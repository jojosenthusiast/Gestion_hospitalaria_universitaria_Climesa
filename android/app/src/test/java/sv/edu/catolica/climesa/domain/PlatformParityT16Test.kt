package sv.edu.catolica.climesa.domain

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** T16: Android behaves like the web reference (double audit Android vs web). */
class PlatformParityT16Test {
    // B1: reception issues a number for a chosen patient; the API reads `patientId` for the `x` context.
    @Test fun issueBodyCarriesThePatient() {
        val routine = QueueRules.issueBody("laboratorio", "rutina", "p-1")
        assertEquals(setOf("service", "patientId"), routine.keys().asSequence().toSet())
        assertEquals("p-1", routine.getString("patientId"))
        val urgent = QueueRules.issueBody("consulta_general", "urgente", "p-2")
        assertEquals("p-2", urgent.getString("patientId"))
        assertEquals("urgente", urgent.getString("priority"))
    }

    // B5: only active consulting rooms of `/espacios` are offered for a call, as the web filter does.
    @Test fun officesAreActiveConsultingRooms() {
        val spaces = JSONArray()
            .put(JSONObject().put("id", "o1").put("type", "consultorio").put("code", "C-101").put("name", "Consultorio 1").put("active", true))
            .put(JSONObject().put("id", "o2").put("type", "consultorio").put("code", "C-102").put("name", "Consultorio 2").put("active", false))
            .put(JSONObject().put("id", "h1").put("type", "habitacion").put("code", "HAB-201").put("name", "Habitación").put("active", true))
        val offices = QueueRules.offices(spaces)
        assertEquals(listOf("o1"), offices.map { it.id })
        assertEquals("C-101 · Consultorio 1", offices.single().label)
        assertTrue(QueueRules.offices(JSONObject()).isEmpty())
    }

    // B6: "who goes next" has three states before a proposal: computing, error and nobody waiting.
    @Test fun nextPanelHasLoadingErrorAndNone() {
        val none = NextProposal("consulta_general", "CON", "r", null)
        assertEquals(NextStatus.LOADING, QueueRules.nextStatus(null, loading = true, error = null))
        assertEquals(NextStatus.LOADING, QueueRules.nextStatus(null, loading = false, error = null))
        assertEquals(NextStatus.ERROR, QueueRules.nextStatus(null, loading = false, error = "No se pudo"))
        assertEquals(NextStatus.NONE, QueueRules.nextStatus(none, loading = false, error = null))
        val some = none.copy(proposal = ProposedTicket("t1", 1, "CON", "Ana", "rutina", 1, "orden", "Por orden de llegada."))
        assertEquals(NextStatus.PROPOSAL, QueueRules.nextStatus(some, loading = false, error = null))
    }

    private fun queueRow(id: String, state: String, consultation: String? = null, byMe: Boolean? = null, byColleague: Boolean? = null, service: String = "consulta_general") =
        JSONObject().put("id", id).put("numero", id.drop(1).toInt()).put("patientName", "P$id").put("state", state).put("service", service)
            .put("consultationId", consultation ?: JSONObject.NULL).apply { byMe?.let { put("calledByMe", it) }; byColleague?.let { put("calledByColleague", it) } }

    // B2: the doctor's queue reads `calledByMe` / `calledByColleague` from the API; a missing flag is false.
    @Test fun doctorQueueReadsTheCallerFlags() {
        val rows = ConsultationResume.parseQueue(JSONArray().put(queueRow("t1", "llamado", byMe = true)).put(queueRow("t2", "llamado", byColleague = true)).put(queueRow("t3", "llamado")))
        assertTrue(rows[0].calledByMe); assertFalse(rows[0].calledByColleague)
        assertTrue(rows[1].calledByColleague); assertFalse(rows[1].calledByMe)
        assertFalse(rows[2].calledByMe); assertFalse(rows[2].calledByColleague)
        assertFalse(rows[0].calledElsewhere)
        assertTrue(rows[1].calledElsewhere)
        // A call by reception or with no recorded caller stays actionable.
        assertFalse(rows[2].calledElsewhere)
        assertEquals(ConsultationPrimary.StartTicket("t1"), ConsultationPrimary.pick(rows, unsigned = emptyList(), canCallNext = false))
        assertNull(ConsultationPrimary.pick(rows.drop(1), unsigned = emptyList(), canCallNext = false))
    }

    @Test fun ownConsultationIsNeverCalledElsewhere() {
        val row = ConsultationResume.parseQueue(JSONArray().put(queueRow("t4", "llamado", consultation = "c4", byColleague = true))).single()
        assertFalse(row.calledElsewhere)
    }

