package sv.edu.catolica.climesa.domain

import java.time.Instant
import org.junit.Assert.assertEquals
import org.junit.Test

/** "Mi próximo turno" reads like people say it, without the year (El Salvador is UTC-6). */
class MyShiftsRelativeTest {
    private val now = Instant.parse("2026-11-17T18:00:00Z") // Tuesday 17 Nov, 12:00 local

    @Test fun todayTomorrowWeekdayAndLater() {
        assertEquals("Hoy 14:00", MyShifts.relative(Instant.parse("2026-11-17T20:00:00Z"), now))
        assertEquals("Mañana 07:00", MyShifts.relative(Instant.parse("2026-11-18T13:00:00Z"), now))
        assertEquals("Viernes 07:00", MyShifts.relative(Instant.parse("2026-11-20T13:00:00Z"), now))
        assertEquals("Jue 26 nov, 07:00", MyShifts.relative(Instant.parse("2026-11-26T13:00:00Z"), now))
    }

    @Test fun lateNightLocalIsStillTodayEvenWhenUtcIsTomorrow() {
        // 23:30 local on the 17th is already the 18th in UTC.
        assertEquals("Hoy 23:30", MyShifts.relative(Instant.parse("2026-11-18T05:30:00Z"), now))
    }
}
