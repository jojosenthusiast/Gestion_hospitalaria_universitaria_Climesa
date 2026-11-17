package sv.edu.catolica.climesa.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import sv.edu.catolica.climesa.data.ApiGateway
import sv.edu.catolica.climesa.data.SubmissionIntent
import sv.edu.catolica.climesa.domain.AppointmentAction
import sv.edu.catolica.climesa.domain.AppointmentActions
import sv.edu.catolica.climesa.data.realtime.LiveSubscription
import sv.edu.catolica.climesa.domain.AppointmentEvents
import sv.edu.catolica.climesa.data.realtime.RealtimeRepository
import sv.edu.catolica.climesa.domain.AppointmentDoctor
import sv.edu.catolica.climesa.domain.AppointmentSlot
import sv.edu.catolica.climesa.domain.AppointmentWorkPeriod
import sv.edu.catolica.climesa.domain.DaySlot
import sv.edu.catolica.climesa.domain.ReceptionScheduling
import sv.edu.catolica.climesa.domain.PatientAppointment
import sv.edu.catolica.climesa.domain.PatientAppointmentRules
import sv.edu.catolica.climesa.domain.RealtimeSignal
import java.time.LocalDate

data class PatientAppointmentsState(
    val loading: Boolean = true,
    val appointments: List<PatientAppointment> = emptyList(),
    val doctors: List<AppointmentDoctor> = emptyList(),
    /** Doctors for the request form's "Ya tengo médico": on shift on any of the next 7 days. */
    val requestDoctors: List<AppointmentDoctor> = emptyList(),
    val selectedDoctorId: String = "",
    val selectedDate: LocalDate = ReceptionScheduling.today(),
    val workPeriods: List<AppointmentWorkPeriod> = emptyList(),
    val slots: List<AppointmentSlot> = emptyList(),
    /** Todas las franjas del día con su estado (libre, ocupado, sin turno, ya pasó). */
    val daySlots: List<DaySlot> = emptyList(),
    val selectedSlot: AppointmentSlot? = null,
    val saving: Boolean = false,
    val error: String? = null,
    val notice: String? = null,
    /** Reschedule request in progress (CITA-01): the appointment, the day of the grid, its slots and the chosen one. */
    val rescheduleId: String? = null,
    val rescheduleDate: LocalDate = ReceptionScheduling.today(),
    val rescheduleSlots: List<DaySlot> = emptyList(),
    val rescheduleSlot: DaySlot? = null,
    val loadingRescheduleSlots: Boolean = false,
) {
    val rescheduleTarget get() = appointments.firstOrNull { it.id == rescheduleId }
}

