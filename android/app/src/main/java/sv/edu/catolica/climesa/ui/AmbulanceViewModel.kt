package sv.edu.catolica.climesa.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import java.time.Instant
import javax.inject.Inject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import sv.edu.catolica.climesa.data.ApiGateway
import sv.edu.catolica.climesa.data.AuthRequestException
import sv.edu.catolica.climesa.data.RequestIntent
import sv.edu.catolica.climesa.data.SubmissionIntent
import sv.edu.catolica.climesa.data.realtime.LiveSubscription
import sv.edu.catolica.climesa.data.realtime.RealtimeRepository
import sv.edu.catolica.climesa.domain.AmbulanceEvents
import sv.edu.catolica.climesa.domain.AmbulanceLogEntry
import sv.edu.catolica.climesa.domain.AmbulanceParser
import sv.edu.catolica.climesa.domain.AmbulanceRequestRow
import sv.edu.catolica.climesa.domain.AmbulanceRules
import sv.edu.catolica.climesa.domain.AmbulanceService
import sv.edu.catolica.climesa.domain.AmbulanceLabels
import sv.edu.catolica.climesa.domain.AmbulanceStatus
import sv.edu.catolica.climesa.domain.FormDrafts
import sv.edu.catolica.climesa.domain.LogFilters
import sv.edu.catolica.climesa.domain.OwnAmbulanceRequest
import sv.edu.catolica.climesa.domain.QueuedMilestone
import sv.edu.catolica.climesa.domain.PrehospitalForm
import sv.edu.catolica.climesa.domain.PrehospitalView
import sv.edu.catolica.climesa.domain.RealtimeSignal

/** D21: [linkedServiceId] is the crew's active service the API already linked the record to (`linkedServiceId`); null when not linked. */
data class ProvisionalPatient(val id: String, val record: String, val linkedServiceId: String? = null) {
    val linked get() = !linkedServiceId.isNullOrBlank()

    companion object {
        fun fromCreated(created: JSONObject) = ProvisionalPatient(
            created.getString("id"), created.optString("record"),
            created.optString("linkedServiceId").takeIf { !created.isNull("linkedServiceId") && it.isNotBlank() },
        )
    }
}
/** Reporte prehospital en cola: el mismo cuerpo y la misma clave se reenvían, aunque la app se cierre (RN-34). */
data class QueuedPrehospital(val serviceId: String, val body: String, val key: String = java.util.UUID.randomUUID().toString())

data class AmbulanceUiState(
    val loading: Boolean = false,
    val status: AmbulanceStatus? = null,
    val log: List<AmbulanceLogEntry> = emptyList(),
    val logFilters: LogFilters = LogFilters(),
    val arrival: PrehospitalView? = null,
    val arrivalServiceId: String? = null,
    /** MA-AMB-04: services to receive (arrived without handover first, then the active one); the screen lets the user pick. */
    val arrivals: List<sv.edu.catolica.climesa.domain.ArrivalCandidate> = emptyList(),
    /** MA-AMB-05: the patient's requests as the server keeps them; null until the first read answers. */
    val ownRequests: List<OwnAmbulanceRequest>? = null,
    /** S13: the patient's own address and phone (`GET /me/paciente`) for the request form; null when the record is not readable. */
    val requestPrefill: sv.edu.catolica.climesa.domain.AmbulancePrefill? = null,
    val prehospital: PrehospitalForm = PrehospitalForm(),
    val queued: QueuedPrehospital? = null,
    /** MA-AMB-06: milestones recorded without signal, sent in order with their phone time. */
    val queuedMilestones: List<QueuedMilestone> = emptyList(),
    val provisional: ProvisionalPatient? = null,
    val busy: Boolean = false,
    val error: String? = null,
    val formError: String? = null,
    val notice: String? = null,
    /** G4: the milestone just tapped, held 10 s with "Deshacer" before it joins the queue (no inverse endpoint exists). */
    val pendingMilestone: PendingUndo? = null,
)

enum class AmbulanceMode { STATUS, LOG, ARRIVAL, REQUEST, PARAMEDIC }

@HiltViewModel
class AmbulanceViewModel @Inject constructor(private val api: ApiGateway, realtime: RealtimeRepository, private val drafts: sv.edu.catolica.climesa.data.DraftStore = sv.edu.catolica.climesa.data.NoDraftStore) : ViewModel() {
    private var userId: String? = null

