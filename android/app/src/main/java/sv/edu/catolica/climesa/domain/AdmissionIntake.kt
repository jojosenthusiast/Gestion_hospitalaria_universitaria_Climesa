package sv.edu.catolica.climesa.domain

import java.time.Instant
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeParseException
import org.json.JSONArray
import org.json.JSONObject

/** Source of an admission; each one links to a record of the same patient (`GET /admisiones/origenes`). */
enum class OriginKind(val wire: String, val label: String) {
    APPOINTMENT("cita", "Cita"), EMERGENCY("emergencia", "Emergencia"), AMBULANCE("ambulancia", "Ambulancia"), CONSULTATION("consulta", "Consulta");
    companion object { fun of(wire: String) = entries.firstOrNull { it.wire == wire } }
}
enum class IsolationType(val wire: String, val label: String) {
    CONTACT("contacto", "Por contacto"), DROPLET("gotitas", "Por gotitas"), AIRBORNE("aerea", "Aérea"), PROTECTIVE("protector", "Protector"),
}
data class OriginRecord(val id: String, val origin: OriginKind, val label: String, val detail: String)
data class IntakeDoctor(val id: String, val name: String, val specialty: String?, val available: Boolean, val reason: String?)
data class CategoryCount(val category: String, val free: Int, val compatible: Int) { val selectable get() = free > 0 }
data class IntakeBed(
    val id: String, val version: Int, val code: String, val roomId: String, val room: String, val floor: Int?, val category: String,
    val capacity: Int, val compatible: Boolean, val reason: String?, val suggested: Boolean,
)
data class BedMap(val categories: List<CategoryCount>, val beds: List<IntakeBed>)
data class FeasibilityCheck(val code: String, val ok: Boolean, val message: String)
data class Feasibility(val feasible: Boolean, val checks: List<FeasibilityCheck>)
data class RoomGroup(val roomId: String, val name: String, val capacity: Int, val beds: List<IntakeBed>)
data class FloorGroup(val floor: Int?, val rooms: List<RoomGroup>)

/** Everything typed in the eight steps. It lives in the ViewModel so rotating the phone keeps it. */
data class AdmissionDraft(
    val patient: PickerPatient? = null,
    val origin: OriginKind? = null,
    val originRecord: OriginRecord? = null,
    val motive: String = "",
    /** Local El Salvador time `yyyy-MM-dd HH:mm`. */
    val at: String = AdmissionIntake.nowLocal(),
    val doctor: IntakeDoctor? = null,
    val category: String? = null,
    val isolation: Boolean = false,
    val isolationType: IsolationType? = null,
    val unstable: Boolean = false,
    val postSurgical: Boolean = false,
    val bed: IntakeBed? = null,
    val visitorsAllowed: Boolean = true,
    val visitorsMax: Int = 1,
)

/** Rules of the guided admission. The API repeats every check (rule 5); these only guide the person step by step. */
object AdmissionIntake {
    const val MOTIVE_MIN = 10
    const val MOTIVE_MAX = 500
    const val LAST_STEP = 7
    val STEP_TITLES = listOf("Paciente", "Origen y motivo", "Fecha y médico", "Categoría", "Requisitos clínicos", "Cama", "Visitas", "Resumen")
    /** Assumption (docs/preguntas-abiertas.md): companions per patient by category. */
    val VISITOR_LIMIT = mapOf("semiprivada" to 1, "vip" to 3)
    val CATEGORY_LABELS = mapOf("semiprivada" to "Semiprivada", "vip" to "VIP")
    private val zone = ZoneId.of("America/El_Salvador")
    private val input = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm")

    fun nowLocal(now: Instant = Instant.now()): String = LocalDateTime.ofInstant(now, zone).format(input)

    /** `yyyy-MM-dd HH:mm` (El Salvador) to an ISO instant, or null if it does not parse. */
    fun instantOf(local: String): Instant? = try { LocalDateTime.parse(local.trim(), input).atZone(zone).toInstant() } catch (_: DateTimeParseException) { null }

