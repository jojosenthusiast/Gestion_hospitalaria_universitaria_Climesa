package sv.edu.catolica.climesa.ui.dashboard

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import sv.edu.catolica.climesa.data.ApiGateway
import sv.edu.catolica.climesa.data.realtime.LiveSubscription
import sv.edu.catolica.climesa.data.realtime.RealtimeRepository
import sv.edu.catolica.climesa.domain.DashboardEvents
import sv.edu.catolica.climesa.domain.DashboardModel
import sv.edu.catolica.climesa.domain.DashboardSource
import sv.edu.catolica.climesa.domain.RealtimeSignal
import sv.edu.catolica.climesa.domain.RoleDashboard

data class DashboardUiState(val loading: Boolean = true, val model: DashboardModel? = null, val error: String? = null)

/**
 * Reads the endpoints the role's dashboard needs (only those its permissions allow), in parallel, and builds the tiles,
 * charts and "needs attention" list in [RoleDashboard]. A source that fails leaves its tiles out; it never shows a made-up
 * zero. Realtime events trigger a debounced silent re-read; there is no timer.
 */
@HiltViewModel
class DashboardViewModel @Inject constructor(private val api: ApiGateway, realtime: RealtimeRepository) : ViewModel() {
    private data class Args(val role: String, val permissions: List<String>, val linked: Boolean, val channels: List<String>)

    private val mutable = MutableStateFlow(DashboardUiState())
    val state: StateFlow<DashboardUiState> = mutable.asStateFlow()
    private val live = LiveSubscription(realtime)
    private var args: Args? = null
    private var job: Job? = null

    /** Idempotent for the same role, permissions and channels: reads once and subscribes to the realtime channels. */
    fun start(role: String, permissions: List<String>, channels: List<String>, linked: Boolean) {
        val next = Args(role, permissions, linked, channels)
        if (next != args) {
            args = next
            load(silent = false)
        }
        live.start(viewModelScope, channels) { signal ->
            when (signal) {
                is RealtimeSignal.Event -> if (DashboardEvents.matches(signal.event)) reloadSoon()
                RealtimeSignal.Resync -> reloadSoon()
                else -> Unit
            }
        }
    }

    fun reload() = load(silent = false)

    private fun reloadSoon() {
        job?.cancel()
        job = viewModelScope.launch { delay(DEBOUNCE_MS); fetch(silent = true) }
    }

    private fun load(silent: Boolean) {
        job?.cancel()
        job = viewModelScope.launch { fetch(silent) }
    }

    private suspend fun fetch(silent: Boolean) {
        val current = args ?: return
        if (!silent) mutable.value = mutable.value.copy(loading = true, error = null)
        val sources = if (current.role == "PAC" && !current.linked) emptyList() else RoleDashboard.sources(current.role, current.permissions)
        val results = coroutineScope { sources.map { source -> async { source to read(source) } }.awaitAll() }
        val data = results.mapNotNull { (source, result) -> result.getOrNull()?.let { source to it } }.toMap()
        val failed = results.filter { it.second.isFailure }.map { it.first }.toSet()
        if (sources.isNotEmpty() && data.isEmpty()) {
            if (silent && mutable.value.model != null) return
            mutable.value = DashboardUiState(loading = false, error = results.firstNotNullOfOrNull { it.second.exceptionOrNull()?.message } ?: "No se pudo cargar el tablero.")
            return
        }
        mutable.value = DashboardUiState(loading = false, model = RoleDashboard.build(current.role, current.permissions, data, failed, linked = current.linked))
    }

    private suspend fun read(source: DashboardSource): Result<Any> =
        try { Result.success(api.request(source.path)) } catch (e: CancellationException) { throw e } catch (e: Exception) { Result.failure(e) }

    private companion object { const val DEBOUNCE_MS = 400L }
}
