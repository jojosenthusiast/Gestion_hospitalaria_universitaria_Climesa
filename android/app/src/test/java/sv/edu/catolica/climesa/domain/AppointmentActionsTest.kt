package sv.edu.catolica.climesa.domain

import java.time.Instant
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AppointmentActionsTest {
    private val now = Instant.parse("2026-11-14T18:00:00Z")
    private val reception = listOf("citas.ver", "citas.agendar", "citas.cancelar")
    private fun row(state: String, start: String = "2026-11-14T20:00:00Z") = ReceptionAppointment("a1", "Ana", "Dr. Prueba", start, "2026-11-14T20:20:00Z", state, 2)

    @Test fun aFutureRequestCanBeConfirmedOrRejectedButNotCancelled() {
        assertEquals(listOf(AppointmentAction.CONFIRM, AppointmentAction.REJECT), AppointmentActions.available(row("solicitada"), reception, now))
    }

    @Test fun aPastRequestIsExpiredAndReadOnly() {
        val past = row("solicitada", start = "2026-11-14T13:00:00Z")
        assertTrue(AppointmentActions.available(past, reception, now).isEmpty())
        assertEquals("vencida", AppointmentActions.displayState(past, now))
        assertEquals("solicitada", AppointmentActions.displayState(row("solicitada"), now))
    }

    @Test fun onlyAFutureConfirmedAppointmentCanBeCancelled() {
        assertEquals(listOf(AppointmentAction.CANCEL), AppointmentActions.available(row("confirmada"), reception, now))
        assertTrue(AppointmentActions.available(row("confirmada", start = "2026-11-14T18:00:00Z"), reception, now).isEmpty())
        listOf("cancelada", "rechazada", "atendida", "no_asistio").forEach { assertTrue(AppointmentActions.available(row(it), reception, now).isEmpty()) }
    }

    @Test fun actionsFollowThePermissions() {
        assertTrue(AppointmentActions.available(row("solicitada"), listOf("citas.ver"), now).isEmpty())
        assertTrue(AppointmentActions.available(row("confirmada"), listOf("citas.ver", "citas.agendar"), now).isEmpty())
    }

    @Test fun rejectAndCancelNeedAMotiveOfTenCharacters() {
        assertNotNull(AppointmentActions.reasonError(AppointmentAction.REJECT, "corto"))
        assertNull(AppointmentActions.reasonError(AppointmentAction.REJECT, "Sin turno ese día"))
        assertNotNull(AppointmentActions.reasonError(AppointmentAction.CANCEL, "   "))
        assertNull(AppointmentActions.reasonError(AppointmentAction.CONFIRM, ""))
        assertEquals("reason", AppointmentActions.reasonField(AppointmentAction.CANCEL))
        assertEquals("rejectionReason", AppointmentActions.reasonField(AppointmentAction.REJECT))
    }
}
