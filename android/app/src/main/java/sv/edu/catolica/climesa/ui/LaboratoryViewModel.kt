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
)

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
            try { val orders = LaboratoryParser.orders(api.request(path)); mutable.value = mutable.value.copy(loading = false, orders = orders) }
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