    /** An admission is immediate unless it is asked more than 15 minutes ahead (the bed is then assigned on arrival). */
    fun isImmediate(at: String, now: Instant = Instant.now()): Boolean = instantOf(at)?.let { !it.isAfter(now.plusSeconds(15 * 60)) } ?: false

    fun visitorError(allowed: Boolean, max: Int, category: String?): String? {
        if (!allowed) return if (max == 0) null else "Sin visitas, el número de acompañantes debe ser 0."
        if (max < 1) return "Indica al menos 1 acompañante."
        val limit = VISITOR_LIMIT[category] ?: 4
        return if (max > limit) "La categoría ${CATEGORY_LABELS[category] ?: ""} admite hasta $limit acompañante${if (limit == 1) "" else "s"}." else null
    }

    /** What is missing to leave `step`, or null if the person can continue. `canAssignBed` is `camas.asignar`. */
    fun stepError(step: Int, d: AdmissionDraft, canAssignBed: Boolean, feasible: Boolean = false, now: Instant = Instant.now()): String? = when (step) {
        0 -> if (d.patient == null) "Elige al paciente." else null
        1 -> when {
            d.origin == null -> "Elige el origen del ingreso."
            d.originRecord == null -> "Elige el registro de origen del paciente."
            d.motive.trim().length < MOTIVE_MIN -> "Escribe el motivo del ingreso, de al menos $MOTIVE_MIN caracteres."
            else -> null
        }
        2 -> when {
            instantOf(d.at) == null -> "Indica la fecha y la hora como aaaa-mm-dd hh:mm."
            d.doctor == null -> "Elige al médico tratante."
            !d.doctor.available -> "El médico elegido no está disponible: ${d.doctor.reason ?: "sin turno"}."
            else -> null
        }
        3 -> if (d.category == null) "Elige la categoría de habitación." else null
        4 -> if (d.isolationType != null && !d.isolation) "El tipo de aislamiento necesita que el aislamiento esté marcado." else null
        5 -> if (canAssignBed && isImmediate(d.at, now) && d.bed == null) "Elige una cama compatible." else null
        6 -> visitorError(d.visitorsAllowed, d.visitorsMax, d.category)
        7 -> if (feasible) null else "Hay condiciones que impiden confirmar el ingreso."
        else -> null
    }

    private fun withBed(d: AdmissionDraft, canAssignBed: Boolean, now: Instant) = if (canAssignBed && isImmediate(d.at, now)) d.bed else null

    /** The validated values every request of the intake needs; null fields never reach the API (MOV-02). */
    private class Ready(val patientId: String, val origin: OriginKind, val originId: String, val doctorId: String, val at: Instant, val category: String)

    private fun ready(d: AdmissionDraft): Ready? {
        val patient = d.patient ?: return null
        val origin = d.origin ?: return null
        val record = d.originRecord ?: return null
        val doctor = d.doctor ?: return null
        val at = instantOf(d.at) ?: return null
        val category = d.category ?: return null
        if (patient.id.isBlank() || record.id.isBlank() || doctor.id.isBlank()) return null
        return Ready(patient.id, origin, record.id, doctor.id, at, category)
    }

    /** What is still missing to send the admission, in Spanish, or null when [body] can be built. */
    fun missing(d: AdmissionDraft): String? = when {
        d.patient == null || d.patient.id.isBlank() -> "Elige al paciente."
        d.origin == null -> "Elige el origen del ingreso."
        d.originRecord == null || d.originRecord.id.isBlank() -> "Elige el registro de origen del paciente."
        d.motive.trim().length !in MOTIVE_MIN..MOTIVE_MAX -> "Escribe el motivo del ingreso, de $MOTIVE_MIN a $MOTIVE_MAX caracteres."
        instantOf(d.at) == null -> "Indica la fecha y la hora como aaaa-mm-dd hh:mm."
        d.doctor == null || d.doctor.id.isBlank() -> "Elige al médico tratante."
        d.category == null -> "Elige la categoría de habitación."
        else -> null
    }

