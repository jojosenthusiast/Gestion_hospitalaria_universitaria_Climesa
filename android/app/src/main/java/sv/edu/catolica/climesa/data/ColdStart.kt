package sv.edu.catolica.climesa.data

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first

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
    /** After this long without an answer the screen explains that the server is waking up, if it seems asleep. */
    const val SLOW_HINT_MS = 5_000L
    /** Render sleeps the API after about 15 minutes idle: with no answer for this long it is assumed asleep again. */
    const val IDLE_UNTIL_COLD_MS = 14 * 60_000L

    /** Answers seen by this process; shared by [ApiClient] and [BackendAccessRepository]. */
    val warmth = ServerWarmth()

    /**
     * The server is plausibly asleep when nothing answered yet, nothing answered for [IDLE_UNTIL_COLD_MS], or a call
     * failed without an answer (network or 502-504) after the last answer. Same rule as iOS `ColdStartPolicy` and the web.
     */
    fun isLikelyCold(lastAnswerAt: Long?, failedSinceAnswer: Boolean, now: Long): Boolean =
        failedSinceAnswer || lastAnswerAt == null || now - lastAnswerAt > IDLE_UNTIL_COLD_MS

    /** A status outside 502-504 means the API itself answered, so it is awake. */
    fun isAnswer(status: Int): Boolean = status !in 502..504

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

/** Tracks whether the API answered recently, so "El servidor se está activando" shows only when it may be asleep. */
class ServerWarmth(private val clock: () -> Long = System::currentTimeMillis) {
    @Volatile private var lastAnswerAt: Long? = null
    private val failedSinceAnswer = MutableStateFlow(false)

    fun record(status: Int) { if (ColdStart.isAnswer(status)) answered() else failed() }
    fun answered() { lastAnswerAt = clock(); failedSinceAnswer.value = false }
    fun failed() { failedSinceAnswer.value = true }
    fun likelyCold(): Boolean = ColdStart.isLikelyCold(lastAnswerAt, failedSinceAnswer.value, clock())

    /** Returns once the server seems asleep: right away, or when a later attempt fails without an answer. */
    suspend fun awaitLikelyCold() {
        if (likelyCold()) return
        failedSinceAnswer.first { it }
    }
}
