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
import org.json.JSONArray
import org.json.JSONObject
import sv.edu.catolica.climesa.data.ApiGateway
import sv.edu.catolica.climesa.data.ApiProblems
import sv.edu.catolica.climesa.data.SubmissionIntent
import sv.edu.catolica.climesa.domain.AppointmentReasons
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
    /** A failed command (cancel, reschedule, catalog): shown as a notice, never with «Reintentar». */
    val error: String? = null,
    /** The appointment list itself could not be read: the only failure the shared ErrorState offers «Reintentar» for. */
    val loadError: String? = null,
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

    /**
     * Reads only the appointments, over an explicit window ([PatientAppointmentRules.listPath]). The doctor catalog is
     * read when the request form opens ([loadRequestDoctors]): a failing catalog no longer hides the list, and a live
     * event no longer reads it again.
     */
    fun load() {
        viewModelScope.launch {
            mutable.updateLoading(true)
            try {
                val appointments = PatientAppointmentRules.parse(api.request(PatientAppointmentRules.listPath(ReceptionScheduling.today())))
                mutable.update { it.copy(loading = false, appointments = appointments, error = null, loadError = null) }
                if (mutable.value.selectedDoctorId.isNotBlank()) loadAvailability()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                mutable.update { it.copy(loading = false, loadError = userMessage(e, "No se pudieron cargar tus citas.")) }
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
    fun cancel(appointment: PatientAppointment, reason: String, other: Boolean = false) {
        // D-8: a quick reason needs no typing; "Otro" asks for a short text; free text without a code keeps the old 10-character rule.
        val code = AppointmentReasons.patientCancelCode(reason, other)
        val error = when {
            other && reason.trim().length < AppointmentReasons.OTHER_MIN -> "Escribe brevemente el motivo (al menos ${AppointmentReasons.OTHER_MIN} caracteres)."
            code == null && AppointmentActions.reasonError(AppointmentAction.CANCEL, reason) != null -> legacyReasonError
            else -> null
        }
        if (error != null) { mutable.value = mutable.value.copy(error = error); return }
        if (mutable.value.saving) return
        mutable.value = mutable.value.copy(saving = true, error = null, notice = null)
        val path = AppointmentActions.path(AppointmentAction.CANCEL, appointment.id)
        viewModelScope.launch {
            try {
                var useLegacy = code == null || legacyServer
                if (!useLegacy) {
                    try {
                        sendCancel(cancelIntent, path, PatientAppointmentRules.cancelBody(appointment, reason, code), coded = true)
                    } catch (e: CancellationException) {
                        throw e
                    } catch (e: Exception) {
                        // A server released before D-8 rejects the unknown `reasonCode` field; it still takes the released body.
                        if (!ApiProblems.fieldErrors(e).containsKey("reasonCode")) throw e
                        // That answer is definitive: the coded key is done, and from now on this server gets the released body.
                        cancelIntent.reset(); codedBody = null
                        legacyServer = true
                        useLegacy = true
                    }
                }
                if (useLegacy) {
                    // The released body keeps the old 10-character rule; it goes under its own intent, so a retry after a
                    // network error or 5xx replays it exactly with its pending key, and no other body ever takes that key.
                    if (code != null && AppointmentActions.reasonError(AppointmentAction.CANCEL, reason) != null) throw LegacyReasonTooShort(legacyReasonError)
                    sendCancel(legacyIntent, path, PatientAppointmentRules.cancelBody(appointment, reason), coded = false)
                }
                mutable.value = mutable.value.copy(saving = false, notice = "Cita cancelada.")
                load()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                mutable.value = mutable.value.copy(saving = false, error = if (e is LegacyReasonTooShort) e.message else message(e))
            }
        }
    }

    /** The released cancel body `{version, reason}` has its own intent (D-8 fallback), apart from the coded one. */
    private val legacyIntent = SubmissionIntent()
    /** This server rejected `reasonCode` once: every later cancel sends the released body. */
    private var legacyServer = false
    private var codedBody: String? = null
    private var legacyBody: String? = null

    /** A pending key belongs to one body: a different body first drops it, so a key is never reused with another body. */
    private suspend fun sendCancel(intent: SubmissionIntent, path: String, body: JSONObject, coded: Boolean) {
        val text = body.toString()
        val last = if (coded) codedBody else legacyBody
        if (intent.pendingKey != null && last != text) intent.reset()
        if (coded) codedBody = text else legacyBody = text
        intent.send { api.request(path, "POST", body) }
    }

    private class LegacyReasonTooShort(message: String) : Exception(message)
    private companion object { const val DOCTORS_UNAVAILABLE = "No se pudo cargar la lista de médicos. Vuelve a intentar." }
    private val legacyReasonError = "Escribe un motivo de al menos ${AppointmentActions.REASON_MIN} caracteres."

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
            // A day that fails is left out; when every day fails the form says so instead of an empty "Ya tengo médico".
            mutable.value = mutable.value.copy(requestDoctors = merged.ifEmpty { mutable.value.doctors }, error = if (lists.isEmpty()) DOCTORS_UNAVAILABLE else mutable.value.error)
        }
    }

    /** Al cambiar de día se vuelve a pedir quién tiene turno ese día. */
    private fun loadDoctors() {
        val date = mutable.value.selectedDate
        viewModelScope.launch {
            try { api.request("/citas/catalogos?date=$date").let { r -> mutable.value = mutable.value.copy(doctors = parseDoctors(r)) } }
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
    value = value.copy(loading = loading, error = null, loadError = null)
}
