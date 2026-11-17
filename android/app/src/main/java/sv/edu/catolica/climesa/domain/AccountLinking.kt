package sv.edu.catolica.climesa.domain

import org.json.JSONObject
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeParseException

/**
 * A03 states (pantallas.csv): form, in verification, approved, rejected. [LOADING] is the first read of
 * `GET /me/vinculacion`; [UNAVAILABLE] means that read failed, so nothing is known (never shown as the form).
 */
enum class LinkStatus { LOADING, UNAVAILABLE, FORM, PENDING, APPROVED, REJECTED }

/** `declared` of `GET /me/vinculacion`: what the account declared, to ask again with the form prefilled. */
data class LinkDeclared(val dui: String, val birth: String?)

/** `LinkRequestResponse`: the account's last link request. */
data class LinkRequest(val id: String, val state: String, val createdAt: String, val rejectionReason: String?)

/** `GET /me/vinculacion`: whether the account is linked, its last request (null if it never asked) and what it declared. */
data class MyLink(val linked: Boolean, val request: LinkRequest?, val declared: LinkDeclared?)

/** What the A03 screen shows: the status, the day a pending request was sent, the rejection reason and the prefill. */
data class LinkScreen(val status: LinkStatus, val since: LocalDate? = null, val rejectionReason: String? = null, val prefill: LinkDeclared? = null)

/** G2: the A03 screen opens on the real state of the request (`GET /me/vinculacion`), the same rules as iOS `LinkStatusRules`. */
object LinkStatusRules {
    private val zone: ZoneId = ZoneId.of("America/El_Salvador")

    private fun JSONObject.text(key: String) = if (!has(key) || isNull(key)) null else optString(key).takeIf { it.isNotBlank() }

    fun request(json: JSONObject?): LinkRequest? = json?.let { r ->
        val id = r.text("id") ?: return null
        LinkRequest(id, r.optString("state"), r.optString("createdAt"), r.text("rejectionReason"))
    }

    fun parse(json: JSONObject): MyLink = MyLink(
        linked = json.optBoolean("linked", false),
        request = request(json.optJSONObject("request")),
        declared = json.optJSONObject("declared")?.let { d -> d.text("dui")?.let { LinkDeclared(it, d.text("birth")) } },
    )

    /** The day (El Salvador) of an ISO instant, for "En revisión desde 16/11"; null when it cannot be read. */
    fun day(createdAt: String): LocalDate? = runCatching { Instant.parse(createdAt).atZone(zone).toLocalDate() }.getOrNull()

    /**
     * [sent] is the request this screen just created: until a read returns it, the screen stays pending instead of
     * showing the older state (never the form, so it is not sent twice).
     */
    fun screen(link: MyLink, profileLinked: Boolean, sent: LinkRequest? = null): LinkScreen {
        if (profileLinked || link.linked) return LinkScreen(LinkStatus.APPROVED)
        if (sent != null && link.request?.id != sent.id) return LinkScreen(LinkStatus.PENDING, since = day(sent.createdAt))
        val request = link.request ?: return LinkScreen(LinkStatus.FORM)
        return when (request.state) {
            "aprobada" -> LinkScreen(LinkStatus.APPROVED)
            "rechazada" -> LinkScreen(LinkStatus.REJECTED, rejectionReason = request.rejectionReason, prefill = link.declared)
            // An unknown state is still a request: never the form, so it is not asked twice.
            else -> LinkScreen(LinkStatus.PENDING, since = day(request.createdAt))
        }
    }
}

/**
 * Account-to-record linking (spec 101, FR-101-08 to FR-101-10, RN-39). The client only checks the format for comfort;
 * the API validates the DUI check digit and compares DUI and date of birth with the record.
 */
object LinkRules {
    /** Field errors for the A03 form; empty when it can be sent. */
    fun errors(dui: String, birth: String, today: LocalDate): Map<String, String> = buildMap {
        if (!dui.trim().matches(Regex("[0-9]{8}-?[0-9]")) || !PatientRules.validDui(dui)) put("dui", "Usa 9 dígitos con un verificador válido.")
        val date = parseDate(birth)
        if (date == null) put("birth", "Escribe la fecha como aaaa-mm-dd.")
        else if (date.isAfter(today)) put("birth", "La fecha de nacimiento no puede ser futura.")
    }

    fun body(dui: String, birth: String): JSONObject = JSONObject().put("dui", PatientRules.formatDui(dui.trim())).put("birth", birth.trim())

    /** Status returned by `POST /cuentas/vinculacion` (`state`: pendiente, aprobada, rechazada). */
    fun statusOf(state: String): LinkStatus = when (state) {
        "pendiente" -> LinkStatus.PENDING
        "aprobada" -> LinkStatus.APPROVED
        "rechazada" -> LinkStatus.REJECTED
        else -> LinkStatus.FORM
    }

    private fun parseDate(value: String): LocalDate? =
        if (!value.trim().matches(Regex("\\d{4}-\\d{2}-\\d{2}"))) null else try { LocalDate.parse(value.trim()) } catch (_: DateTimeParseException) { null }
}

/** `vinculacion.solicitada` / `vinculacion.resuelta` (tiempo-real.md); the patient receives them on `usuario:<id>`. */
object LinkEvents {
    fun matches(event: EventoDominio) = LiveEntities.matches(event, "vinculacion_paciente", "vinculacion")
    fun resolved(event: EventoDominio) = event.type == "vinculacion.resuelta"
}
