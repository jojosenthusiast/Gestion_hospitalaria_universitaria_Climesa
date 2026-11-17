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
import sv.edu.catolica.climesa.data.ApiProblems
import sv.edu.catolica.climesa.data.SubmissionIntent
import sv.edu.catolica.climesa.domain.AppointmentAction
import sv.edu.catolica.climesa.domain.AppointmentActions
import sv.edu.catolica.climesa.domain.DaySlot
import sv.edu.catolica.climesa.domain.ReceptionAppointment
import sv.edu.catolica.climesa.domain.ReceptionScheduling
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

data class AppointmentActionState(
    val target: ReceptionAppointment? = null,
    val action: AppointmentAction? = null,
    val reason: String = "",
    val showErrors: Boolean = false,
    val serverError: String? = null,
    val busy: Boolean = false,
    /** Reschedule: day shown in the slot grid, its slots and the chosen free slot. */
    val date: LocalDate = ReceptionScheduling.today(),
    val slots: List<DaySlot> = emptyList(),
    val loadingSlots: Boolean = false,
    val slot: DaySlot? = null,
    /** Set after the API accepts the action; the screen shows it and reloads the list. */
    val done: String? = null,
    val error: String? = null,
    /** D-3: "No asistió" waiting 8 s with "Deshacer" before it is sent ([PendingUndo.key] is the appointment id). */
    val pendingNoShow: PendingUndo? = null,
    /** Every "No asistió" still in its window, one per appointment. */
    val pendingNoShows: List<PendingUndo> = emptyList(),
    /** The stored "No asistió" whose last send failed (kept, with [error], until it goes through or is discarded). */
    val failedNoShow: String? = null,
    /** Why [failedNoShow] failed; it comes back as [error] when a dialog closes, so the failure row is never lost. */
    val failedNoShowError: String? = null,
) {
    /** A fresh state that keeps the "No asistió" ones still waiting or failed, and the failure row. */
    fun carried(done: String? = this.done) = AppointmentActionState(
        done = done, pendingNoShow = pendingNoShow, pendingNoShows = pendingNoShows, failedNoShow = failedNoShow,
        failedNoShowError = failedNoShowError, error = failedNoShowError.takeIf { failedNoShow != null },
    )
    val reasonError: String? get() = serverError ?: action?.let { a -> AppointmentActions.reasonError(a, reason).takeIf { showErrors } }
    val canSubmit: Boolean get() = !busy && (action != AppointmentAction.RESCHEDULE || slot?.selectable == true)
}

/**
 * M-02 / MA-CIT-01: one command on one appointment, with version and Idempotency-Key: confirm or reject a request, cancel,
 * reschedule to a free slot of the same doctor, mark a no-show, or decide a patient's reschedule request.
 */
@HiltViewModel
class AppointmentActionViewModel @Inject constructor(private val api: ApiGateway, private val drafts: sv.edu.catolica.climesa.data.DraftStore = sv.edu.catolica.climesa.data.NoDraftStore) : ViewModel() {
    private val mutable = MutableStateFlow(AppointmentActionState())
    val state = mutable.asStateFlow()
    private val intent = SubmissionIntent()
    private var slotsJob: Job? = null
    /** Clock of the undo window (tests move it to after a restart). */
    var clock: () -> Long = { System.currentTimeMillis() }
    private val noShow = UndoWindow(
        viewModelScope, api, sv.edu.catolica.climesa.domain.FormDrafts.DEFERRED_NO_SHOW, drafts, now = { clock() },
        onSent = { item, _ ->
            mutable.update {
                val cleared = it.failedNoShow == item.id
                it.copy(
                    done = AppointmentActions.doneNotice(AppointmentAction.NO_SHOW, item.label.substringAfter("Cita de ").substringBefore(" marcada")),
                    error = if (it.target == null) null else it.error,
                    failedNoShow = if (cleared) null else it.failedNoShow, failedNoShowError = if (cleared) null else it.failedNoShowError,
                )
            }
        },
        // While a dialog is open its own error stays in place; the failure row comes back when it closes ([carried]).
        onFailed = { item, e, kept ->
            mutable.update {
                if (kept) {
                    val message = businessMessage(e, "No se pudo marcar la inasistencia.") + " Queda guardada y se reintentará."
                    it.copy(error = if (it.target == null) message else it.error, failedNoShow = item.id, failedNoShowError = message)
                } else {
                    val message = businessMessage(e, "No se pudo marcar la inasistencia.")
                    val cleared = it.failedNoShow == item.id
                    it.copy(error = if (it.target == null) message else it.error, failedNoShow = if (cleared) null else it.failedNoShow, failedNoShowError = if (cleared) null else it.failedNoShowError, done = null)
                }
            }
        },
        onExpired = { gone -> mutable.update { it.copy(error = "${gone.size} «No asistió» de hace más de 24 h no se enviaron.") } },
    ) { pending -> mutable.update { it.copy(pendingNoShow = pending.lastOrNull(), pendingNoShows = pending) } }

    /** Signed-in user: a "No asistió" stored before the app closed is sent now if its window ended. */
    fun bindUser(id: String) = noShow.bind(id)

    /** Screen back on top or signal back: sends what is due, failed ones again. */
    fun resume() = noShow.resume()

