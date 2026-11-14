package sv.edu.catolica.climesa.domain

import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter

data class ShiftConflict(val code: String, val text: String)

/**
 * Rules the "Asignar turno" flow shows before sending (area, schedule, eligible staff, inline conflicts). They mirror
 * the web ones and the API policy (turnos.duracion 4–12 h, guardia/nocturno hasta 24 h; descanso 8 h, 12 h tras 24 h);
 * the API and PostgreSQL stay the guarantee.
 */
object ShiftAssignment {
    const val MIN_HOURS = 4L
    const val MAX_DAY_HOURS = 12L
    const val MAX_LONG_HOURS = 24L
    const val REST_HOURS = 8L
    const val REST_AFTER_LONG_HOURS = 12L
    private val zone = ShiftPlanning.zone
    private val stamp = DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm").withZone(zone)

    private fun date(text: String) = runCatching { LocalDate.parse(text.trim()) }.getOrNull()
    private fun time(text: String) = text.trim().takeIf { Regex("""\d{2}:\d{2}""").matches(it) }?.let { runCatching { LocalTime.parse(it) }.getOrNull() }

    /** Start and end instants; an end time not after the start time means the shift ends the next day. */
    fun window(startDate: String, startTime: String, endTime: String): Pair<ZonedDateTime, ZonedDateTime>? {
        val d = date(startDate) ?: return null
        val s = time(startTime) ?: return null
        val e = time(endTime) ?: return null
        val start = LocalDateTime.of(d, s).atZone(zone)
        var end = LocalDateTime.of(d, e).atZone(zone)
        if (!end.isAfter(start)) end = end.plusDays(1)
        return start to end
    }

    fun hours(start: ZonedDateTime, end: ZonedDateTime): Double = Duration.between(start, end).toMinutes() / 60.0

    /** Suggested type from the schedule; the person can change it. */
    fun suggestKind(start: ZonedDateTime, end: ZonedDateTime): String {
        if (hours(start, end) > MAX_DAY_HOURS) return "guardia"
        return if (start.hour >= 18 || start.hour < 5) "nocturno" else "diurno"
    }

    /** 4–24 h rule: diurno 4 to 12 h; nocturno and guardia up to 24 h. */
    fun durationProblem(start: ZonedDateTime, end: ZonedDateTime, kind: String): String? {
        val h = hours(start, end)
        val max = if (kind == "diurno") MAX_DAY_HOURS else MAX_LONG_HOURS
        if (h >= MIN_HOURS && h <= max) return null
        val label = when (kind) { "diurno" -> "diurno"; "nocturno" -> "nocturno"; else -> "de guardia" }
        return "Un turno $label dura de $MIN_HOURS a $max horas; este dura ${"%.1f".format(h)}."
    }

    /** Duration problem of a filled form, or null (also null while the schedule is incomplete: `ShiftPlanning.formError` reports that). */
    fun formProblem(form: ShiftForm): String? {
        val (start, end) = window(form.startDate, form.startTime, form.endTime) ?: return null
        return durationProblem(start, end, form.type)
    }

    private fun restUntil(start: ZonedDateTime, end: ZonedDateTime, kind: String): ZonedDateTime? {
        val sameDay = start.toLocalDate() == end.minusNanos(1).toLocalDate()
        val night = start.hour >= 18
        if (hours(start, end) < 24 && (sameDay || (!night && kind != "nocturno"))) return null
        return end.toLocalDate().plusDays(1).atStartOfDay(zone)
    }

    fun conflicts(person: CatalogStaff?, start: ZonedDateTime, end: ZonedDateTime, kind: String, shifts: List<PlannedShift>, ignoreId: String? = null): List<ShiftConflict> {
        if (person == null || !end.isAfter(start)) return emptyList()
        val out = mutableListOf<ShiftConflict>()
        if (person.type == "medico" || person.type == "enfermero") {
            val day = start.toLocalDate().toString()
            if (person.registrations.none { it.first <= day && day <= it.second }) out += ShiftConflict("inscripcion", "Sin inscripción profesional vigente en esa fecha")
        }
        val dayStart = start.toLocalDate().atStartOfDay(zone).toInstant()
        val dayEnd = dayStart.plus(Duration.ofDays(1))
        for (item in shifts) {
            if (item.staffId != person.id || item.id == ignoreId || item.state == "cancelado") continue
            val a = runCatching { Instant.parse(item.start) }.getOrNull() ?: continue
            val b = runCatching { Instant.parse(item.end) }.getOrNull() ?: continue
            val s = start.toInstant(); val e = end.toInstant()
            if (a < e && b > s) { out += ShiftConflict("traslape", "Se traslapa con otro turno (${stamp.format(a)} a ${stamp.format(b)})"); continue }
            if (!b.isAfter(s)) {
                val until = restUntil(a.atZone(zone), b.atZone(zone), item.type)
                if (until != null && start.isBefore(until)) { out += ShiftConflict("descanso", "Descanso obligatorio hasta ${stamp.format(until)}"); continue }
                val need = if (item.type == "guardia" && Duration.between(a, b).toHours() >= 24) REST_AFTER_LONG_HOURS else REST_HOURS
                if (Duration.between(b, s).toMinutes() / 60.0 < need) { out += ShiftConflict("descanso", "Necesita $need h de descanso tras su turno anterior"); continue }
            }
            if (!a.isBefore(e)) {
                val until = restUntil(start, end, kind)
                if (until != null && a.isBefore(until.toInstant())) { out += ShiftConflict("descanso", "Debe descansar tras este turno; su siguiente turno es el ${stamp.format(a)}"); continue }
                val need = if ((kind == "guardia" || kind == "nocturno") && hours(start, end) >= 24) REST_AFTER_LONG_HOURS else REST_HOURS
                if (Duration.between(e, a).toMinutes() / 60.0 < need) { out += ShiftConflict("descanso", "Necesita $need h de descanso antes de su siguiente turno"); continue }
            }
            if (a < dayEnd && b > dayStart) out += ShiftConflict("jornada", "Ya tiene un turno en esa jornada")
        }
        return out
    }

    private fun chain(areas: List<CatalogArea>, id: String?): Set<String> {
        val seen = linkedSetOf<String>()
        var at = id
        while (at != null && seen.add(at)) at = areas.firstOrNull { it.id == at }?.parentId
        return seen
    }

    /**
     * Staff eligible for an area: that area, containers (hospital, floor) or contained spaces, and people without an
     * area; `includeOthers` opens everyone (cross-area cover). [role] is `FILTER_ALL` or a function code.
     */
    fun eligible(catalog: ShiftCatalog, areaId: String, role: String, includeOthers: Boolean): List<CatalogStaff> {
        val up = chain(catalog.areas, areaId)
        return catalog.staff.filter { p ->
            (role == FILTER_ALL || p.type == role) &&
                (includeOthers || areaId.isBlank() || p.areaId == null || p.areaId in up || areaId in chain(catalog.areas, p.areaId))
        }
    }

    /** Accent- and case-insensitive match used by the autosuggest fields. */
    fun fold(text: String): String = java.text.Normalizer.normalize(text, java.text.Normalizer.Form.NFD).replace(Regex("\\p{M}+"), "").lowercase().trim()
    fun matches(query: String, vararg fields: String?): Boolean = query.isBlank() || fold(fields.filterNotNull().joinToString(" ")).contains(fold(query))
}
