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
) {
    val reasonError: String? get() = serverError ?: action?.let { a -> AppointmentActions.reasonError(a, reason).takeIf { showErrors } }
    val canSubmit: Boolean get() = !busy && (action != AppointmentAction.RESCHEDULE || slot?.selectable == true)
}

/**
 * M-02 / MA-CIT-01: one command on one appointment, with version and Idempotency-Key: confirm or reject a request, cancel,
 * reschedule to a free slot of the same doctor, mark a no-show, or decide a patient's reschedule request.
 */
@HiltViewModel
class AppointmentActionViewModel @Inject constructor(private val api: ApiGateway) : ViewModel() {
    private val mutable = MutableStateFlow(AppointmentActionState())
    val state = mutable.asStateFlow()
    private val intent = SubmissionIntent()
    private var slotsJob: Job? = null

    fun open(target: ReceptionAppointment, action: AppointmentAction) {
        intent.reset()
        val day = runCatching { Instant.parse(target.start).atZone(ZoneId.of("America/El_Salvador")).toLocalDate() }.getOrNull()
        val date = if (day != null && !day.isBefore(ReceptionScheduling.today())) day else ReceptionScheduling.today()
        mutable.value = AppointmentActionState(target = target, action = action, date = date)
        if (action == AppointmentAction.RESCHEDULE) loadSlots()
    }
    fun close() { if (!mutable.value.busy) { intent.reset(); slotsJob?.cancel(); mutable.update { AppointmentActionState(done = it.done) } } }
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
                mutable.update { it.copy(loadingSlots = false, slots = emptyList(), error = e.message ?: "No se pudo consultar el horario.") }
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
                mutable.value = AppointmentActionState(done = AppointmentActions.doneNotice(action, target.patientName.ifBlank { "el paciente" }, rescheduleState))
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
