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
import sv.edu.catolica.climesa.domain.parseMillis

data class LaboratoryState(val loading: Boolean = true, val orders: List<LaboratoryOrder> = emptyList(), val busy: Boolean = false, val error: String? = null, val notice: String? = null)

@HiltViewModel
class LaboratoryViewModel @Inject constructor(private val api: ApiGateway, realtime: RealtimeRepository) : ViewModel() {
    private val mutable = MutableStateFlow(LaboratoryState())
    val state = mutable.asStateFlow()
    private val live = LiveSubscription(realtime)
    private var loadJob: Job? = null
    /** Source of the list: the lab queue, or `/me/laboratorio` for the patient (A07: state always, values only reviewed). */
    var path: String = "/laboratorio/ordenes"

    /** A [silent] reload (realtime invalidation) keeps the shown orders and messages, even if it fails. */
    fun load(silent: Boolean = false) {
        if (!silent) mutable.value = mutable.value.copy(loading = true, error = null)
        loadJob?.cancel()
        loadJob = viewModelScope.launch {
            try { val orders = parse(api.request(path)); mutable.value = mutable.value.copy(loading = false, orders = orders) }
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

    fun review(order: LaboratoryOrder) = mutate("/laboratorio/ordenes/${order.id}/revisar", JSONObject().put("version", order.version), "Resultados revisados y liberados.")

    fun clearMessages() { mutable.value = mutable.value.copy(error = null, notice = null) }

    private fun mutate(path: String, body: JSONObject, notice: String) {
        mutable.value = mutable.value.copy(busy = true, error = null, notice = null)
        viewModelScope.launch {
            try { api.request(path, "POST", body); mutable.value = mutable.value.copy(busy = false, notice = notice); load(silent = true) }
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
            LaboratoryOrder(
                row.optString("id"), row.optString("patientName").ifBlank { "Paciente" }, row.optString("priority"), row.optString("state"), row.optInt("version", 1), items, !row.isNull("reviewedAt"),
                record = row.optString("patientRecord").ifBlank { null }, sex = row.optString("patientSex").ifBlank { null },
                age = if (!row.isNull("patientAge")) "${row.optInt("patientAge")} años" else row.optString("patientAgeRange").takeIf(String::isNotBlank)?.let { "$it años" },
                doctorName = row.optString("doctorName").ifBlank { null }, createdAtMillis = parseMillis(row.optString("createdAt")),
            )
        } }
    }

    private fun message(error: Exception) = if (error is AuthRequestException) error.message ?: "No se pudo completar la operación." else error.message ?: "No se pudo completar la operación."
}
