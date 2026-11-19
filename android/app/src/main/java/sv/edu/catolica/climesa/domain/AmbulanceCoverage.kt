package sv.edu.catolica.climesa.domain

import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/** An interval of `GET /ambulancia/cobertura` without a full crew on shift; [missing] is `paramedico`, `motorista` or `tripulacion`. */
data class CrewGap(val start: Instant, val end: Instant, val hours: Int, val missing: String)

/** Lote 5 S8, `GET /ambulancia/cobertura?dias=7`: hours of the coming days without a paramedic and a driver on shift. */
data class CrewCoverage(val hoursWithoutCrew: Int, val covered: Boolean, val days: Int, val daysWithGaps: Int, val gaps: List<CrewGap>)

/**
 * "ni se valida que en todos los dias a todo momento debe de haber turnos de ambulancia": the roles that dispatch see, in the
 * dispatch header, when the next days have hours without crew. Informative only; publishing shifts is never blocked on it.
 */
object AmbulanceCoverage {
    const val DAYS = 7
    const val PATH = "/ambulancia/cobertura?dias=$DAYS"

    private val zone: ZoneId = ZoneId.of("America/El_Salvador")
    private val clock = DateTimeFormatter.ofPattern("HH:mm").withZone(zone)

    private fun instant(value: String?): Instant? = value?.takeIf { it.isNotBlank() }?.let { runCatching { Instant.parse(it) }.getOrNull() ?: runCatching { OffsetDateTime.parse(it).toInstant() }.getOrNull() }
    private fun objects(array: JSONArray?) = (0 until (array?.length() ?: 0)).mapNotNull { array?.optJSONObject(it) }

    /** Defensive read: a missing body or fields give null (no warning), as an API without the endpoint (404) does. */
    fun parse(value: Any?): CrewCoverage? {
        val json = value as? JSONObject ?: return null
        if (!json.has("covered") || !json.has("hoursWithoutCrew")) return null
        val days = objects(json.optJSONArray("days"))
        val gaps = objects(json.optJSONArray("gaps")).mapNotNull { g ->
            val start = instant(g.optString("start")) ?: return@mapNotNull null
            val end = instant(g.optString("end")) ?: return@mapNotNull null
            CrewGap(start, end, g.optInt("hours"), g.optString("missing"))
        }.sortedBy { it.start }
        return CrewCoverage(json.optInt("hoursWithoutCrew"), json.optBoolean("covered"), days.size.takeIf { it > 0 } ?: DAYS, days.count { it.optInt("hoursWithoutCrew") > 0 }, gaps)
    }

    fun missingLabel(code: String) = when (code) {
        "paramedico" -> "falta paramédico"
        "motorista" -> "falta motorista"
        else -> "falta la tripulación"
    }

    /**
     * "Faltan turnos de ambulancia: 14 h sin tripulación completa en 2 de los próximos 7 días. Primer hueco: Mañana 22:00 a 06:00,
     * falta motorista." Null when every hour is covered.
     */
    fun warning(coverage: CrewCoverage?, now: Instant = Instant.now()): String? {
        val c = coverage ?: return null
        if (c.covered || c.hoursWithoutCrew <= 0) return null
        val span = if (c.daysWithGaps > 0) " en ${c.daysWithGaps} de los próximos ${c.days} días" else " en los próximos ${c.days} días"
        val first = c.gaps.firstOrNull()?.let { " Primer hueco: ${MyShifts.relative(it.start, now)} a ${clock.format(it.end)}, ${missingLabel(it.missing)}." }.orEmpty()
        return "Faltan turnos de ambulancia: ${c.hoursWithoutCrew} h sin tripulación completa$span.$first"
    }
}
