package sv.edu.catolica.climesa.domain

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate

class AccountLinkingTest {
    private val today = LocalDate.of(2026, 11, 13)
    /** Fictitious DUI with a valid check digit. */
    private val dui = "10000001-9"

    @Test fun formRequiresValidDuiAndPastIsoDate() {
        assertEquals(emptyMap<String, String>(), LinkRules.errors(dui, "1990-01-01", today))
        assertTrue("dui" in LinkRules.errors("10000001-8", "1990-01-01", today))
        assertTrue("birth" in LinkRules.errors(dui, "01/01/1990", today))
        assertTrue("birth" in LinkRules.errors(dui, "1990-02-30", today))
        assertTrue("birth" in LinkRules.errors(dui, "2026-11-14", today))
    }

    @Test fun bodyCarriesFormattedDuiAndDate() {
        val body = LinkRules.body("100000019", " 1990-01-01 ")
        assertEquals("10000001-9", body.getString("dui"))
        assertEquals("1990-01-01", body.getString("birth"))
        assertEquals(LinkStatus.PENDING, LinkRules.statusOf("pendiente"))
        assertEquals(LinkStatus.REJECTED, LinkRules.statusOf("rechazada"))
    }

    @Test fun resolutionEventsRefreshTheProfile() {
        val resolved = EventoDominio("vinculacion.resuelta", "vinculacion_paciente", "v1", 2)
        assertTrue(LinkEvents.matches(resolved) && LinkEvents.resolved(resolved))
        assertFalse(LinkEvents.resolved(EventoDominio("vinculacion.solicitada", "vinculacion_paciente", "v1", 1)))
        assertTrue(ProfileEvents.matches(resolved))
        assertFalse(ProfileEvents.matches(EventoDominio("vinculacion.solicitada", "vinculacion_paciente", "v1", 1)))
    }

    @Test fun historyParserKeepsOnlyWhatTheApiSent() {
        val json = JSONObject().put("patient", JSONObject().put("fullName", "Paciente Ficticio").put("record", "000412-7")).put("access", "propio")
            .put("consultations", JSONArray().put(JSONObject().put("id", "c1").put("state", "firmada").put("startedAt", "2026-11-10T15:00:00Z").put("signedAt", "2026-11-10T15:30:00Z")
                .put("reason", "Fiebre").put("plan", JSONObject.NULL).put("doctor", JSONObject().put("name", "Médica Ficticia"))
                .put("diagnoses", JSONArray().put(JSONObject().put("code", "J06.9").put("description", "Infección aguda").put("principal", true)))
                .put("prescriptions", JSONArray().put(JSONObject().put("items", JSONArray().put(JSONObject().put("medication", "Paracetamol").put("dose", "500 mg").put("route", "oral").put("frequency", "c/8 h").put("duration", "3 días")))))))
            .put("laboratory", JSONArray().put(JSONObject().put("id", "o1").put("state", "completado").put("priority", "rutina").put("reviewedAt", JSONObject.NULL)
                .put("items", JSONArray().put(JSONObject().put("id", "i1").put("code", "HB").put("name", "Hemoglobina").put("result", JSONObject.NULL)))))
            .put("admissions", JSONArray())
        val history = ClinicalHistoryParser.parse(json)!!
        assertEquals("propio", history.access)
        val consultation = history.consultations.single()
        assertEquals("2026-11-10", consultation.date)
        assertEquals("", consultation.plan)
        assertEquals("J06.9", consultation.diagnoses.single().code)
        assertEquals("Paracetamol", consultation.prescriptions.single().medication)
        val order = history.laboratory.single()
        assertFalse(order.reviewed)
        assertNull(order.items.single().result)
        assertNull(ClinicalHistoryParser.parse(JSONArray()))
    }
}