    /**
     * Signed-in user. The prehospital report being typed and a report queued without signal are kept as local drafts,
     * so a killed app neither loses the form nor the pending report; both come back here.
     */
    fun bindUser(id: String) {
        if (userId == id) return
        userId = id; drafts.retainOnly(id, sv.edu.catolica.climesa.data.SessionDrafts.PENDING_WRITES)
        val queued = drafts.load(id, FormDrafts.PREHOSPITAL_QUEUE)?.let { runCatching { QueuedPrehospital(it.getString("serviceId"), it.getString("body"), it.optString("key").ifBlank { java.util.UUID.randomUUID().toString() }) }.getOrNull() }
        if (queued != null && mutable.value.queued == null) mutable.value = mutable.value.copy(queued = queued, notice = "Hay un reporte prehospital en cola: se enviará al reintentar.")
        restoredForm = drafts.load(id, FormDrafts.PREHOSPITAL_FORM)
        // MA-AMB-06: the provisional patient and the queued milestones survive a killed app too.
        val provisional = drafts.load(id, FormDrafts.PROVISIONAL_PATIENT)?.let { runCatching { ProvisionalPatient.fromCreated(it) }.getOrNull() }
        if (provisional != null && mutable.value.provisional == null) mutable.value = mutable.value.copy(provisional = provisional)
        val milestones = drafts.load(id, FormDrafts.MILESTONE_QUEUE)?.optJSONArray("items")?.let { items -> (0 until items.length()).mapNotNull { items.optJSONObject(it)?.let(QueuedMilestone::fromJson) } }.orEmpty()
        if (milestones.isNotEmpty() && mutable.value.queuedMilestones.isEmpty()) mutable.value = mutable.value.copy(queuedMilestones = milestones, notice = "Hay hitos en cola: se enviarán al volver la señal.")
        // Signed in again (after a sign-out, the inactivity timeout or a killed app): send what waited on the phone. A
        // milestone tapped just before the app died keeps only the rest of its undo window; one past it goes now.
        if (milestones.isNotEmpty()) { resumeHeld(); flushMilestones() }
        if (queued != null) retryQueued()
    }
    private var restoredForm: JSONObject? = null

    /** Restores the saved prehospital form of [serviceId] once, when the sheet opens with an empty form. */
    fun restorePrehospital(serviceId: String, servicePriority: String? = null) {
        sv.edu.catolica.climesa.domain.FormDrafts.prehospital(restoredForm, serviceId)?.let { form ->
            restoredForm = null
            if (sv.edu.catolica.climesa.domain.FormDrafts.isEmpty(mutable.value.prehospital)) mutable.value = mutable.value.copy(prehospital = form)
        }
        // D17: an untouched report starts with the priority dispatch gave the service, not the form default.
        val current = mutable.value.prehospital
        if (servicePriority != null && servicePriority in AmbulanceLabels.priorities.map { it.first } &&
            sv.edu.catolica.climesa.domain.FormDrafts.isEmpty(current) && current.priority == PrehospitalForm().priority
        ) mutable.value = mutable.value.copy(prehospital = current.copy(priority = servicePriority))
    }

    private val mutable = MutableStateFlow(AmbulanceUiState())
    val state = mutable.asStateFlow()
    private val live = LiveSubscription(realtime)
    private var loadJob: Job? = null
    private var mode: AmbulanceMode? = null
    private var readsStatus = false

    /** Abre una sección: STATUS (A36, A70, A71, A72), LOG (A74), ARRIVAL (A25, A54) o REQUEST (A09, `GET /ambulancia/solicitudes/mias`). */
    fun open(mode: AmbulanceMode, canReadStatus: Boolean = true) {
        this.mode = mode; readsStatus = canReadStatus
        load(silent = false)
    }

    fun load(silent: Boolean = true) {
        val current = mode ?: return
        if (!silent) mutable.value = mutable.value.copy(loading = true, error = null)
        loadJob?.cancel()
        loadJob = viewModelScope.launch {
            try {
                when (current) {
                    AmbulanceMode.STATUS -> api.request("/ambulancia").let { r -> mutable.value = mutable.value.copy(loading = false, status = AmbulanceParser.status(r)) }
                    AmbulanceMode.LOG -> api.request(AmbulanceRules.logPath(mutable.value.logFilters)).let { r -> mutable.value = mutable.value.copy(loading = false, log = AmbulanceParser.log(r)) }
                    AmbulanceMode.ARRIVAL -> loadArrival()
                    AmbulanceMode.PARAMEDIC -> loadParamedic()
                    AmbulanceMode.REQUEST -> {
                        api.request("/ambulancia/solicitudes/mias").let { r -> mutable.value = mutable.value.copy(loading = false, ownRequests = AmbulanceParser.ownRequests(r)) }
                        loadPrefill()
                    }
                }
            } catch (e: CancellationException) { throw e }
            catch (e: Exception) { if (!silent) mutable.value = mutable.value.copy(loading = false, error = message(e)) else mutable.value = mutable.value.copy(loading = false) }
        }
    }

