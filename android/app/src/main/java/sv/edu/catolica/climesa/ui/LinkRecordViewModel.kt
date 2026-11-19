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
import org.json.JSONObject
import sv.edu.catolica.climesa.data.ApiGateway
import sv.edu.catolica.climesa.data.realtime.LiveSubscription
import sv.edu.catolica.climesa.data.realtime.RealtimeRepository
import sv.edu.catolica.climesa.domain.LinkEvents
import sv.edu.catolica.climesa.domain.LinkStatus
import sv.edu.catolica.climesa.domain.LinkStatusRules
import sv.edu.catolica.climesa.domain.RealtimeSignal

/**
 * [email] is the account's email that Recepción must write on the record. [readError] says why `GET /me/vinculacion`
 * failed; it is shown with a retry and never read as "not linked".
 */
data class LinkRecordState(
    val status: LinkStatus = LinkStatus.LOADING,
    val email: String? = null,
    val readError: String? = null,
)

/**
 * A03 · Vincular expediente (U12). The account joins its record on its own by verified email, so the screen only says
 * where it stands (`GET /me/vinculacion`) and follows it live: `vinculacion.resuelta` on `usuario:<id>` (or a resync) reads
 * it again. Nothing private is shown before the account joins (RN-39).
 */
@HiltViewModel
class LinkRecordViewModel @Inject constructor(private val api: ApiGateway, realtime: RealtimeRepository) : ViewModel() {
    private val mutable = MutableStateFlow(LinkRecordState())
    val state = mutable.asStateFlow()
    private val live = LiveSubscription(realtime)
    private var profileLinked = false
    private var readJob: Job? = null

    fun init(patientId: String?) {
        profileLinked = !patientId.isNullOrBlank()
        if (profileLinked) { readJob?.cancel(); mutable.update { it.copy(status = LinkStatus.LINKED, readError = null) }; return }
        read()
    }

    /** "Volver a intentar" after a failed read. */
    fun reload() = read()

    private fun read() {
        readJob?.cancel()
        mutable.update { if (it.status == LinkStatus.UNAVAILABLE) it.copy(status = LinkStatus.LOADING, readError = null) else it }
        readJob = viewModelScope.launch {
            try {
                val link = LinkStatusRules.parse(api.request("/me/vinculacion") as? JSONObject ?: error("Respuesta inesperada."))
                mutable.update { it.copy(status = LinkStatusRules.status(link, profileLinked), email = link.email, readError = null) }
            } catch (e: CancellationException) { throw e }
            catch (e: Exception) {
                val message = userMessage(e, "No se pudo consultar si tu cuenta ya está vinculada.")
                // Nothing known yet: say so with the retry. A known state stays, with the error above it.
                mutable.update { if (it.status == LinkStatus.LOADING) it.copy(status = LinkStatus.UNAVAILABLE, readError = message) else it.copy(readError = message) }
            }
        }
    }

    fun startLive(channels: List<String>) {
        live.start(viewModelScope, channels) { signal ->
            val matches = signal is RealtimeSignal.Event && LinkEvents.matches(signal.event)
            if (!profileLinked && (matches || signal is RealtimeSignal.Resync)) read()
        }
    }
}
