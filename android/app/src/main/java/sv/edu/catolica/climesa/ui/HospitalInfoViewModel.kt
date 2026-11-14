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
import sv.edu.catolica.climesa.data.ApiGateway
import sv.edu.catolica.climesa.data.realtime.LiveSubscription
import sv.edu.catolica.climesa.data.realtime.RealtimeRepository
import sv.edu.catolica.climesa.domain.HospitalInfo
import sv.edu.catolica.climesa.domain.HospitalInfoEvents
import sv.edu.catolica.climesa.domain.HospitalInfoParser
import sv.edu.catolica.climesa.domain.RealtimeProtocol
import sv.edu.catolica.climesa.domain.RealtimeSignal

data class HospitalInfoState(val loading: Boolean = true, val info: HospitalInfo = HospitalInfo(), val error: String? = null)

/**
 * A10 · lee los endpoints públicos (spec 112) y vuelve a pedir al llegar un evento del canal `publico` o tras una
 * reconexión. Sin temporizadores: un aviso o turno vencido desaparece con el siguiente evento o al volver a abrir.
 */
@HiltViewModel
class HospitalInfoViewModel @Inject constructor(private val api: ApiGateway, realtime: RealtimeRepository) : ViewModel() {
    private val mutable = MutableStateFlow(HospitalInfoState())
    val state = mutable.asStateFlow()
    private val live = LiveSubscription(realtime)
    private var loadJob: Job? = null

    fun load(silent: Boolean = false) {
        if (!silent) mutable.value = mutable.value.copy(loading = true, error = null)
        loadJob?.cancel()
        loadJob = viewModelScope.launch {
            try {
                val info = HospitalInfo(
                    occupancy = HospitalInfoParser.occupancy(api.request("/publico/ocupacion")),
                    doctors = HospitalInfoParser.doctors(api.request("/publico/medicos-de-turno")),
                    notices = HospitalInfoParser.notices(api.request("/publico/avisos")),
                )
                mutable.value = HospitalInfoState(loading = false, info = info)
            } catch (e: CancellationException) { throw e }
            catch (e: Exception) { if (!silent) mutable.value = mutable.value.copy(loading = false, error = e.message ?: "No se pudo cargar la información del hospital.") }
        }
    }

    /** Solo el canal público: esta pantalla no necesita los canales del rol. */
    fun startLive() {
        live.start(viewModelScope, listOf(RealtimeProtocol.PUBLIC_CHANNEL)) { signal ->
            if (signal is RealtimeSignal.Event && HospitalInfoEvents.matches(signal.event) || signal is RealtimeSignal.Resync) load(silent = true)
        }
    }
}
