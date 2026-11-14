package sv.edu.catolica.climesa.data

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay

/**
 * MA-OPS-01 / E-01: the free Render plan sleeps the API and the first request after a while takes up to a minute. Reads wait
 * long enough for it to wake up, and a read or the login that fails without an answer (or with a gateway 502-504) is retried
 * with a growing wait. Writes are not retried here: their Idempotency-Key already makes the person's own retry safe.
 */
object ColdStart {
    const val CONNECT_TIMEOUT_MS = 15_000
    const val READ_TIMEOUT_MS = 75_000
    /** `/auth/me` is usually the first call that wakes the server. */
    const val PROFILE_READ_TIMEOUT_MS = 90_000
    /** Waits between attempts: three attempts in total. */
    val BACKOFF_MS = listOf(2_000L, 5_000L)
    /** After this long without an answer the screen explains that the server is waking up. */
    const val SLOW_HINT_MS = 5_000L

    fun retryable(error: Throwable): Boolean =
        error is AuthRequestException && (error.statusCode == null || error.statusCode in 502..504)

    suspend fun <T> retrying(backoff: List<Long> = BACKOFF_MS, block: suspend () -> T): T {
        for (wait in backoff) {
            try { return block() } catch (e: CancellationException) { throw e } catch (e: Exception) { if (!retryable(e)) throw e }
            delay(wait)
        }
        return block()
    }
}
