package sv.edu.catolica.climesa.data

import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test
import sv.edu.catolica.climesa.domain.AuthSession

private class FakeTokens(var session: AuthSession?, var renewed: AuthSession? = null, var renewError: AuthRequestException? = null) : SessionTokens {
    var renewals = 0
    override suspend fun current() = session
    override suspend fun renewAfterRejection(rejectedAccessToken: String): AuthSession? {
        renewals++
        renewError?.let { throw it }
        return renewed
    }
}

class SessionGuardTest {
    private fun session(token: String) = AuthSession(token, "refresh", 0, "u1", "u1@climesa")
    private val unauthorized = AuthRequestException("No autorizado.", 401)

    @Test fun a401RenewsOnceAndRepeatsWithTheNewToken() = runTest {
        val tokens = FakeTokens(session("viejo"), renewed = session("nuevo"))
        val used = mutableListOf<String>()
        val result = authorizedCall(tokens, SessionExpiry()) { token -> used += token; if (token == "viejo") throw unauthorized; "ok" }
        assertEquals("ok", result)
        assertEquals(listOf("viejo", "nuevo"), used)
        assertEquals(1, tokens.renewals)
    }

    @Test fun aSecond401ClosesTheSessionWithASpanishMessage() = runTest(UnconfinedTestDispatcher()) {
        val expiry = SessionExpiry()
        val message = mutableListOf<String>()
        val watcher = launch { message += expiry.expired.first() }
        val tokens = FakeTokens(session("viejo"), renewed = session("nuevo"))
        try { authorizedCall(tokens, expiry) { throw unauthorized }; fail() }
        catch (e: AuthRequestException) {
            assertEquals(401, e.statusCode)
            assertEquals(SessionExpiry.CODE, e.code)
            assertEquals("Tu sesión expiró. Ingresa nuevamente para continuar.", e.message)
        }
        watcher.join()
        assertEquals(listOf(SessionExpiry.MESSAGE), message)
    }

    @Test fun aRejectedRefreshTokenClosesTheSession() = runTest(UnconfinedTestDispatcher()) {
        val expiry = SessionExpiry()
        var expired = false
        val watcher = launch { expiry.expired.first(); expired = true }
        val tokens = FakeTokens(session("viejo"), renewError = AuthRequestException("Refresco inválido.", 400))
        try { authorizedCall(tokens, expiry) { throw unauthorized }; fail() } catch (e: AuthRequestException) { assertEquals(SessionExpiry.CODE, e.code) }
        watcher.join()
        assertTrue(expired)
    }

    @Test fun withoutSessionTheCallIsNotSentAndTheSessionExpires() = runTest {
        var sent = false
        try { authorizedCall(FakeTokens(null), SessionExpiry()) { sent = true }; fail() } catch (e: AuthRequestException) { assertEquals(SessionExpiry.CODE, e.code) }
        assertTrue(!sent)
    }

    @Test fun networkErrorsAndOtherStatusesNeverCloseTheSession() = runTest {
        val tokens = FakeTokens(session("t"), renewError = AuthRequestException("Sin conexión."))
        try { authorizedCall(tokens, SessionExpiry()) { throw AuthRequestException("Prohibido.", 403) }; fail() } catch (e: AuthRequestException) { assertEquals(403, e.statusCode) }
        assertEquals(0, tokens.renewals)
        try { authorizedCall(tokens, SessionExpiry()) { throw unauthorized }; fail() } catch (e: AuthRequestException) { assertEquals(null, e.statusCode) }
        assertEquals(1, tokens.renewals)
    }
}
