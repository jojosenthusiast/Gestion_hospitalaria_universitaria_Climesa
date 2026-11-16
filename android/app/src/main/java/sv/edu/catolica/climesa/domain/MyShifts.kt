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
    /** `07:00 a 15:00`, `07:00 a 07:00 del día siguiente · Guardia 24 h`. */
    val hours: String = MyShifts.MISSING_TIME,
)

/** One day of "Mis turnos": the assigned day (the day the shift starts) with its shifts in start order. */
data class MyShiftDay(val title: String, val shifts: List<MyShift>)

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

    /** Shifts grouped by assigned day, days and shifts in start order; rows without a valid start go last. */
    fun byDay(shifts: List<MyShift>, today: LocalDate = LocalDate.now(zone)): List<MyShiftDay> {
        val dated = shifts.filter { it.start != null }.sortedBy { it.start }
            .groupBy { it.start!!.atZone(zone).toLocalDate() }
            .map { (day, items) -> MyShiftDay(dayTitle(day, today), items) }
        val undated = shifts.filter { it.start == null }
        return if (undated.isEmpty()) dated else dated + MyShiftDay("Sin fecha", undated)
    }

    private fun text(row: JSONObject, key: String): String? = if (row.isNull(key)) null else row.optString(key)

    /** Attendance text for the person (never the raw code). */
    fun attendanceLabel(shift: MyShift): String? = when (shift.attendance) {
        "presente" -> if (shift.late) "Entrada corregida · llegó tarde" else "Entrada confirmada"
        "ausente" -> "Ausencia registrada"
        "pendiente" -> "Se confirma sola al iniciar"
        else -> null
    }
}
