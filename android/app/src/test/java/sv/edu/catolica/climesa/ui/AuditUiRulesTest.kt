package sv.edu.catolica.climesa.ui

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Flow audit 2026-11-20 (second Android pass): rules that live next to the screens. */
class AuditUiRulesTest {
    // D71: a critical result is released only after the explicit tick; a normal one needs no tick.
    @Test fun liberarCriticoPideConfirmacion() {
        val critical = LabReviewTarget("o1", "Yaneth", 2, listOf("Potasio 6.8"), critical = true, criticalLines = setOf("Potasio 6.8"))
        assertFalse(critical.canRelease(criticalAcknowledged = false))
        assertTrue(critical.canRelease(criticalAcknowledged = true))
        assertTrue(critical.copy(critical = false).canRelease(criticalAcknowledged = false))
    }

    // D126: the slot of the appointment being moved is recognised whatever the offset spelling.
    @Test fun franjaPropiaSeReconoce() {
        assertTrue(isSameSlot("2026-11-25T16:00:00Z", "2026-11-25T16:00:00.000Z"))
        assertFalse(isSameSlot("2026-11-25T16:20:00Z", "2026-11-25T16:00:00Z"))
        assertFalse(isSameSlot("2026-11-25T16:00:00Z", null))
    }
}
