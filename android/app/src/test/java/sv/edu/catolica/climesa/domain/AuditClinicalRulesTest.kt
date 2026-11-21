package sv.edu.catolica.climesa.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Flow audit 2026-11-20 (second Android pass): doctor, nurse and patient rules. */
class AuditClinicalRulesTest {
    private fun admission(id: String, state: String, patientId: String? = "p-$id") =
        HospitalAdmission(id, "Paciente $id", state, "HAB-201-A", "semiprivada", false, 1, patientId = patientId)

    // D70: the current step names what is awaited, never the past participle that reads as done.
    @Test fun pasoActualDiceLoQueFalta() {
        assertEquals("Revisión del médico", LabFlow.currentLabel(4))
        assertEquals("Toma de muestra", LabFlow.currentLabel(1))
        assertEquals("En Proceso", LabFlow.currentLabel(2))
    }

    // D71: the inbox row keeps which values come from a critical item.
    @Test fun filaDeBandejaGuardaValoresCriticos() {
        val items = listOf(
            LabFollowUp("f1", "o1", "Yaneth", null, true, "", 1, null, orderVersion = 2, orderActions = listOf("revisar"), values = listOf("Potasio 6.8 · Crítico alto")),
            LabFollowUp("f2", "o1", "Yaneth", null, false, "Hemólisis leve", 1, null, values = listOf("Glucosa 95 · Normal")),
        )
        val row = LabInbox.rows(items).single()
        assertEquals(listOf("Potasio 6.8 · Crítico alto"), row.criticalValues)
        assertEquals(listOf("Potasio 6.8 · Crítico alto", "Glucosa 95 · Normal"), row.keyValues)
    }

    // D68: the snooze confirmation says when the notice comes back.
    @Test fun recordarmeConfirmaLaHora() {
        assertEquals("Listo: te lo recordamos en 4 h.", NoticeInboxRules.snoozedText(4.0))
        assertEquals("Listo: te lo recordamos en 1,5 h.", NoticeInboxRules.snoozedText(1.5))
    }

    // D74: an empty signing handoff is dropped when someone is waiting; a real proposal always stays.
    @Test fun traspasoVacioNoContradiceLaFila() {
        val empty = NextProposal("consulta_general", "CON", "fifo", null)
        val proposal = NextProposal("consulta_general", "CON", "fifo", ProposedTicket("t", 3, "CON", "Karla", "rutina", 1, "cita", "Viene de su cita"))
        assertNull(ConsultationPrimary.shownHandoff(empty, waitingGeneral = true))
        assertEquals(empty, ConsultationPrimary.shownHandoff(empty, waitingGeneral = false))
        assertEquals(proposal, ConsultationPrimary.shownHandoff(proposal, waitingGeneral = true))
    }

    // D76: the patient called into the doctor's office leaves "Mi día" and stays only in "Fila del día".
    @Test fun pacienteLlamadoNoSaleDosVeces() {
        fun appt(id: String, patient: String, name: String) = MedicalAppointment(id, patient, name, "2026-11-20T16:00:00Z", "2026-11-20T16:20:00Z", "confirmada", null, null, null, null, null, null, 1)
        val agenda = listOf(appt("a1", "p1", "Karla"), appt("a2", "p2", "Luis"))
        val byId = listOf(QueueConsultation("t1", 3, "Karla", "llamado", null, null, calledByMe = true, patientId = "p1"))
        assertEquals(listOf("a2"), ConsultationPrimary.withoutCalled(agenda, byId).map { it.appointmentId })
        val byName = listOf(QueueConsultation("t1", 3, "Luis", "en_atencion", "c1", null))
        assertEquals(listOf("a1"), ConsultationPrimary.withoutCalled(agenda, byName).map { it.appointmentId })
        val waiting = listOf(QueueConsultation("t1", 3, "Karla", "en_espera", null, null, patientId = "p1"))
        assertEquals(2, ConsultationPrimary.withoutCalled(agenda, waiting).size)
    }

    // D84: "Hospitalizados" counts every active stay the list shows.
    @Test fun hospitalizadosCuentaLasEstanciasActivas() {
        assertEquals(3, RoleDashboard.inBed(mapOf("hospitalizado" to 1, "alta_firmada" to 1, "pendiente_cama" to 1, "egresado" to 4)))
    }

