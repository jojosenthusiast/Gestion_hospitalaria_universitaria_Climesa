package sv.edu.catolica.climesa.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import sv.edu.catolica.climesa.data.ApiClient
import sv.edu.catolica.climesa.data.AuthRequestException
import sv.edu.catolica.climesa.domain.QueueTicket

data class QueueState(val loading: Boolean = true, val tickets: List<QueueTicket> = emptyList(), val busy: Boolean = false, val error: String? = null, val notice: String? = null)

@HiltViewModel
class QueueViewModel @Inject constructor(private val api: ApiClient) : ViewModel() {
    private val mutable = MutableStateFlow(QueueState())
    val state = mutable.asStateFlow()

    fun load() {
        mutable.value = mutable.value.copy(loading = true, error = null)
        viewModelScope.launch {
            try { mutable.value = QueueState(loading = false, tickets = parse(api.request("/fila"))) }
            catch (e: CancellationException) { throw e }
            catch (e: Exception) { mutable.value = mutable.value.copy(loading = false, error = message(e)) }
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
        return (0 until rows.length()).mapNotNull { index -> rows.optJSONObject(index)?.let { row -> QueueTicket(row.optString("id"), row.optString("service"), row.optInt("numero"), row.optString("patientName").ifBlank { "Paciente" }, row.optString("state"), row.optInt("llamados"), row.optInt("version", 1)) } }
    }
    private fun message(error: Exception) = if (error is AuthRequestException) error.message ?: "No se pudo completar la operación." else error.message ?: "No se pudo completar la operación."
}
