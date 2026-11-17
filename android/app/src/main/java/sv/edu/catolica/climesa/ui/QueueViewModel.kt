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
import org.json.JSONArray
import org.json.JSONObject
import sv.edu.catolica.climesa.data.ApiGateway
import sv.edu.catolica.climesa.data.SubmissionIntent
import sv.edu.catolica.climesa.data.realtime.LiveSubscription
import sv.edu.catolica.climesa.data.realtime.RealtimeRepository
import sv.edu.catolica.climesa.domain.QueueEvents
import sv.edu.catolica.climesa.domain.NextProposal
import sv.edu.catolica.climesa.domain.QueueLabels
import sv.edu.catolica.climesa.domain.QueueMove
import sv.edu.catolica.climesa.domain.QueueMoves
import sv.edu.catolica.climesa.domain.QueueRules
import sv.edu.catolica.climesa.domain.QueueTicket
import sv.edu.catolica.climesa.domain.QueueOffice
import sv.edu.catolica.climesa.domain.PickerPatient
import sv.edu.catolica.climesa.domain.RealtimeSignal

/** Last call, reversible with "Deshacer" (`POST /fila/{id}/deshacer-llamado` with the version the call returned). */
data class UndoableCall(val ticketId: String, val version: Int, val label: String)

data class QueueState(
    val loading: Boolean = true, val tickets: List<QueueTicket> = emptyList(), val busy: Boolean = false, val error: String? = null, val notice: String? = null,
    /** Who goes next in the chosen area (`GET /fila/siguiente`), null until an area is chosen. */
    val next: NextProposal? = null,
    /** "Calculando…" while the proposal of the chosen area is being read, and its error (B6: three states, like the web). */
    val nextLoading: Boolean = false,
    val nextError: String? = null,
    val undo: UndoableCall? = null,
    /** Patient chosen for "Emitir número" (`patientId` is required for reception). */
    val issueSearch: PatientSearchState = PatientSearchState(),
    /** Active consulting rooms (`GET /espacios`), the optional destination of "Llamar siguiente". */
    val offices: List<QueueOffice> = emptyList(),
)

@HiltViewModel
class QueueViewModel @Inject constructor(private val api: ApiGateway, realtime: RealtimeRepository) : ViewModel() {
    private val mutable = MutableStateFlow(QueueState())
    val state = mutable.asStateFlow()
    private val live = LiveSubscription(realtime)
    private var loadJob: Job? = null
    /** One user intent per command path: a retry of the same command reuses its Idempotency-Key. */
    private val intents = mutableMapOf<String, SubmissionIntent>()

    /**
     * Loads the queue. A [silent] reload (realtime invalidation) keeps the current list and messages visible and
     * keeps the shown tickets if it fails. A newer load replaces one still running.
     */
    fun load(silent: Boolean = false) {
        if (!silent) mutable.value = mutable.value.copy(loading = true, error = null)
        loadJob?.cancel()
        loadJob = viewModelScope.launch {
            try {
                val tickets = QueueRules.parse(api.request("/fila"))
                mutable.value = mutable.value.copy(loading = false, tickets = tickets)
                loadNext()
            }
            catch (e: CancellationException) { throw e }
            catch (e: Exception) {
                mutable.value = mutable.value.copy(nextLoading = false)
                if (!silent) mutable.value = mutable.value.copy(loading = false, error = message(e))
            }
        }
    }

    /** Idempotent per channel list: reloads when a queue event arrives or after a reconnection gap. */
    fun startLive(channels: List<String>) {
        live.start(viewModelScope, channels) { signal ->
            if (signal is RealtimeSignal.Event && QueueEvents.matches(signal.event) || signal is RealtimeSignal.Resync) load(silent = true)
        }
    }

    /** The proposal of the chosen area; a failure is shown in the panel instead of reading as "nobody waiting". */
    private suspend fun loadNext() {
        val service = nextService ?: return
        mutable.value = mutable.value.copy(nextLoading = true)
        try {
            val next = QueueRules.parseNext(api.request("/fila/siguiente?service=$service"))
            if (service == nextService) mutable.value = mutable.value.copy(next = next, nextLoading = false, nextError = null)
        } catch (e: CancellationException) { throw e }
        catch (e: Exception) { if (service == nextService) mutable.value = mutable.value.copy(nextLoading = false, nextError = userMessage(e, "No se pudo calcular quién pasa después.")) }
    }

    private var nextService: String? = null
    /** Chooses the area whose "who goes next" proposal is shown; null hides it. */
    fun chooseArea(service: String?) {
        if (service == nextService) return
        nextService = service
        mutable.value = mutable.value.copy(next = null, nextError = null, nextLoading = service != null)
        if (service != null) load(silent = true)
    }

    private val patients = PatientSelectorSearch(api, viewModelScope, { mutable.value.issueSearch }) { change -> mutable.value = mutable.value.copy(issueSearch = change(mutable.value.issueSearch)) }
    /** Wait between keystrokes of the patient search; tests set it to zero. */
    internal var debounceMs: Long
        get() = patients.debounceMs
        set(value) { patients.debounceMs = value }
    fun issueQuery(text: String) = patients.query(text)
    fun moreIssuePatients() = patients.more()
    fun pickIssuePatient(patient: PickerPatient?) = patients.pick(patient)
    /** Clears the chosen patient when the dialog closes, so the next number starts with a new search. */
    fun resetIssue() { patients.cancel(); mutable.value = mutable.value.copy(issueSearch = PatientSearchState()) }

