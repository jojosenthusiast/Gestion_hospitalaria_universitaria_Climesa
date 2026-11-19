package sv.edu.catolica.climesa.domain

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AccountLinkingTest {
    private fun mine(linked: Boolean, email: String?, verified: Boolean) =
        JSONObject().put("linked", linked).put("email", email ?: JSONObject.NULL).put("emailVerified", verified).put("request", JSONObject.NULL)

    @Test fun statusFollowsLinkedAndVerifiedEmail() {
        val notVerified = LinkStatusRules.parse(mine(false, "ana@example.test", false))
        assertEquals(MyLink(false, "ana@example.test", false), notVerified)
        assertEquals(LinkStatus.EMAIL_NOT_VERIFIED, LinkStatusRules.status(notVerified, profileLinked = false))
        assertEquals(LinkStatus.NOT_LINKED, LinkStatusRules.status(LinkStatusRules.parse(mine(false, "ana@example.test", true)), false))
        assertEquals(LinkStatus.LINKED, LinkStatusRules.status(LinkStatusRules.parse(mine(true, "ana@example.test", true)), false))
        assertEquals(LinkStatus.LINKED, LinkStatusRules.status(notVerified, profileLinked = true))
        assertNull(LinkStatusRules.parse(mine(false, null, false)).email)
    }

    @Test fun recordEmailConflictsKeepTheApiTextAndOtherCodesAreIgnored() {
        val inUse = "Ese correo ya está en el expediente activo 0000002-5. Cada correo puede estar en un solo expediente activo: revisa si es la misma persona o usa otro correo."
        assertEquals(inUse, PatientEmail.conflict("correo_en_uso", inUse))
        assertTrue(PatientEmail.conflict("correo_de_otra_cuenta", "")!!.startsWith("Ese correo es de una cuenta de la app"))
        assertNull(PatientEmail.conflict("dui_duplicado", "x"))
        assertEquals("Tu correo lo actualiza Recepción. Pídelo en ventanilla.", BusinessErrors.message("correo_lo_gestiona_recepcion"))
        assertEquals("Vinculada", PatientEmail.appAccount("vinculada"))
        assertEquals("Sin cuenta todavía", PatientEmail.appAccount("sin_cuenta"))
        assertNull(PatientEmail.appAccount(null))
    }

    @Test fun resolutionEventsRefreshTheProfile() {
        val resolved = EventoDominio("vinculacion.resuelta", "vinculacion_paciente", "v1", 2)
        assertTrue(LinkEvents.matches(resolved) && LinkEvents.resolved(resolved))
        assertTrue(LinkEvents.matches(EventoDominio("vinculacion.resuelta", "usuario", "u1", 2)))
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
