package sv.edu.catolica.climesa.domain

import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import org.json.JSONArray

/** One row of "Quién vio mi expediente" (A11, FR-110-08): role, date and reason, never the staff member's name. */
data class AccessEntry(val at: String, val role: String, val dataKind: String, val reason: String)

object MyAccessRules {
    private val zone = ZoneId.of("America/El_Salvador")
    private val formatter = DateTimeFormatter.ofPattern("d MMM yyyy, HH:mm", Locale("es", "SV")).withZone(zone)

    /** Reads `GET /me/accesos`; rows without a date are skipped. */
    fun parse(value: Any?): List<AccessEntry> {
        val array = value as? JSONArray ?: return emptyList()
        return (0 until array.length()).mapNotNull { i ->
            val row = array.optJSONObject(i) ?: return@mapNotNull null
            val at = row.optString("fecha").takeIf { it.isNotBlank() } ?: return@mapNotNull null
            AccessEntry(at, row.optString("rol", "Personal del hospital"), row.optString("tipoDato"), row.optString("motivo"))
        }
    }

    /** Days of the last week stay open; older days fold under one line. */
    const val RECENT_DAYS = 7L

    /** One day of the log: its date, whether it is older than [RECENT_DAYS], and its rows (newest first). */
    data class Day(val date: java.time.LocalDate, val older: Boolean, val entries: List<AccessEntry>)

    /** Rows grouped by local day, newest day first; rows without a readable date are left out. */
    fun byDay(entries: List<AccessEntry>, today: java.time.LocalDate): List<Day> = entries
        .mapNotNull { e -> runCatching { Instant.parse(e.at) }.getOrNull()?.let { it to e } }
        .sortedByDescending { it.first }
        .groupBy { it.first.atZone(zone).toLocalDate() }
        .map { (day, rows) -> Day(day, day.isBefore(today.minusDays(RECENT_DAYS - 1)), rows.map { it.second }) }

    /** Time of a row inside its day group ("10:32"). */
    fun time(iso: String): String = runCatching { DateTimeFormatter.ofPattern("HH:mm").withZone(zone).format(Instant.parse(iso)) }.getOrDefault(iso)

    /** Local hospital time, for example "14 nov 2026, 10:32"; the raw text if it is not an ISO instant. */
    fun displayDate(iso: String): String = try { formatter.format(Instant.parse(iso)) } catch (e: Exception) { iso }
}
