package sv.edu.catolica.climesa.domain

import org.json.JSONArray
import org.json.JSONObject
import java.time.Clock
import java.time.LocalDate
import java.time.ZoneId

/** Row of `GET /pacientes/selector`: lo mínimo para elegir a alguien en una lista con búsqueda. */
data class PickerPatient(
    val id: String, val record: String, val name: String, val age: Int?,
    /** B-2: the patient's confirmed appointment of today (`appointmentToday`), only for accounts that see appointments. */
    val appointmentToday: TodayAppointment? = null,
    /** B-2: the patient's live queue number of today (`ticketToday`). */
    val ticketToday: TodayTicket? = null,
    /** Preconditions S1: `active`; an older API without the field means active (today's behavior). */
    val active: Boolean = true,
    /** Preconditions S1: `activeAdmission`, the patient already has an admission that is not closed. */
    val activeAdmission: Boolean = false,
    /** Preconditions S1: `careContext`, the caller attends this patient (same rule the API uses for vital signs). */
    val careContext: Boolean = true,
) {
    val detail get() = "Expediente $record" + (age?.let { " · $it años" } ?: "")
    /** B1 "Registrar llegada": an appointment today whose arrival is not registered yet with a live number. */
    val canRegisterArrival get() = appointmentToday != null && ticketToday?.appointmentId != appointmentToday.id
}

/** What a patient is picked for; each purpose has its own precondition (preconditions sweep S1). */
enum class PickPurpose { CARE, ADMISSION, VITALS }

/**
 * Preconditions S1: why a selector row cannot be picked for [PickPurpose], said before the tap; null when it can. The API
 * refuses the same cases (inactive patient on queue/appointments/admission, a second active admission, vitals without a
 * care context), so the row is shown disabled with the reason instead.
 */
object PatientGate {
    const val INACTIVE = "Paciente inactivo: actívalo en Pacientes para atenderlo."
    const val ACTIVE_ADMISSION = "Ya tiene una admisión activa."
    const val NO_CARE_CONTEXT = "Solo puedes registrar signos de pacientes que atiendes."

    fun blockedReason(patient: PickerPatient, purpose: PickPurpose): String? = when (purpose) {
        PickPurpose.CARE -> INACTIVE.takeIf { !patient.active }
        PickPurpose.ADMISSION -> if (!patient.active) INACTIVE else ACTIVE_ADMISSION.takeIf { patient.activeAdmission }
        PickPurpose.VITALS -> NO_CARE_CONTEXT.takeIf { !patient.careContext }
    }
}

/** `appointmentToday` of a selector row: the appointment and its doctor. */
data class TodayAppointment(val id: String, val start: String, val doctorId: String, val doctorName: String) {
    /** Sweep #11: "Cita 09:00 con Ana Médica"; never "· <doctor>", which reads as a second patient. Without a name, "Cita 09:00". */
    val chip get() = "Cita ${AppointmentAgenda.time(start)}" + doctorName.trim().let { if (it.isEmpty()) "" else " con $it" }
}

/** `ticketToday` of a selector row: the number the patient already holds today. */
data class TodayTicket(val id: String, val service: String, val number: Int, val state: String, val appointmentId: String?) {
    val code get() = "${QueueLabels.areaOf(service)} $number"
}
data class PickerPage(val items: List<PickerPatient>, val hasMore: Boolean)

/** Estados de una franja del día (`estado` de `/citas/disponibilidad`). Solo `FREE` se puede elegir. */
enum class SlotStatus(val wire: String, val defaultReason: String?) {
    FREE("libre", null), BUSY("ocupado", "Ocupado"), NO_SHIFT("sin_turno", "Médico sin turno"), PAST("pasado", "Ya pasó");
    companion object { fun of(wire: String) = entries.firstOrNull { it.wire == wire } ?: NO_SHIFT }
}
data class DaySlot(val start: String, val end: String, val status: SlotStatus, val reason: String?) {
    val selectable get() = status == SlotStatus.FREE
    val label get() = reason ?: status.defaultReason ?: ""
}
/** Médico del selector: sin turno ese día se muestra apagado y con su motivo. */
data class SchedulingDoctor(val id: String, val name: String, val specialty: String?, val hasShift: Boolean, val reason: String?) {
    val detail get() = specialty ?: "Medicina general"
}

