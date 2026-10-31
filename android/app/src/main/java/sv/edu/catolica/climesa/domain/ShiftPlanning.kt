package sv.edu.catolica.climesa.domain

import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit

data class PlannedShift(
    val id: String, val staffId: String, val person: String, val areaId: String, val area: String,
    val start: String, val end: String, val type: String, val state: String, val justification: String?, val version: Int,
)
data class StaffOption(val id: String, val label: String)
data class AreaOption(val id: String, val label: String)
data class CoverageGap(val area: String, val role: String, val start: String, val end: String, val required: Int, val actual: Int) {
    val missing get() = maxOf(required - actual, 0)
}
data class PublishSummary(val from: String, val to: String, val published: Int, val gaps: List<CoverageGap>)

/** Lo escrito en el formulario de turno: fecha `AAAA-MM-DD` y hora `HH:mm`, siempre en horario de El Salvador. */
data class ShiftForm(
    val staffId: String = "", val areaId: String = "",
    val startDate: String = "", val startTime: String = "", val endDate: String = "", val endTime: String = "",
    val type: String = "diurno", val justification: String = "",
)

/** Planificación de turnos (FR-103-08, FR-103-09): todo se pregunta por permiso del catálogo, nunca por rol. */
object ShiftPlanning {
    const val VIEW = "turnos.ver"
    const val PLAN = "turnos.planificar"
    const val PUBLISH = "turnos.publicar"
    const val DRAFTS = "turnos.ver_borradores"
    const val MAX_PUBLISH_DAYS = 31L
    const val MAX_NOTE = 500
    val zone: ZoneId = ZoneId.of("America/El_Salvador")
    private val areaTypes = setOf("area", "planta", "consultorio", "hospital")
    private val types = mapOf("diurno" to "Diurno", "nocturno" to "Nocturno", "guardia" to "Guardia")
    private val localFormat = DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm").withZone(zone)
    private val timeFormat = DateTimeFormatter.ofPattern("HH:mm").withZone(zone)

    /** La pantalla se ofrece a quien planifica, publica o ve borradores; sin `turnos.ver` no hay qué listar. */
    fun canView(permissions: Collection<String>) =
        VIEW in permissions && (PLAN in permissions || PUBLISH in permissions || DRAFTS in permissions)
    fun canPlan(permissions: Collection<String>) = VIEW in permissions && PLAN in permissions
    fun canPublish(permissions: Collection<String>) = VIEW in permissions && PUBLISH in permissions
    fun cancellable(state: String) = state == "borrador" || state == "publicado"
    fun typeLabel(code: String) = types[code] ?: code
    fun stateLabel(code: String) = StaffLabels.shiftState(code).let { if (it == code) mapOf("en_curso" to "En curso", "completado" to "Completado")[code] ?: code else it }
    fun format(iso: String): String = runCatching { localFormat.format(Instant.parse(iso)) }.getOrDefault(iso)

    fun parseShifts(rows: JSONArray): List<PlannedShift> = (0 until rows.length()).map { i ->
        val r = rows.getJSONObject(i)
        PlannedShift(
            r.getString("id"), r.getString("staffId"), r.optString("person"), r.getString("areaId"), r.optString("area"),
            r.getString("start"), r.getString("end"), r.optString("type"), r.optString("state"),
            r.optString("justification").takeIf { it.isNotBlank() }, r.optInt("version", 1),
        )
    }

    fun parseStaff(rows: JSONArray): List<StaffOption> = (0 until rows.length()).map { rows.getJSONObject(it) }
        .filter { it.optBoolean("active", true) }
        .map { StaffOption(it.getString("id"), "${it.optString("givenNames")} ${it.optString("surnames")} · ${StaffLabels.function(it.optString("type"))}") }

    fun parseAreas(rows: JSONArray): List<AreaOption> = (0 until rows.length()).map { rows.getJSONObject(it) }
        .filter { it.optBoolean("active", true) && it.optString("type") in areaTypes }
        .map { AreaOption(it.getString("id"), "${it.optString("code")} · ${it.optString("name")}") }

    private fun date(text: String) = runCatching { LocalDate.parse(text.trim()) }.getOrNull()
    private fun time(text: String) = text.trim().takeIf { Regex("""\d{2}:\d{2}""").matches(it) }?.let { runCatching { LocalTime.parse(it) }.getOrNull() }
    private fun instantOf(d: String, t: String) = LocalDateTime.of(date(d)!!, time(t)!!).atZone(zone)

