package sv.edu.catolica.climesa.domain

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

class LabOrderRulesTest {
    @Test fun parsesTheActiveCatalog() {
        val rows = JSONArray()
            .put(JSONObject().put("id", "e1").put("code", "HEM").put("name", "Hemograma").put("isPanel", true))
            .put(JSONObject().put("code", "SIN-ID"))
        assertEquals(listOf(LabExam("e1", "HEM", "Hemograma", true)), LabOrderRules.parseCatalog(rows))
    }

    @Test fun needsAConsultationAndAtLeastOneExam() {
        assertNotNull(LabOrderRules.error(null, listOf("e1")))
        assertNotNull(LabOrderRules.error("c1", emptyList()))
        assertNull(LabOrderRules.error("c1", listOf("e1")))
    }

    @Test fun bodyMatchesLabOrderDto() {
        val body = LabOrderRules.body("c1", listOf("e1", "e1", "e2"), urgent = true)
        assertEquals("c1", body.getString("consultationId"))
        assertEquals(2, body.getJSONArray("exams").length())
        assertEquals("urgente", body.getString("priority"))
        assertEquals("rutina", LabOrderRules.body("c1", listOf("e1"), urgent = false).getString("priority"))
    }
}
