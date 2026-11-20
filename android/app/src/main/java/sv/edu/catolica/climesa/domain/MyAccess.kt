package sv.edu.catolica.climesa.domain

import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import org.json.JSONArray

/** One row of "Quién vio mi expediente" (A11, FR-110-08): role, date and reason, never the staff member's name. */
data class AccessEntry(val at: String, val role: String, val dataKind: String, val reason: String, val name: String? = null, val urgent: Boolean = false)

/**
 * D130: accesses that repeat the same who, what and why within [MyAccessRules.GROUP_WINDOW_MINUTES] collapse into one row,
 * newest first: [latest] is the most recent, [earliest] the first and [count] how many there were.
 */
data class AccessGroup(val entry: AccessEntry, val earliest: String, val latest: String, val count: Int)

object MyAccessRules {
    private val zone = ZoneId.of("America/El_Salvador")
    private val formatter = DateTimeFormatter.ofPattern("d MMM yyyy, HH:mm", Locale("es", "SV")).withZone(zone)

    /** Reads `GET /me/accesos`; rows without a date are skipped. */
    fun parse(value: Any?): List<AccessEntry> {
        val array = value as? JSONArray ?: return emptyList()
        return (0 until array.length()).mapNotNull { i ->
            val row = array.optJSONObject(i) ?: return@mapNotNull null
            val at = row.optString("fecha").takeIf { it.isNotBlank() } ?: return@mapNotNull null
            // D130: the person's name only when the API sends it (`nombre`); otherwise the role alone.
            val name = listOf("nombre", "personal", "staffName").firstNotNullOfOrNull { k -> row.optString(k).takeIf { !row.isNull(k) && it.isNotBlank() } }
            // D120: `urgente` marks the urgent read of an ambulance reception; an older API without it reads the reason.
            val reason = row.optString("motivo")
            AccessEntry(at, row.optString("rol", "Personal del hospital"), row.optString("tipoDato"), reason, name, row.optBoolean("urgente", false) || isUrgentReason(reason))
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

    const val GROUP_WINDOW_MINUTES = 15L

    /** D130: one row per burst of identical accesses (same who, what and why, each within the window of the previous one). */
    fun collapse(entries: List<AccessEntry>): List<AccessGroup> {
        val timed = entries.mapNotNull { e -> runCatching { Instant.parse(e.at) }.getOrNull()?.let { it to e } }.sortedByDescending { it.first }
        val groups = mutableListOf<MutableList<Pair<Instant, AccessEntry>>>()
        timed.forEach { item ->
            val last = groups.lastOrNull()?.last()
            val same = last != null && last.second.copy(at = "") == item.second.copy(at = "") &&
                java.time.Duration.between(item.first, last.first).toMinutes() <= GROUP_WINDOW_MINUTES
            if (same) groups.last() += item else groups += mutableListOf(item)
        }
        return groups.map { g -> AccessGroup(g.first().second, earliest = g.last().second.at, latest = g.first().second.at, count = g.size) }
    }

    /** D130: what was read, in plain words instead of the audit code. */
    fun dataText(kind: String): String = when (kind.lowercase(Locale.ROOT)) {
        "fila" -> "Tu número en la fila"
        "consulta", "consultas" -> "Tus consultas"
        "expediente", "paciente" -> "Tu expediente"
        "signos", "signos_vitales" -> "Tus signos vitales"
        "laboratorio", "examenes", "exámenes" -> "Tus exámenes"
        "receta", "recetas" -> "Tus recetas"
        "admision", "hospitalizacion" -> "Tu hospitalización"
        "cita", "citas" -> "Tus citas"
        "" -> "Tu expediente"
        else -> kind.replace('_', ' ').replaceFirstChar { it.uppercase(Locale("es", "SV")) }
    }

    /** D120: "Recepción de ambulancia (urgente)" is the urgent read of the ambulance reception. */
    fun isUrgentReason(reason: String) = reason.lowercase(Locale.ROOT).contains("(urgente)")

    /** D130: why, in plain words ("para atenderte") instead of the audit code. */
    fun reasonText(reason: String): String = when (reason.lowercase(Locale.ROOT)) {
        "atencion", "atención" -> "para atenderte"
        "emergencia" -> "por una emergencia"
        "auditoria", "auditoría" -> "por una revisión de calidad"
        "recepción de ambulancia (urgente)", "recepcion de ambulancia (urgente)" -> "al recibirte de una ambulancia (acceso urgente)"
        "" -> ""
        else -> "motivo: " + reason.replace('_', ' ')
    }

    /** Time of a row inside its day group ("10:32"). */
    fun time(iso: String): String = runCatching { DateTimeFormatter.ofPattern("HH:mm").withZone(zone).format(Instant.parse(iso)) }.getOrDefault(iso)

    /** Local hospital time, for example "14 nov 2026, 10:32"; the raw text if it is not an ISO instant. */
    fun displayDate(iso: String): String = try { formatter.format(Instant.parse(iso)) } catch (e: Exception) { iso }
}