    /** `POST /admisiones` body, or null while [missing] reports something. */
    fun body(d: AdmissionDraft, canAssignBed: Boolean, now: Instant = Instant.now()): JSONObject? {
        if (missing(d) != null) return null
        val r = ready(d) ?: return null
        return JSONObject()
            .put("patientId", r.patientId).put("origin", r.origin.wire).put("originId", r.originId).put("motive", d.motive.trim())
            .put("requestedCategory", r.category).put("isolation", d.isolation).put("unstable", d.unstable).put("postSurgical", d.postSurgical)
            .put("attendingDoctorId", r.doctorId).put("scheduledAt", r.at.toString())
            .put("visitorsAllowed", d.visitorsAllowed).put("visitorsMax", if (d.visitorsAllowed) d.visitorsMax else 0)
            .apply {
                if (d.isolation && d.isolationType != null) put("isolationType", d.isolationType.wire)
                withBed(d, canAssignBed, now)?.let { put("bedId", it.id).put("bedVersion", it.version) }
            }
    }

    fun feasibilityPath(d: AdmissionDraft, canAssignBed: Boolean, now: Instant = Instant.now()): String? {
        fun enc(v: String) = java.net.URLEncoder.encode(v, "UTF-8")
        val r = ready(d) ?: return null
        val parts = mutableListOf(
            "patientId=${enc(r.patientId)}", "origin=${r.origin.wire}", "originId=${enc(r.originId)}", "doctorId=${enc(r.doctorId)}",
            "at=${enc(r.at.toString())}", "category=${r.category}", "isolation=${d.isolation}", "visitorsAllowed=${d.visitorsAllowed}",
            "visitorsMax=${if (d.visitorsAllowed) d.visitorsMax else 0}",
        )
        withBed(d, canAssignBed, now)?.let { parts += "bedId=${enc(it.id)}" }
        return "/admisiones/factibilidad?" + parts.joinToString("&")
    }

    fun floors(beds: List<IntakeBed>): List<FloorGroup> = beds.groupBy { it.floor }.entries
        .sortedBy { it.key ?: Int.MAX_VALUE }
        .map { (floor, inFloor) -> FloorGroup(floor, inFloor.groupBy { it.roomId }.map { (id, rooms) -> RoomGroup(id, rooms.first().room, rooms.first().capacity, rooms) }) }

    private fun JSONObject.text(key: String) = if (isNull(key)) null else optString(key).takeIf { it.isNotBlank() }
    private fun JSONArray?.objects() = (0 until (this?.length() ?: 0)).mapNotNull { this?.optJSONObject(it) }

    fun origins(array: JSONArray): List<OriginRecord> = array.objects().mapNotNull {
        val kind = OriginKind.of(it.optString("origin")) ?: return@mapNotNull null
        OriginRecord(it.getString("id"), kind, it.optString("label"), it.optString("detail"))
    }
    fun doctors(array: JSONArray) = array.objects().map { IntakeDoctor(it.getString("id"), it.optString("name"), it.text("specialty"), it.optBoolean("available"), it.text("reason")) }
    fun bedMap(json: JSONObject) = BedMap(
        json.optJSONArray("categories").objects().map { CategoryCount(it.optString("category"), it.optInt("free"), it.optInt("compatible")) },
        json.optJSONArray("beds").objects().map {
            IntakeBed(it.getString("id"), it.optInt("version", 1), it.optString("code"), it.optString("roomId"), it.optString("room"), if (it.isNull("floor")) null else it.optInt("floor"),
                it.optString("category"), it.optInt("capacity"), it.optBoolean("compatible"), it.text("reason"), it.optBoolean("suggested"))
        },
    )
    fun feasibility(json: JSONObject) = Feasibility(json.optBoolean("feasible"), json.optJSONArray("checks").objects().map { FeasibilityCheck(it.optString("code"), it.optBoolean("ok"), it.optString("message")) })
}