    /** The person drops a "No asistió" the API keeps rejecting, after reading why. */
    fun discardFailedNoShow() {
        val id = mutable.value.failedNoShow ?: return
        noShow.discard(id)
        mutable.update { it.copy(failedNoShow = null, failedNoShowError = null, error = null) }
    }

    /**
     * D-3 (A4): "No asistió" is one tap with 8 s to undo, the same on web and Android. Nothing reaches the API until the
     * window ends, so "Deshacer" leaves no trace (no inverse endpoint exists).
     */
    fun markNoShow(target: ReceptionAppointment) {
        if (AppointmentAction.NO_SHOW !in target.allowedActions) return
        val name = target.patientName.ifBlank { "el paciente" }
        noShow.start(target.id, "Cita de $name marcada como no asistió.", AppointmentActions.path(AppointmentAction.NO_SHOW, target.id), AppointmentActions.body(AppointmentAction.NO_SHOW, target.version, ""))
    }
    fun undoNoShow(appointmentId: String? = null) { if (noShow.undo(appointmentId)) mutable.update { it.copy(done = "Se mantiene la cita.", error = null) } }

    /** D-8 / A4: a quick reason chip fills the reason; "Otro" empties it for typing. */
    fun quickReason(text: String?) = mutable.update { if (it.busy) it else it.copy(reason = text.orEmpty(), serverError = null, error = null) }

    fun open(target: ReceptionAppointment, action: AppointmentAction) {
        intent.reset()
        val day = runCatching { Instant.parse(target.start).atZone(ZoneId.of("America/El_Salvador")).toLocalDate() }.getOrNull()
        val date = if (day != null && !day.isBefore(ReceptionScheduling.today())) day else ReceptionScheduling.today()
        // The dialog opens clean (its own errors only) but keeps the waiting and failed "No asistió".
        mutable.update { it.carried(done = null).copy(target = target, action = action, date = date, error = null) }
        if (action == AppointmentAction.RESCHEDULE) loadSlots()
    }
    fun close() { if (!mutable.value.busy) { intent.reset(); slotsJob?.cancel(); mutable.update { it.carried() } } }
    fun consumeDone() = mutable.update { it.copy(done = null) }
    fun reason(text: String) = mutable.update { if (it.busy) it else it.copy(reason = text.take(AppointmentActions.REASON_MAX), serverError = null, error = null) }

    fun selectDate(date: LocalDate) {
        if (mutable.value.busy) return
        mutable.update { it.copy(date = date, slot = null, slots = emptyList(), error = null) }
        loadSlots()
    }
    fun pickSlot(slot: DaySlot) { if (slot.selectable && !mutable.value.busy) mutable.update { it.copy(slot = slot, error = null) } }

    /** Slots of the same doctor (`GET /citas/disponibilidad`); only `libre` ones can be chosen. */
    private fun loadSlots() {
        val s = mutable.value
        val target = s.target ?: return
        if (target.doctorId.isBlank()) return
        slotsJob?.cancel()
        mutable.update { it.copy(loadingSlots = true) }
        slotsJob = viewModelScope.launch {
            try {
                val slots = ReceptionScheduling.daySlots(api.request("/citas/disponibilidad?doctorId=${target.doctorId}&date=${s.date}") as JSONObject)
                mutable.update { st -> st.copy(loadingSlots = false, slots = slots, slot = st.slot?.takeIf { chosen -> slots.any { it.start == chosen.start && it.selectable } }) }
            } catch (e: CancellationException) { throw e } catch (e: Exception) {
                mutable.update { it.copy(loadingSlots = false, slots = emptyList(), error = userMessage(e, "No se pudo consultar el horario.")) }
            }
        }
    }

    fun submit() {
        val s = mutable.value
        val target = s.target ?: return
        val action = s.action ?: return
        if (s.busy) return
        if (AppointmentActions.reasonError(action, s.reason) != null) { mutable.update { it.copy(showErrors = true) }; return }
        if (action == AppointmentAction.RESCHEDULE && s.slot?.selectable != true) { mutable.update { it.copy(error = "Elige una franja libre.") }; return }
        val decision = action == AppointmentAction.ACCEPT_RESCHEDULE || action == AppointmentAction.REJECT_RESCHEDULE
        val reschedule = target.reschedule
        if (decision && reschedule == null) return
        val version = if (decision) reschedule!!.version else target.version
        mutable.update { it.copy(busy = true, showErrors = true, error = null, serverError = null) }
        viewModelScope.launch {
            try {
                val result = intent.send { api.request(AppointmentActions.path(action, target.id, reschedule?.id), "POST", AppointmentActions.body(action, version, s.reason, s.slot)) }
                val rescheduleState = (result as? JSONObject)?.optString("rescheduleState")?.takeIf { it.isNotBlank() }
                mutable.update { it.carried(done = AppointmentActions.doneNotice(action, target.patientName.ifBlank { "el paciente" }, rescheduleState)) }
            } catch (e: CancellationException) { throw e } catch (e: Exception) {
                val field = ApiProblems.fieldErrors(e)[AppointmentActions.reasonField(action)]
                mutable.update { it.copy(busy = false, serverError = field, error = businessMessage(e, "No se pudo completar la acción.")) }
                // The slot may have been taken meanwhile: show the real state of the day.
                if (action == AppointmentAction.RESCHEDULE) { mutable.update { it.copy(slot = null) }; loadSlots() }
            }
        }
    }

    override fun onCleared() { slotsJob?.cancel(); super.onCleared() }
}
