package sv.edu.catolica.climesa.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class HospitalizationRulesTest {
    @Test fun eachActionNeedsItsPermissionAndState() {
        val nurse = listOf("admision.ver", "admision.registrar_salida")
        assertTrue(HospitalizationRules.actions("hospitalizado", nurse).isEmpty())
        assertEquals(setOf(AdmissionAction.REGISTER_EXIT), HospitalizationRules.actions("alta_firmada", nurse))
        assertEquals(setOf(AdmissionAction.SIGN_DISCHARGE), HospitalizationRules.actions("hospitalizado", listOf("alta.firmar")))
        assertEquals(setOf(AdmissionAction.ASSIGN_BED), HospitalizationRules.actions("pendiente_cama", listOf("camas.asignar")))
        assertTrue(HospitalizationRules.actions("pendiente_cama", listOf("alta.firmar")).isEmpty())
    }

    @Test fun dischargeNeedsAWrittenSummary() {
        assertNotNull(HospitalizationRules.dischargeError(DischargeType.MEDICAL, "corto", emptyList(), false))
        assertNull(HospitalizationRules.dischargeError(DischargeType.MEDICAL, "Evolución favorable, sin fiebre.", emptyList(), false))
    }

    @Test fun eachPendingNeedsDescriptionAndResponsible() {
        val summary = "Evolución favorable, sin fiebre."
        assertNotNull(HospitalizationRules.dischargeError(DischargeType.MEDICAL, summary, listOf(DischargePending("Control en 7 días", "")), false))
        assertNull(HospitalizationRules.dischargeError(DischargeType.MEDICAL, summary, listOf(DischargePending("Control en 7 días", "Dra. López")), false))
        assertNull("an empty row is ignored", HospitalizationRules.dischargeError(DischargeType.MEDICAL, summary, listOf(DischargePending()), false))
    }

    @Test fun voluntaryDischargeNeedsConsent() {
        val summary = "Paciente solicita el alta voluntaria."
        assertNotNull(HospitalizationRules.dischargeError(DischargeType.VOLUNTARY, summary, emptyList(), false))
        assertNull(HospitalizationRules.dischargeError(DischargeType.VOLUNTARY, summary, emptyList(), true))
    }

    @Test fun dischargeBodyCarriesTheTypedTextAndTheAdmissionVersion() {
        val body = HospitalizationRules.dischargeBody(6, DischargeType.MEDICAL, "  Evolución favorable.  ", listOf(DischargePending("Control", "Dra. López"), DischargePending()), false)
        assertEquals("medica", body.getString("type"))
        assertEquals("Evolución favorable.", body.getString("summary"))
        assertEquals(1, body.getJSONArray("pending").length())
        assertEquals("Control", body.getJSONArray("pending").getJSONObject(0).getString("description"))
        assertEquals("Dra. López", body.getJSONArray("pending").getJSONObject(0).getString("responsible"))
        assertEquals(6, body.getInt("version"))
        assertFalse(body.has("voluntaryConsent"))
    }

    @Test fun assignReasonIsOptionalButValidatedWhenWritten() {
        assertNull(HospitalizationRules.assignReasonError(""))
        assertNotNull(HospitalizationRules.assignReasonError("corto"))
        val body = HospitalizationRules.assignBody("b1", 7, "")
        assertEquals(7, body.getInt("version"))
        assertFalse(body.has("reason"))
        assertEquals("Cama aislada por indicación", HospitalizationRules.assignBody("b1", 7, " Cama aislada por indicación ").getString("reason"))
    }

    @Test fun exitNeedsAReasonAndSendsTheAdmissionVersion() {
        assertNotNull(HospitalizationRules.exitReasonError(""))
        val body = HospitalizationRules.exitBody(3, "Egreso con familiar responsable")
        assertEquals(3, body.getInt("version"))
        assertEquals("Egreso con familiar responsable", body.getString("reason"))
    }
}
