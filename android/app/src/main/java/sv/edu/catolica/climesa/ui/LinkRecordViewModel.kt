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
import sv.edu.catolica.climesa.data.DraftStore
import sv.edu.catolica.climesa.data.NoDraftStore
import sv.edu.catolica.climesa.data.SubmissionIntent
import sv.edu.catolica.climesa.data.realtime.LiveSubscription
import sv.edu.catolica.climesa.data.realtime.RealtimeRepository
import sv.edu.catolica.climesa.domain.LinkEvents
import sv.edu.catolica.climesa.domain.LinkRules
import sv.edu.catolica.climesa.domain.LinkStatus
import sv.edu.catolica.climesa.domain.RealtimeSignal
import java.time.LocalDate
import java.time.ZoneId

/** [since] is the day the pending request was sent from this device ("En revisión desde 16/11"). */
data class LinkRecordState(val status: LinkStatus = LinkStatus.FORM, val busy: Boolean = false, val error: String? = null, val fieldErrors: Map<String, String> = emptyMap(), val since: LocalDate? = null)

/**
 * A03 · Vincular expediente. Sends DUI and date of birth (`POST /cuentas/vinculacion`) and follows the request live:
 * when reception resolves it, `vinculacion.resuelta` arrives on `usuario:<id>` and the screen asks `/me/paciente`
 * (200 approved, 404 still unlinked, so rejected). Nothing private is shown before approval (RN-39).
 */
@HiltViewModel
class LinkRecordViewModel @Inject constructor(private val api: ApiGateway, realtime: RealtimeRepository, private val drafts: DraftStore = NoDraftStore) : ViewModel() {
    private var userId: String? = null
    private val mutable = MutableStateFlow(LinkRecordState())
    val state = mutable.asStateFlow()
    private val live = LiveSubscription(realtime)
    var today: () -> LocalDate = { LocalDate.now(ZoneId.of("America/El_Salvador")) }

    /**
     * The profile of `/auth/me` already says whether the account is linked. G2: without `GET /me/vinculacion` (gap G-1) a
     * request sent from this device is remembered for the session, so coming back shows "En revisión desde …" instead of
     * an empty form; `/me/paciente` then tells whether it was approved meanwhile.
     */
    fun init(patientId: String?, userId: String? = null) {
        this.userId = userId
        if (!patientId.isNullOrBlank()) { forget(); mutable.value = mutable.value.copy(status = LinkStatus.APPROVED, error = null); return }
        if (mutable.value.status != LinkStatus.FORM) return
        val since = userId?.let { drafts.load(it, KEY) }?.optString("since")?.let { runCatching { LocalDate.parse(it) }.getOrNull() } ?: return
        mutable.value = mutable.value.copy(status = LinkStatus.PENDING, since = since)
        verifyLink(resync = true)
    }

    private fun remember(day: LocalDate) { userId?.let { drafts.save(it, KEY, JSONObject().put("since", day.toString())) } }
    private fun forget() { userId?.let { drafts.clear(it, KEY) } }

    /** The link form is one intent until the API answers; retries reuse its Idempotency-Key. */
    private val linkIntent = SubmissionIntent()

    fun submit(dui: String, birth: String) {
        val errors = LinkRules.errors(dui, birth, today())
        if (errors.isNotEmpty()) { mutable.value = mutable.value.copy(fieldErrors = errors, error = null); return }
        mutable.value = mutable.value.copy(busy = true, error = null, fieldErrors = emptyMap())
        viewModelScope.launch {
            try {
                val response = linkIntent.send { api.request("/cuentas/vinculacion", "POST", LinkRules.body(dui, birth)) } as? JSONObject
                val status = LinkRules.statusOf(response?.optString("state").orEmpty()).takeIf { it != LinkStatus.FORM } ?: LinkStatus.PENDING
                if (status == LinkStatus.PENDING) remember(today())
                mutable.value = mutable.value.copy(busy = false, status = status, since = if (status == LinkStatus.PENDING) today() else null)
            } catch (e: CancellationException) { throw e }
            catch (e: Exception) {
                val code = (e as? AuthRequestException)?.code
                mutable.value = when (code) {
                    "vinculacion_pendiente" -> mutable.value.copy(busy = false, status = LinkStatus.PENDING, since = mutable.value.since)
                    "cuenta_ya_vinculada" -> mutable.value.copy(busy = false, status = LinkStatus.APPROVED)
                    else -> mutable.value.copy(busy = false, error = userMessage(e, "No se pudo enviar la solicitud."))
                }
            }
        }
    }

    /** Back to the form after a rejection, to correct the data and ask again. */
    fun retry() { forget(); mutable.value = LinkRecordState() }

    fun startLive(channels: List<String>) {
        live.start(viewModelScope, channels) { signal ->
            val resolved = signal is RealtimeSignal.Event && LinkEvents.matches(signal.event) && LinkEvents.resolved(signal.event)
            if (mutable.value.status == LinkStatus.PENDING && (resolved || signal is RealtimeSignal.Resync)) verifyLink(resync = !resolved)
        }
    }

    /** After a resync nothing is known to be resolved, so a 404 keeps the request in verification. */
    private fun verifyLink(resync: Boolean) {
        viewModelScope.launch {
            try { api.request("/me/paciente"); forget(); mutable.value = mutable.value.copy(status = LinkStatus.APPROVED) }
            catch (e: CancellationException) { throw e }
            catch (e: Exception) {
                if ((e as? AuthRequestException)?.statusCode == 404 && !resync) { forget(); mutable.value = mutable.value.copy(status = LinkStatus.REJECTED) }
            }
        }
    }

    private companion object { const val KEY = "vinculacion:solicitud" }
}
