package sv.edu.catolica.climesa.domain

import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.time.ZoneId

/** Preferred time of day of a category request (`franja`): local morning 07-12, afternoon 12-17, or any. */
enum class RequestFranja(val wire: String, val label: String, val fromHour: Int, val toHour: Int) {
    MORNING("manana", "Mañana", 7, 12), AFTERNOON("tarde", "Tarde", 12, 17), ANY("cualquiera", "Cualquier hora", 0, 24);
    companion object { fun of(wire: String) = entries.firstOrNull { it.wire == wire } ?: ANY }
}

/** Row of `GET /citas/categorias`: the reason a patient picks instead of a doctor (Fase 2, flow A). */
data class AppointmentCategory(val code: String, val name: String, val description: String, val icon: String, val specialties: List<String>, val keywords: String)

data class CategoryRef(val code: String, val name: String, val icon: String)

/** Soft tone of a category mark; the UI maps each one to a pair of existing theme tokens (strong icon, soft background). */
enum class CategoryTone { SLATE, AMBER, MAGENTA, RED, ORANGE, BLUE, TEAL, PURPLE, INDIGO, GREEN, CYAN }

data class AssignedAppointment(val id: String, val doctorName: String, val start: String, val end: String)

/** D128: pending requests that count for the limit, the policy maximum, and whether a new one would be accepted (with the server's reason). */
data class RequestLimit(val pending: Int, val max: Int, val canRequest: Boolean, val code: String?, val reason: String?)

/** Row of `GET /citas/solicitudes-categoria`; the actions come from the server (`allowedActions`). */
data class CategoryRequest(
    val id: String, val patientName: String, val record: String?, val categories: List<CategoryRef>, val specialties: List<String>,
    val franja: RequestFranja, val note: String?, val preferredDoctorId: String?, val preferredDoctorName: String?, val state: String,
    val rejectionReason: String?, val appointment: AssignedAppointment?, val createdAt: String, val version: Int, val allowedActions: List<String>,
) {
    val pending get() = state == CategoryRequestRules.PENDING
    fun allows(action: String) = action in allowedActions
    val categoryNames get() = categories.joinToString(", ") { it.name }
}

object CategoryRequestRules {
    const val PENDING = "pendiente"
    const val ASSIGN = "asignar"
    const val REJECT = "rechazar"
    const val CANCEL = "cancelar"
    const val MAX_CATEGORIES = 3
    const val NOTE_MAX = 280
    const val REJECT_MIN = 10
    const val PATH = "/citas/solicitudes-categoria"
    const val CATEGORIES_PATH = "/citas/categorias"
    /** D128: `GET /citas/solicitudes-categoria/limite`, read when "Pedir una cita" opens. */
    const val LIMIT_PATH = "/citas/solicitudes-categoria/limite"

    /** D128: reads the limit answer; null when it is not that object (an older API without the endpoint). */
    fun limit(value: Any?): RequestLimit? {
        val json = value as? org.json.JSONObject ?: return null
        if (!json.has("canRequest")) return null
        fun text(key: String) = if (json.isNull(key)) null else json.optString(key).takeIf { it.isNotBlank() }
        return RequestLimit(json.optInt("pending"), json.optInt("max"), json.optBoolean("canRequest", true), text("code"), text("reason"))
    }

    /** State value that picks the shared family, and its label: the same pairs as the web `REQUEST_STATE`. */
    fun status(state: String): Pair<String, String> = when (state) {
        PENDING -> "en_espera" to "Por asignar"
        "asignada" -> "confirmada" to "Cita asignada"
        "rechazada" -> "rechazada" to "Rechazada"
        "cancelada" -> "cancelada" to "Retirada"
        else -> state to state
    }

    /** How long a request has waited, like the web `waitingFor`: "hace 5 min", "hace 2 h", "hace 3 d". */
    fun waitingFor(createdAt: String, nowMillis: Long): String? {
        val created = parseMillis(createdAt) ?: return null
        val minutes = maxOf(0L, Math.round((nowMillis - created) / 60_000.0))
        return when {
            minutes < 60 -> "hace $minutes min"
            minutes < 1440 -> "hace ${minutes / 60} h"
            else -> "hace ${minutes / 1440} d"
        }
    }

