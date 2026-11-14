package sv.edu.catolica.climesa.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AccountEmailTest {
    @Test fun redirectsLandOnWebPagesWithoutDoubleSlash() {
        assertEquals("https://sghu-web.onrender.com/confirmar-correo", AuthRedirects.confirmEmail("https://sghu-web.onrender.com/"))
        assertEquals("https://sghu-web.onrender.com/restablecer", AuthRedirects.resetPassword(" https://sghu-web.onrender.com "))
    }

    @Test fun redirectIsSentAsEncodedQueryParameter() {
        val url = AuthRedirects.confirmEmail("https://sghu-web.onrender.com")
        assertEquals("/auth/v1/signup?redirect_to=https%3A%2F%2Fsghu-web.onrender.com%2Fconfirmar-correo", AuthRedirects.withRedirect("/auth/v1/signup", url))
        assertEquals("/auth/v1/verify?type=signup&redirect_to=https%3A%2F%2Fa.b%2Fr", AuthRedirects.withRedirect("/auth/v1/verify?type=signup", "https://a.b/r"))
    }

    @Test fun unconfirmedEmailHasItsOwnSpanishMessage() {
        assertEquals(AuthErrors.EMAIL_NOT_CONFIRMED, AuthErrors.code("email_not_confirmed", null))
        assertEquals(AuthErrors.EMAIL_NOT_CONFIRMED, AuthErrors.code("", "Email not confirmed"))
        assertNull(AuthErrors.code(null, "Invalid login credentials"))
        assertEquals(AuthErrors.UNCONFIRMED_MESSAGE, AuthErrors.message("email_not_confirmed"))
        assertTrue(AuthErrors.message("invalid_credentials").startsWith("Correo o contraseña incorrectos"))
        assertTrue(AuthErrors.message("over_email_send_rate_limit").contains("minuto"))
        assertTrue(AuthErrors.message("algo_nuevo").startsWith("No se pudo completar"))
    }

    @Test fun cooldownRoundsUpAndEndsAtZero() {
        val at = ResendCooldown.availableAt(1_000)
        assertEquals(61_000, at)
        assertEquals(60, ResendCooldown.remainingSeconds(at, 1_000))
        assertEquals(1, ResendCooldown.remainingSeconds(at, 60_500))
        assertEquals(0, ResendCooldown.remainingSeconds(at, 61_000))
        assertEquals(0, ResendCooldown.remainingSeconds(0, 5_000))
    }

    @Test fun platformGateNamesWhereTheAccountCanSignIn() {
        assertEquals(
            "Tus roles no usan la app de Android. Puedes ingresar desde la web (sghu-web.onrender.com).",
            PlatformGate.message(listOf("web"), "android", "https://sghu-web.onrender.com/"),
        )
        assertEquals(
            "Tus roles no usan la app de iPhone (iOS). Puedes ingresar desde la web (w.test) o la app de Android.",
            PlatformGate.message(listOf("android", "web"), "ios", "https://w.test"),
        )
        assertEquals(listOf("web", "ios"), PlatformGate.otherPlatforms(listOf("iOS", "Android", "Web"), "android"))
        assertTrue(PlatformGate.message(emptyList(), "android", "https://w.test").contains("Administración"))
    }

    @Test fun multiRoleAccountEntersWhenAnyRoleAllowsAndroidAndOnlyAllowedRolesShow() {
        val profile = AccessProfile(
            roles = listOf("LAB", "MED"), verifiedByBackend = true, platforms = listOf("web", "android"),
            permissions = listOf("sesion.perfil", "consulta.iniciar", "laboratorio.revisar"),
        )
        assertEquals(listOf("MED"), RoleAccess.allowed(profile, "android"))
        val webOnly = profile.copy(roles = listOf("LAB", "JOP"), platforms = listOf("web"))
        assertTrue(RoleAccess.allowed(webOnly, "android").isEmpty())
        assertEquals(listOf("web"), PlatformGate.otherPlatforms(webOnly.platforms, "android"))
    }
}
