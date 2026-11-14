package sv.edu.catolica.climesa.domain

import java.net.URLEncoder

/**
 * Links that Supabase Auth puts in its emails. Without `redirect_to` Supabase falls back to its Site URL, so the
 * confirmation link opened a page that does not exist on the phone. Every link lands on a page of the web app.
 */
object AuthRedirects {
    const val CONFIRM_EMAIL_PATH = "/confirmar-correo"
    const val RESET_PASSWORD_PATH = "/restablecer"

    fun confirmEmail(webUrl: String) = webUrl.trim().trimEnd('/') + CONFIRM_EMAIL_PATH
    fun resetPassword(webUrl: String) = webUrl.trim().trimEnd('/') + RESET_PASSWORD_PATH

    /** Supabase Auth path with the `redirect_to` query parameter (the same one supabase-js sends for `emailRedirectTo`). */
    fun withRedirect(path: String, redirectTo: String): String {
        val separator = if ('?' in path) '&' else '?'
        return path + separator + "redirect_to=" + URLEncoder.encode(redirectTo, Charsets.UTF_8.name())
    }
}

/** Spanish message for each Supabase Auth `error_code`. Unknown codes get a generic message. */
object AuthErrors {
    const val EMAIL_NOT_CONFIRMED = "email_not_confirmed"
    const val UNCONFIRMED_MESSAGE = "Tu correo todavía no está confirmado. Abre el enlace que te enviamos (revisa también la carpeta de spam) o reenvía el correo."

    /** `error_code` of the response; older Auth servers only describe an unconfirmed email in the text. */
    fun code(errorCode: String?, detail: String?): String? = errorCode?.takeIf { it.isNotBlank() }
        ?: EMAIL_NOT_CONFIRMED.takeIf { detail.orEmpty().contains("not confirmed", ignoreCase = true) }

    fun message(code: String?): String = when (code) {
        "invalid_credentials" -> "Correo o contraseña incorrectos."
        EMAIL_NOT_CONFIRMED -> UNCONFIRMED_MESSAGE
        "user_already_exists", "email_exists" -> "Ya existe una cuenta con ese correo. Inicia sesión o recupera tu contraseña."
        "weak_password" -> "La contraseña es muy débil. Usa 8 caracteres, mayúscula, minúscula, número y símbolo."
        "email_address_invalid" -> "Ese correo no es válido. Revisa que esté bien escrito."
        "over_email_send_rate_limit" -> "Ya enviamos un correo hace poco. Espera un minuto antes de pedir otro."
        "over_request_rate_limit" -> "Demasiados intentos. Espera un momento y vuelve a intentar."
        "signup_disabled" -> "El registro de cuentas está desactivado por ahora."
        "user_banned" -> "Esta cuenta está suspendida. Comunícate con Recepción."
        else -> "No se pudo completar la autenticación. Revisa los datos o intenta más tarde."
    }
}

/** Wait between two confirmation emails. Supabase rejects a new email to the same address within 60 seconds. */
object ResendCooldown {
    const val SECONDS = 60L
    fun availableAt(sentAtMillis: Long) = sentAtMillis + SECONDS * 1000
    fun remainingSeconds(availableAtMillis: Long, nowMillis: Long): Long =
        if (availableAtMillis <= nowMillis) 0 else (availableAtMillis - nowMillis + 999) / 1000
}

/**
 * Message for an account whose roles do not open this app. The platforms come from `platforms` of `/auth/me`
 * (union of `acceso.rol.plataformas` of every role), so the message never repeats a hardcoded role table.
 */
object PlatformGate {
    private val names = linkedMapOf("web" to "la web", "android" to "la app de Android", "ios" to "la app de iPhone (iOS)")

    fun otherPlatforms(platforms: Collection<String>, current: String): List<String> {
        val own = platforms.map { it.lowercase() }.toSet()
        return names.keys.filter { it in own && it != current.lowercase() }
    }

    fun message(platforms: Collection<String>, current: String, webUrl: String): String {
        val others = otherPlatforms(platforms, current)
        if (others.isEmpty()) return "Tu cuenta todavía no tiene un rol habilitado en ninguna plataforma. Pide a Administración que revise tus roles."
        val described = others.map { if (it == "web") "la web (${webUrl.trim().trimEnd('/').removePrefix("https://").removePrefix("http://")})" else names.getValue(it) }
        val list = if (described.size == 1) described[0] else described.dropLast(1).joinToString(", ") + " o " + described.last()
        return "Tus roles no usan ${names.getValue(current.lowercase())}. Puedes ingresar desde $list."
    }
}