    // B4: with no signing handoff, an account that may call and someone waiting in general consultation calls the first patient.
    @Test fun firstPatientIsCalledWhenNothingElseIsPending() {
        val waiting = ConsultationResume.parseQueue(JSONArray().put(queueRow("t5", "en_espera")).put(queueRow("t6", "en_espera", service = "laboratorio")))
        assertTrue(ConsultationResume.waitingInGeneral(waiting))
        assertFalse(ConsultationResume.waitingInGeneral(waiting.drop(1)))
        assertEquals(ConsultationPrimary.CallWaiting, ConsultationPrimary.pick(emptyList(), unsigned = emptyList(), canCallNext = false, canCallWaiting = true))
        // An own consultation to resume, an unsigned one or a number this doctor called comes first.
        assertEquals(ConsultationPrimary.ResumeUnsigned("c1"), ConsultationPrimary.pick(emptyList(), unsigned = listOf("c1"), canCallNext = false, canCallWaiting = true))
        val mine = ConsultationResume.parseQueue(JSONArray().put(queueRow("t7", "llamado", byMe = true)))
        assertEquals(ConsultationPrimary.StartTicket("t7"), ConsultationPrimary.pick(mine, unsigned = emptyList(), canCallNext = false, canCallWaiting = true))
        assertNull(ConsultationPrimary.pick(emptyList(), unsigned = emptyList(), canCallNext = false, canCallWaiting = false))
        assertEquals(setOf("service"), QueueRules.callNextBody("consulta_general").keys().asSequence().toSet())
    }

    // B3: "Mi día" reloads on queue events (`ticket_fila`, type `fila.*`), like the web live scope of /consultas.
    @Test fun consultationScreenReloadsOnQueueEvents() {
        assertTrue(DoctorDayEvents.matches(EventoDominio("fila.actualizada", "ticket_fila", "t1", 2)))
        assertTrue(DoctorDayEvents.matches(EventoDominio("fila.actualizada", "otra", "t1", 2)))
        assertTrue(DoctorDayEvents.matches(EventoDominio("consulta.firmada", "consulta", "c1", 2)))
        assertTrue(DoctorDayEvents.matches(EventoDominio("cita.confirmada", "cita", "a1", 1)))
        assertFalse(DoctorDayEvents.matches(EventoDominio("cama.estado_cambiado", "cama", "b1", 2)))
        // The clinical history keeps its own filter: a queue call does not reload (and re-audit) a patient's record.
        assertFalse(ConsultationEvents.matches(EventoDominio("fila.actualizada", "ticket_fila", "t1", 2)))
    }

    // A1: category request states use the web pairs (value for the family, label for the patient and reception).
    @Test fun categoryRequestStatesFollowTheWeb() {
        assertEquals("en_espera" to "Por asignar", CategoryRequestRules.status("pendiente"))
        assertEquals("confirmada" to "Cita asignada", CategoryRequestRules.status("asignada"))
        assertEquals("rechazada" to "Rechazada", CategoryRequestRules.status("rechazada"))
        assertEquals("cancelada" to "Retirada", CategoryRequestRules.status("cancelada"))
    }

    // A4: waiting time of a request, like the web `waitingFor`.
    @Test fun requestWaitingTimeReadsLikeTheWeb() {
        val now = java.time.Instant.parse("2026-11-16T15:00:00Z").toEpochMilli()
        assertEquals("hace 5 min", CategoryRequestRules.waitingFor("2026-11-16T14:55:00Z", now))
        assertEquals("hace 2 h", CategoryRequestRules.waitingFor("2026-11-16T12:30:00Z", now))
        assertEquals("hace 3 d", CategoryRequestRules.waitingFor("2026-11-13T14:00:00Z", now))
        assertEquals("hace 0 min", CategoryRequestRules.waitingFor("2026-11-16T15:05:00Z", now))
        assertNull(CategoryRequestRules.waitingFor("no es fecha", now))
    }

    // A3: the cancel deadline names its day when it is not the appointment's day.
    @Test fun cancelDeadlineNamesTheDayWhenItDiffers() {
        assertEquals("las 09:00", AppointmentAgenda.deadline("2026-11-20T15:00:00Z", "2026-11-20T17:00:00Z"))
        assertEquals("el jueves 19 de noviembre a las 11:00", AppointmentAgenda.deadline("2026-11-19T17:00:00Z", "2026-11-20T17:00:00Z"))
    }

