package sv.edu.catolica.climesa.data

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.currentTime
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ColdStartTest {
    @Test fun theWakingHintNeedsAServerThatSeemsAsleep() {
        var now = 1_000_000L
        val warmth = ServerWarmth { now }
        // No answer yet in this process: the server may be asleep.
        assertTrue(warmth.likelyCold())
        warmth.record(200)
        assertFalse(warmth.likelyCold())
        // A 404 is still an answer from the API.
        now += 60_000; warmth.record(404)
        assertFalse(warmth.likelyCold())
        // No answer for more than 14 minutes.
        now += ColdStart.IDLE_UNTIL_COLD_MS + 1
        assertTrue(warmth.likelyCold())
        warmth.answered()
        // A gateway 503 or a network failure after the last answer.
        warmth.record(503)
        assertTrue(warmth.likelyCold())
        warmth.answered(); warmth.failed()
        assertTrue(warmth.likelyCold())
        assertTrue(ColdStart.isLikelyCold(null, false, now))
        assertFalse(ColdStart.isLikelyCold(now - ColdStart.IDLE_UNTIL_COLD_MS, false, now))
    }

    @Test fun aSlowCallOnAWarmServerWaitsUntilAnAttemptFails() = runTest {
        val warmth = ServerWarmth { 0L }
        warmth.answered()
        var cold = false
        val waiter = launch { warmth.awaitLikelyCold(); cold = true }
        advanceUntilIdle()
        assertFalse(cold)
        warmth.failed()
        advanceUntilIdle()
        assertTrue(cold)
        waiter.join()
    }

    @Test fun aReadWithoutAnswerIsRetriedWithAGrowingWait() = runTest {
        var attempts = 0
        val result = ColdStart.retrying {
            attempts++
            if (attempts < 3) throw AuthRequestException("Sin conexión.") else "ok"
        }
        assertEquals("ok", result)
        assertEquals(3, attempts)
        assertEquals(ColdStart.BACKOFF_MS.sum(), currentTime)
    }

    @Test fun aDefinitiveAnswerIsNotRetried() = runTest {
        var attempts = 0
        val error = runCatching { ColdStart.retrying { attempts++; throw AuthRequestException("Correo o contraseña incorrectos.", 400) } }.exceptionOrNull()
        assertEquals(1, attempts)
        assertEquals("Correo o contraseña incorrectos.", error?.message)
    }

    @Test fun itGivesUpAfterThreeAttempts() = runTest {
        var attempts = 0
        val error = runCatching { ColdStart.retrying { attempts++; throw AuthRequestException("Puerta de enlace", 503) } }.exceptionOrNull()
        assertEquals(3, attempts)
        assertTrue(error is AuthRequestException)
    }

    @Test fun gatewayErrorsAndMissingAnswersAreRetryable() {
        assertTrue(ColdStart.retryable(AuthRequestException("x", 502)))
        assertTrue(ColdStart.retryable(AuthRequestException("x")))
        assertFalse(ColdStart.retryable(AuthRequestException("x", 409)))
        assertFalse(ColdStart.retryable(IllegalStateException()))
    }

    @Test fun timeoutsWaitForTheServerToWakeUp() {
        assertEquals(15_000, ColdStart.CONNECT_TIMEOUT_MS)
        assertTrue(ColdStart.READ_TIMEOUT_MS in 75_000..90_000)
        assertTrue(ColdStart.PROFILE_READ_TIMEOUT_MS in 75_000..90_000)
    }
}
