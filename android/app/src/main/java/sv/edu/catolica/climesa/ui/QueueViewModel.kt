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
import sv.edu.catolica.climesa.data.AuthRequestException
import sv.edu.catolica.climesa.data.realtime.LiveSubscription
import sv.edu.catolica.climesa.data.realtime.RealtimeRepository
import sv.edu.catolica.climesa.domain.QueueEvents
import sv.edu.catolica.climesa.domain.QueueTicket
import sv.edu.catolica.climesa.domain.RealtimeSignal
import sv.edu.catolica.climesa.domain.parseMillis

data class QueueState(val loading: Boolean = true, val tickets: List<QueueTicket> = emptyList(), val busy: Boolean = false, val error: String? = null, val notice: String? = null)

@HiltViewModel
class QueueViewModel @Inject constructor(private val api: ApiGateway, realtime: RealtimeRepository) : ViewModel() {
    private val mutable = MutableStateFlow(QueueState())
    val state = mutable.asStateFlow()
    private val live = LiveSubscription(realtime)
    private var loadJob: Job? = null

    /**
     * Loads the queue. A [silent] reload (realtime invalidation) keeps the current list and messages visible and
     * keeps the shown tickets if it fails. A newer load replaces one still running.
     */
    fun load(silent: Boolean = false) {
        if (!silent) mutable.value = mutable.value.copy(loading = true, error = null)
        loadJob?.cancel()
        loadJob = viewModelScope.launch {
            try { val tickets = parse(api.request("/fila")); mutable.value = mutable.value.copy(loading = false, tickets = tickets) }
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

    private fun mutate(path: String, body: JSONObject, notice: String) {
        mutable.value = mutable.value.copy(busy = true, error = null, notice = null)
        viewModelScope.launch {
            try { api.request(path, "POST", body); mutable.value = mutable.value.copy(busy = false, notice = notice); load() }
            catch (e: CancellationException) { throw e }
            catch (e: Exception) { mutable.value = mutable.value.copy(busy = false, error = message(e)) }
        }
    }

    fun clearMessages() { mutable.value = mutable.value.copy(error = null, notice = null) }

    private fun parse(value: Any): List<QueueTicket> {
        val rows = value as? JSONArray ?: return emptyList()
        return (0 until rows.length()).mapNotNull { index -> rows.optJSONObject(index)?.let { row -> QueueTicket(row.optString("id"), row.optString("service"), row.optInt("numero"), row.optString("patientName").ifBlank { "Paciente" }, row.optString("state"), row.optInt("llamados"), row.optInt("version", 1), parseMillis(row.optString("issuedAt"))) } }
    }
    private fun message(error: Exception) = if (error is AuthRequestException) error.message ?: "No se pudo completar la operación." else error.message ?: "No se pudo completar la operación."
}
