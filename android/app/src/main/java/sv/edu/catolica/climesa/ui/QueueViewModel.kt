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
import sv.edu.catolica.climesa.domain.RealtimeSignal

/** Last call, reversible with "Deshacer" (`POST /fila/{id}/deshacer-llamado` with the version the call returned). */
data class UndoableCall(val ticketId: String, val version: Int, val label: String)

data class QueueState(
    val loading: Boolean = true, val tickets: List<QueueTicket> = emptyList(), val busy: Boolean = false, val error: String? = null, val notice: String? = null,
    /** Who goes next in the chosen area (`GET /fila/siguiente`), null until an area is chosen. */
    val next: NextProposal? = null,
    val undo: UndoableCall? = null,
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
                val next = nextService?.let { service -> runCatching { QueueRules.parseNext(api.request("/fila/siguiente?service=$service")) }.getOrNull() }
                mutable.value = mutable.value.copy(loading = false, tickets = tickets, next = next)
            }
            catch (e: CancellationException) { throw e }
            catch (e: Exception) { if (!silent) mutable.value = mutable.value.copy(loading = false, error = message(e)) }
        }
    }

    /** Idempotent per channel list: reloads when a queue event arrives or after a reconnection gap. */
    fun startLive(channels: List<String>) {
        live.start(viewModelScope, channels) { signal ->
            if (signal is RealtimeSignal.Event && QueueEvents.matches(signal.event) || signal is RealtimeSignal.Resync) load(silent = true)
        }
    }

    private var nextService: String? = null
    /** Chooses the area whose "who goes next" proposal is shown; null hides it. */
    fun chooseArea(service: String?) {
        if (service == nextService) return
        nextService = service
        if (service == null) mutable.value = mutable.value.copy(next = null) else load(silent = true)
    }

    fun issue(service: String, priority: String = "rutina") = mutate("/fila", QueueRules.issueBody(service, priority), "Número emitido.")
    fun call(ticket: QueueTicket) = mutate("/fila/${ticket.id}/llamar", JSONObject().put("version", ticket.version), "Número llamado.", undoOf = { result -> undoable(result, ticket.id, QueueLabels.code(ticket)) })
    /** Card menu (keyboard and touch alternative to dragging): the move is one server action the API already allows. */
    fun move(ticket: QueueTicket, move: QueueMove) {
        if (move == QueueMove.CALL) { call(ticket); return }
        val body = if (move == QueueMove.UNDO_CALL) QueueRules.undoBody(ticket.version) else JSONObject().put("version", ticket.version)
        mutate(QueueMoves.path(ticket, move), body, "${QueueLabels.code(ticket)}: ${move.label.lowercase()}.")
    }
    fun undoLastCall() {
        val undo = mutable.value.undo ?: return
        mutate("/fila/${undo.ticketId}/deshacer-llamado", QueueRules.undoBody(undo.version), "Llamado deshecho: el número volvió a la espera.")
    }
    fun changePriority(ticket: QueueTicket, priority: String) = mutate("/fila/${ticket.id}/prioridad", QueueRules.priorityBody(ticket.version, priority), "Prioridad de ${QueueLabels.code(ticket)}: ${QueueLabels.priority(priority)}.")
    fun attend(ticket: QueueTicket) = mutate("/fila/${ticket.id}/atender", JSONObject().put("version", ticket.version), "Atención iniciada.")
    fun complete(ticket: QueueTicket) = mutate("/fila/${ticket.id}/completar", JSONObject().put("version", ticket.version), "Atención completada.")
    fun absent(ticket: QueueTicket) = mutate("/fila/${ticket.id}/no-se-presento", JSONObject().put("version", ticket.version), "Paciente marcado como no presentado.")

    /** The API picks the first waiting number of [service] (`POST /fila/llamar-siguiente`); 409 `fila_sin_espera` when none. */
    fun callNext(service: String) = mutate("/fila/llamar-siguiente", QueueRules.callNextBody(service), "Número llamado.", describe = { result ->
        (result as? JSONObject)?.optInt("numero", 0)?.takeIf { it > 0 }?.let { "Se llamó al N.º $it de ${QueueLabels.service(service)}." }
    }, undoOf = { result -> (result as? JSONObject)?.let { undoable(it, it.optString("id"), "${QueueLabels.areaOf(service)} ${it.optInt("numero")}") } })

    private fun undoable(result: Any, ticketId: String, code: String): UndoableCall? =
        (result as? JSONObject)?.optInt("version", 0)?.takeIf { it > 0 && ticketId.isNotBlank() }?.let { UndoableCall(ticketId, it, "Llamaste $code.") }

    private fun mutate(path: String, body: JSONObject, notice: String, describe: (Any) -> String? = { null }, undoOf: (Any) -> UndoableCall? = { null }) {
        if (mutable.value.busy) return
        mutable.value = mutable.value.copy(busy = true, error = null, notice = null, undo = null)
        val intent = intents.getOrPut(path) { SubmissionIntent() }
        viewModelScope.launch {
            try { val result = intent.send { api.request(path, "POST", body) }; mutable.value = mutable.value.copy(busy = false, notice = describe(result) ?: notice, undo = undoOf(result)); load() }
            catch (e: CancellationException) { throw e }
            catch (e: Exception) { mutable.value = mutable.value.copy(busy = false, error = message(e)) }
        }
    }

    fun clearMessages() { mutable.value = mutable.value.copy(error = null, notice = null) }

    private fun message(error: Exception) = businessMessage(error, "No se pudo completar la operación.")
}
