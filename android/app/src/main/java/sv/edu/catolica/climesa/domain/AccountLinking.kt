package sv.edu.catolica.climesa.domain

import org.json.JSONObject

/**
 * A03 states (U12, link by verified email). [LOADING] is the first read of `GET /me/vinculacion`; [UNAVAILABLE] means
 * that read failed, so nothing is known. [EMAIL_NOT_VERIFIED]: Supabase Auth has not confirmed the account's email yet, so
 * it cannot join a record. [NOT_LINKED]: the email is confirmed and Recepción must write it on the record. [LINKED]: the
 * account already joined its record.
 */
enum class LinkStatus { LOADING, UNAVAILABLE, EMAIL_NOT_VERIFIED, NOT_LINKED, LINKED }

/** `GET /me/vinculacion` (U12): whether the account joined its record, its email and whether that email is confirmed. */
data class MyLink(val linked: Boolean, val email: String?, val emailVerified: Boolean)

/**
 * The account joins the one active record whose email matches the email Supabase Auth confirmed, on its next session or
 * when Recepción saves that email on the record. There is no request to send (`POST /cuentas/vinculacion` answers 410).
 */
object LinkStatusRules {
    fun parse(json: JSONObject): MyLink = MyLink(
        linked = json.optBoolean("linked", false),
        email = if (!json.has("email") || json.isNull("email")) null else json.optString("email").trim().takeIf { it.isNotBlank() },
        emailVerified = json.optBoolean("emailVerified", false),
    )

    /** The profile of `/auth/me` already says whether the account is linked (`patientId`); otherwise the API says it. */
    fun status(link: MyLink, profileLinked: Boolean): LinkStatus = when {
        profileLinked || link.linked -> LinkStatus.LINKED
        !link.emailVerified -> LinkStatus.EMAIL_NOT_VERIFIED
        else -> LinkStatus.NOT_LINKED
    }
}

/** `vinculacion.resuelta` (tiempo-real.md): the account joined its record; the patient receives it on `usuario:<id>`. */
object LinkEvents {
    fun matches(event: EventoDominio) = event.type == "vinculacion.resuelta" || LiveEntities.matches(event, "vinculacion_paciente", "vinculacion")
    fun resolved(event: EventoDominio) = event.type == "vinculacion.resuelta"
}
