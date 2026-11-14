package sv.edu.catolica.climesa.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ClinicalListsTest {
    private val now = 1_800_000_000_000L
    private fun minutes(n: Long) = now - n * 60_000
    private fun order(id: String, priority: String = "rutina", state: String = "pendiente", ageMin: Long = 10, reviewed: Boolean = false, mark: String? = null) = LaboratoryOrder(
        id, "Paciente $id", priority, state, 1, listOf(LaboratoryItem("i$id", "HB", "Hemoglobina", mark?.let { LaboratoryResult(1.0, null, it, 1) })), reviewed,
        record = "000101-1", sex = "femenino", age = "34 años", doctorName = "Dr. Ficticio", createdAtMillis = minutes(ageMin),
    )

    @Test fun `sorts urgent first then oldest and closed last`() {
        val sorted = LabWorklist.sorted(listOf(order("a", ageMin = 5), order("b", "urgente", ageMin = 1), order("c", ageMin = 90), order("d", "urgente", "completado", ageMin = 300, reviewed = true)))
        assertEquals(listOf("b", "c", "a", "d"), sorted.map { it.id })
    }

    @Test fun `goal colour depends on priority and stops once the lab is done`() {
        assertEquals(SlaLevel.OK, LabWorklist.sla(order("a", ageMin = 20), now))
        assertEquals(SlaLevel.WARN, LabWorklist.sla(order("a", "urgente", ageMin = 35), now))
        assertEquals(SlaLevel.LATE, LabWorklist.sla(order("a", "urgente", ageMin = 61), now))
        assertEquals(SlaLevel.NONE, LabWorklist.sla(order("a", state = "completado", ageMin = 900), now))
    }

    @Test fun `stages and critical flag`() {
        assertEquals(LabStage.TO_REVIEW, LabWorklist.stage(order("a", state = "completado")))
        assertEquals(LabStage.RELEASED, LabWorklist.stage(order("a", state = "completado", reviewed = true)))
        assertTrue(LabWorklist.isCritical(order("a", mark = "critico_bajo")))
        assertFalse(LabWorklist.isCritical(order("a", mark = "alto")))
    }

    @Test fun `identity line and accent insensitive search`() {
        assertEquals("Exp. 000101-1 · 34 años · F", LabWorklist.identityLine(order("a")))
        assertTrue(LabWorklist.matches(order("a").copy(patientName = "María"), "maria"))
        assertFalse(LabWorklist.matches(order("a"), "zzz"))
    }

    @Test fun `elapsed text`() { assertEquals(listOf("7 min", "1 h 05 min", "2 h", "1 d 1 h"), listOf(7L, 65L, 120L, 1500L).map(::elapsedText)) }

    private fun ticket(n: Int, state: String, service: String = "consulta_general", ageMin: Long = 5) = QueueTicket("t$n", service, n, "Paciente $n", state, 0, 1, minutes(ageMin))

    @Test fun `queue summary counts each column and averages the waits`() {
        val tickets = listOf(ticket(1, "en_espera", ageMin = 10), ticket(2, "llamado", ageMin = 30), ticket(3, "en_atencion"), ticket(4, "atendido"), ticket(5, "no_se_presento"))
        val summary = QueueBoard.summary(tickets, now)
        assertEquals(mapOf(QueueColumn.WAITING to 1, QueueColumn.CALLED to 1, QueueColumn.IN_ATTENTION to 1, QueueColumn.CLOSED to 2), summary.counts)
        assertEquals(20L, summary.averageWait); assertEquals(30L, summary.longestWait)
    }

    @Test fun `queue filters by service and text and colours long waits`() {
        val tickets = listOf(ticket(1, "en_espera"), ticket(2, "en_espera", "laboratorio", ageMin = 50))
        assertEquals(listOf(2), QueueBoard.visible(tickets, "laboratorio", "").map { it.number })
        assertEquals(listOf(1), QueueBoard.visible(tickets, null, "paciente 1").map { it.number })
        assertEquals(SlaLevel.LATE, QueueBoard.waitLevel(tickets[1], now)); assertEquals(SlaLevel.OK, QueueBoard.waitLevel(tickets[0], now))
        assertEquals(SlaLevel.NONE, QueueBoard.waitLevel(ticket(3, "atendido"), now))
    }

    @Test fun `agenda writes one range per row in El Salvador time and groups by day`() {
        assertEquals("08:00 – 08:20", AppointmentAgenda.timeRange("2026-11-20T14:00:00Z", "2026-11-20T14:20:00Z"))
        assertEquals("2026-11-20", AppointmentAgenda.dayKey("2026-11-21T03:30:00Z"))
        assertEquals("Viernes 20 de noviembre", AppointmentAgenda.dayLabel("2026-11-20"))
        val grouped = AppointmentAgenda.groupByDay(listOf("2026-11-21T15:00:00Z", "2026-11-20T16:00:00Z", "2026-11-20T14:00:00Z")) { it }
        assertEquals(listOf("2026-11-20", "2026-11-21"), grouped.map { it.first }); assertEquals(2, grouped[0].second.size)
    }
}
