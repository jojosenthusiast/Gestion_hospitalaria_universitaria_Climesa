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

/** Why the app closes a session by itself; [message] is what the login screen shows afterwards. */
enum class SessionEnd(val message: String, val code: String) {
    /** The refresh token is gone or Auth rejects it: the person signs in again. */
    EXPIRED("Tu sesión expiró. Ingresa nuevamente para continuar.", "sesion_expirada"),

    /** The API rejects an account whose token is valid: deactivated by administration, or its roles or app access withdrawn. */
    REVOKED("Tu acceso fue retirado. Si crees que es un error, contacta a administración.", "acceso_retirado"),
}

/**
 * Which responses end the session. Only account-level signals do: an ordinary 403 to one action is a refusal of that
 * action (shown as an info state, S8) and the person keeps working.
 */
object SessionEndRules {
    /** Renewing the session failed: Auth answered 400/401 for the refresh token. Network errors return null. */
    fun afterRefreshFailure(status: Int?): SessionEnd? = if (status == 400 || status == 401) SessionEnd.EXPIRED else null

    /**
     * An API call failed with a token that was just renewed (or another call had just renewed it). The API answers 401
     * only when it no longer accepts the account (`acceso.usuario.estado` not `activo`, or no role left); 403 is per action.
     */
    fun afterRenewedCall(status: Int?): SessionEnd? = if (status == 401) SessionEnd.REVOKED else null

    /**
     * `/auth/me` with a restored session failed. It is the account's own profile, so a 401 (account not active, no role)
     * or a 403 (no `sesion.perfil`, no role) means the account lost access to the app.
     */
    fun afterProfile(status: Int?): SessionEnd? = if (status == 401 || status == 403) SessionEnd.REVOKED else null
}

/** Global "session ended" signal: the app clears the session and goes back to the login screen with the [SessionEnd] message. */
class SessionExpiry {
    private val events = MutableSharedFlow<String>(extraBufferCapacity = 1, onBufferOverflow = BufferOverflow.DROP_OLDEST)
    val expired: SharedFlow<String> = events.asSharedFlow()

    fun expire(reason: SessionEnd = SessionEnd.EXPIRED) { events.tryEmit(reason.message) }

    companion object {
        val MESSAGE = SessionEnd.EXPIRED.message
        val CODE = SessionEnd.EXPIRED.code
    }
}

/**
 * Runs an authenticated API call. On a 401 it renews the session once and repeats the call with the new token
 * (same idempotency key, because the intent is the same). If there is no session or the refresh token is rejected, the
 * session expired ([SessionEnd.EXPIRED]); if the repeated call gets 401 again with the fresh token, the API no longer accepts
 * the account ([SessionEnd.REVOKED]). Either way it signals [SessionExpiry] and throws a 401 with the [SessionEnd.code].
 * Network errors and 403 never close the session.
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
        SessionEndRules.afterRenewedCall(error.statusCode)?.let { throw ended(expiry, it) }
        throw error
    }
}

private suspend fun obtainSession(expiry: SessionExpiry, load: suspend () -> AuthSession?): AuthSession {
    val session = try {
        load()
    } catch (error: AuthRequestException) {
        SessionEndRules.afterRefreshFailure(error.statusCode)?.let { throw ended(expiry, it) }
        throw error
    }
    return session ?: throw ended(expiry, SessionEnd.EXPIRED)
}

private fun ended(expiry: SessionExpiry, reason: SessionEnd): AuthRequestException {
    expiry.expire(reason)
    return AuthRequestException(reason.message, 401, reason.code)
}
