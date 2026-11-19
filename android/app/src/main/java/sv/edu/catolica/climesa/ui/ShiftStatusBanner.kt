package sv.edu.catolica.climesa.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
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
import sv.edu.catolica.climesa.domain.ActiveShiftStatus
import sv.edu.catolica.climesa.domain.LiveEntities
import sv.edu.catolica.climesa.domain.RealtimeSignal
import sv.edu.catolica.climesa.domain.ShiftGate
import sv.edu.catolica.climesa.ui.icons.ClimesaIcons

/**
 * Lote 5 S9: the account's shift state, read at session start and on every resume (no polling) and again when a shift
 * changes (`turno` events). Any failure, including the 404 of an API without the endpoint, leaves [status] null: no banner,
 * and the API keeps refusing writes with its own message.
 */
@HiltViewModel
class ShiftStatusViewModel @Inject constructor(private val api: ApiGateway, realtime: RealtimeRepository) : ViewModel() {
    private val mutable = MutableStateFlow<ActiveShiftStatus?>(null)
    val status = mutable.asStateFlow()
    private val live = LiveSubscription(realtime)
    private var job: Job? = null

    fun load() {
        job?.cancel()
        job = viewModelScope.launch {
            mutable.value = try { ShiftGate.parse(api.request(ShiftGate.PATH)) }
            catch (e: CancellationException) { throw e }
            catch (e: Exception) { null }
        }
    }

    fun start(channels: List<String>) = live.start(viewModelScope, channels) { signal ->
        when (signal) {
            is RealtimeSignal.Event -> if (LiveEntities.matches(signal.event, "turno")) load()
            RealtimeSignal.Resync -> load()
            else -> Unit
        }
    }
}

/**
 * Compact, persistent notice under the top bar while the account has no active shift: one line that says reading still
 * works, plus the next published shift. Draws nothing otherwise. The same view model instance serves every screen of the
 * activity, so «Mis turnos» and the ward can read it too.
 */
@Composable
internal fun ShiftStatusBanner(channels: List<String>, model: ShiftStatusViewModel = viewModel()) {
    androidx.lifecycle.compose.LifecycleResumeEffect(Unit) { model.load(); onPauseOrDispose { } }
    androidx.compose.runtime.LaunchedEffect(channels) { model.start(channels) }
    val status by model.status.collectAsStateWithLifecycle()
    val text = ShiftGate.banner(status) ?: return
    val c = MaterialTheme.climesa
    Surface(
        Modifier.fillMaxWidth().semantics { liveRegion = LiveRegionMode.Polite },
        color = c.warningSoft,
        contentColor = c.warning,
    ) {
        Row(Modifier.padding(horizontal = Spacing.page, vertical = Spacing.sm), horizontalArrangement = Arrangement.spacedBy(Spacing.sm), verticalAlignment = Alignment.Top) {
            Icon(ClimesaIcons.Info, null, Modifier.padding(top = 1.dp).size(18.dp))
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(text.title, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurface)
                text.next?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
            }
        }
    }
}
