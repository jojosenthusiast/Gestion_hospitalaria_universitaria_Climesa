package sv.edu.catolica.climesa.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import org.json.JSONArray
import sv.edu.catolica.climesa.data.ApiGateway
import sv.edu.catolica.climesa.data.realtime.LiveSubscription
import sv.edu.catolica.climesa.data.realtime.RealtimeRepository
import sv.edu.catolica.climesa.domain.LinkEvents
import sv.edu.catolica.climesa.domain.LinkRequestRow
import sv.edu.catolica.climesa.domain.RealtimeSignal
import sv.edu.catolica.climesa.domain.ReceptionLinking

data class ReceptionLinkingState(val loading: Boolean = true, val rows: List<LinkRequestRow> = emptyList(), val busyId: String? = null, val error: String? = null, val notice: String? = null)

/** A33: cola de vinculaciones que Recepción verifica (DUI y nacimiento) y aprueba o rechaza con motivo. */
@HiltViewModel
class ReceptionLinkingViewModel @Inject constructor(private val api: ApiGateway, realtime: RealtimeRepository) : ViewModel() {
    private val mutable = MutableStateFlow(ReceptionLinkingState())
    val state = mutable.asStateFlow()
    private val live = LiveSubscription(realtime)

    fun load() {
        viewModelScope.launch {
            mutable.update { it.copy(loading = true, error = null) }
            try {
                val rows = ReceptionLinking.parse(api.request("/cuentas/vinculaciones") as? JSONArray ?: JSONArray())
                mutable.update { it.copy(loading = false, rows = rows) }
            } catch (e: CancellationException) { throw e } catch (e: Exception) {
                mutable.update { it.copy(loading = false, error = e.message ?: "No se pudieron cargar las vinculaciones.") }
            }
        }
    }

    /** Las solicitudes nuevas entran solas: cualquier evento de vinculación vuelve a pedir la lista. */
    fun startLive(channels: List<String>) {
        live.start(viewModelScope, channels) { signal ->
            if (signal is RealtimeSignal.Event && LinkEvents.matches(signal.event) || signal is RealtimeSignal.Resync) load()
        }
    }

    fun approve(row: LinkRequestRow) {
        if (!row.canApprove || mutable.value.busyId != null) return
        resolve(row, "aprobar", ReceptionLinking.approveBody(row), "Vinculación aprobada: la cuenta ya ve su expediente.")
    }

    fun reject(row: LinkRequestRow, reason: String) {
        ReceptionLinking.rejectError(reason)?.let { message -> mutable.update { it.copy(error = message) }; return }
        if (mutable.value.busyId != null) return
        resolve(row, "rechazar", ReceptionLinking.rejectBody(row, reason), "Vinculación rechazada. El paciente verá tu motivo.")
    }

    private fun resolve(row: LinkRequestRow, verb: String, body: org.json.JSONObject, done: String) {
        mutable.update { it.copy(busyId = row.id, error = null, notice = null) }
        viewModelScope.launch {
            try {
                api.request("/cuentas/vinculaciones/${row.id}/$verb", "POST", body)
                mutable.update { it.copy(busyId = null, notice = done) }
                load()
            } catch (e: CancellationException) { throw e } catch (e: Exception) {
                mutable.update { it.copy(busyId = null, error = e.message ?: "No se pudo resolver la vinculación.") }
                load()
            }
        }
    }

    fun clearMessages() { mutable.update { it.copy(error = null, notice = null) } }
    override fun onCleared() { live.stop(); super.onCleared() }
}
