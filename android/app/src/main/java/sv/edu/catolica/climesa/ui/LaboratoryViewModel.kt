package sv.edu.catolica.climesa.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import org.json.JSONObject
import sv.edu.catolica.climesa.data.ApiGateway
import sv.edu.catolica.climesa.data.realtime.LiveSubscription
import sv.edu.catolica.climesa.data.realtime.RealtimeRepository
import sv.edu.catolica.climesa.data.AuthRequestException
import sv.edu.catolica.climesa.data.DocumentReader
import sv.edu.catolica.climesa.domain.LabAttachment
import sv.edu.catolica.climesa.domain.LabAttachmentRules
import sv.edu.catolica.climesa.domain.LabFile
import sv.edu.catolica.climesa.domain.LabExternalAction
import sv.edu.catolica.climesa.domain.LabExternalRules
import sv.edu.catolica.climesa.domain.LabFollowUp
import sv.edu.catolica.climesa.domain.LabFollowUpRules
import sv.edu.catolica.climesa.domain.LabOrderAction
import sv.edu.catolica.climesa.domain.LabOrderRules
import sv.edu.catolica.climesa.domain.LaboratoryEvents
import sv.edu.catolica.climesa.domain.LaboratoryOrder
import sv.edu.catolica.climesa.domain.LaboratoryParser
import sv.edu.catolica.climesa.domain.RealtimeSignal

/** [cancelOrderId] is the order whose cancel dialog is open; the reason lives here so a rotation keeps it. */
data class LaboratoryState(
    val loading: Boolean = true, val orders: List<LaboratoryOrder> = emptyList(), val busy: Boolean = false, val error: String? = null, val notice: String? = null,
    val cancelOrderId: String? = null, val cancelReason: String = "", val cancelError: String? = null, val cancelling: Boolean = false,
    /** S10: the doctor's "Resultados por revisar" (`GET /laboratorio/pendientes`). */
    val followUps: List<LabFollowUp> = emptyList(), val followUpBusy: String? = null,
    /** S10: dialogs of the external path; their drafts live here so a rotation keeps them. */
    val external: ExternalDraft? = null, val externalLoad: ExternalLoadDraft? = null,
    /** T07c: the values were saved but the file did not upload; the dialog says so until the person closes it. */
    val uploadFailure: String? = null,
    /** T07c: attachments of completed external orders, by order id ([AttachmentsState.version] is the order version read). */
    val attachments: Map<String, AttachmentsState> = emptyMap(),
    /** T07c: the attachment whose link or upload is in progress; one flag for every attachment action. */
    val attachmentBusy: String? = null,
    /** T07c: a fresh signed http(s) link to hand to the system once (for [openOrderId]); cleared by [LaboratoryViewModel.urlOpened]. */
    val openUrl: String? = null, val openOrderId: String? = null,
)

data class AttachmentsState(val version: Int, val loading: Boolean = true, val files: List<LabFile> = emptyList(), val error: String? = null)

/** Spanish text of a failed signed link (T07c): the attachment code first, then [userMessage]. */
internal fun labLinkMessage(error: Throwable): String {
    if (error is LabAttachmentRules.UnopenableLink) return error.message.orEmpty()
    val failure = error as? AuthRequestException
    return LabAttachmentRules.linkMessage(failure?.code, failure?.statusCode) ?: userMessage(error, "No se pudo abrir el archivo. Vuelve a intentar.")
}

/** Spanish text of a failed upload (T07c): size, unreadable file and attachment codes first, then [userMessage]. */
internal fun labUploadMessage(error: Throwable): String = when (error) {
    is LabAttachmentRules.FileTooLarge -> error.message.orEmpty()
    is AuthRequestException -> labUploadApiMessage(error)
    // The picked document can no longer be read (moved, deleted or its permission ended).
    is java.io.IOException, is SecurityException -> LabAttachmentRules.UNREADABLE
    else -> userMessage(error, UPLOAD_FALLBACK)
}

private const val UPLOAD_FALLBACK = "No se pudo subir el archivo. Vuelve a intentar."
private fun labUploadApiMessage(error: AuthRequestException) = LabAttachmentRules.uploadMessage(error.code) ?: userMessage(error, UPLOAD_FALLBACK)

data class ExternalDraft(val orderId: String, val place: String = "", val instructions: String = LabExternalRules.INSTRUCTIONS_TEMPLATE, val error: String? = null, val busy: Boolean = false)
data class ExternalLoadDraft(val orderId: String, val attachment: LabAttachment? = null, val values: Map<String, String> = emptyMap(), val note: String = "", val error: String? = null, val busy: Boolean = false)