@HiltViewModel
class PatientAppointmentsViewModel @Inject constructor(
    private val api: ApiGateway,
    realtime: RealtimeRepository,
) : ViewModel() {
    private val mutable = MutableStateFlow(PatientAppointmentsState())
    val state = mutable.asStateFlow()
    private val live = LiveSubscription(realtime)
    private var availabilityJob: Job? = null
    private var rescheduleJob: Job? = null
    private val cancelIntent = SubmissionIntent()
    private val rescheduleIntent = SubmissionIntent()
    private val requestIntent = SubmissionIntent()

    fun load() {
        viewModelScope.launch {
            mutable.updateLoading(true)
            try {
                val appointments = PatientAppointmentRules.parse(api.request("/citas"))
                val doctors = parseDoctors(api.request("/citas/catalogos?date=${mutable.value.selectedDate}"))
                mutable.value = mutable.value.copy(loading = false, appointments = appointments, doctors = doctors, error = null)
                if (mutable.value.selectedDoctorId.isNotBlank()) loadAvailability()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                mutable.value = mutable.value.copy(loading = false, error = message(e))
            }
        }
    }

    fun startLive(channels: List<String>) {
        live.start(viewModelScope, channels) { signal ->
            if (signal is RealtimeSignal.Event && AppointmentEvents.matches(signal.event) || signal is RealtimeSignal.Resync) load()
        }
    }

    fun selectDoctor(id: String) {
        mutable.value = mutable.value.copy(selectedDoctorId = id, selectedSlot = null, workPeriods = emptyList(), slots = emptyList(), daySlots = emptyList(), error = null)
        if (id.isNotBlank()) loadAvailability()
    }

    fun selectDate(date: LocalDate) {
        mutable.value = mutable.value.copy(selectedDate = date, selectedSlot = null, workPeriods = emptyList(), slots = emptyList(), daySlots = emptyList(), error = null)
        loadDoctors()
        if (mutable.value.selectedDoctorId.isNotBlank()) loadAvailability()
    }

    fun selectSlot(slot: AppointmentSlot?) { mutable.value = mutable.value.copy(selectedSlot = slot) }

    fun request(reason: String) {
        val current = mutable.value
        val slot = current.selectedSlot ?: return
        if (current.selectedDoctorId.isBlank()) return
        mutable.value = current.copy(saving = true, error = null, notice = null)
        viewModelScope.launch {
            try {
                requestIntent.send { api.request("/citas/solicitudes", "POST", PatientAppointmentRules.requestBody(current.selectedDoctorId, slot, reason)) }
                mutable.value = mutable.value.copy(saving = false, selectedSlot = null, slots = emptyList(), daySlots = emptyList(), notice = "Solicitud enviada. Recepción debe confirmarla.")
                load()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                mutable.value = mutable.value.copy(saving = false, error = message(e))
            }
        }
    }

    /** Cancels through one [SubmissionIntent]; the API decides whether the deadline (`cancelableUntil`) still allows it. */
    fun cancel(appointment: PatientAppointment, reason: String) {
        if (AppointmentActions.reasonError(AppointmentAction.CANCEL, reason) != null) {
            mutable.value = mutable.value.copy(error = "Escribe un motivo de al menos ${AppointmentActions.REASON_MIN} caracteres.")
            return
        }
        if (mutable.value.saving) return
        mutable.value = mutable.value.copy(saving = true, error = null, notice = null)
        viewModelScope.launch {
            try {
                cancelIntent.send { api.request(AppointmentActions.path(AppointmentAction.CANCEL, appointment.id), "POST", PatientAppointmentRules.cancelBody(appointment, reason)) }
                mutable.value = mutable.value.copy(saving = false, notice = "Cita cancelada.")
                load()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                mutable.value = mutable.value.copy(saving = false, error = message(e))
            }
        }
    }

    /** Opens the reschedule dialog on the day of the appointment (or today) with the same doctor's slots. */
    fun openReschedule(appointment: PatientAppointment) {
        if (!appointment.allows(AppointmentAction.RESCHEDULE)) return
        rescheduleIntent.reset()
        val day = runCatching { java.time.Instant.parse(appointment.start).atZone(java.time.ZoneId.of("America/El_Salvador")).toLocalDate() }.getOrNull()
        val date = if (day != null && !day.isBefore(ReceptionScheduling.today())) day else ReceptionScheduling.today()
        mutable.value = mutable.value.copy(rescheduleId = appointment.id, rescheduleDate = date, rescheduleSlots = emptyList(), rescheduleSlot = null, error = null, notice = null)
        loadRescheduleSlots()
    }

    fun closeReschedule() {
        if (mutable.value.saving) return
        rescheduleJob?.cancel(); rescheduleIntent.reset()
        mutable.value = mutable.value.copy(rescheduleId = null, rescheduleSlots = emptyList(), rescheduleSlot = null)
    }

    fun selectRescheduleDate(date: LocalDate) {
        mutable.value = mutable.value.copy(rescheduleDate = date, rescheduleSlots = emptyList(), rescheduleSlot = null, error = null)
        loadRescheduleSlots()
    }

    fun pickRescheduleSlot(slot: DaySlot) { if (slot.selectable) mutable.value = mutable.value.copy(rescheduleSlot = slot) }

    private fun loadRescheduleSlots() {
        val current = mutable.value
        val target = current.rescheduleTarget ?: return
        if (target.doctorId.isBlank()) return
        rescheduleJob?.cancel()
        mutable.value = current.copy(loadingRescheduleSlots = true)
        rescheduleJob = viewModelScope.launch {
            try {
                val slots = ReceptionScheduling.daySlots(api.request("/citas/disponibilidad?doctorId=${target.doctorId}&date=${current.rescheduleDate}") as JSONObject)
                mutable.value = mutable.value.copy(loadingRescheduleSlots = false, rescheduleSlots = slots)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                mutable.value = mutable.value.copy(loadingRescheduleSlots = false, rescheduleSlots = emptyList(), error = message(e))
            }
        }
    }

    /** `POST /citas/{id}/reprogramar`: for the patient it creates a pending request that Recepción or the doctor decides. */
    fun reschedule() {
        val current = mutable.value
        val target = current.rescheduleTarget ?: return
        val slot = current.rescheduleSlot?.takeIf { it.selectable } ?: return
        if (current.saving) return
        mutable.value = current.copy(saving = true, error = null, notice = null)
        viewModelScope.launch {
            try {
                val result = rescheduleIntent.send { api.request(AppointmentActions.path(AppointmentAction.RESCHEDULE, target.id), "POST", PatientAppointmentRules.rescheduleBody(target, AppointmentSlot(slot.start, slot.end))) }
                val pending = (result as? JSONObject)?.optString("rescheduleState") != "aceptada"
                mutable.value = mutable.value.copy(saving = false, rescheduleId = null, rescheduleSlots = emptyList(), rescheduleSlot = null,
                    notice = if (pending) "Solicitud de reprogramación enviada. Te avisaremos cuando la revisen." else "Cita reprogramada.")
                load()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                mutable.value = mutable.value.copy(saving = false, rescheduleSlot = null, error = message(e))
                loadRescheduleSlots()
            }
        }
    }

    fun clearMessages() { mutable.value = mutable.value.copy(error = null, notice = null) }

    /**
     * The request form's "Ya tengo médico": reception may assign any of the next 7 days, so a doctor counts as on shift
     * when they have a shift on any of them (not only today). A day that fails is skipped; today's list is the fallback.
     */
    fun loadRequestDoctors(from: java.time.LocalDate = ReceptionScheduling.today()) {
        viewModelScope.launch {
            val days = (0L until 7L).map { from.plusDays(it) }
            val lists = days.mapNotNull { day -> try { parseDoctors(api.request("/citas/catalogos?date=$day")) } catch (e: CancellationException) { throw e } catch (_: Exception) { null } }
            val merged = lists.flatten().groupBy { it.id }.map { (_, same) -> same.firstOrNull { it.hasShift }?.copy(reason = null) ?: same.first() }
            mutable.value = mutable.value.copy(requestDoctors = merged.ifEmpty { mutable.value.doctors })
        }
    }

    /** Al cambiar de día se vuelve a pedir quién tiene turno ese día. */
    private fun loadDoctors() {
        val date = mutable.value.selectedDate
        viewModelScope.launch {
            try { mutable.value = mutable.value.copy(doctors = parseDoctors(api.request("/citas/catalogos?date=$date"))) }
            catch (e: CancellationException) { throw e } catch (_: Exception) { /* la lista anterior sigue válida */ }
        }
    }

    private fun loadAvailability() {
        val current = mutable.value
        availabilityJob?.cancel()
        availabilityJob = viewModelScope.launch {
            try {
                val encodedDate = current.selectedDate.toString()
                val result = api.request("/citas/disponibilidad?doctorId=${current.selectedDoctorId}&date=$encodedDate") as JSONObject
                val periods = result.optJSONArray("workPeriods")
                val workPeriods = (0 until (periods?.length() ?: 0)).mapNotNull { i -> periods?.optJSONObject(i)?.let { AppointmentWorkPeriod(it.optString("start"), it.optString("end")) } }
                val rows = result.optJSONArray("slots")
                val slots = (0 until (rows?.length() ?: 0)).mapNotNull { i ->
                    rows?.optJSONObject(i)?.let { AppointmentSlot(it.optString("start"), it.optString("end")) }
                }
                mutable.value = mutable.value.copy(workPeriods = workPeriods, slots = slots, daySlots = ReceptionScheduling.daySlots(result), error = null)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                mutable.value = mutable.value.copy(workPeriods = emptyList(), slots = emptyList(), daySlots = emptyList(), error = message(e))
            }
        }
    }

    private fun parseDoctors(value: Any): List<AppointmentDoctor> {
        val doctors = (value as? JSONObject)?.optJSONArray("doctors") ?: return emptyList()
        return (0 until doctors.length()).mapNotNull { i -> doctors.optJSONObject(i)?.let { row ->
            AppointmentDoctor(row.optString("id"), "${row.optString("givenNames")} ${row.optString("surnames")}".trim(), row.optString("specialty").takeIf(String::isNotBlank),
                hasShift = row.isNull("tieneTurno") || !row.has("tieneTurno") || row.optBoolean("tieneTurno"), reason = row.optString("motivo").takeIf { !row.isNull("motivo") && it.isNotBlank() })
        } }
    }

    private fun message(error: Exception): String = businessMessage(error, "No se pudo completar la operación.")

    override fun onCleared() { live.stop(); availabilityJob?.cancel(); rescheduleJob?.cancel(); super.onCleared() }
}

/** A reload after a command keeps its notice ("Cita cancelada."); "Reintentar" clears messages itself. */
private fun MutableStateFlow<PatientAppointmentsState>.updateLoading(loading: Boolean) {
    value = value.copy(loading = loading, error = null)
}
