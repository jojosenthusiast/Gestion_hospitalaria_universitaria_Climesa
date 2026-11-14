package sv.edu.catolica.climesa.domain

import org.json.JSONObject
import org.json.JSONArray
import java.time.Instant
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/** One row of `GET /turnos/mios`, already formatted for display. */
data class MyShift(val area: String, val period: String, val state: String)

/**
 * Parses `GET /turnos/mios` outside composition. A missing or malformed `start`/`end` never throws:
 * the raw text (or a placeholder) is shown instead of crashing the screen.
 */
object MyShifts {
    const val MISSING_TIME = "Sin hora"
    private val formatter = DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm").withZone(ZoneId.of("America/El_Salvador"))

    fun formatInstant(value: String?): String {
        val text = value?.trim().orEmpty()
        if (text.isEmpty() || text == "null") return MISSING_TIME
        val instant = runCatching { Instant.parse(text) }.getOrNull()
            ?: runCatching { OffsetDateTime.parse(text).toInstant() }.getOrNull()
            ?: return text
        return formatter.format(instant)
    }

    fun parse(value: Any?): List<MyShift> {
        val rows = value as? JSONArray ?: return emptyList()
        return (0 until rows.length()).mapNotNull { index ->
            rows.optJSONObject(index)?.let { row ->
                MyShift(
                    area = row.optString("area"),
                    period = formatInstant(text(row, "start")) + " — " + formatInstant(text(row, "end")),
                    state = row.optString("state"),
                )
            }
        }
    }

    private fun text(row: JSONObject, key: String): String? = if (row.isNull(key)) null else row.optString(key)
}