    /** Reception issues the number for the chosen patient; without one nothing is sent. */
    fun issue(service: String, priority: String = "rutina") {
        val patient = mutable.value.issueSearch.patient ?: run { mutable.value = mutable.value.copy(error = "Elige al paciente que recibe el número."); return }
        mutate("/fila", QueueRules.issueBody(service, priority, patient.id), "Número emitido para ${patient.name}.", onDone = { resetIssue() })
    }

    /** Consulting rooms for "Llamar siguiente" (only for accounts with `espacios.ver`); a failure leaves the call without room. */
    fun loadOffices() {
        viewModelScope.launch {
            try { mutable.value = mutable.value.copy(offices = QueueRules.offices(api.request("/espacios"))) }
            catch (e: CancellationException) { throw e }
            catch (_: Exception) { mutable.value = mutable.value.copy(offices = emptyList()) }
        }
    }
    fun call(ticket: QueueTicket) = mutate("/fila/${ticket.id}/llamar", JSONObject().put("version", ticket.version), "Número llamado.", undoOf = { result -> undoable(result, ticket.id, QueueLabels.code(ticket)) })
    /** Card menu (keyboard and touch alternative to dragging): the move is one server action the API already allows. */
    fun move(ticket: QueueTicket, move: QueueMove) {
        if (move == QueueMove.CALL) { call(ticket); return }
        val body = if (move == QueueMove.UNDO_CALL || move == QueueMove.REMOVE_CALL) QueueRules.undoBody(ticket.version) else JSONObject().put("version", ticket.version)
        mutate(QueueMoves.path(ticket, move), body, "${QueueLabels.code(ticket)}: ${move.label.lowercase()}.")
    }
    fun undoLastCall() {
        val undo = mutable.value.undo ?: return
        mutate("/fila/${undo.ticketId}/deshacer-llamado", QueueRules.undoBody(undo.version), "Llamado deshecho.")
    }
    fun changePriority(ticket: QueueTicket, priority: String) = mutate("/fila/${ticket.id}/prioridad", QueueRules.priorityBody(ticket.version, priority), "Prioridad de ${QueueLabels.code(ticket)}: ${QueueLabels.priority(priority)}.")
    fun attend(ticket: QueueTicket) = mutate("/fila/${ticket.id}/atender", JSONObject().put("version", ticket.version), "Atención iniciada.")
    fun complete(ticket: QueueTicket) = mutate("/fila/${ticket.id}/completar", JSONObject().put("version", ticket.version), "Atención completada.")
    fun absent(ticket: QueueTicket) = mutate("/fila/${ticket.id}/no-se-presento", JSONObject().put("version", ticket.version), "Paciente marcado como no presentado.")

    /**
     * The API picks who goes next in [service] by RN-FILA-SIGUIENTE (priority, appointments in their window, then arrival)
     * with `POST /fila/llamar-siguiente`, optionally to [officeId]; 409 `fila_sin_espera` when nobody waits.
     */
    fun callNext(service: String, officeId: String? = null) = mutate("/fila/llamar-siguiente", QueueRules.callNextBody(service, officeId?.takeIf { it.isNotBlank() }), "Número llamado.", describe = { result ->
        (result as? JSONObject)?.optInt("numero", 0)?.takeIf { it > 0 }?.let { "Se llamó al N.º $it de ${QueueLabels.service(service)}." }
    }, undoOf = { result -> (result as? JSONObject)?.let { undoable(it, it.optString("id"), "${QueueLabels.areaOf(service)} ${it.optInt("numero")}") } })

    private fun undoable(result: Any, ticketId: String, code: String): UndoableCall? =
        (result as? JSONObject)?.optInt("version", 0)?.takeIf { it > 0 && ticketId.isNotBlank() }?.let { UndoableCall(ticketId, it, "Llamaste $code.") }

    private fun mutate(path: String, body: JSONObject, notice: String, describe: (Any) -> String? = { null }, undoOf: (Any) -> UndoableCall? = { null }, onDone: () -> Unit = {}) {
        if (mutable.value.busy) return
        mutable.value = mutable.value.copy(busy = true, error = null, notice = null, undo = null)
        val intent = intents.getOrPut(path) { SubmissionIntent() }
        viewModelScope.launch {
            try { val result = intent.send { api.request(path, "POST", body) }; mutable.value = mutable.value.copy(busy = false, notice = describe(result) ?: notice, undo = undoOf(result)); onDone(); load() }
            catch (e: CancellationException) { throw e }
            catch (e: Exception) { mutable.value = mutable.value.copy(busy = false, error = message(e)) }
        }
    }

    fun clearMessages() { mutable.value = mutable.value.copy(error = null, notice = null) }

    private fun message(error: Exception) = businessMessage(error, "No se pudo completar la operación.")
}
