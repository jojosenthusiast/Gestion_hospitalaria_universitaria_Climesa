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
import sv.edu.catolica.climesa.domain.EventoDominio
import sv.edu.catolica.climesa.domain.NoticeEvents
import sv.edu.catolica.climesa.domain.NoticeRefresh
import sv.edu.catolica.climesa.domain.RealtimeSignal
import sv.edu.catolica.climesa.domain.RoleNotice
import sv.edu.catolica.climesa.domain.RoleNoticeParser

/**
 * Avisos de mi tablero de inicio (obs. 14): `GET /me/avisos`, solo lectura. Un evento de aviso hace volver a leer una vez,
 * y la lista se vuelve a leer sola en su `proximoCambio` (un aviso vence o empieza). Si esa lectura falla, se quitan el aviso
 * que cambió o se retiró y los ya vencidos, en lugar de dejarlos a la vista; el tablero no se detiene.
 */
@HiltViewModel
class NoticesViewModel @Inject constructor(private val api: ApiGateway, realtime: RealtimeRepository) : ViewModel() {
    private val mutable = MutableStateFlow<List<RoleNotice>>(emptyList())
    val notices: StateFlow<List<RoleNotice>> = mutable.asStateFlow()
    private val live = LiveSubscription(realtime)
    private var job: Job? = null
    private var timer: Job? = null
    private var started = false

    fun start(channels: List<String>) {
        if (!started) { started = true; load() }
        live.start(viewModelScope, channels) { signal ->
            when (signal) {
                is RealtimeSignal.Event -> if (NoticeEvents.matches(signal.event)) reloadSoon(signal.event)
                RealtimeSignal.Resync -> reloadSoon(null)
                else -> Unit
            }
        }
    }

    private fun reloadSoon(event: EventoDominio?) {
        job?.cancel()
        job = viewModelScope.launch { delay(DEBOUNCE_MS); load(event) }
    }

    private fun load(event: EventoDominio? = null) {
        viewModelScope.launch {
            try {
                val feed = RoleNoticeParser.parseFeed(api.request("/me/avisos"))
                mutable.value = feed.notices
                schedule(feed.nextChange)
            } catch (e: CancellationException) { throw e } catch (_: Exception) {
                mutable.value = NoticeRefresh.afterFailedRefetch(mutable.value, event, System.currentTimeMillis())
            }
        }
    }

    private fun schedule(nextChange: String?) {
        timer?.cancel()
        val wait = NoticeRefresh.delayMs(nextChange, System.currentTimeMillis()) ?: return
        timer = viewModelScope.launch { delay(wait); load() }
    }

    private companion object { const val DEBOUNCE_MS = 400L }
}