    private var prefillRead = false

    /** Reads the patient's own contact data once per ViewModel; a record that is not readable (unlinked account) prefills nothing. */
    private suspend fun loadPrefill() {
        if (prefillRead) return
        prefillRead = true
        val json = try { api.request("/me/paciente") as? org.json.JSONObject } catch (e: CancellationException) { prefillRead = false; throw e } catch (_: Exception) { null }
        json?.let { mutable.value = mutable.value.copy(requestPrefill = sv.edu.catolica.climesa.domain.AmbulancePrefill.from(it)) }
    }

    /** Pantalla "Servicio activo": estado de la unidad y, aparte, los últimos servicios; si la bitácora falla, el estado se muestra igual. */
    private suspend fun loadParamedic() {
        api.request("/ambulancia").let { r -> mutable.value = mutable.value.copy(loading = false, status = AmbulanceParser.status(r)) }
        val recent = runCatching { AmbulanceParser.log(api.request(AmbulanceRules.logPath(LogFilters()))) }.getOrNull()
        if (recent != null) mutable.value = mutable.value.copy(log = recent)
    }

    /**
     * MA-AMB-04: the API lists what to receive: services that arrived without a handover first (even after the unit left on
     * another one), then the active one. The screen shows the chosen one (or an event's), else the first of the list.
     */
    private suspend fun loadArrival() {
        if (readsStatus) api.request("/ambulancia").let { r -> mutable.value = mutable.value.copy(status = AmbulanceParser.status(r)) }
        val arrivals = AmbulanceParser.arrivals(api.request("/ambulancia/llegada"))
        val chosen = mutable.value.arrivalServiceId
        // D27: the chosen one stays on screen even after it was received and left the list (its handover shows who received
        // it); the screen never jumps by itself to another service. Without a choice yet, the first of the list.
        val id = chosen ?: arrivals.firstOrNull()?.serviceId
        mutable.value = mutable.value.copy(arrivals = arrivals, arrivalServiceId = id)
        val view = id?.let { AmbulanceParser.prehospital(api.request("/ambulancia/servicios/$it/prehospital")) }
        mutable.value = mutable.value.copy(loading = false, arrival = view)
    }

    /** MA-AMB-04: shows another service of the arrival list. */
    fun selectArrival(serviceId: String) {
        if (mutable.value.arrivalServiceId == serviceId) return
        mutable.value = mutable.value.copy(arrivalServiceId = serviceId)
        load(silent = false)
    }

    /** Idempotente por lista de canales. Un evento de ambulancia vuelve a pedir; al reconectar se reenvía el prehospital en cola. */
    fun startLive(channels: List<String>) {
        live.start(viewModelScope, channels) { signal ->
            when (signal) {
                is RealtimeSignal.Event -> if (AmbulanceEvents.matches(signal.event)) {
                    // D27: an event only picks the service when none is chosen; it never switches away from the one being read.
                    if (mutable.value.arrivalServiceId == null && (AmbulanceEvents.isPrehospital(signal.event) || (signal.event.type == "ambulancia.hito" && signal.event.entity == "servicio"))) mutable.value = mutable.value.copy(arrivalServiceId = signal.event.id)
                    load()
                }
                RealtimeSignal.Resync -> { load(); retryQueued(); resumeHeld(); flushMilestones() }
                else -> Unit
            }
        }
    }

    /** A09 / FR-109-02: queda "por confirmar" y muestra el aviso del 911. */
    /** One request form = one intent: a retry after a lost answer reuses the key and never asks for two ambulances. */
    private val requestIntent = SubmissionIntent()

    fun submitRequest(address: String, municipality: String, reason: String, contactPhone: String) {
        AmbulanceRules.requestError(address, reason, contactPhone)?.let { mutable.value = mutable.value.copy(formError = it); return }
        write(notice = AmbulanceRules.NOTICE_911) { requestIntent.send { api.request("/ambulancia/solicitudes", "POST", AmbulanceRules.requestBody(address, municipality, reason, contactPhone)) } }
    }

