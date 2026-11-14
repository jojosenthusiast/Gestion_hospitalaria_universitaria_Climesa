package sv.edu.catolica.climesa.data

import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import sv.edu.catolica.climesa.domain.AuthSession

/** Source of the access token for API calls; [SupabaseAuthRepository] is the real one. */
interface SessionTokens {
    /** Current session, renewed by clock when it is about to expire; null when there is no session. */
    suspend fun current(): AuthSession?

    /**
     * Renews the session after the API rejected [rejectedAccessToken] with 401. If another call already renewed it,
     * returns that newer session. Returns null when there is no session; throws with status 400/401 when the
     * refresh token is no longer valid.
     */
    suspend fun renewAfterRejection(rejectedAccessToken: String): AuthSession?
}

/** Global "session expired" signal: the app clears the session and goes back to the login screen with [MESSAGE]. */
class SessionExpiry {
    private val events = MutableSharedFlow<String>(extraBufferCapacity = 1, onBufferOverflow = BufferOverflow.DROP_OLDEST)
    val expired: SharedFlow<String> = events.asSharedFlow()

    fun expire() { events.tryEmit(MESSAGE) }

    companion object {
        const val MESSAGE = "Tu sesión expiró. Ingresa nuevamente para continuar."
        const val CODE = "sesion_expirada"
    }
}

/**
 * Runs an authenticated API call. On a 401 it renews the session once and repeats the call with the new token
 * (same idempotency key, because the intent is the same). If there is no session, the refresh token is rejected, or
 * the repeated call gets 401 again, it signals [SessionExpiry] and throws a 401 with code [SessionExpiry.CODE].
 * Network errors never close the session.
 */
suspend fun <T> authorizedCall(tokens: SessionTokens, expiry: SessionExpiry, call: suspend (accessToken: String) -> T): T {
    val first = obtainSession(expiry) { tokens.current() }
    try {
        return call(first.accessToken)
    } catch (error: AuthRequestException) {
        if (error.statusCode != 401) throw error
    }
    val renewed = obtainSession(expiry) { tokens.renewAfterRejection(first.accessToken) }
    try {
        return call(renewed.accessToken)
    } catch (error: AuthRequestException) {
        if (error.statusCode == 401) throw expired(expiry)
        throw error
    }
}

private suspend fun obtainSession(expiry: SessionExpiry, load: suspend () -> AuthSession?): AuthSession {
    val session = try {
        load()
    } catch (error: AuthRequestException) {
        if (error.statusCode == 400 || error.statusCode == 401) throw expired(expiry)
        throw error
    }
    return session ?: throw expired(expiry)
}

private fun expired(expiry: SessionExpiry): AuthRequestException {
    expiry.expire()
    return AuthRequestException(SessionExpiry.MESSAGE, 401, SessionExpiry.CODE)
}
