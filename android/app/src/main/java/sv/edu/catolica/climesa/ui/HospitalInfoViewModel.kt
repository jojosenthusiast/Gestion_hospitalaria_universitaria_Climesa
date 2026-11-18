package sv.edu.catolica.climesa.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import sv.edu.catolica.climesa.data.ApiGateway
import sv.edu.catolica.climesa.data.realtime.LiveSubscription
import sv.edu.catolica.climesa.data.realtime.RealtimeRepository
import sv.edu.catolica.climesa.domain.HospitalInfo
import sv.edu.catolica.climesa.domain.HospitalInfoEvents
import sv.edu.catolica.climesa.domain.HospitalInfoParser
import sv.edu.catolica.climesa.domain.HospitalInfoPart
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

    /**
     * Each part is read on its own (iOS `Part`): one failing endpoint shows its own notice and the others stay. Only when
     * every part fails does the screen show the error. A silent reload keeps a part that fails now with its last value.
     * The location (`/publico/hospital`) does not change with events, so it is read once.
     */
    fun load(silent: Boolean = false) {
        if (!silent) mutable.update { it.copy(loading = true, error = null) }
        loadJob?.cancel()
        loadJob = viewModelScope.launch {
            val previous = mutable.value.info
            var firstError: Exception? = null
            suspend fun <T> part(path: String, parse: (Any?) -> T): T? = try { parse(api.request(path)) }
                catch (e: CancellationException) { throw e } catch (e: Exception) { firstError = firstError ?: e; null }
            val occupancy = part("/publico/ocupacion", HospitalInfoParser::occupancy)
            val doctors = part("/publico/medicos-de-turno", HospitalInfoParser::doctors)
            val notices = part("/publico/avisos", HospitalInfoParser::notices)
            val location = previous.location ?: part("/publico/hospital", HospitalInfoParser::location)
            if (occupancy == null && doctors == null && notices == null) {
                // Nothing to show: a silent reload keeps what is on screen; otherwise the screen says why.
                if (!silent) mutable.update { it.copy(loading = false, error = userMessage(firstError ?: Exception(), "No se pudo cargar la información del hospital.")) }
                return@launch
            }
            // A silent reload keeps the last good value of a part that fails now.
            val keep = silent && mutable.value.error == null
            fun <T> kept(now: T?, old: T, part: HospitalInfoPart): T? = now ?: old.takeIf { keep && part !in previous.failed }
            val occ = kept(occupancy, previous.occupancy, HospitalInfoPart.OCCUPANCY)
            val docs = kept(doctors, previous.doctors, HospitalInfoPart.DOCTORS)
            val news = kept(notices, previous.notices, HospitalInfoPart.NOTICES)
            val info = HospitalInfo(
                occupancy = occ.orEmpty(), doctors = docs.orEmpty(), notices = news.orEmpty(), location = location,
                failed = setOfNotNull(
                    HospitalInfoPart.OCCUPANCY.takeIf { occ == null }, HospitalInfoPart.DOCTORS.takeIf { docs == null },
                    HospitalInfoPart.NOTICES.takeIf { news == null }, HospitalInfoPart.LOCATION.takeIf { location == null },
                ),
            )
            mutable.update { HospitalInfoState(loading = false, info = info) }
        }
    }

    /** Solo el canal público: esta pantalla no necesita los canales del rol. */
    fun startLive() {
        live.start(viewModelScope, listOf(RealtimeProtocol.PUBLIC_CHANNEL)) { signal ->
            if (signal is RealtimeSignal.Event && HospitalInfoEvents.matches(signal.event) || signal is RealtimeSignal.Resync) load(silent = true)
        }
    }
}