    /** MA-AMB-05: the patient cancels a request still waiting for confirmation; the server says when it is allowed. */
    fun cancelRequest(request: OwnAmbulanceRequest, reason: String) {
        if (!request.canCancel) return
        write(notice = "Solicitud cancelada.") { api.request("/ambulancia/solicitudes/${request.id}/cancelar", "POST", AmbulanceRules.cancelBody(request.version, reason)) }
    }

    /** MA-AMB-04 (A25, A54): clinical staff mark the patient received after the ambulance arrived. */
    fun receivePatient() {
        val view = mutable.value.arrival ?: return
        if (!view.canReceive) return
        write(notice = "Paciente recibido en el hospital.") { api.request("/ambulancia/servicios/${view.serviceId}/recepcion", "POST", AmbulanceRules.handoverBody(view)) }
    }

    /** A36 / FR-109-04: confirma por teléfono y despacha con la versión de la unidad que se vio Disponible. */
    /** MA-AMB-02: with the crew the dispatcher chose among `availableCrew` (only they gain the care relationship). */
    fun dispatch(request: AmbulanceRequestRow, type: String, priority: String, destination: String, crew: List<String>) {
        val status = mutable.value.status ?: return
        if (destination.trim().length < 3) { mutable.value = mutable.value.copy(formError = "Indica el destino."); return }
        AmbulanceRules.crewProblem(status.availableCrew, crew)?.let { mutable.value = mutable.value.copy(formError = it); return }
        val chosen = status.availableCrew.map { it.staffId }.filter { it in crew }
        write(notice = "Ambulancia despachada.") { api.request("/ambulancia/servicios", "POST", AmbulanceRules.dispatchBody(status.unit.version, request.id, type, priority, destination, chosen)) }
    }

    fun discard(request: AmbulanceRequestRow, reason: String) {
        if (reason.trim().length < 5) { mutable.value = mutable.value.copy(formError = "Indica el motivo, de al menos 5 caracteres."); return }
        write(notice = "Solicitud descartada.") { api.request("/ambulancia/solicitudes/${request.id}/descartar", "POST", JSONObject().put("version", request.version).put("reason", reason.trim())) }
    }

    /** The active service as the API will see it once the queued milestones arrive (MA-AMB-06). */
    fun projected(service: AmbulanceService) = AmbulanceRules.withQueued(service, mutable.value.queuedMilestones)

    /**
     * A71 / FR-109-07: el hito siguiente con la hora del teléfono; finalizar antes del hospital exige estado final y motivo.
     * MA-AMB-06: every milestone goes through the ordered queue: without signal it stays on the phone (with its key and
     * time) and is resent on reconnect or with "Reintentar", so the paramedic keeps working offline.
     */
    fun advance(service: AmbulanceService, type: String, finalState: String? = null, reason: String = "", notice: String = "Hito registrado.", at: Instant = Instant.now(), undoable: Boolean = false) {
        val current = projected(service)
        if (type == "finalizado" && AmbulanceRules.finishNeedsReason(current) && (finalState == null || reason.trim().length < 5)) {
            mutable.value = mutable.value.copy(formError = "Para terminar sin llegar al hospital elige cómo terminó y escribe el motivo."); return
        }
        // The phone time is the tap, not the end of the undo window.
        val body = AmbulanceRules.milestoneBody(type, finalState, reason, at).toString()
        val key = java.util.UUID.randomUUID().toString()
        if (undoable) {
            // G4: stored at once (it survives a killed app), held 10 s so "Deshacer" can drop it before it is sent.
            releaseHeld()
            val item = QueuedMilestone(service.id, type, body, key, holdUntil = clock() + MILESTONE_UNDO_MS)
            mutable.value = mutable.value.copy(formError = null, notice = null)
            saveMilestones(mutable.value.queuedMilestones + item)
            hold(item, MILESTONE_UNDO_MS, notice)
            return
        }
        // A milestone still in its window goes first, so the queue keeps the order the paramedic tapped.
        releaseHeld()
        saveMilestones(mutable.value.queuedMilestones + QueuedMilestone(service.id, type, body, key))
        flushMilestones(notice)
    }

