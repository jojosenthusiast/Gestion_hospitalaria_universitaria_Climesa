package sv.edu.catolica.climesa.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class InactivityTimeoutTest {
    private var clock = 1_000L
    private val timeout = InactivityTimeout({ clock })

    @Test fun theSessionStaysOpenJustBeforeFiveMinutesWithoutInteraction() {
        clock += 5 * 60_000L - 1
        assertFalse(timeout.expired())
        assertEquals(1L, timeout.remainingMs())
    }

    @Test fun fiveMinutesWithoutInteractionExpireTheSession() {
        clock += 5 * 60_000L
        assertTrue(timeout.expired())
        assertEquals(0L, timeout.remainingMs())
    }

    @Test fun anInteractionRestartsTheFiveMinutes() {
        clock += 4 * 60_000L
        timeout.touch()
        clock += 4 * 60_000L
        assertFalse(timeout.expired())
        assertEquals(60_000L, timeout.remainingMs())
        clock += 60_000L
        assertTrue(timeout.expired())
    }

    @Test fun theLimitIsFiveMinutes() {
        assertEquals(300_000L, InactivityTimeout.LIMIT_MS)
        assertEquals(300_000L, timeout.remainingMs())
    }
}