/**
 * R3 A-42: doctors shown in the assign panel. With 45+ doctors the panel shows the first [LIMIT] of the already ordered
 * list (suggested first) until reception searches or asks for all; a search matches name or specialty, accent-insensitive.
 * The chosen doctor always stays visible.
 */
object DoctorChoices {
    const val LIMIT = 5
    private fun fold(text: String) = java.text.Normalizer.normalize(text.lowercase(), java.text.Normalizer.Form.NFD).replace(Regex("\\p{Mn}+"), "")
    fun visible(ordered: List<SchedulingDoctor>, query: String, showAll: Boolean, chosenId: String?): List<SchedulingDoctor> {
        val q = fold(query.trim())
        val matching = if (q.isEmpty()) ordered else ordered.filter { fold(it.name).contains(q) || fold(it.detail).contains(q) }
        val shown = if (showAll || q.isNotEmpty()) matching else matching.take(LIMIT)
        val chosen = ordered.firstOrNull { it.id == chosenId }
        return if (chosen != null && chosen !in shown) listOf(chosen) + shown else shown
    }
    fun hidden(ordered: List<SchedulingDoctor>, query: String, showAll: Boolean): Int =
        if (showAll || query.isNotBlank()) 0 else (ordered.size - LIMIT).coerceAtLeast(0)
}
/** Cita de `GET /citas` tal como la ve Recepción (o el médico, sus propias citas). Las acciones vienen del servidor. */
/** `arrival` of an appointment row: the number its arrival issued ("Llegó · CON 4"). */
data class AppointmentArrival(val id: String, val number: Int, val state: String) {
    val code get() = "CON $number"
}

data class ReceptionAppointment(
    val id: String, val patientName: String, val doctorName: String, val start: String, val end: String, val state: String, val version: Int,
    val doctorId: String = "",
    val allowedActions: List<AppointmentAction> = emptyList(),
    val blockedActions: Map<AppointmentAction, String> = emptyMap(),
    val cancelableUntil: String? = null,
    val rescheduledFromId: String? = null,
    val rescheduledToId: String? = null,
    val reschedule: RescheduleRequest? = null,
    /** Categories of the request by reason this appointment came from; empty when booked directly. */
    val categories: List<CategoryRef> = emptyList(),
    val patientId: String = "",
    /** D-1: the queue number reception issued when the patient arrived (`arrival`); null before the arrival. */
    val arrival: AppointmentArrival? = null,
) {
    /** D-1, the web rule: a confirmed appointment of [today] whose arrival is not registered yet. */
    fun canRegisterArrival(today: String) = arrival == null && state == "confirmada" && patientId.isNotBlank() && AppointmentAgenda.dayKey(start) == today
    /** A patient's pending reschedule request that this reader can decide. */
    val pendingReschedule get() = reschedule?.takeIf { it.pending }
    val isRequest get() = state == "solicitada"
}

object ReceptionScheduling {
    /** Día con que abre el formulario de cita: hoy en El Salvador. Abrir en mañana dejaba la cita "de hoy" para el día siguiente. */
    fun today(clock: Clock = Clock.systemUTC()): LocalDate = LocalDate.now(clock.withZone(ZoneId.of("America/El_Salvador")))

    /** El selector busca desde dos caracteres, sin tener en cuenta tildes (la API normaliza igual). */
    const val MIN_QUERY = 2
    const val DEBOUNCE_MS = 250L
    fun canSearch(query: String) = PatientRules.normalize(query).replace(" ", "").length >= MIN_QUERY

