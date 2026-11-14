package sv.edu.catolica.climesa.ui.dashboard

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import sv.edu.catolica.climesa.data.ApiGateway
import sv.edu.catolica.climesa.data.realtime.LiveSubscription
import sv.edu.catolica.climesa.data.realtime.RealtimeRepository
import sv.edu.catolica.climesa.domain.NoticeEvents
import sv.edu.catolica.climesa.domain.RealtimeSignal
import sv.edu.catolica.climesa.domain.RoleNotice
import sv.edu.catolica.climesa.domain.RoleNoticeParser

/**
 * Avisos de mi tablero de inicio (obs. 14): `GET /me/avisos`, solo lectura. Un aviso nuevo llega con un evento y se vuelve
 * a leer una vez; si la lectura falla se conserva lo último que se vio y el tablero no se detiene. No hay temporizador.
 */
@HiltViewModel
class NoticesViewModel @Inject constructor(private val api: ApiGateway, realtime: RealtimeRepository) : ViewModel() {
    private val mutable = MutableStateFlow<List<RoleNotice>>(emptyList())
    val notices: StateFlow<List<RoleNotice>> = mutable.asStateFlow()
    private val live = LiveSubscription(realtime)
    private var job: Job? = null
    private var started = false

    fun start(channels: List<String>) {
        if (!started) { started = true; load() }
        live.start(viewModelScope, channels) { signal ->
            when (signal) {
                is RealtimeSignal.Event -> if (NoticeEvents.matches(signal.event)) reloadSoon()
                RealtimeSignal.Resync -> reloadSoon()
                else -> Unit
            }
        }
    }

    private fun reloadSoon() {
        job?.cancel()
        job = viewModelScope.launch { delay(DEBOUNCE_MS); load() }
    }

    private fun load() {
        viewModelScope.launch {
            try { mutable.value = RoleNoticeParser.parse(api.request("/me/avisos")) } catch (e: CancellationException) { throw e } catch (_: Exception) { }
        }
    }

    private companion object { const val DEBOUNCE_MS = 400L }
}
