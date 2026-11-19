package sv.edu.catolica.climesa.ui

import java.time.Instant
import java.time.LocalDate
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import sv.edu.catolica.climesa.domain.AgendaDay
import sv.edu.catolica.climesa.domain.CategoryRef
import sv.edu.catolica.climesa.domain.DoctorDaySections
import sv.edu.catolica.climesa.domain.MedicalAppointment
import sv.edu.catolica.climesa.domain.QueueConsultation
import sv.edu.catolica.climesa.domain.QueueContext

/** Lote 5 S11: "Mi día" by section (Ahora, Próximas, Atendidas) and the labelled entries for other days. */
class Lote5MedDayTest {
    private fun appt(id: String, start: String, end: String, consultation: String? = null, state: String? = null, appointmentState: String = "confirmada") =
        MedicalAppointment(id, "p-$id", "Paciente $id", start, end, appointmentState, null, consultation, state, null, null, null, 1)

    // 10:00 local (16:00 UTC) on 2026-11-18.
    private val now = Instant.parse("2026-11-18T16:00:00Z")

    @Test fun todaySplitsIntoNowUpcomingAndDone() {
        val rows = listOf(
            appt("later", "2026-11-18T20:00:00Z", "2026-11-18T20:20:00Z"),
            appt("running", "2026-11-18T15:50:00Z", "2026-11-18T16:10:00Z"),
            appt("open", "2026-11-18T14:00:00Z", "2026-11-18T14:20:00Z", consultation = "k1", state = "abierta"),
            appt("signed", "2026-11-18T15:00:00Z", "2026-11-18T15:20:00Z", consultation = "k2", state = "firmada"),
            appt("missed", "2026-11-18T13:00:00Z", "2026-11-18T13:20:00Z"),
            appt("next", "2026-11-18T17:00:00Z", "2026-11-18T17:20:00Z"),
        )
        val today = DoctorDaySections.split(rows, now)
        assertEquals(listOf("open", "running"), today.now.map { it.appointmentId })
        assertEquals(listOf("next", "later"), today.upcoming.map { it.appointmentId })
        assertEquals(listOf("missed", "signed"), today.done.map { it.appointmentId })
    }

    @Test fun planKeepsOtherDaysApartWithHistoryNewestFirst() {
        val plan = DoctorDaySections.plan(listOf(
            appt("t", "2026-11-18T20:00:00Z", "2026-11-18T20:20:00Z"),
            appt("p1", "2026-11-16T15:00:00Z", "2026-11-16T15:20:00Z"),
            appt("p2", "2026-11-17T15:00:00Z", "2026-11-17T15:20:00Z"),
            appt("l", "2026-11-20T15:00:00Z", "2026-11-20T15:20:00Z"),
        ), now)
        assertEquals(listOf("t"), plan.today.upcoming.map { it.appointmentId })
        assertEquals(listOf(LocalDate.of(2026, 11, 17), LocalDate.of(2026, 11, 16)), plan.past.map { it.date })
        assertEquals(listOf(LocalDate.of(2026, 11, 20)), plan.later.map { it.date })
    }

    @Test fun expanderSaysHowManyMoreOfToday() {
        assertNull(DoctorDaySections.moreTodayLabel(3, expanded = false))
        assertEquals("Mostrar 3 más de hoy", DoctorDaySections.moreTodayLabel(6, expanded = false))
        assertEquals("Mostrar menos", DoctorDaySections.moreTodayLabel(6, expanded = true))
    }

    @Test fun historyEntryNamesDaysCountAndDates() {
        val a = appt("a", "2026-11-16T15:00:00Z", "2026-11-16T15:20:00Z")
        val past = listOf(AgendaDay(LocalDate.of(2026, 11, 17), listOf(a, a)), AgendaDay(LocalDate.of(2026, 11, 16), listOf(a)))
        assertEquals("2 días · 3 citas · lun 16 nov a mar 17 nov", DoctorDaySections.historyDetail(past))
        assertEquals("1 día · 1 cita · lun 16 nov", DoctorDaySections.historyDetail(past.drop(1)))
        assertNull(DoctorDaySections.historyDetail(emptyList()))
        assertEquals("1 día · 2 citas · hasta mar 17 nov", DoctorDaySections.laterDetail(past.take(1)))
    }

    @Test fun queueContextSaysServiceAndOrigin() {
        val walkIn = QueueConsultation("t", 7, "Ana", "llamado", null, null, "consulta_general")
        assertEquals("Consulta general · Llegó sin cita", QueueContext.line(walkIn))
        val cited = walkIn.copy(service = "emergencia", appointmentAt = "2026-11-18T15:00:00Z", categories = listOf(CategoryRef("cabeza", "Cabeza", "cabeza")))
        assertEquals("Emergencia · Viene de su cita de las 09:00", QueueContext.line(cited))
    }
}
