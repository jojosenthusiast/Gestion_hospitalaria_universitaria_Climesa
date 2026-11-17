package sv.edu.catolica.climesa.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class RoleNoticesTest {
    // D1: notices have one scale, `nivel`; an unknown level reads as informative.
    @Test fun unknownLevelFallsBackToInformative() {
        assertEquals(NoticeLevel.INFORMATIVE, NoticeLevel.of(null))
        assertEquals(NoticeLevel.CRITICAL, NoticeLevel.of("critico"))
    }

    @Test fun noticeEventsMatchTheAvisoEntity() {
        assertTrue(NoticeEvents.matches(EventoDominio(type = "aviso.publicado", entity = "aviso", id = "x", version = 1)))
        assertFalse(NoticeEvents.matches(EventoDominio(type = "cama.estado_cambiado", entity = "cama", id = "x", version = 1)))
    }

    /** MA-AVI-02: editar o retirar un aviso llega como `aviso.actualizado`; Información del hospital también se actualiza. */
    @Test fun editedOrWithdrawnNoticesRefreshTheHospitalInfo() {
        val edited = EventoDominio(type = "aviso.actualizado", entity = "aviso", id = "x", version = 2)
        assertTrue(NoticeEvents.matches(edited))
        assertTrue(HospitalInfoEvents.matches(edited))
    }

    @Test fun theRefreshIsScheduledOnceAtTheNextChange() {
        val now = java.time.Instant.parse("2026-11-20T11:00:00.000Z").toEpochMilli()
        assertEquals(3_600_000L + NoticeRefresh.SLACK_MS, NoticeRefresh.delayMs("2026-11-20T12:00:00.000Z", now))
        assertEquals(NoticeRefresh.SLACK_MS, NoticeRefresh.delayMs("2026-11-20T10:00:00.000Z", now))
        assertEquals(null, NoticeRefresh.delayMs(null, now))
        assertEquals(null, NoticeRefresh.delayMs("no es fecha", now))
    }
}
