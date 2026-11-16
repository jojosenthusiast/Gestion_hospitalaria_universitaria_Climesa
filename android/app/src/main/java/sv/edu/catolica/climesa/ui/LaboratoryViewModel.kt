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
import sv.edu.catolica.climesa.domain.LabAttachment
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
)

data class ExternalDraft(val orderId: String, val place: String = "", val instructions: String = LabExternalRules.INSTRUCTIONS_TEMPLATE, val error: String? = null, val busy: Boolean = false)
data class ExternalLoadDraft(val orderId: String, val attachment: LabAttachment? = null, val values: Map<String, String> = emptyMap(), val note: String = "", val error: String? = null, val busy: Boolean = false)

@HiltViewModel
class LaboratoryViewModel @Inject constructor(private val api: ApiGateway, realtime: RealtimeRepository) : ViewModel() {
    private val mutable = MutableStateFlow(LaboratoryState())
    val state = mutable.asStateFlow()
    private val live = LiveSubscription(realtime)
    private var loadJob: Job? = null
    /** Source of the list: the lab queue, or `/me/laboratorio` for the patient (A07: state always, values only reviewed). */
    var path: String = "/laboratorio/ordenes"
    /** True for readers with `laboratorio.revisar`: they also get the "Resultados por revisar" inbox. */
    var followUpsEnabled: Boolean = false

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
        val problem = LabExternalRules.attachmentError(draft.attachment) ?: LabExternalRules.valuesError(order.items, draft.values)
        if (problem != null) { mutable.value = mutable.value.copy(externalLoad = draft.copy(error = problem)); return }
        mutable.value = mutable.value.copy(externalLoad = draft.copy(busy = true, error = null))
        viewModelScope.launch {
            try {
                api.request(LabExternalRules.resultPath(order.id), "POST", LabExternalRules.resultBody(order.version, draft.attachment!!, order.items, draft.values, draft.note))
                mutable.value = mutable.value.copy(externalLoad = null, notice = "Resultado externo guardado; la orden espera la revisión médica.")
                load(silent = true)
            }
            catch (e: CancellationException) { throw e }
            catch (e: Exception) { mutable.value = mutable.value.copy(externalLoad = draft.copy(busy = false, error = businessMessage(e, "No se pudo guardar el resultado externo."))) }
        }
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
