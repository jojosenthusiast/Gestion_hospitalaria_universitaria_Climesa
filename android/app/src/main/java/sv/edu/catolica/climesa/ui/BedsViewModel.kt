package sv.edu.catolica.climesa.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import sv.edu.catolica.climesa.data.AuthRequestException
import sv.edu.catolica.climesa.data.BedRepository
import sv.edu.catolica.climesa.data.realtime.RealtimeRepository
import sv.edu.catolica.climesa.domain.Bed
import sv.edu.catolica.climesa.domain.BedAction
import sv.edu.catolica.climesa.domain.BedEvents
import sv.edu.catolica.climesa.domain.BedRules
import sv.edu.catolica.climesa.domain.ConnectionState
import sv.edu.catolica.climesa.domain.RealtimeSignal
import javax.inject.Inject

data class PendingBedAction(val bedId: String, val action: BedAction)

data class BedsUiState(
    val loading: Boolean = true,
    val beds: List<Bed> = emptyList(),
    val error: String? = null,
    val connection: ConnectionState = ConnectionState.RECONNECTING,
    /** Aviso no fatal: algún canal fue rechazado y quedó fuera; puede que falten avisos de otros roles. */
    val partialLive: Boolean = false,
    val permissions: Set<String> = emptySet(),
    val pending: PendingBedAction? = null,
    val reason: String = "",
    val reasonError: String? = null,
    val submitting: Boolean = false,
    val message: String? = null,
    val actionError: String? = null,
)

@HiltViewModel
class BedsViewModel @Inject constructor(
    private val repository: BedRepository,
    private val realtime: RealtimeRepository,
) : ViewModel() {
    private val mutable = MutableStateFlow(BedsUiState())
    val state: StateFlow<BedsUiState> = mutable.asStateFlow()
    private var loadJob: Job? = null
    private var liveJob: Job? = null
    private var channelsKey: String? = null

    /** Idempotente: se llama al mostrar la pantalla con los canales y permisos de `/auth/me`. */
    fun start(channels: List<String>, permissions: Set<String>) {
        mutable.update { it.copy(permissions = permissions) }
        val key = channels.joinToString("|")
        if (key == channelsKey) return
        channelsKey = key
        mutable.update { it.copy(partialLive = false) }
        liveJob?.cancel()
        reload()
        liveJob = viewModelScope.launch {
            realtime.observe(channels).collect { signal ->
                when (signal) {
                    is RealtimeSignal.State -> mutable.update { it.copy(connection = signal.state) }
                    is RealtimeSignal.Event -> if (BedEvents.matches(signal.event)) reload()
                    RealtimeSignal.Resync -> reload()
                    is RealtimeSignal.ChannelsDropped -> mutable.update { it.copy(partialLive = signal.channels.isNotEmpty()) }
                }
            }
        }
    }

    /** Invalida y vuelve a pedir el tablero; una carga en curso se reemplaza por la más reciente. */
    fun reload() {
        loadJob?.cancel()
        loadJob = viewModelScope.launch {
            try {
                val beds = repository.beds()
                mutable.update { it.copy(loading = false, beds = beds, error = null) }
            } catch (e: Exception) {
                if (e is CancellationException) throw e
                mutable.update { it.copy(loading = false, error = e.message ?: "No se pudo cargar el tablero de camas.") }
            }
        }
    }

    fun select(bed: Bed, action: BedAction) {
        if (action !in BedRules.availableActions(bed, mutable.value.permissions)) return
        mutable.update { it.copy(pending = PendingBedAction(bed.id, action), reason = "", reasonError = null, actionError = null, message = null) }
    }

    fun cancel() = mutable.update { it.copy(pending = null, reason = "", reasonError = null, actionError = null) }

    fun onReason(text: String) = mutable.update { it.copy(reason = text.take(BedRules.MAX_REASON), reasonError = null) }

    fun dismissMessage() = mutable.update { it.copy(message = null) }

    fun confirm() {
        val current = mutable.value
        val pending = current.pending ?: return
        if (current.submitting) return
        val bed = current.beds.firstOrNull { it.id == pending.bedId } ?: return cancel()
        BedRules.validateReason(pending.action, current.reason)?.let { error ->
            mutable.update { it.copy(reasonError = error) }
            return
        }
        mutable.update { it.copy(submitting = true, actionError = null) }
        viewModelScope.launch {
            try {
                repository.act(bed.id, pending.action, bed.version, current.reason)
                mutable.update { it.copy(submitting = false, pending = null, reason = "", message = pending.action.successMessage) }
                reload()
            } catch (e: Exception) {
                if (e is CancellationException) throw e
                val api = e as? AuthRequestException
                val text = BedRules.errorMessage(api?.statusCode, api?.code, e.message)
                mutable.update { it.copy(submitting = false, actionError = text) }
                if (api?.statusCode == 409 || api?.statusCode == 404) reload()
            }
        }
    }
}
