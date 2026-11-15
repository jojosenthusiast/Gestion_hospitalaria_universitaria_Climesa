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
import sv.edu.catolica.climesa.domain.QueueLabels
import sv.edu.catolica.climesa.domain.QueueRules
import sv.edu.catolica.climesa.domain.QueueTicket
import sv.edu.catolica.climesa.domain.RealtimeSignal

data class QueueState(val loading: Boolean = true, val tickets: List<QueueTicket> = emptyList(), val busy: Boolean = false, val error: String? = null, val notice: String? = null)

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
            try { val tickets = QueueRules.parse(api.request("/fila")); mutable.value = mutable.value.copy(loading = false, tickets = tickets) }
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

    fun issue(service: String) = mutate("/fila", JSONObject().put("service", service), "Número emitido.")
    fun call(ticket: QueueTicket) = mutate("/fila/${ticket.id}/llamar", JSONObject().put("version", ticket.version), "Número llamado.")
    fun attend(ticket: QueueTicket) = mutate("/fila/${ticket.id}/atender", JSONObject().put("version", ticket.version), "Atención iniciada.")
    fun complete(ticket: QueueTicket) = mutate("/fila/${ticket.id}/completar", JSONObject().put("version", ticket.version), "Atención completada.")
    fun absent(ticket: QueueTicket) = mutate("/fila/${ticket.id}/no-se-presento", JSONObject().put("version", ticket.version), "Paciente marcado como no presentado.")

    /** The API picks the first waiting number of [service] (`POST /fila/llamar-siguiente`); 409 `fila_sin_espera` when none. */
    fun callNext(service: String) = mutate("/fila/llamar-siguiente", QueueRules.callNextBody(service), "Número llamado.") { result ->
        (result as? JSONObject)?.optInt("numero", 0)?.takeIf { it > 0 }?.let { "Se llamó al N.º $it de ${QueueLabels.service(service)}." }
    }

    private fun mutate(path: String, body: JSONObject, notice: String, describe: (Any) -> String? = { null }) {
        if (mutable.value.busy) return
        mutable.value = mutable.value.copy(busy = true, error = null, notice = null)
        val intent = intents.getOrPut(path) { SubmissionIntent() }
        viewModelScope.launch {
            try { val result = intent.send { api.request(path, "POST", body) }; mutable.value = mutable.value.copy(busy = false, notice = describe(result) ?: notice); load() }
            catch (e: CancellationException) { throw e }
            catch (e: Exception) { mutable.value = mutable.value.copy(busy = false, error = message(e)) }
        }
    }

    fun clearMessages() { mutable.value = mutable.value.copy(error = null, notice = null) }

    private fun message(error: Exception) = businessMessage(error, "No se pudo completar la operación.")
}
