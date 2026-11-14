package sv.edu.catolica.climesa.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AdmissionIndicationTest {
    private val context = IndicationContext("p1", "Ana", "c1", "s1", "Dra. Prueba")
    private val ready = IndicationDraft(motive = "Dolor abdominal con fiebre", category = "vip")

    @Test fun theLockedContextComesFromTheConsultation() {
        val body = AdmissionIndication.body(context, ready)!!
        assertEquals("consulta", body.getString("origin"))
        assertEquals("c1", body.getString("originId"))
        assertEquals("s1", body.getString("attendingDoctorId"))
        assertEquals("p1", body.getString("patientId"))
        assertFalse(body.has("isolationType"))
    }

    @Test fun aMissingContextNeverSendsANullOrEmptyId() {
        assertNull(AdmissionIndication.body(context.copy(doctorStaffId = null), ready))
        assertTrue(AdmissionIndication.contextError(context.copy(doctorStaffId = null))!!.contains("vinculada"))
        assertNull(AdmissionIndication.body(context.copy(consultationId = null), ready))
        assertNull(AdmissionIndication.body(context.copy(patientId = ""), ready))
    }

    @Test fun fieldsAreValidatedWithSpanishMessagesKeyedLikeTheApi() {
        val errors = AdmissionIndication.fieldErrors(IndicationDraft(motive = "corto", isolationType = IsolationType.AIRBORNE))
        assertEquals(setOf("motive", "requestedCategory", "isolationType"), errors.keys)
        assertNotNull(errors["motive"])
        assertEquals("26/500", AdmissionIndication.motiveCounter(ready.motive))
    }
}
