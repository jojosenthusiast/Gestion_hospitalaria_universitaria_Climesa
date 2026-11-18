package sv.edu.catolica.climesa.domain

import org.json.JSONArray
import org.json.JSONObject

data class PatientAppointment(
    val id: String,
    val doctorName: String,
    val start: String,
    val end: String,
    val state: String,
    val reason: String?,
    val version: Int,
    val doctorId: String = "",
    val allowedActions: List<AppointmentAction> = emptyList(),
    val blockedActions: Map<AppointmentAction, String> = emptyMap(),
    /** CITA-01: last moment the patient may cancel or reschedule; null when the API gives no deadline. */
    val cancelableUntil: String? = null,
    val rescheduledToId: String? = null,
    val reschedule: RescheduleRequest? = null,
    /** Categories the patient picked when asking by reason; empty when reception booked it directly. */
    val categories: List<CategoryRef> = emptyList(),
) {
    fun allows(action: AppointmentAction) = action in allowedActions
    fun blockedReason(action: AppointmentAction) = blockedActions[action]
}

data class AppointmentDoctor(
    val id: String,
    val name: String,
    val specialty: String?,
    val hasShift: Boolean = true,
    val reason: String? = null,
)

data class AppointmentSlot(
    val start: String,
    val end: String,
)

data class AppointmentWorkPeriod(
    val start: String,
    val end: String,
)

/** R3 A-7: "Mis citas" split like the web `upcoming()`: what is ahead (soonest first) and what already passed or closed. */
data class AppointmentSplit(val upcoming: List<PatientAppointment>, val past: List<PatientAppointment>)

/** `POST /citas/solicitudes`: the patient asks for a slot; Recepción confirms or rejects it. */
object PatientAppointmentRules {
    /** Days before and after today that "Mis citas" and Inicio read: 59 + 33 stays inside the API's 93-day limit. */
    const val PAST_DAYS = 59L
    const val AHEAD_DAYS = 33L

    /**
     * `GET /citas` with an explicit window: a bare call only covers the last 7 and next 31 days, so "Anteriores" held one
     * week and an appointment further ahead was missing from the list and from Inicio.
     */
    fun listPath(today: java.time.LocalDate): String = "/citas?from=${today.minusDays(PAST_DAYS)}&to=${today.plusDays(AHEAD_DAYS)}"

    private val closed = setOf("cancelada", "atendida", "no_asistio", "rechazada", "vencida", "reprogramada")

    /** Upcoming: an open appointment whose end is still ahead, ascending. Past: the rest, most recent first. */
    fun split(appointments: List<PatientAppointment>, now: java.time.Instant): AppointmentSplit {
        fun instant(value: String) = runCatching { java.time.Instant.parse(value) }.getOrNull()
            ?: runCatching { java.time.OffsetDateTime.parse(value).toInstant() }.getOrNull()
        val (upcoming, past) = appointments.partition { a -> a.state !in closed && (instant(a.end) ?: instant(a.start))?.isAfter(now) != false }
        return AppointmentSplit(upcoming.sortedBy { instant(it.start) }, past.sortedByDescending { instant(it.start) })
    }

    fun parse(value: Any): List<PatientAppointment> {
        val rows = value as? JSONArray ?: return emptyList()
        return (0 until rows.length()).mapNotNull { i -> rows.optJSONObject(i)?.let { row ->
            PatientAppointment(
                row.optString("id"), row.optString("doctorName"), row.optString("start"), row.optString("end"), row.optString("state"),
                ServerActions.text(row, "reason"), row.optInt("version", 1),
                doctorId = row.optString("doctorId"),
                allowedActions = ServerActions.appointmentAllowed(row),
                blockedActions = ServerActions.appointmentBlocked(row),
                cancelableUntil = ServerActions.text(row, "cancelableUntil"),
                rescheduledToId = ServerActions.text(row, "rescheduledToId"),
                reschedule = ServerActions.reschedule(row),
                categories = CategoryRequestRules.refs(row),
            )
        } }
    }

    /** Body of `POST /citas/{id}/reprogramar` for the patient (a request that Recepción or the doctor decides). */
    fun rescheduleBody(appointment: PatientAppointment, slot: AppointmentSlot): JSONObject =
        JSONObject().put("version", appointment.version).put("start", slot.start).put("end", slot.end)

    /** The released body is `{version, reason}`; D-8 adds `reasonCode` only when the patient picked a quick reason or "Otro". */
    fun cancelBody(appointment: PatientAppointment, reason: String, reasonCode: String? = null): JSONObject =
        JSONObject().put("version", appointment.version).put("reason", reason.trim()).apply { if (reasonCode != null) put("reasonCode", reasonCode) }

    fun requestBody(doctorId: String, slot: AppointmentSlot, reason: String): JSONObject = JSONObject()
        .put("doctorId", doctorId).put("start", slot.start).put("end", slot.end)
        .apply { if (reason.isNotBlank()) put("reason", reason.trim()) }
}
