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

data class AssignedAppointment(val id: String, val doctorName: String, val start: String, val end: String)

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

    private val zone = ZoneId.of("America/El_Salvador")
    private fun JSONObject.text(key: String) = if (!has(key) || isNull(key)) null else optString(key).takeIf { it.isNotBlank() }
    private fun JSONArray?.objects() = (0 until (this?.length() ?: 0)).mapNotNull { this?.optJSONObject(it) }
    private fun JSONArray?.strings() = (0 until (this?.length() ?: 0)).mapNotNull { this?.optString(it)?.takeIf(String::isNotBlank) }

    fun categories(value: Any): List<AppointmentCategory> = (value as? JSONArray).objects().map {
        AppointmentCategory(it.optString("code"), it.optString("name"), it.optString("description"), it.optString("icon"), it.optJSONArray("specialties").strings(), it.optString("keywords"))
    }

    fun requests(value: Any): List<CategoryRequest> = (value as? JSONArray).objects().map { row ->
        CategoryRequest(
            row.optString("id"), row.text("patientName") ?: "Paciente", row.text("record"),
            row.optJSONArray("categories").objects().map { CategoryRef(it.optString("code"), it.optString("name"), it.optString("icon")) },
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
