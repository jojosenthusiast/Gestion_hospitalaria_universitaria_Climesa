package sv.edu.catolica.climesa.domain

import org.json.JSONArray
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** D7: the patient reads the summary of the own signed discharge in «Mi habitación». */
class DischargeSummaryRulesTest {
    private fun row(id: String, state: String, discharge: String, patient: String = "p1", bed: String = "2-04A") =
        """{"id":"$id","patientId":"$patient","patientName":"Ana","state":"$state","bed":"$bed","requestedCategory":"semiprivada","isolation":false,"version":3,"discharge":$discharge,"allowedActions":[]}"""

    private val clinical = """{"type":"medica","signedAt":"2026-11-18T16:30:00Z","signedByName":"Dra. Ficticia","pending":[{"description":"Retirar puntos","responsible":"Consulta externa"}],"pendingCount":1,"specialHandling":false,
        "summary":"Reposo y dieta blanda.","diagnoses":[{"code":"K35.8","description":"Apendicitis aguda","principal":false},{"code":"A09","description":"Diarrea","principal":true}],
        "followUp":{"at":"2026-11-21T16:00:00Z","state":"solicitada","doctorName":"Dr. Ficticio","specialty":"Cirugía"}}"""

    @Test fun parsesTheClinicalSummaryFields() {
        val discharge = AdmissionParser.admissions(JSONArray("[${row("a", "alta_firmada", clinical)}]")).single().discharge!!
        assertEquals("Reposo y dieta blanda.", discharge.summary)
        assertEquals(listOf("A09", "K35.8"), DischargeSummaryRules.diagnoses(discharge).map { it.code })
        assertEquals(DischargeFollowUp("2026-11-21T16:00:00Z", "solicitada", "Dr. Ficticio", "Cirugía"), discharge.followUp)
    }

    @Test fun readersWithoutCareRelationshipGetNoSummary() {
        val operational = """{"type":null,"signedAt":"2026-11-18T16:30:00Z","signedByName":null,"pending":null,"pendingCount":1,"specialHandling":false,"summary":null,"diagnoses":null,"followUp":null}"""
        val list = AdmissionParser.admissions(JSONArray("[${row("a", "alta_firmada", operational)}]"))
        assertNull(list.single().discharge?.summary)
        assertNull(list.single().discharge?.diagnoses)
        assertNull(DischargeSummaryRules.summary(list, "p1"))
    }

    @Test fun showsTheSignedOrClosedStayOfThePatientOnly() {
        val list = AdmissionParser.admissions(JSONArray("[${row("h", "hospitalizado", "null")},${row("e", "egresado", clinical, bed = "")},${row("o", "alta_firmada", clinical, patient = "p2")}]"))
        assertEquals("e", DischargeSummaryRules.summary(list, "p1")?.id)
        assertEquals("o", DischargeSummaryRules.summary(list, "p2")?.id)
        assertNull(DischargeSummaryRules.summary(list, "p3"))
        // A signed discharge keeps the bed until the physical exit; the closed stay has none.
        assertEquals("o", MyRoomRules.current(list, "p2")?.id)
        assertEquals("h", MyRoomRules.current(list, "p1")?.id)
    }

    @Test fun displayLines() {
        val discharge = AdmissionParser.admissions(JSONArray("[${row("a", "alta_firmada", clinical)}]")).single().discharge!!
        assertEquals("Alta médica", DischargeSummaryRules.typeLabel(DischargeType.MEDICAL))
        assertEquals("A09 · Diarrea (principal)", DischargeSummaryRules.diagnosisLine(DischargeSummaryRules.diagnoses(discharge).first()))
        assertEquals("Retirar puntos — Responsable: Consulta externa", DischargeSummaryRules.pendingLine(discharge.pending!!.single()))
        // Hospital local time (UTC-6); the month abbreviation depends on the JDK locale data.
        val followUp = DischargeSummaryRules.followUpLine(discharge.followUp!!)
        assertTrue(followUp, followUp.startsWith("21 ") && followUp.endsWith("2026, 10:00 · Dr. Ficticio · Cirugía (por confirmar)"))
        val signed = DischargeSummaryRules.signedLine(discharge)
        assertTrue(signed, signed.startsWith("Firmada el 18 ") && signed.endsWith("2026, 10:30 por Dra. Ficticia"))
    }
}
