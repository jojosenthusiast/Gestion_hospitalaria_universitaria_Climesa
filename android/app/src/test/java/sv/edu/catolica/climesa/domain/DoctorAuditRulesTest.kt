package sv.edu.catolica.climesa.domain

import java.time.Instant
import java.time.LocalDate
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** MED audit rows 1, 3, 5, 8, 11 and 15. */
class DoctorAuditRulesTest {
    private fun obj(vararg pairs: Pair<String, Any?>) = JSONObject().apply { pairs.forEach { (k, v) -> put(k, v ?: JSONObject.NULL) } }
    private fun arr(vararg items: JSONObject) = JSONArray().apply { items.forEach { put(it) } }

    @Test fun firstDiagnosisIsPrincipalButASecondDoesNotDemoteTheFirst() {
        assertTrue(ConsultationRecordRules.defaultPrincipal(ConsultationRecord("c1")))
        val withPrincipal = ConsultationRecord("c1", diagnoses = listOf(RecordedDiagnosis("d1", "J06.9", principal = true, note = null)))
        assertFalse(ConsultationRecordRules.defaultPrincipal(withPrincipal))
        val onlySecondary = ConsultationRecord("c1", diagnoses = listOf(RecordedDiagnosis("d1", "J06.9", principal = false, note = null)))
        assertTrue(ConsultationRecordRules.defaultPrincipal(onlySecondary))
        // Record not read yet: never demote an existing principal by default.
        assertFalse(ConsultationRecordRules.defaultPrincipal(null))
    }

    @Test fun vitalsTakenInTheConsultationAreReadFromTheDetailNewestFirst() {
        val detail = obj("vitalSigns" to arr(
            obj("id" to "v1", "takenAt" to "2026-11-18T14:00:00Z", "systolic" to 120, "diastolic" to 80, "heartRate" to 72, "respiratoryRate" to null, "temperature" to "36.8", "oxygenSaturation" to 98, "weightKg" to null, "heightCm" to null),
            obj("id" to "v2", "takenAt" to "2026-11-18T15:00:00Z", "systolic" to null, "diastolic" to null, "heartRate" to 90, "respiratoryRate" to 18, "temperature" to null, "oxygenSaturation" to null, "weightKg" to "70.5", "heightCm" to null),
        ))
        val vitals = ConsultationRecordRules.vitals(detail)
        assertEquals(listOf("v2", "v1"), vitals.map { it.id })
        assertEquals("PA 120/80 · FC 72 · T 36.8 °C · SpO₂ 98 %", vitals[1].text)
        assertEquals("FC 90 · FR 18 · 70.5 kg", vitals[0].text)
        assertTrue(ConsultationRecordRules.vitals(obj()).isEmpty())
    }

    @Test fun doctorHomeCountsOnlyTodaysAppointments() {
        val now = Instant.parse("2026-11-18T16:00:00Z")
        val agenda = arr(
            obj("start" to "2026-11-18T15:00:00Z", "consultationId" to "c1"),
            obj("start" to "2026-11-18T20:00:00Z", "consultationId" to null),
            obj("start" to "2026-11-12T15:00:00Z", "consultationId" to "c0"),
            obj("start" to "2026-12-10T15:00:00Z", "consultationId" to null),
        )
        val model = RoleDashboard.build("MED", setOf("consulta.iniciar"), mapOf(DashboardSource.AGENDA to agenda), now = now)
        assertEquals("2", model.kpis.first { it.label == "Citas de hoy" }.value)
        assertEquals("1", model.kpis.first { it.label == "Consultas iniciadas" }.value)
    }

    @Test fun existingAdmissionPrefersTheOneIndicatedFromThisConsultation() {
        val rows = arr(
            obj("id" to "a0", "patientId" to "p1", "state" to "egresado", "origin" to "consulta", "originId" to "c1"),
            obj("id" to "a1", "patientId" to "p1", "state" to "pendiente_cama", "origin" to "consulta", "originId" to "c1"),
            obj("id" to "a2", "patientId" to "p2", "state" to "hospitalizado", "origin" to "emergencia", "originId" to "e1"),
        )
        assertEquals(ExistingAdmission("a1", "pendiente_cama", true), AdmissionIndication.existing(rows, "p1", "c1"))
        assertEquals(ExistingAdmission("a2", "hospitalizado", false), AdmissionIndication.existing(rows, "p2", "c9"))
        assertNull(AdmissionIndication.existing(rows, "p3", "c1"))
        assertNull(AdmissionIndication.existing(rows, null, "c1"))
    }

    @Test fun calledNumberOffersOnlyTheServersQueueActions() {
        val row = obj("id" to "t1", "numero" to 7, "patientName" to "Ana", "state" to "llamado", "service" to "consulta_general", "consultationId" to null, "consultationState" to null,
            "calledByMe" to true, "version" to 4, "priority" to "urgente", "area" to "CON",
            "allowedActions" to JSONArray().put("llamar").put("no_se_presento"), "undoActions" to JSONArray().put("deshacer_llamado"))
        val ticket = ConsultationResume.parseQueue(arr(row)).single()
        assertEquals("CON 7", ticket.code)
        assertEquals(4, ticket.version)
        assertTrue(QueueCardActions.canUndo(ticket, canCall = true))
        assertFalse(QueueCardActions.canUndo(ticket, canCall = false))
        assertFalse(QueueCardActions.canUndo(ticket.copy(calledByMe = false), canCall = true))
        assertTrue(QueueCardActions.canCallAgain(ticket, canCall = true))
        assertTrue(QueueCardActions.canMarkAbsent(ticket))
        assertEquals(listOf("emergencia", "rutina"), QueueCardActions.priorities(ticket, canManage = true))
        assertTrue(QueueCardActions.priorities(ticket, canManage = false).isEmpty())
        assertFalse(QueueCardActions.canMarkAbsent(ticket.copy(allowedActions = emptyList())))
    }

    @Test fun agendaGroupsByDayWithTodayApart() {
        fun appt(id: String, start: String) = MedicalAppointment(id, "p", "Ana", start, start, "confirmada", null, null, null, null, null, null, 1)
        val today = LocalDate.of(2026, 11, 18)
        val groups = ConsultationAgenda.group(listOf(appt("b", "2026-11-18T20:00:00Z"), appt("a", "2026-11-18T15:00:00Z"), appt("p", "2026-11-16T15:00:00Z"), appt("l", "2026-11-20T15:00:00Z")), today)
        assertEquals(listOf("a", "b"), groups.today?.appointments?.map { it.appointmentId })
        assertEquals(listOf(LocalDate.of(2026, 11, 16)), groups.past.map { it.date })
        assertEquals(listOf(LocalDate.of(2026, 11, 20)), groups.later.map { it.date })
        assertEquals(listOf(1, 2), ConsultationAgenda.shown(listOf(1, 2, 3, 4), expanded = false))
        assertEquals(2, ConsultationAgenda.hidden(4, expanded = false))
        assertEquals(0, ConsultationAgenda.hidden(4, expanded = true))
    }
}