    /** G4: "Deshacer" inside the window: the milestone leaves the phone's queue and never reaches the API. */
    fun undoMilestone() {
        val held = mutable.value.queuedMilestones.lastOrNull { it.holdUntil > 0 } ?: return
        holds.remove(held.key)?.cancel()
        saveMilestones(mutable.value.queuedMilestones.filterNot { it.key == held.key })
        mutable.value = mutable.value.copy(pendingMilestone = null, notice = "Hito anulado; no se registró.")
    }

    /** Clock of the undo window (tests move it to after a restart). */
    var clock: () -> Long = { System.currentTimeMillis() }
    private val holds = mutableMapOf<String, Job>()

    private fun pendingOf(item: QueuedMilestone) = PendingUndo(item.serviceId, until = item.holdUntil, label = "Registrando «${AmbulanceLabels.milestone(item.type)}» a las ${localClock(runCatching { Instant.parse(item.occurredAt) }.getOrDefault(Instant.now()))}…")

    private fun hold(item: QueuedMilestone, wait: Long, notice: String? = null) {
        mutable.value = mutable.value.copy(pendingMilestone = pendingOf(item))
        holds[item.key] = viewModelScope.launch {
            delay(wait)
            holds.remove(item.key)
            free(item.key)
            flushMilestones(notice)
        }
    }

    /** Frees [key] from its window (in memory and on the phone) so the next flush sends it. */
    private fun free(key: String) {
        saveMilestones(mutable.value.queuedMilestones.map { if (it.key == key) it.copy(holdUntil = 0L) else it })
        if (mutable.value.queuedMilestones.none { it.holdUntil > 0 }) mutable.value = mutable.value.copy(pendingMilestone = null)
    }

    /** Another milestone was tapped: the one still in its window is sent first, in tap order. */
    private fun releaseHeld() {
        mutable.value.queuedMilestones.filter { it.holdUntil > 0 }.forEach { holds.remove(it.key)?.cancel(); free(it.key) }
    }

    /** After a restart: a held milestone past its window is freed; one still inside it waits only for the rest. */
    private fun resumeHeld() {
        val now = clock()
        mutable.value.queuedMilestones.filter { it.holdUntil > 0 && it.key !in holds }.forEach { item ->
            if (item.holdUntil <= now) free(item.key) else hold(item, (item.holdUntil - now).coerceAtMost(MILESTONE_UNDO_MS))
        }
    }

    private fun localClock(at: Instant) = java.time.format.DateTimeFormatter.ofPattern("HH:mm").format(at.atZone(java.time.ZoneId.of("America/El_Salvador")))

    fun retryMilestones() { resumeHeld(); flushMilestones() }

    /** Screen back on top: what is past its window, or waited for signal, is sent now. */
    fun resume() = retryMilestones()

    private var flushing = false

    private fun saveMilestones(items: List<QueuedMilestone>) {
        mutable.value = mutable.value.copy(queuedMilestones = items)
        val user = userId ?: return
        if (items.isEmpty()) drafts.clear(user, FormDrafts.MILESTONE_QUEUE)
        else drafts.save(user, FormDrafts.MILESTONE_QUEUE, JSONObject().put("items", JSONArray().apply { items.forEach { put(it.toJson()) } }))
    }

    /** Sends the queued milestones in order; stops at the first one without signal and keeps it (and the rest) for the next try. */
    private fun flushMilestones(notice: String? = null) {
        if (flushing || mutable.value.queuedMilestones.isEmpty()) return
        flushing = true
        mutable.value = mutable.value.copy(busy = true, formError = null, notice = null)
        viewModelScope.launch {
            var outcome: String? = notice
            var failure: String? = null
            try {
                while (true) {
                    val next = mutable.value.queuedMilestones.firstOrNull() ?: break
                    // A milestone in its undo window (and every later one) waits for the window to end.
                    if (next.holdUntil > 0) break
                    try {
                        withContext(RequestIntent(next.key)) { api.request("/ambulancia/servicios/${next.serviceId}/hitos", "POST", JSONObject(next.body)) }
                        saveMilestones(mutable.value.queuedMilestones.drop(1))
                    } catch (e: CancellationException) { throw e }
                    catch (e: Exception) {
                        // No signal, server waking up (5xx), too many requests or a session to renew: keep it and stop,
                        // so a later milestone never lands without this one (review of #117).
                        if (transient(e)) { outcome = if (isOffline(e)) "Sin señal: el hito quedó en cola con su hora y se enviará al volver la conexión." else "El servidor no respondió: el hito quedó en cola con su hora; toca Reintentar en un momento."; break }
                        // A definitive rejection: the later milestones of that service cannot apply either; drop them and say so.
                        saveMilestones(mutable.value.queuedMilestones.drop(1).filter { it.serviceId != next.serviceId })
                        failure = "No se registró «${AmbulanceLabels.milestone(next.type)}». ${message(e)} Los hitos siguientes de este servicio se descartaron; revísalo y regístralos de nuevo."
                        outcome = null; break
                    }
                }
            } finally {
                flushing = false
                mutable.value = mutable.value.copy(busy = false, notice = outcome, formError = failure)
                load()
            }
        }
    }

