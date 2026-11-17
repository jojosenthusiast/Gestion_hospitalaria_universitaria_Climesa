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
import sv.edu.catolica.climesa.data.AuthRequestException
import sv.edu.catolica.climesa.data.SubmissionIntent
import sv.edu.catolica.climesa.data.realtime.LiveSubscription
import sv.edu.catolica.climesa.data.realtime.RealtimeRepository
import sv.edu.catolica.climesa.domain.LinkDeclared
import sv.edu.catolica.climesa.domain.LinkEvents
import sv.edu.catolica.climesa.domain.LinkRequest
import sv.edu.catolica.climesa.domain.LinkRules
import sv.edu.catolica.climesa.domain.LinkScreen
import sv.edu.catolica.climesa.domain.LinkStatus
import sv.edu.catolica.climesa.domain.LinkStatusRules
import sv.edu.catolica.climesa.domain.RealtimeSignal
import java.time.LocalDate
import java.time.ZoneId

/**
 * [since] is the day the pending request was sent ("En revisión desde 16/11"). [readError] says why
 * `GET /me/vinculacion` failed; it is shown with a retry and never read as "no request". [prefill] is what the account
 * declared, applied once to the form after "Volver a pedir".
 */
data class LinkRecordState(
    val status: LinkStatus = LinkStatus.LOADING,
    val busy: Boolean = false,
    val error: String? = null,
    val fieldErrors: Map<String, String> = emptyMap(),
    val since: LocalDate? = null,
    val rejectionReason: String? = null,
    val readError: String? = null,
    val prefill: LinkDeclared? = null,
)

/**
 * A03 · Vincular expediente. The screen opens on the real state of the request (`GET /me/vinculacion`, G2), sends DUI
 * and date of birth (`POST /cuentas/vinculacion`) and follows the request live: `vinculacion.resuelta` on
 * `usuario:<id>` (or a resync) reads it again. Nothing private is shown before approval (RN-39). Nothing is kept on the
 * device, so a sign-out never brings back an empty form.
 */
@HiltViewModel
class LinkRecordViewModel @Inject constructor(private val api: ApiGateway, realtime: RealtimeRepository) : ViewModel() {
    private val mutable = MutableStateFlow(LinkRecordState())
    val state = mutable.asStateFlow()
    private val live = LiveSubscription(realtime)
    var today: () -> LocalDate = { LocalDate.now(ZoneId.of("America/El_Salvador")) }

    private var profileLinked = false
    /** The request this screen created, until a read returns it. */
    private var sent: LinkRequest? = null
    /** What the account declared in its last request, for "Volver a pedir". */
    private var declared: LinkDeclared? = null
    /** True after "Volver a pedir": a read that still says "rejected" keeps the form being filled. */
    private var askingAgain = false
    private var readJob: Job? = null

    /** The link form is one intent until the API answers; a retry of the same body reuses its Idempotency-Key. */
    private val linkIntent = SubmissionIntent()
    private var lastBody: String? = null

    /** The profile of `/auth/me` already says whether the account is linked; otherwise the API says where the request is. */
    fun init(patientId: String?) {
        profileLinked = !patientId.isNullOrBlank()
        if (profileLinked) { readJob?.cancel(); mutable.update { it.copy(status = LinkStatus.APPROVED, readError = null) }; return }
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
                if (sent != null && link.request?.id == sent?.id) sent = null
                show(LinkStatusRules.screen(link, profileLinked, sent).also { declared = link.declared ?: declared })
            } catch (e: CancellationException) { throw e }
            catch (e: Exception) {
                val message = userMessage(e, "No se pudo consultar tu solicitud.")
                // Nothing known yet: say so with the retry. A known state stays, with the error above it.
                mutable.update { if (it.status == LinkStatus.LOADING) it.copy(status = LinkStatus.UNAVAILABLE, readError = message) else it.copy(readError = message) }
            }
        }
    }

    private fun show(screen: LinkScreen) {
        if (askingAgain && screen.status == LinkStatus.REJECTED) { mutable.update { it.copy(status = LinkStatus.FORM, readError = null) }; return }
        askingAgain = false
        mutable.update { it.copy(status = screen.status, since = screen.since, rejectionReason = screen.rejectionReason, readError = null) }
    }

    fun submit(dui: String, birth: String) {
        val errors = LinkRules.errors(dui, birth, today())
        if (errors.isNotEmpty()) { mutable.update { it.copy(fieldErrors = errors, error = null) }; return }
        if (mutable.value.busy) return
        val body = LinkRules.body(dui, birth)
        // A retry is an exact replay (same body, same key); corrected data is a new intent with a new key.
        if (linkIntent.pendingKey != null && lastBody != body.toString()) linkIntent.reset()
        lastBody = body.toString()
        mutable.update { it.copy(busy = true, error = null, fieldErrors = emptyMap()) }
        viewModelScope.launch {
            try {
                val created = LinkStatusRules.request(linkIntent.send { api.request("/cuentas/vinculacion", "POST", body) } as? JSONObject)
                askingAgain = false
                when (created?.state) {
                    "aprobada" -> mutable.update { it.copy(busy = false, status = LinkStatus.APPROVED) }
                    else -> {
                        sent = created
                        mutable.update { it.copy(busy = false, status = LinkStatus.PENDING, since = created?.let { c -> LinkStatusRules.day(c.createdAt) } ?: today(), rejectionReason = null) }
                    }
                }
                read()
            } catch (e: CancellationException) { throw e }
            catch (e: Exception) {
                when ((e as? AuthRequestException)?.code) {
                    // Another request is already waiting: the API says since when.
                    "vinculacion_pendiente" -> { askingAgain = false; mutable.update { it.copy(busy = false, status = LinkStatus.PENDING, since = null) }; read() }
                    "cuenta_ya_vinculada" -> mutable.update { it.copy(busy = false, status = LinkStatus.APPROVED) }
                    else -> mutable.update { it.copy(busy = false, error = userMessage(e, "No se pudo enviar la solicitud.")) }
                }
            }
        }
    }

    /** "Volver a pedir" after a rejection: the form, prefilled with what was declared. */
    fun retry() {
        askingAgain = true
        mutable.update { LinkRecordState(status = LinkStatus.FORM, prefill = declared) }
    }

    /** The screen copied [LinkRecordState.prefill] into its fields; rotation keeps what is typed from then on. */
    fun prefillApplied() = mutable.update { it.copy(prefill = null) }

    fun startLive(channels: List<String>) {
        live.start(viewModelScope, channels) { signal ->
            val matches = signal is RealtimeSignal.Event && LinkEvents.matches(signal.event)
            if (!profileLinked && !mutable.value.busy && (matches || signal is RealtimeSignal.Resync)) read()
        }
    }
}
