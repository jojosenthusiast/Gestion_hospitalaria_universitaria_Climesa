package sv.edu.catolica.climesa.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class DraftRulesTest {
    @Test fun onlyChangesAgainstWhatTheApiHasCountAsDirty() {
        assertFalse(DraftRules.isDirty(mapOf("plan" to "Reposo", "dose" to "", "principal" to false), mapOf("plan" to "Reposo")))
        assertTrue(DraftRules.isDirty(mapOf("plan" to "Reposo y líquidos"), mapOf("plan" to "Reposo")))
        assertTrue(DraftRules.isDirty(mapOf("dose" to "500 mg")))
        assertTrue(DraftRules.isDirty(mapOf("principal" to true)))
    }

    @Test fun leavingAsksOnlyWhenChangesWereNotKeptLocally() {
        assertFalse(DraftRules.mustConfirmLeave(dirty = true, status = DraftStatus.SAVED))
        assertTrue(DraftRules.mustConfirmLeave(dirty = true, status = DraftStatus.NOT_SAVED))
        assertFalse(DraftRules.mustConfirmLeave(dirty = false, status = DraftStatus.NOT_SAVED))
    }

    @Test fun vitalsDraftRoundTripsAndAnEmptyFormIsNoDraft() {
        val form = VitalsForm(mapOf(VitalMeasure.TEMPERATURE to "38.2"), "Paciente con escalofríos")
        assertEquals(form, FormDrafts.vitals(FormDrafts.vitals(form)))
        assertNull(FormDrafts.vitals(FormDrafts.vitals(VitalsForm())))
    }

    @Test fun prehospitalDraftBelongsToItsService() {
        val form = PrehospitalForm(reason = "Caída", priority = "roja", heartRate = "120")
        val json = FormDrafts.prehospital("s1", form)
        assertEquals(form, FormDrafts.prehospital(json, "s1"))
        assertNull(FormDrafts.prehospital(json, "s2"))
        assertTrue(FormDrafts.isEmpty(PrehospitalForm(priority = "verde")))
    }
}