    /** A74: búsqueda y filtros de la bitácora; cada cambio vuelve a pedir con la consulta nueva. */
    fun setLogFilters(filters: LogFilters) {
        mutable.value = mutable.value.copy(logFilters = filters)
        if (mode == AmbulanceMode.LOG) load()
    }

    /** `POST /ambulancia/ubicacion`: un punto del teléfono; la API lo rechaza si no hay servicio activo. */
    fun sendLocation(latitude: Double, longitude: Double, capturedAt: Instant = Instant.now()) {
        write(notice = "Ubicación enviada a despacho.") { api.request("/ambulancia/ubicacion", "POST", AmbulanceRules.locationBody(latitude, longitude, capturedAt)) }
    }

    fun reportLocationUnavailable() { mutable.value = mutable.value.copy(formError = "No se pudo obtener tu ubicación. Activa el GPS e inténtalo de nuevo.") }

    fun updatePrehospital(form: PrehospitalForm, serviceId: String? = null) {
        mutable.value = mutable.value.copy(prehospital = form, formError = null)
        val user = userId ?: return
        if (serviceId == null || sv.edu.catolica.climesa.domain.FormDrafts.isEmpty(form)) drafts.clear(user, sv.edu.catolica.climesa.domain.FormDrafts.PREHOSPITAL_FORM)
        else drafts.save(user, sv.edu.catolica.climesa.domain.FormDrafts.PREHOSPITAL_FORM, sv.edu.catolica.climesa.domain.FormDrafts.prehospital(serviceId, form))
    }

    /** A72 / FR-109-10: sin señal el reporte queda en cola con el mismo cuerpo; se reenvía al reconectar o con "Reintentar". */
    fun sendPrehospital(serviceId: String, capturedAt: Instant = Instant.now()) {
        AmbulanceRules.prehospitalError(mutable.value.prehospital)?.let { mutable.value = mutable.value.copy(formError = it); return }
        val body = AmbulanceRules.prehospitalBody(mutable.value.prehospital, capturedAt, mutable.value.provisional?.id)
        deliver(QueuedPrehospital(serviceId, body.toString()))
    }

    fun retryQueued() { mutable.value.queued?.let { deliver(it) } }

    private fun deliver(item: QueuedPrehospital) {
        mutable.value = mutable.value.copy(busy = true, formError = null, notice = null)
        viewModelScope.launch {
            try {
                withContext(RequestIntent(item.key)) { api.request("/ambulancia/servicios/${item.serviceId}/prehospital", "POST", JSONObject(item.body)) }
                userId?.let { drafts.clear(it, FormDrafts.PREHOSPITAL_QUEUE); drafts.clear(it, FormDrafts.PREHOSPITAL_FORM); drafts.clear(it, FormDrafts.PROVISIONAL_PATIENT) }
                mutable.value = mutable.value.copy(busy = false, queued = null, prehospital = PrehospitalForm(), provisional = null, notice = "Reporte enviado a emergencia.")
                load()
            } catch (e: CancellationException) { throw e }
            catch (e: Exception) {
                if (isOffline(e)) userId?.let { drafts.save(it, FormDrafts.PREHOSPITAL_QUEUE, JSONObject().put("serviceId", item.serviceId).put("body", item.body).put("key", item.key)) }
                mutable.value = if (isOffline(e)) mutable.value.copy(busy = false, queued = item, notice = "Sin señal: el reporte quedó en cola y se enviará al volver la conexión.")
                else mutable.value.copy(busy = false, queued = null, formError = message(e))
            }
        }
    }