    // B5 + G2: the patient is told the office only when the ticket carries it, never in red.
    @Test fun patientTurnNamesTheOfficeOnlyWhenKnown() {
        val build = { row: JSONObject -> RoleDashboard.build("PAC", setOf("fila.ver"), mapOf(DashboardSource.QUEUE to JSONArray().put(row)), now = java.time.Instant.parse("2026-11-16T15:00:00Z")) }
        val withOffice = build(JSONObject().put("state", "llamado").put("numero", 4).put("officeCode", "C-101"))
        val attention = withOffice.attention.first { it.title == "Es tu turno" }
        assertEquals("Pasa al consultorio C-101.", attention.detail)
        assertFalse(attention.tone == DashboardTone.DANGER)
        assertFalse(withOffice.kpis.first { it.label == "Mi turno en fila" }.tone == DashboardTone.DANGER)
        val without = build(JSONObject().put("state", "llamado").put("numero", 4))
        val neutral = without.attention.first { it.title == "Es tu turno" }.detail
        assertFalse(neutral.contains("indicado"))
        assertEquals("Atento al llamado en recepción.", neutral)
    }

    // G1: since #145 the block means no paramedic with an app account is on shift.
    @Test fun paramedicGuidanceMentionsShiftAndAccount() {
        val planner = ParamedicRules.blockGuidance("sin_paramedico_de_turno", canPlanShifts = true)
        val crew = ParamedicRules.blockGuidance("sin_paramedico_de_turno", canPlanShifts = false)
        listOf(planner, crew).forEach { assertTrue(it, it.contains("turno")); assertTrue(it, it.contains("cuenta")) }
        assertTrue(planner.contains("Publica un turno"))
        assertTrue(crew.contains("Jefatura de Operaciones"))
    }

    // C1: follow-up appointment proposals for reception (`GET /laboratorio/seguimientos`) and their two writes.
    @Test fun labProposalsParseAndBuildTheirBodies() {
        val rows = JSONArray().put(JSONObject().put("id", "s1").put("orderId", "o1").put("patientId", "p1").put("patientName", "Ana Ficticia").put("patientRecord", "EXP-1")
            .put("doctorId", "d1").put("doctorName", "Dra. Prueba").put("state", "propuesta").put("priority", "urgente").put("resultsAt", "2026-11-16T15:00:00Z")
            .put("createdAt", "2026-11-16T15:01:00Z").put("version", 2))
            .put(JSONObject().put("id", "s2").put("orderId", "o2").put("patientId", "p2").put("patientName", JSONObject.NULL).put("patientRecord", JSONObject.NULL)
                .put("doctorId", "d2").put("doctorName", JSONObject.NULL).put("priority", "rutina").put("resultsAt", "2026-11-16T16:00:00Z").put("createdAt", "2026-11-16T16:00:00Z").put("version", 1))
        val proposals = LabProposalRules.parse(rows)
        assertEquals(listOf("s1", "s2"), proposals.map { it.id })
        assertEquals("Exp. EXP-1 · Con Dra. Prueba · Resultados del 16 nov, 09:00", proposals[0].detail)
        assertTrue(proposals[0].urgent)
        assertEquals("Paciente", proposals[1].patientName)
        assertEquals("Resultados del 16 nov, 10:00", proposals[1].detail)
        assertEquals("/laboratorio/seguimientos/s1/confirmar", LabProposalRules.confirmPath("s1"))
        assertEquals("/laboratorio/seguimientos/s1/descartar", LabProposalRules.discardPath("s1"))
        val link = LabProposalRules.confirmBody(2, "a1")
        assertEquals(setOf("version", "appointmentId"), link.keys().asSequence().toSet()); assertEquals("a1", link.getString("appointmentId"))
        val discard = LabProposalRules.discardBody(2, "  Ya tiene control agendado ")
        assertEquals(setOf("version", "reason"), discard.keys().asSequence().toSet()); assertEquals("Ya tiene control agendado", discard.getString("reason"))
        assertEquals("Escribe el motivo, de al menos 10 caracteres.", LabProposalRules.discardError("corto"))
        assertNull(LabProposalRules.discardError("Ya tiene control agendado"))
        val slot = DaySlot("2026-11-23T15:00:00Z", "2026-11-23T15:20:00Z", SlotStatus.FREE, null)
        val appointment = LabProposalRules.appointmentBody(proposals[0], slot)
        assertEquals("p1", appointment.getString("patientId")); assertEquals("d1", appointment.getString("doctorId"))
        assertEquals("Seguimiento de resultados de laboratorio", appointment.getString("reason"))
        assertTrue(LabProposalRules.parse(JSONObject()).isEmpty())
    }
}