    private val zone = ZoneId.of("America/El_Salvador")
    private fun JSONObject.text(key: String) = if (!has(key) || isNull(key)) null else optString(key).takeIf { it.isNotBlank() }
    private fun JSONArray?.objects() = (0 until (this?.length() ?: 0)).mapNotNull { this?.optJSONObject(it) }
    private fun JSONArray?.strings() = (0 until (this?.length() ?: 0)).mapNotNull { this?.optString(it)?.takeIf(String::isNotBlank) }

    fun categories(value: Any): List<AppointmentCategory> = (value as? JSONArray).objects().map {
        AppointmentCategory(it.optString("code"), it.optString("name"), it.optString("description"), it.optString("icon"), it.optJSONArray("specialties").strings(), it.optString("keywords"))
    }

    /**
     * `categories` of an appointment, agenda entry or request row (`CategoryRefResponse[]`). Defensive: a missing field,
     * `null`, a non-array value or entries without a code give no categories, so older servers show no marks.
     */
    fun refs(row: JSONObject): List<CategoryRef> = (row.opt("categories") as? JSONArray).objects()
        .mapNotNull { item -> item.text("code")?.let { CategoryRef(it, item.text("name") ?: it, item.optString("icon")) } }

    /** Same palette as the web (`components/category.tsx`); unknown icons are slate. */
    fun tone(icon: String): CategoryTone = when (icon) {
        "nino", "piel" -> CategoryTone.AMBER
        "mujer" -> CategoryTone.MAGENTA
        "corazon" -> CategoryTone.RED
        "hueso", "alergia" -> CategoryTone.ORANGE
        "ojo" -> CategoryTone.BLUE
        "oido" -> CategoryTone.TEAL
        "mente" -> CategoryTone.PURPLE
        "neuro" -> CategoryTone.INDIGO
        "digestivo" -> CategoryTone.GREEN
        "rinon" -> CategoryTone.CYAN
        else -> CategoryTone.SLATE
    }

    fun requests(value: Any): List<CategoryRequest> = (value as? JSONArray).objects().map { row ->
        CategoryRequest(
            row.optString("id"), row.text("patientName") ?: "Paciente", row.text("record"),
            refs(row),
            row.optJSONArray("specialties").strings(), RequestFranja.of(row.optString("franja")), row.text("note"),
            row.text("preferredDoctorId"), row.text("preferredDoctorName"), row.optString("state"), row.text("rejectionReason"),
            row.optJSONObject("appointment")?.let { AssignedAppointment(it.optString("id"), it.optString("doctorName"), it.optString("start"), it.optString("end")) },
            row.optString("createdAt"), row.optInt("version", 1), row.optJSONArray("allowedActions").strings(),
        )
    }

    /** Text search without accents over name, description, keywords and specialties; picked categories always stay visible. */
    fun filter(categories: List<AppointmentCategory>, query: String, picked: Collection<String> = emptyList()) =
        categories.filter { it.code in picked || matchesQuery(query, it.name, it.description, it.keywords, it.specialties.joinToString(" ")) }

    /** One to three categories: a fourth is ignored, tapping a picked one removes it. */
    fun toggle(picked: List<String>, code: String) = when {
        code in picked -> picked - code
        picked.size >= MAX_CATEGORIES -> picked
        else -> picked + code
    }

    fun canSend(picked: List<String>, note: String) = picked.isNotEmpty() && note.length <= NOTE_MAX

    /** Body of `POST /citas/solicitudes-categoria`. */
    fun createBody(picked: List<String>, franja: RequestFranja, note: String, preferredDoctorId: String?): JSONObject = JSONObject()
        .put("categories", JSONArray(picked)).put("franja", franja.wire)
        .apply { if (note.isNotBlank()) put("note", note.trim()) }
        .apply { if (!preferredDoctorId.isNullOrBlank()) put("preferredDoctorId", preferredDoctorId) }

    fun assignPath(request: CategoryRequest) = "$PATH/${request.id}/asignar"
    /** A-1: the server's first day with a gap in the requested time of day, with that doctor (up to 14 days). */
    fun suggestionPath(request: CategoryRequest) = "$PATH/${request.id}/sugerencia"

