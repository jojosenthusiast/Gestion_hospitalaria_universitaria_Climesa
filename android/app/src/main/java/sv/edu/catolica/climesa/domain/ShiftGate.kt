package sv.edu.catolica.climesa.domain

import org.json.JSONObject
import java.time.Instant
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/** A shift window of `GET /me/turno-activo` (`shift` or `next`). */
data class ShiftWindow(val id: String, val start: Instant, val end: Instant, val area: String?, val state: String)

/**
 * Lote 5 S9, `GET /me/turno-activo`: whether the account works by shifts ([required]) and may run operational commands now
 * ([active]). The API is the guarantee (403 `sin_turno_activo`); this only tells the person before they try.
 */
data class ActiveShiftStatus(
    val required: Boolean,
    val active: Boolean,
    val graceMinutes: Int = 0,
    val shift: ShiftWindow? = null,
    val next: ShiftWindow? = null,
    val message: String? = null,
)

/** What the compact banner under the top bar says. [next] is null when no shift is published. */
data class ShiftBannerText(val title: String, val next: String?)

object ShiftGate {
    const val PATH = "/me/turno-activo"
    /** Code of the 403 the API answers to an operational command without an active shift. */
    const val NO_ACTIVE_SHIFT = "sin_turno_activo"
    const val NO_ACTIVE_SHIFT_TEXT = "No tienes un turno activo. Pide a Jefatura que publique tu turno."
    const val BANNER_TITLE = "Sin turno activo: puedes consultar pero no registrar."

    private val zone: ZoneId = ZoneId.of("America/El_Salvador")
    private val clock = DateTimeFormatter.ofPattern("HH:mm").withZone(zone)

    private fun JSONObject.text(key: String) = if (!has(key) || isNull(key)) null else optString(key).takeIf { it.isNotBlank() }
    private fun instant(value: String?): Instant? = value?.let { runCatching { Instant.parse(it) }.getOrNull() ?: runCatching { OffsetDateTime.parse(it).toInstant() }.getOrNull() }

    private fun window(json: JSONObject?): ShiftWindow? {
        val row = json ?: return null
        val start = instant(row.text("start")) ?: return null
        val end = instant(row.text("end")) ?: return null
        return ShiftWindow(row.optString("id"), start, end, row.text("area"), row.optString("state"))
    }

    /**
     * Reads the answer defensively: anything that is not an object, or lacks `required`/`active`, gives null (no banner).
     * An older API without the endpoint answers 404, which the caller also turns into null.
     */
    fun parse(value: Any?): ActiveShiftStatus? {
        val json = value as? JSONObject ?: return null
        if (!json.has("required") || !json.has("active")) return null
        return ActiveShiftStatus(
            required = json.optBoolean("required"),
            active = json.optBoolean("active"),
            graceMinutes = json.optInt("graceMinutes"),
            shift = window(json.optJSONObject("shift")),
            next = window(json.optJSONObject("next")),
            message = json.text("message"),
        )
    }

    /** The banner shows only when the account works by shifts and has none now. */
    fun showsBanner(status: ActiveShiftStatus?) = status != null && status.required && !status.active

    /** "Próximo turno: Mañana 07:00 a 15:00 · Consulta externa"; null without a published next shift. */
    fun nextText(next: ShiftWindow?, now: Instant): String? {
        val shift = next ?: return null
        val hours = "${MyShifts.relative(shift.start, now)} a ${clock.format(shift.end)}"
        return "Próximo turno: " + listOfNotNull(hours, shift.area).joinToString(" · ")
    }

    fun banner(status: ActiveShiftStatus?, now: Instant = Instant.now()): ShiftBannerText? =
        if (!showsBanner(status)) null else ShiftBannerText(BANNER_TITLE, nextText(status!!.next, now))
}