@HiltViewModel
class LaboratoryViewModel @Inject constructor(
    private val api: ApiGateway,
    realtime: RealtimeRepository,
    private val documents: DocumentReader,
) : ViewModel() {
    private val mutable = MutableStateFlow(LaboratoryState())
    val state = mutable.asStateFlow()
    private val live = LiveSubscription(realtime)
    private var loadJob: Job? = null
    /** Source of the list: the lab queue, or `/me/laboratorio` for the patient (A07: state always, values only reviewed). */
    var path: String = "/laboratorio/ordenes"
    /** True for readers with `laboratorio.revisar`: they also get the "Resultados por revisar" inbox. */
    var followUpsEnabled: Boolean = false
    /** T07c: readers with `laboratorio.procesar` or `laboratorio.revisar` may upload a reference-only attachment (the API checks it). */
    var canAttach: Boolean = false

    /** A [silent] reload (realtime invalidation) keeps the shown orders and messages, even if it fails. */
    fun load(silent: Boolean = false) {
        if (!silent) mutable.value = mutable.value.copy(loading = true, error = null)
        loadJob?.cancel()
        loadJob = viewModelScope.launch {
            try { val orders = LaboratoryParser.orders(api.request(path)); mutable.value = mutable.value.copy(loading = false, orders = orders) }
            catch (e: CancellationException) { throw e }
            catch (e: Exception) { if (!silent) mutable.value = mutable.value.copy(loading = false, error = message(e)) }
        }
    }

    /** Idempotent per channel list: reloads when a laboratory event arrives or after a reconnection gap. */
    fun startLive(channels: List<String>) {
        live.start(viewModelScope, channels) { signal ->
            if (signal is RealtimeSignal.Event && LaboratoryEvents.matches(signal.event) || signal is RealtimeSignal.Resync) { load(silent = true); if (followUpsEnabled) loadFollowUps() }
        }
    }

    /** Loads the doctor's inbox; only called for readers with `laboratorio.revisar` (the API answers 403 otherwise). */
    fun loadFollowUps() {
        viewModelScope.launch {
            try { mutable.value = mutable.value.copy(followUps = LabFollowUpRules.parse(api.request("/laboratorio/pendientes"))) }
            catch (e: CancellationException) { throw e }
            catch (_: Exception) { /* The list below still works; the inbox reloads on the next event. */ }
        }
    }

    fun reviewFollowUp(item: LabFollowUp) {
        if (mutable.value.followUpBusy != null) return
        mutable.value = mutable.value.copy(followUpBusy = item.id, error = null, notice = null)
        viewModelScope.launch {
            try {
                api.request(LabFollowUpRules.reviewPath(item.id), "POST", LabFollowUpRules.reviewBody(item.version))
                mutable.value = mutable.value.copy(followUpBusy = null, followUps = mutable.value.followUps.filterNot { it.id == item.id }, notice = "Marcado como revisado.")
                loadFollowUps()
            }
            catch (e: CancellationException) { throw e }
            catch (e: Exception) { mutable.value = mutable.value.copy(followUpBusy = null, error = businessMessage(e, "No se pudo marcar como revisado.")); loadFollowUps() }
        }
    }

    fun openExternal(orderId: String) { mutable.value = mutable.value.copy(external = ExternalDraft(orderId), notice = null) }
    fun editExternal(place: String = mutable.value.external?.place.orEmpty(), instructions: String = mutable.value.external?.instructions.orEmpty()) {
        mutable.value.external?.let { mutable.value = mutable.value.copy(external = it.copy(place = place.take(LabExternalRules.MAX_PLACE), instructions = instructions.take(LabExternalRules.MAX_INSTRUCTIONS), error = null)) }
    }
    fun dismissExternal() { if (mutable.value.external?.busy != true) mutable.value = mutable.value.copy(external = null) }

    fun confirmExternal(order: LaboratoryOrder) {
        val draft = mutable.value.external ?: return
        if (draft.busy || !order.allowsExternal(LabExternalAction.SEND)) return
        LabExternalRules.sendError(draft.place, draft.instructions)?.let { mutable.value = mutable.value.copy(external = draft.copy(error = it)); return }
        mutable.value = mutable.value.copy(external = draft.copy(busy = true, error = null))
        viewModelScope.launch {
            try {
                api.request(LabExternalRules.sendPath(order.id), "POST", LabExternalRules.sendBody(order.version, draft.place, draft.instructions))
                mutable.value = mutable.value.copy(external = null, notice = "La orden quedó como externa; el paciente ya ve dónde ir.")
                load(silent = true)
            }
            catch (e: CancellationException) { throw e }
            catch (e: Exception) { mutable.value = mutable.value.copy(external = draft.copy(busy = false, error = businessMessage(e, "No se pudo enviar a externo."))) }
        }
    }

    fun openExternalLoad(orderId: String) { mutable.value = mutable.value.copy(externalLoad = ExternalLoadDraft(orderId), notice = null) }
    fun setAttachment(file: LabAttachment?) { mutable.value.externalLoad?.let { mutable.value = mutable.value.copy(externalLoad = it.copy(attachment = file, error = LabExternalRules.attachmentError(file))) } }
    fun setExternalValue(itemId: String, value: String) { mutable.value.externalLoad?.let { mutable.value = mutable.value.copy(externalLoad = it.copy(values = it.values + (itemId to value), error = null)) } }
    fun setExternalNote(note: String) { mutable.value.externalLoad?.let { mutable.value = mutable.value.copy(externalLoad = it.copy(note = note.take(LabExternalRules.MAX_NOTE))) } }
    fun dismissExternalLoad() { if (mutable.value.externalLoad?.busy != true) mutable.value = mutable.value.copy(externalLoad = null) }

    fun confirmExternalLoad(order: LaboratoryOrder) {
        val draft = mutable.value.externalLoad ?: return
        if (draft.busy || !order.allowsExternal(LabExternalAction.LOAD_RESULT)) return
        val problem = LabAttachmentRules.uploadProblem(draft.attachment) ?: LabExternalRules.valuesError(order.items, draft.values)
        if (problem != null) { mutable.value = mutable.value.copy(externalLoad = draft.copy(error = problem)); return }
        val file = draft.attachment!!
        // One busy flag for both steps: the values (with the file reference) and then the file itself, as the web does.
        mutable.value = mutable.value.copy(externalLoad = draft.copy(busy = true, error = null))
        viewModelScope.launch {
            val saved = try {
                api.request(LabExternalRules.resultPath(order.id), "POST", LabExternalRules.resultBody(order.version, file, order.items, draft.values, draft.note))
            }
            catch (e: CancellationException) { throw e }
            catch (e: Exception) { mutable.value = mutable.value.copy(externalLoad = draft.copy(busy = false, error = userMessage(e, "No se pudo guardar el resultado externo."))); return@launch }
            val attachmentId = LabAttachmentRules.attachmentIdOf(saved)
            val uploadError = attachmentId?.let { id -> try { sendFile(id, file); null } catch (e: CancellationException) { throw e } catch (e: Exception) { labUploadMessage(e) } }
            mutable.value = if (uploadError != null) {
                mutable.value.copy(externalLoad = null, uploadFailure = "Los valores se guardaron, pero el archivo no se subió: $uploadError")
            } else {
                mutable.value.copy(externalLoad = null, notice = if (attachmentId != null) "Resultado externo guardado con su archivo; la orden espera la revisión médica." else "Resultado externo guardado; la orden espera la revisión médica.")
            }
            load(silent = true)
        }
    }

    fun dismissUploadFailure() { mutable.value = mutable.value.copy(uploadFailure = null) }

    /** Reads the picked document again (checking 10 MiB while reading) and posts it in the `archivo` field. */
    private suspend fun sendFile(attachmentId: String, file: LabAttachment) {
        val bytes = documents.read(file.uri ?: throw java.io.FileNotFoundException(file.fileName), LabExternalRules.MAX_ATTACHMENT_BYTES)
        if (bytes.isEmpty()) throw java.io.FileNotFoundException(file.fileName)
        api.upload(LabAttachmentRules.filePath(attachmentId), LabAttachmentRules.UPLOAD_FIELD, file.fileName, file.mimeType, bytes)
    }

    /** `GET /laboratorio/ordenes/{id}` for its attachments, once per order version (a new version reads them again). */
    fun loadAttachments(orderId: String, version: Int, force: Boolean = false) {
        val current = mutable.value.attachments[orderId]
        if (!force && current != null && current.version == version && current.error == null) return
        setAttachments(orderId, AttachmentsState(version, loading = true, files = current?.files.orEmpty()))
        viewModelScope.launch {
            try { setAttachments(orderId, AttachmentsState(version, loading = false, files = LabAttachmentRules.parseDetail(api.request(LabAttachmentRules.detailPath(orderId))))) }
            catch (e: CancellationException) { throw e }
            catch (e: Exception) { setAttachments(orderId, AttachmentsState(version, loading = false, files = current?.files.orEmpty(), error = userMessage(e, "No se pudieron cargar los adjuntos. Vuelve a intentar."))) }
        }
    }

    /** Asks the API for a fresh 5-minute link on every tap; only an http(s) link is handed to the system, and never stored. */
    fun openAttachment(orderId: String, attachmentId: String) {
        if (mutable.value.attachmentBusy != null) return
        mutable.value = mutable.value.copy(attachmentBusy = attachmentId)
        updateAttachments(orderId) { it.copy(error = null) }
        viewModelScope.launch {
            try {
                val url = LabAttachmentRules.openableUrl(LabAttachmentRules.linkUrl(api.request(LabAttachmentRules.linkPath(attachmentId)))) ?: throw LabAttachmentRules.UnopenableLink()
                mutable.value = mutable.value.copy(attachmentBusy = null, openUrl = url, openOrderId = orderId)
            }
            catch (e: CancellationException) { throw e }
            catch (e: Exception) { mutable.value = mutable.value.copy(attachmentBusy = null); updateAttachments(orderId) { it.copy(error = labLinkMessage(e)) } }
        }
    }

    fun urlOpened() { mutable.value = mutable.value.copy(openUrl = null, openOrderId = null) }

    /** The system has no app to open the file. */
    fun openFailed() {
        val orderId = mutable.value.openOrderId
        mutable.value = mutable.value.copy(openUrl = null, openOrderId = null)
        if (orderId != null) updateAttachments(orderId) { it.copy(error = labLinkMessage(LabAttachmentRules.UnopenableLink())) }
    }

    /** Uploads the file of an attachment that only has its reference; the size is checked before anything is sent. */
    fun uploadAttachment(orderId: String, version: Int, attachmentId: String, file: LabAttachment?) {
        if (mutable.value.attachmentBusy != null) return
        LabAttachmentRules.uploadProblem(file)?.let { problem -> updateAttachments(orderId, version) { it.copy(error = problem) }; return }
        mutable.value = mutable.value.copy(attachmentBusy = attachmentId)
        updateAttachments(orderId, version) { it.copy(error = null) }
        viewModelScope.launch {
            try {
                sendFile(attachmentId, file!!)
                mutable.value = mutable.value.copy(attachmentBusy = null, notice = "Archivo guardado en el expediente.")
                loadAttachments(orderId, version, force = true)
            }
            catch (e: CancellationException) { throw e }
            catch (e: Exception) { mutable.value = mutable.value.copy(attachmentBusy = null); updateAttachments(orderId, version) { it.copy(error = labUploadMessage(e)) } }
        }
    }

    private fun setAttachments(orderId: String, value: AttachmentsState) { mutable.value = mutable.value.copy(attachments = mutable.value.attachments + (orderId to value)) }
    private fun updateAttachments(orderId: String, version: Int = 0, change: (AttachmentsState) -> AttachmentsState) {
        val current = mutable.value.attachments[orderId] ?: AttachmentsState(version, loading = false)
        setAttachments(orderId, change(current))
    }

    fun review(order: LaboratoryOrder) = mutate("/laboratorio/ordenes/${order.id}/revisar", JSONObject().put("version", order.version), "Resultados revisados y liberados.")

    fun openCancel(orderId: String) { mutable.value = mutable.value.copy(cancelOrderId = orderId, cancelReason = "", cancelError = null, notice = null) }

    fun setCancelReason(reason: String) { mutable.value = mutable.value.copy(cancelReason = reason.take(LabOrderRules.MAX_CANCEL_REASON), cancelError = null) }

    fun dismissCancel() { if (!mutable.value.cancelling) mutable.value = mutable.value.copy(cancelOrderId = null, cancelReason = "", cancelError = null) }

    /** `POST /laboratorio/ordenes/{id}/cancelar` with the order version; offered only when the API allows `cancelar`. */
    fun confirmCancel(order: LaboratoryOrder) {
        val current = mutable.value
        if (current.cancelling || !order.allows(LabOrderAction.CANCEL)) return
        LabOrderRules.cancelReasonError(current.cancelReason)?.let { mutable.value = current.copy(cancelError = it); return }
        mutable.value = current.copy(cancelling = true, cancelError = null)
        viewModelScope.launch {
            try {
                api.request(LabOrderRules.cancelPath(order.id), "POST", LabOrderRules.cancelBody(order.version, current.cancelReason))
                mutable.value = mutable.value.copy(cancelling = false, cancelOrderId = null, cancelReason = "", notice = "Orden cancelada.")
                load(silent = true)
            }
            catch (e: CancellationException) { throw e }
            catch (e: Exception) { mutable.value = mutable.value.copy(cancelling = false, cancelError = businessMessage(e, "No se pudo cancelar la orden. Intenta de nuevo.")) }
        }
    }

    fun clearMessages() { mutable.value = mutable.value.copy(error = null, notice = null) }

    private fun mutate(path: String, body: JSONObject, notice: String) {
        mutable.value = mutable.value.copy(busy = true, error = null, notice = null)
        viewModelScope.launch {
            try { api.request(path, "POST", body); mutable.value = mutable.value.copy(busy = false, notice = notice); load(silent = true) }
            catch (e: CancellationException) { throw e }
            catch (e: Exception) { mutable.value = mutable.value.copy(busy = false, error = businessMessage(e, "No se pudo completar la operación.")) }
        }
    }

    private fun message(error: Exception) = if (error is AuthRequestException) error.message ?: "No se pudo completar la operación." else error.message ?: "No se pudo completar la operación."
}