    /** `GET .../sugerencia`; null when nothing was found or the answer is incomplete. */
    fun suggestion(value: Any?): RequestSuggestion? {
        val json = value as? org.json.JSONObject ?: return null
        if (!json.optBoolean("found", false)) return null
        fun text(key: String) = if (json.isNull(key)) null else json.optString(key).takeIf { it.isNotBlank() }
        val date = text("date")?.let { runCatching { java.time.LocalDate.parse(it.take(10)) }.getOrNull() } ?: return null
        return RequestSuggestion(text("doctorId") ?: return null, date, text("start"))
    }

    /** The suggested slot when it is still free, else the first free one of the requested time of day. */
    fun suggestedSlot(slots: List<DaySlot>, suggestedStart: String?, franja: RequestFranja, wholeDay: Boolean): DaySlot? =
        slots.firstOrNull { suggestedStart != null && it.selectable && sameInstant(it.start, suggestedStart) } ?: firstFreeSlot(slots, franja, wholeDay)

    private fun sameInstant(a: String, b: String) = runCatching { java.time.Instant.parse(a) == java.time.Instant.parse(b) }.getOrDefault(a == b)
    fun rejectPath(request: CategoryRequest) = "$PATH/${request.id}/rechazar"
    fun cancelPath(request: CategoryRequest) = "$PATH/${request.id}/cancelar"

    fun assignBody(request: CategoryRequest, doctorId: String, slot: DaySlot): JSONObject =
        JSONObject().put("version", request.version).put("doctorId", doctorId).put("start", slot.start).put("end", slot.end)

    fun rejectError(reason: String) = if (reason.trim().length < REJECT_MIN) "Escribe un motivo de al menos $REJECT_MIN caracteres." else null
    fun rejectBody(request: CategoryRequest, reason: String): JSONObject = JSONObject().put("version", request.version).put("rejectionReason", reason.trim())
    fun cancelBody(request: CategoryRequest): JSONObject = JSONObject().put("version", request.version)

    /** The slot starts inside the requested time of day (El Salvador time). */
    fun inFranja(start: String, franja: RequestFranja): Boolean {
        val hour = runCatching { Instant.parse(start).atZone(zone).hour }.getOrNull() ?: return false
        return hour >= franja.fromHour && hour < franja.toHour
    }

    fun slotsFor(slots: List<DaySlot>, franja: RequestFranja, wholeDay: Boolean) = if (wholeDay) slots else slots.filter { inFranja(it.start, franja) }

    /** Prefill: the patient's preferred doctor when on shift, else the first doctor on shift of a suggested specialty. */
    fun suggestedDoctor(request: CategoryRequest, doctors: List<SchedulingDoctor>): SchedulingDoctor? =
        doctors.firstOrNull { it.id == request.preferredDoctorId && it.hasShift }
            ?: doctors.firstOrNull { it.hasShift && (it.specialty ?: "Medicina general") in request.specialties }

    /** Doctors of the suggested specialties first; the rest keep their order. */
    fun orderDoctors(request: CategoryRequest, doctors: List<SchedulingDoctor>) =
        doctors.sortedByDescending { (it.specialty ?: "Medicina general") in request.specialties || it.id == request.preferredDoctorId }

    fun isSuggested(request: CategoryRequest, doctor: SchedulingDoctor) = (doctor.specialty ?: "Medicina general") in request.specialties

    fun firstFreeSlot(slots: List<DaySlot>, franja: RequestFranja, wholeDay: Boolean) = slotsFor(slots, franja, wholeDay).firstOrNull { it.selectable }
}

/** A-1: what `GET /citas/solicitudes-categoria/{id}/sugerencia` proposes: the doctor, the day and the slot start. */
data class RequestSuggestion(val doctorId: String, val date: java.time.LocalDate, val start: String?)

/**
 * Lote 2 (Citas): reception has two different queues, never the same request twice. A category request has no doctor or
 * time yet and waits «Por asignar» in the inbox; an appointment the patient booked (`solicitada`) already has its slot and
 * waits «Por confirmar» in the list. The list names that state the same way the web does.
 */
object ReceptionAppointmentLabels {
    const val TO_CONFIRM = "Por confirmar"

    fun state(code: String, fallback: (String) -> String): String = if (code == "solicitada") TO_CONFIRM else fallback(code)
}
