package sv.edu.catolica.climesa.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import org.json.JSONObject
import sv.edu.catolica.climesa.data.ApiGateway
import sv.edu.catolica.climesa.data.AuthRequestException
import sv.edu.catolica.climesa.data.realtime.LiveSubscription
import sv.edu.catolica.climesa.data.realtime.RealtimeRepository
import sv.edu.catolica.climesa.domain.LinkEvents
import sv.edu.catolica.climesa.domain.LinkRules
import sv.edu.catolica.climesa.domain.LinkStatus
import sv.edu.catolica.climesa.domain.RealtimeSignal
import java.time.LocalDate
import java.time.ZoneId

data class LinkRecordState(val status: LinkStatus = LinkStatus.FORM, val busy: Boolean = false, val error: String? = null, val fieldErrors: Map<String, String> = emptyMap())

/**
 * A03 · Vincular expediente. Sends DUI and date of birth (`POST /cuentas/vinculacion`) and follows the request live:
 * when reception resolves it, `vinculacion.resuelta` arrives on `usuario:<id>` and the screen asks `/me/paciente`
 * (200 approved, 404 still unlinked, so rejected). Nothing private is shown before approval (RN-39).
 */
@HiltViewModel
class LinkRecordViewModel @Inject constructor(private val api: ApiGateway, realtime: RealtimeRepository) : ViewModel() {
    private val mutable = MutableStateFlow(LinkRecordState())
    val state = mutable.asStateFlow()
    private val live = LiveSubscription(realtime)
    var today: () -> LocalDate = { LocalDate.now(ZoneId.of("America/El_Salvador")) }

    /** The profile of `/auth/me` already says whether the account is linked. */
    fun init(patientId: String?) {
        if (!patientId.isNullOrBlank()) mutable.value = mutable.value.copy(status = LinkStatus.APPROVED, error = null)
    }

    fun submit(dui: String, birth: String) {
        val errors = LinkRules.errors(dui, birth, today())
        if (errors.isNotEmpty()) { mutable.value = mutable.value.copy(fieldErrors = errors, error = null); return }
        mutable.value = mutable.value.copy(busy = true, error = null, fieldErrors = emptyMap())
        viewModelScope.launch {
            try {
                val response = api.request("/cuentas/vinculacion", "POST", LinkRules.body(dui, birth)) as? JSONObject
                mutable.value = mutable.value.copy(busy = false, status = LinkRules.statusOf(response?.optString("state").orEmpty()).takeIf { it != LinkStatus.FORM } ?: LinkStatus.PENDING)
            } catch (e: CancellationException) { throw e }
            catch (e: Exception) {
                val code = (e as? AuthRequestException)?.code
                mutable.value = when (code) {
                    "vinculacion_pendiente" -> mutable.value.copy(busy = false, status = LinkStatus.PENDING)
                    "cuenta_ya_vinculada" -> mutable.value.copy(busy = false, status = LinkStatus.APPROVED)
                    else -> mutable.value.copy(busy = false, error = e.message ?: "No se pudo enviar la solicitud.")
                }
            }
        }
    }

    /** Back to the form after a rejection, to correct the data and ask again. */
    fun retry() { mutable.value = LinkRecordState() }

    fun startLive(channels: List<String>) {
        live.start(viewModelScope, channels) { signal ->
            val resolved = signal is RealtimeSignal.Event && LinkEvents.matches(signal.event) && LinkEvents.resolved(signal.event)
            if (mutable.value.status == LinkStatus.PENDING && (resolved || signal is RealtimeSignal.Resync)) verifyLink(resync = !resolved)
        }
    }

    /** After a resync nothing is known to be resolved, so a 404 keeps the request in verification. */
    private fun verifyLink(resync: Boolean) {
        viewModelScope.launch {
            try { api.request("/me/paciente"); mutable.value = mutable.value.copy(status = LinkStatus.APPROVED) }
            catch (e: CancellationException) { throw e }
            catch (e: Exception) {
                if ((e as? AuthRequestException)?.statusCode == 404 && !resync) mutable.value = mutable.value.copy(status = LinkStatus.REJECTED)
            }
        }
    }
}
