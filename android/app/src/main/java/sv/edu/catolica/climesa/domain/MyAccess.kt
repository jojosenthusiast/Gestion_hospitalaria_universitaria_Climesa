package sv.edu.catolica.climesa.domain

import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import org.json.JSONArray

/** One row of "Quién vio mi expediente" (A11, FR-110-08): role, date and reason, never the staff member's name. */
data class AccessEntry(val at: String, val role: String, val dataKind: String, val reason: String, val exceptional: Boolean)

object MyAccessRules {
    private val zone = ZoneId.of("America/El_Salvador")
    private val formatter = DateTimeFormatter.ofPattern("d MMM yyyy, HH:mm", Locale("es", "SV")).withZone(zone)

    /** Reads `GET /me/accesos`; rows without a date are skipped. */
    fun parse(value: Any?): List<AccessEntry> {
        val array = value as? JSONArray ?: return emptyList()
        return (0 until array.length()).mapNotNull { i ->
            val row = array.optJSONObject(i) ?: return@mapNotNull null
            val at = row.optString("fecha").takeIf { it.isNotBlank() } ?: return@mapNotNull null
            AccessEntry(at, row.optString("rol", "Personal del hospital"), row.optString("tipoDato"), row.optString("motivo"), row.optBoolean("accesoExcepcional", false))
        }
    }

    /** Local hospital time, for example "14 nov 2026, 10:32"; the raw text if it is not an ISO instant. */
    fun displayDate(iso: String): String = try { formatter.format(Instant.parse(iso)) } catch (e: Exception) { iso }
}