    /** A73 / FR-109-12: identidad provisional con búsqueda previa; se vincula al servicio en el siguiente reporte prehospital. */
    fun registerUnidentified(sex: String, estimatedAge: String, description: String) {
        AmbulanceRules.unidentifiedError(sex, estimatedAge, description)?.let { mutable.value = mutable.value.copy(formError = it); return }
        write {
            val query = "Persona sin identidad"
            val search = api.request("/pacientes/busquedas", "POST", JSONObject().put("query", query)) as JSONObject
            val body = JSONObject().put("givenNames", "").put("surnames", "").put("sex", sex).put("description", description.trim())
                .put("searchToken", search.getString("token")).put("searchQuery", query)
                .apply { estimatedAge.toIntOrNull()?.let { put("estimatedAge", it) } }
            val created = api.request("/pacientes/provisionales", "POST", body) as JSONObject
            val provisional = ProvisionalPatient.fromCreated(created)
            // D21: with `linkedServiceId` the record is already linked to the service; never promise a later link.
            val notice = if (provisional.linked) "Paciente provisional registrado y vinculado al servicio en curso."
            else "Paciente provisional registrado. Se vinculará al servicio con el reporte prehospital."
            mutable.value = mutable.value.copy(provisional = provisional, notice = notice)
            userId?.let { drafts.save(it, FormDrafts.PROVISIONAL_PATIENT, JSONObject().put("id", provisional.id).put("record", provisional.record).apply { provisional.linkedServiceId?.let { s -> put("linkedServiceId", s) } }) }
        }
    }

    fun clearMessages() { mutable.value = mutable.value.copy(error = null, formError = null, notice = null) }

    private fun write(notice: String? = null, work: suspend () -> Unit) {
        mutable.value = mutable.value.copy(busy = true, formError = null, notice = null)
        viewModelScope.launch {
            try { work(); mutable.value = mutable.value.copy(busy = false, notice = notice ?: mutable.value.notice); load() }
            catch (e: CancellationException) { throw e }
            catch (e: Exception) { mutable.value = mutable.value.copy(busy = false, formError = message(e)); load() }
        }
    }

    private fun isOffline(error: Exception) = error is AuthRequestException && error.statusCode == null
    /** Worth retrying later with the same key: no signal, 5xx (Render cold start), 429 or 401 (aligned with `ColdStart.retryable`). */
    private fun transient(error: Exception) = error is AuthRequestException && (error.statusCode == null || error.statusCode >= 500 || error.statusCode == 429 || error.statusCode == 401)

    /** El mensaje sale del `codigo` de la API cuando es una regla conocida; si no, del texto que devolvió. */
    private fun message(error: Exception): String {
        val code = (error as? AuthRequestException)?.code
        return when (code) {
            "ambulancia_ya_despachada" -> "La ambulancia ya fue despachada."
            "sin_paramedico_de_turno" -> "No hay paramédico con cuenta en la app con turno en curso."
            "sin_motorista_de_turno" -> "No hay un motorista con turno en curso."
            "sin_tripulacion_de_turno" -> "No hay paramédico ni motorista con turno en curso."
            "cuenta_no_verificada" -> "Tu cuenta aún no está vinculada a tu expediente; recepción debe verificarla."
            "hito_fuera_de_orden" -> "Ese hito no sigue al último registrado. Se actualizó el servicio."
            "version_conflicto" -> "La unidad o la solicitud cambió. Revisa el estado actual e intenta de nuevo."
            "estado_final_invalido" -> "Ese estado final no corresponde a los hitos registrados. Se actualizó el servicio."
            "servicio_finalizado" -> "El servicio ya terminó; los hitos pendientes se descartaron."
            "solicitud_resuelta" -> "Despacho ya atendió la solicitud; ya no se puede cancelar. Si necesitas ayuda, llama al 911."
            "sin_llegada_hospital" -> "La entrega se marca cuando la ambulancia registra la llegada al hospital."
            "entrega_registrada" -> "Otra persona ya marcó recibido al paciente; se actualizó la entrega."
            "hito_hora_invalida" -> "La hora del hito es anterior al último registrado o tiene más de 24 horas."
            "tripulante_sin_turno" -> "Alguien de la tripulación elegida ya no tiene turno en curso. Se actualizó la lista; elige de nuevo."
            "servicio_cerrado" -> "Pasaron más de 24 horas desde que terminó el servicio."
            else -> userMessage(error, "No se pudo completar la operación.")
        }
    }

    companion object { /** D117: long enough to reach "Deshacer" with gloves on. */ const val MILESTONE_UNDO_MS = 15_000L }
}