    // D86: the critical values of the latest signs, in one line; nothing when none is critical.
    @Test fun signosCriticosEnUnaLinea() {
        val alerts = listOf(VitalAlert(VitalMeasure.TEMPERATURE, 39.5, VitalLevel.CRITICAL), VitalAlert(VitalMeasure.HEART_RATE, 110.0, VitalLevel.ABNORMAL))
        val text = HospitalizationRules.criticalSignsText(alerts)!!
        assertTrue(text, text.startsWith("T 39"))
        assertFalse(text, text.contains("FC"))
        assertNull(HospitalizationRules.criticalSignsText(alerts.drop(1)))
        assertTrue(HospitalizationRules.watchesSigns(admission("a", "hospitalizado")))
        assertFalse(HospitalizationRules.watchesSigns(admission("b", "egresado")))
        assertFalse(HospitalizationRules.watchesSigns(admission("c", "hospitalizado", patientId = null)))
    }

    // D88: the summary rule shows while typing: empty is allowed, 5 characters says how many are missing.
    @Test fun resumenDeAltaExplicaAntes() {
        assertNull(HospitalizationRules.summaryError(""))
        assertEquals("Faltan 5 caracteres (mínimo 10), o déjalo vacío.", HospitalizationRules.summaryError("Breve"))
        assertNull(HospitalizationRules.summaryError("Evolución favorable"))
        assertTrue("Consulta general" in HospitalizationRules.PENDING_RESPONSIBLES)
    }

    // D92/D93: finishing a cleaning needs no reason (a default one is sent); a cleaned bed reads apart from one being cleaned.
    @Test fun limpiezaSinMotivoYPorVerificar() {
        assertNull(BedRules.validateReason(BedAction.COMPLETE_CLEANING, ""))
        assertEquals(BedRules.CLEANING_DONE_REASON, BedRules.reasonToSend(BedAction.COMPLETE_CLEANING, " "))
        assertEquals("Lavada con cloro", BedRules.reasonToSend(BedAction.COMPLETE_CLEANING, "Lavada con cloro"))
        assertEquals("Escribe al menos 10 caracteres.", BedRules.validateReason(BedAction.VERIFY_CLEANING, ""))
        assertTrue(BedRules.CLEANING_DONE_REASON.length >= BedAction.COMPLETE_CLEANING.minReason)
        val cleaning = Bed("b", "HAB-203-B", "203", "limpieza", 1, cleaningPending = true)
        assertEquals("limpieza" to "En limpieza", BedRules.tag(cleaning))
        assertEquals("completado" to "Limpia, por verificar", BedRules.tag(cleaning.copy(cleaningCompleted = true)))
    }

    // D99: "Llamar siguiente" counts who waits in the chosen service only.
    @Test fun esperaPorServicio() {
        val tickets = listOf(
            QueueTicket("1", "consulta_general", 1, "A", "en_espera", 0, 1),
            QueueTicket("2", "consulta_general", 2, "B", "llamado", 1, 1),
            QueueTicket("3", "enfermeria", 1, "C", "en_espera", 0, 1),
        )
        assertEquals(1, QueueRules.waitingCount(tickets, "consulta_general"))
        assertEquals(0, QueueRules.waitingCount(tickets, "laboratorio"))
    }

    // D130: a burst of the same access collapses into one row; plain words replace the audit codes; the name when sent.
    @Test fun accesosRepetidosSeAgrupan() {
        val json = org.json.JSONArray(
            (0..5).map { i -> org.json.JSONObject().put("fecha", "2026-11-20T01:0${4 + (i % 5)}:00Z").put("rol", "Médico").put("tipoDato", "fila").put("motivo", "atencion") } +
                org.json.JSONObject().put("fecha", "2026-11-19T15:00:00Z").put("rol", "Enfermería").put("tipoDato", "signos").put("motivo", "atencion").put("nombre", "Ana López"),
        )
        val entries = MyAccessRules.parse(json)
        val groups = MyAccessRules.collapse(entries)
        assertEquals(listOf(6, 1), groups.map { it.count })
        assertEquals("2026-11-20T01:04:00Z", groups[0].earliest)
        assertEquals("2026-11-20T01:08:00Z", groups[0].latest)
        assertEquals("Ana López", groups[1].entry.name)
        assertNull(groups[0].entry.name)
        assertEquals("Tu número en la fila", MyAccessRules.dataText("fila"))
        assertEquals("para atenderte", MyAccessRules.reasonText("atencion"))
    }
}
