package sv.edu.catolica.climesa.ui

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import sv.edu.catolica.climesa.domain.AdmissionParser
import sv.edu.catolica.climesa.domain.AndroidSection
import sv.edu.catolica.climesa.domain.HospitalizationRules
import sv.edu.catolica.climesa.domain.QuickActionRequest
import sv.edu.catolica.climesa.domain.QuickSubject

/** R7 U2, journey G5: "Signos" from a ward card opens on that patient, without picking them again. */
class WardJourneyTest {
    private fun row(state: String, patientId: Any = "p1", bed: String = "HAB-203-A") = JSONObject().put("id", "adm-1").put("patientId", patientId).put("patientName", "Ana Ficticia")
        .put("state", state).put("bed", bed).put("requestedCategory", "general").put("isolation", false).put("version", 2).put("allowedActions", JSONArray())

    @Test fun aHospitalizedPatientOpensSignsAlreadyChosen() {
        val admission = AdmissionParser.admissions(JSONArray().put(row("hospitalizado"))).single()
        assertEquals(QuickSubject("p1", "Ana Ficticia", "Cama HAB-203-A"), HospitalizationRules.vitalsSubject(admission))
        val waiting = AdmissionParser.admissions(JSONArray().put(row("pendiente_cama", bed = ""))).single()
        assertEquals("Sin cama asignada", HospitalizationRules.vitalsSubject(waiting)?.detail)
    }

    // ENF/AST audit #14: a signed discharge still takes signs until the exit; only a closed stay loses the shortcut.
    @Test fun noSignsShortcutAfterDischargeOrWithoutPatient() {
        assertNull(HospitalizationRules.vitalsSubject(AdmissionParser.admissions(JSONArray().put(row("egresado"))).single()))
        assertNull(HospitalizationRules.vitalsSubject(AdmissionParser.admissions(JSONArray().put(row("hospitalizado", JSONObject.NULL))).single()))
    }

    @Test fun theInboxHandsTheSubjectOnlyToItsSection() {
        val inbox = QuickActionInbox()
        inbox.post(QuickActionRequest(AndroidSection.VITAL_SIGNS, subject = QuickSubject("p1", "Ana Ficticia")))
        assertNull(inbox.subjectFor(AndroidSection.WARD))
        assertEquals("p1", inbox.subjectFor(AndroidSection.VITAL_SIGNS)?.id)
        inbox.consume(AndroidSection.VITAL_SIGNS)
        assertNull(inbox.subjectFor(AndroidSection.VITAL_SIGNS))
    }
}