    private fun JSONObject.text(key: String) = if (isNull(key)) null else optString(key).takeIf { it.isNotBlank() }
    private fun JSONArray?.objects() = (0 until (this?.length() ?: 0)).mapNotNull { this?.optJSONObject(it) }

    fun pickerPage(json: JSONObject) = PickerPage(
        json.optJSONArray("items").objects().map {
            PickerPatient(
                it.getString("id"), it.optString("record"), it.optString("fullName"), if (it.has("age") && !it.isNull("age")) it.optInt("age") else null,
                appointmentToday = it.optJSONObject("appointmentToday")?.let { a ->
                    a.text("id")?.let { id -> TodayAppointment(id, a.optString("start"), a.optString("doctorId"), a.text("doctorName") ?: "") }
                },
                ticketToday = it.optJSONObject("ticketToday")?.let { t ->
                    t.text("id")?.let { id -> TodayTicket(id, t.optString("service"), t.optInt("numero"), t.optString("state"), t.text("appointmentId")) }
                },
                active = it.optBoolean("active", true),
                activeAdmission = it.optBoolean("activeAdmission", false),
                careContext = it.optBoolean("careContext", true),
            )
        },
        json.optBoolean("hasMore"),
    )

    fun doctors(json: JSONObject) = json.optJSONArray("doctors").objects().filter { it.optBoolean("active", true) }.map {
        SchedulingDoctor(
            it.getString("id"), "${it.optString("givenNames")} ${it.optString("surnames")}".trim(), it.text("specialty"),
            hasShift = !it.has("tieneTurno") || it.isNull("tieneTurno") || it.optBoolean("tieneTurno"),
            reason = it.text("motivo"),
        )
    }

    /** Todas las franjas del día; si el servidor es antiguo y no manda `franjas`, las libres de `slots`. */
    fun daySlots(json: JSONObject): List<DaySlot> {
        val all = json.optJSONArray("franjas")
        if (all != null) return all.objects().map { DaySlot(it.optString("start"), it.optString("end"), SlotStatus.of(it.optString("estado")), it.text("motivo")) }
        return json.optJSONArray("slots").objects().map { DaySlot(it.optString("start"), it.optString("end"), SlotStatus.FREE, null) }
    }

    fun appointments(array: JSONArray) = array.objects().map {
        ReceptionAppointment(
            it.optString("id"), it.text("patientName").orEmpty(), it.optString("doctorName"), it.optString("start"), it.optString("end"), it.optString("state"), it.optInt("version", 1),
            doctorId = it.optString("doctorId"),
            allowedActions = ServerActions.appointmentAllowed(it),
            blockedActions = ServerActions.appointmentBlocked(it),
            cancelableUntil = it.text("cancelableUntil"),
            rescheduledFromId = it.text("rescheduledFromId"),
            rescheduledToId = it.text("rescheduledToId"),
            reschedule = ServerActions.reschedule(it),
            categories = CategoryRequestRules.refs(it),
            patientId = it.optString("patientId"),
            arrival = it.optJSONObject("arrival")?.let { a -> AppointmentArrival(a.optString("id"), a.optInt("numero"), a.optString("state")) },
        )
    }

    /** Rows whose pending reschedule request this reader may accept (MED: own appointments). */
    fun rescheduleDecisions(rows: List<ReceptionAppointment>) = rows.filter { it.pendingReschedule != null && AppointmentAction.ACCEPT_RESCHEDULE in it.allowedActions }

    fun canConfirm(patient: PickerPatient?, doctor: SchedulingDoctor?, slot: DaySlot?) = patient != null && doctor != null && doctor.hasShift && slot != null && slot.selectable

    fun createBody(patient: PickerPatient, doctor: SchedulingDoctor, slot: DaySlot, reason: String): JSONObject =
        JSONObject().put("patientId", patient.id).put("doctorId", doctor.id).put("start", slot.start).put("end", slot.end)
            .apply { if (reason.isNotBlank()) put("reason", reason.trim()) }
}
