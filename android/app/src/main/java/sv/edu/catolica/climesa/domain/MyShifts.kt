package sv.edu.catolica.climesa.domain

import org.json.JSONObject
import org.json.JSONArray
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit
import java.util.Locale

/**
 * One row of `GET /turnos/mios`, already formatted for display. The state follows the clock on the server: a shift
 * starts, gets its entry confirmed at the start time and ends by itself (ASIS-01), so the app offers no check-in.
 */
data class MyShift(
    val area: String,
    val period: String,
    val state: String,
    val id: String = "",
    val version: Int = 0,
    val attendance: String? = null,
    val late: Boolean = false,
    val type: String = "",
    /** Start instant, or null when the API sent no valid start. */
    val start: Instant? = null,
    /** End instant, or null when the API sent no valid end. */
    val end: Instant? = null,
    /** `07:00 a 15:00`, `07:00 a 07:00 del día siguiente · Guardia 24 h`. */
    val hours: String = MyShifts.MISSING_TIME,
)

/**
 * One day of "Mis turnos": the assigned day (the day the shift starts) with its shifts in start order. `past` days
 * (before today, with every shift already over) go below the current and upcoming ones.
 */
data class MyShiftDay(val title: String, val shifts: List<MyShift>, val past: Boolean = false)

/**
 * Parses `GET /turnos/mios` outside composition. A missing or malformed `start`/`end` never throws:
 * the raw text (or a placeholder) is shown instead of crashing the screen.
 */
object MyShifts {
    const val MISSING_TIME = "Sin hora"
    private val zone: ZoneId = ZoneId.of("America/El_Salvador")
    private val spanish = Locale.forLanguageTag("es-SV")
    private val formatter = DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm").withZone(zone)
    private val clock = DateTimeFormatter.ofPattern("HH:mm").withZone(zone)
    private val dayName = DateTimeFormatter.ofPattern("EEEE, d 'de' MMMM", spanish)

    /**
     * A near moment the way people say it: "Hoy 14:00", "Mañana 07:00", "Jueves 07:00" within the week, and
     * "Jue 26 nov, 07:00" beyond it. Shifts repeat every day, so a full date with the year only adds noise.
     */
    fun relative(at: Instant, now: Instant): String {
        val day = at.atZone(zone).toLocalDate()
        val days = java.time.temporal.ChronoUnit.DAYS.between(now.atZone(zone).toLocalDate(), day)
        val time = clock.format(at)
        val label = when (days) {
            0L -> "Hoy"
            1L -> "Mañana"
            -1L -> "Ayer"
            in 2L..6L -> DateTimeFormatter.ofPattern("EEEE", spanish).format(day)
            else -> DateTimeFormatter.ofPattern("EEE d MMM", spanish).format(day).replace(".", "") + ","
        }
        return "${label.replaceFirstChar { it.uppercase(spanish) }} $time"
    }

    fun formatInstant(value: String?): String {
        val text = value?.trim().orEmpty()
        if (text.isEmpty() || text == "null") return MISSING_TIME
        val instant = instant(text) ?: return text
        return formatter.format(instant)
    }

    private fun instant(text: String?): Instant? {
        val value = text?.trim().orEmpty()
        if (value.isEmpty() || value == "null") return null
        return runCatching { Instant.parse(value) }.getOrNull() ?: runCatching { OffsetDateTime.parse(value).toInstant() }.getOrNull()
    }

    /** Hours of the shift in El Salvador time, marking the next day and a 24 h guard. */
    fun hours(start: Instant?, end: Instant?, type: String): String {
        if (start == null || end == null) return MISSING_TIME
        val nextDay = start.atZone(zone).toLocalDate() != end.minusMillis(1).atZone(zone).toLocalDate()
        val kind = when {
            type == "guardia" && Duration.between(start, end) == Duration.ofHours(24) -> " · Guardia 24 h"
            type == "guardia" -> " · Guardia"
            type == "nocturno" -> " · Nocturno"
            else -> ""
        }
        return "${clock.format(start)} a ${clock.format(end)}${if (nextDay) " del día siguiente" else ""}$kind"
    }

    fun parse(value: Any?): List<MyShift> {
        val rows = value as? JSONArray ?: return emptyList()
        return (0 until rows.length()).mapNotNull { index ->
            rows.optJSONObject(index)?.let { row ->
                val start = instant(text(row, "start"))
                val type = row.optString("type")
                MyShift(
                    area = row.optString("area"),
                    period = formatInstant(text(row, "start")) + " — " + formatInstant(text(row, "end")),
                    state = row.optString("state"),
                    id = row.optString("id"),
                    version = row.optInt("version"),
                    attendance = text(row, "attendance"),
                    late = row.optBoolean("late"),
                    type = type,
                    start = start,
                    end = instant(text(row, "end")),
                    hours = hours(start, instant(text(row, "end")), type),
                )
            }
        }
    }

    /** `Hoy · martes, 10 de noviembre`, `Mañana · …`, `Ayer · …` or `Jueves, 12 de noviembre`. */
    fun dayTitle(day: LocalDate, today: LocalDate): String {
        val name = dayName.format(day)
        return when (ChronoUnit.DAYS.between(today, day)) {
            0L -> "Hoy · $name"
            1L -> "Mañana · $name"
            -1L -> "Ayer · $name"
            else -> name.replaceFirstChar { it.titlecase(spanish) }
        }
    }

    /**
     * Shifts grouped by assigned day, shifts in start order. The screen opens at today: today, a day whose shift is
     * still running (a night shift from yesterday) and upcoming days come first, in date order; past days follow, the
     * most recent first, marked `past`. Rows without a valid start go last.
     */
    fun byDay(shifts: List<MyShift>, today: LocalDate = LocalDate.now(zone), now: Instant = Instant.now()): List<MyShiftDay> {
        val grouped = shifts.filter { it.start != null }.sortedBy { it.start }
            .groupBy { it.start!!.atZone(zone).toLocalDate() }
        val isPast = { day: LocalDate, items: List<MyShift> -> day < today && items.none { it.end == null || it.end > now } }
        val current = grouped.filter { (day, items) -> !isPast(day, items) }.map { (day, items) -> MyShiftDay(dayTitle(day, today), items) }
        val past = grouped.filter { (day, items) -> isPast(day, items) }.toSortedMap(reverseOrder())
            .map { (day, items) -> MyShiftDay(dayTitle(day, today), items, past = true) }
        val undated = shifts.filter { it.start == null }
        return current + past + (if (undated.isEmpty()) emptyList() else listOf(MyShiftDay("Sin fecha", undated)))
    }

    private fun text(row: JSONObject, key: String): String? = if (row.isNull(key)) null else row.optString(key)

    /** Attendance text for the person (never the raw code). */
    fun attendanceLabel(shift: MyShift): String? = when (shift.attendance) {
        "presente" -> if (shift.late) "Entrada corregida · llegó tarde" else "Entrada confirmada"
        "ausente" -> "Ausencia registrada"
        "pendiente" -> "Se confirma sola al iniciar"
        "sin_registro" -> "Sin registro de entrada"
        else -> null
    }
}
