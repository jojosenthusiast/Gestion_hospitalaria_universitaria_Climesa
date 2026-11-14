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
import sv.edu.catolica.climesa.data.realtime.LiveSubscription
import sv.edu.catolica.climesa.data.realtime.RealtimeRepository
import sv.edu.catolica.climesa.data.AuthRequestException
import sv.edu.catolica.climesa.domain.LaboratoryEvents
import sv.edu.catolica.climesa.domain.LaboratoryItem
import sv.edu.catolica.climesa.domain.LaboratoryOrder
import sv.edu.catolica.climesa.domain.LaboratoryResult
import sv.edu.catolica.climesa.domain.RealtimeSignal

data class LaboratoryState(val loading: Boolean = true, val orders: List<LaboratoryOrder> = emptyList(), val busy: Boolean = false, val error: String? = null, val notice: String? = null)

@HiltViewModel
class LaboratoryViewModel @Inject constructor(private val api: ApiGateway, realtime: RealtimeRepository) : ViewModel() {
    private val mutable = MutableStateFlow(LaboratoryState())
    val state = mutable.asStateFlow()
    private val live = LiveSubscription(realtime)
    private var loadJob: Job? = null

    /** A [silent] reload (realtime invalidation) keeps the shown orders and messages, even if it fails. */
    fun load(silent: Boolean = false) {
        if (!silent) mutable.value = mutable.value.copy(loading = true, error = null)
        loadJob?.cancel()
        loadJob = viewModelScope.launch {
            try { val orders = parse(api.request("/laboratorio/ordenes")); mutable.value = mutable.value.copy(loading = false, orders = orders) }
            catch (e: CancellationException) { throw e }
            catch (e: Exception) { if (!silent) mutable.value = mutable.value.copy(loading = false, error = message(e)) }
        }
    }

    /** Idempotent per channel list: reloads when a laboratory event arrives or after a reconnection gap. */
    fun startLive(channels: List<String>) {
        live.start(viewModelScope, channels) { signal ->
            if (signal is RealtimeSignal.Event && LaboratoryEvents.matches(signal.event) || signal is RealtimeSignal.Resync) load(silent = true)
        }
    }

    /** [onDone] runs only after the API accepts the sample, so the identity form survives a failure. */
    fun sample(order: LaboratoryOrder, expediente: String, nombreCompleto: String, onDone: () -> Unit = {}) = mutate(
        "/laboratorio/ordenes/${order.id}/muestra",
        JSONObject().put("version", order.version).put("expediente", expediente.trim()).put("nombreCompleto", nombreCompleto.trim()),
        "Muestra tomada.",
        onDone,
    )
    fun complete(order: LaboratoryOrder) = mutate("/laboratorio/ordenes/${order.id}/completar", JSONObject().put("version", order.version), "Orden completada.")
    fun review(order: LaboratoryOrder) = mutate("/laboratorio/ordenes/${order.id}/revisar", JSONObject().put("version", order.version), "Resultados revisados y liberados.")

    /** [onDone] runs only after the API accepts the result, so the captured value survives a failure. */
    fun saveResult(order: LaboratoryOrder, item: LaboratoryItem, value: String, text: String, onDone: () -> Unit = {}) {
        val body = JSONObject().put("orderItemId", item.id)
        if (value.trim().isNotBlank()) body.put("value", value.trim().toDoubleOrNull() ?: run { mutable.value = mutable.value.copy(error = "El valor debe ser numérico."); return })
        else if (text.trim().isNotBlank()) body.put("text", text.trim())
        else { mutable.value = mutable.value.copy(error = "Captura un valor numérico o un texto."); return }
        mutate("/laboratorio/ordenes/${order.id}/resultados", body, "Resultado guardado.", onDone)
    }

    fun clearMessages() { mutable.value = mutable.value.copy(error = null, notice = null) }

    private fun mutate(path: String, body: JSONObject, notice: String, onDone: () -> Unit = {}) {
        mutable.value = mutable.value.copy(busy = true, error = null, notice = null)
        viewModelScope.launch {
            try { api.request(path, "POST", body); mutable.value = mutable.value.copy(busy = false, notice = notice); onDone(); load(silent = true) }
            catch (e: CancellationException) { throw e }
            catch (e: Exception) { mutable.value = mutable.value.copy(busy = false, error = message(e)) }
        }
    }

    private fun parse(value: Any): List<LaboratoryOrder> {
        val rows = value as? JSONArray ?: return emptyList()
        return (0 until rows.length()).mapNotNull { index -> rows.optJSONObject(index)?.let { row ->
            val items = row.optJSONArray("items")?.let { array -> (0 until array.length()).mapNotNull { itemIndex -> array.optJSONObject(itemIndex)?.let { item ->
                val result = item.optJSONObject("result")?.let { LaboratoryResult(if (it.isNull("value")) null else it.optDouble("value"), it.optString("text").takeIf(String::isNotBlank), it.optString("mark"), it.optInt("version", 1)) }
                LaboratoryItem(item.optString("id"), item.optString("code"), item.optString("name"), result)
            } } } ?: emptyList()
            LaboratoryOrder(row.optString("id"), row.optString("patientName").ifBlank { "Paciente" }, row.optString("priority"), row.optString("state"), row.optInt("version", 1), items, !row.isNull("reviewedAt"))
        } }
    }

    private fun message(error: Exception) = if (error is AuthRequestException) error.message ?: "No se pudo completar la operación." else error.message ?: "No se pudo completar la operación."
}