    fun formError(form: ShiftForm): String? {
        if (form.staffId.isBlank()) return "Selecciona la persona."
        if (form.areaId.isBlank()) return "Selecciona el área."
        if (date(form.startDate) == null || time(form.startTime) == null) return "Indica el inicio con fecha AAAA-MM-DD y hora HH:mm."
        if (date(form.endDate) == null || time(form.endTime) == null) return "Indica el fin con fecha AAAA-MM-DD y hora HH:mm."
        if (!instantOf(form.endDate, form.endTime).isAfter(instantOf(form.startDate, form.startTime))) return "El fin debe ser posterior al inicio."
        if (form.justification.trim().length > MAX_NOTE) return "La observación no puede pasar de $MAX_NOTE caracteres."
        return null
    }

    fun reasonError(reason: String): String? = when {
        reason.trim().length < MaintenanceRules.MIN_REASON -> "Indica el motivo, de al menos ${MaintenanceRules.MIN_REASON} caracteres."
        reason.trim().length > MaintenanceRules.MAX_REASON -> "El motivo no puede pasar de ${MaintenanceRules.MAX_REASON} caracteres."
        else -> null
    }

    private fun iso(d: String, t: String) = DateTimeFormatter.ISO_OFFSET_DATE_TIME.format(instantOf(d, t))

    fun createBody(form: ShiftForm): JSONObject = JSONObject()
        .put("staffId", form.staffId).put("areaId", form.areaId)
        .put("start", iso(form.startDate, form.startTime)).put("end", iso(form.endDate, form.endTime))
        .put("type", form.type).also { body -> form.justification.trim().takeIf { it.isNotEmpty() }?.let { body.put("justification", it) } }

    fun editBody(form: ShiftForm, shift: PlannedShift, reason: String): JSONObject =
        createBody(form).put("version", shift.version).put("reason", reason.trim())

    /** `PATCH /turnos/{id}` con `state: cancelado`: la API pide el turno completo, la versión y el motivo. */
    fun cancelBody(shift: PlannedShift, reason: String): JSONObject = JSONObject()
        .put("staffId", shift.staffId).put("areaId", shift.areaId).put("start", shift.start).put("end", shift.end)
        .put("type", shift.type).put("state", "cancelado").put("version", shift.version).put("reason", reason.trim())

    fun formOf(shift: PlannedShift): ShiftForm {
        val start = Instant.parse(shift.start).atZone(zone)
        val end = Instant.parse(shift.end).atZone(zone)
        return ShiftForm(
            shift.staffId, shift.areaId, start.toLocalDate().toString(), timeFormat.format(start),
            end.toLocalDate().toString(), timeFormat.format(end), shift.type, shift.justification.orEmpty(),
        )
    }

    fun publishError(from: String, to: String): String? {
        val a = date(from); val b = date(to)
        if (a == null || b == null) return "Indica el inicio y el fin del rango con fecha AAAA-MM-DD."
        if (b.isBefore(a)) return "El fin del rango no puede ser anterior al inicio."
        if (ChronoUnit.DAYS.between(a, b) + 1 > MAX_PUBLISH_DAYS) return "El rango no puede pasar de $MAX_PUBLISH_DAYS días."
        return null
    }

    fun publishBody(from: String, to: String, areaId: String?): JSONObject =
        JSONObject().put("from", from.trim()).put("to", to.trim()).also { body -> areaId?.takeIf { it.isNotBlank() }?.let { body.put("areaId", it) } }

    fun parseSummary(json: JSONObject): PublishSummary {
        val warnings = json.optJSONArray("warnings") ?: JSONArray()
        val gaps = (0 until warnings.length()).map { warnings.getJSONObject(it) }.map {
            CoverageGap(it.optString("area"), it.optString("role"), it.optString("start"), it.optString("end"), it.optInt("required"), it.optInt("actual"))
        }
        return PublishSummary(json.optString("from"), json.optString("to"), json.optInt("published"), gaps)
    }

    /** FR-103-09: se publica aunque haya huecos y se muestran para que Operaciones decida. */
    fun summaryText(summary: PublishSummary): String {
        val base = if (summary.published == 0) "No había turnos en borrador en ese rango."
        else "Se publicaron ${summary.published} turnos del ${summary.from} al ${summary.to}."
        return if (summary.gaps.isEmpty()) base else "$base Hay ${summary.gaps.size} huecos de cobertura."
    }

    fun gapText(gap: CoverageGap): String {
        val end = runCatching { timeFormat.format(Instant.parse(gap.end)) }.getOrDefault(gap.end)
        return "${gap.area} · ${StaffLabels.function(gap.role)} · ${format(gap.start)} a $end: faltan ${gap.missing} (mínimo ${gap.required}, programadas ${gap.actual})"
    }
}
