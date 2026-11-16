package sv.edu.catolica.climesa.domain

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** MA-LAB-05 (cancel parity with web) and MA-LAB-04 (critical notice for the doctor), Android side. */
class LabActionsTest {
    private fun row(id: String, state: String, actions: List<String>, amendedAt: String? = null, mark: String = "normal", reviewedAt: String? = null) = JSONObject()
        .put("id", id).put("patientName", "Ana Ejemplo").put("priority", "rutina").put("state", state).put("version", 4)
        .put("reviewedAt", reviewedAt ?: JSONObject.NULL).put("amendedAt", amendedAt ?: JSONObject.NULL).put("allowedActions", JSONArray(actions))
        .put("items", JSONArray().put(JSONObject().put("id", "i1").put("code", "GLU").put("name", "Glucosa").put("unit", "mg/dL")
            .put("result", JSONObject().put("value", 30.0).put("mark", mark).put("version", 1))))

    private fun order(state: String, reviewed: Boolean = false, actions: Set<String> = emptySet(), amended: Boolean = false, mark: String = "normal", id: String = "o") =
        LaboratoryOrder(id, "Paciente", "rutina", state, 1, listOf(LaboratoryItem("i", "GLU", "Glucosa", LaboratoryResult(1.0, null, mark, 1))), reviewed,
            allowedActions = actions, amendedAtMillis = if (amended) 1L else null)

    @Test fun parsesAllowedActionsAmendedAtAndUnit() {
        val orders = LaboratoryParser.orders(JSONArray().put(row("o1", "completado", listOf("revisar", "desconocida"), amendedAt = "2026-11-14T10:00:00Z")).put(row("o2", "pendiente", listOf("cancelar"))))
        assertEquals(setOf("revisar", "desconocida"), orders[0].allowedActions)
        assertTrue(orders[0].allows(LabOrderAction.REVIEW))
        assertFalse(orders[0].allows(LabOrderAction.CANCEL))
        assertNotNull(orders[0].amendedAtMillis)
        assertTrue(orders[1].allows(LabOrderAction.CANCEL))
        assertNull(orders[1].amendedAtMillis)
        assertEquals("mg/dL", orders[0].items.single().unit)
        assertEquals(4, orders[1].version)
    }

    @Test fun missingAllowedActionsMeansNoButtons() {
        val bare = JSONObject().put("id", "o1").put("state", "completado").put("items", JSONArray())
        val order = LaboratoryParser.orders(JSONArray().put(bare)).single()
        assertTrue(order.allowedActions.isEmpty())
        assertFalse(order.allows(LabOrderAction.REVIEW))
        assertEquals("Paciente", order.patientName)
    }

    @Test fun cancelReasonNeedsTenToFiveHundredCharacters() {
        assertNotNull(LabOrderRules.cancelReasonError("   corto   "))
        assertNotNull(LabOrderRules.cancelReasonError("x".repeat(501)))
        assertNull(LabOrderRules.cancelReasonError("  Paciente no se presentó  "))
    }

    @Test fun cancelBodyCarriesVersionAndTrimmedReason() {
        val body = LabOrderRules.cancelBody(3, "  Paciente no se presentó  ")
        assertEquals(setOf("version", "reason"), body.keys().asSequence().toSet())
        assertEquals(3, body.getInt("version"))
        assertEquals("Paciente no se presentó", body.getString("reason"))
        assertEquals("/laboratorio/ordenes/o1/cancelar", LabOrderRules.cancelPath("o1"))
    }

    @Test fun amendedOrderAsksForANewReview() {
        assertEquals("Resultado corregido: revísalo de nuevo.", LabFlow.nextStep(order("completado", amended = true)))
        assertEquals("El laboratorio corrigió un resultado; tu médico lo revisa de nuevo.", LabFlow.nextStep(order("completado", amended = true), ownView = true))
        assertTrue(LabFlow.isAmendedPendingReview(order("completado", amended = true)))
        assertFalse("reviewed again: no label", LabFlow.isAmendedPendingReview(order("completado", reviewed = true, amended = true)))
        assertTrue(LabFlow.nextStep(order("completado", reviewed = true, amended = true)).contains("Liberada"))
    }

    @Test fun criticalCountOnlyCountsCriticalOrdersTheDoctorMayReview() {
        val orders = listOf(
            order("completado", actions = setOf("revisar"), mark = "critico_alto", id = "a"),
            order("completado", actions = setOf("revisar"), mark = "critico_bajo", id = "b"),
            order("completado", actions = setOf("revisar"), mark = "alto", id = "c"),
            order("completado", actions = emptySet(), mark = "critico_alto", id = "d"),
        )
        assertEquals(2, LabCritical.pendingReview(orders))
        assertEquals(0, LabCritical.pendingReview(emptyList()))
    }

    @Test fun criticalNoticeOnlyForCriticalEventsAndReviewers() {
        val critical = EventoDominio("laboratorio.critico", "orden_laboratorio", "o1", 2)
        val other = EventoDominio("laboratorio.orden_actualizada", "orden_laboratorio", "o1", 2)
        assertTrue(LabCriticalEvents.notifies(critical, listOf("laboratorio.revisar")))
        assertFalse(LabCriticalEvents.notifies(critical, listOf("laboratorio.procesar")))
        assertFalse(LabCriticalEvents.notifies(other, listOf("laboratorio.revisar")))
        assertFalse(LabCriticalEvents.notifies(EventoDominio("laboratorio.critico", "cita", "x", 1), listOf("laboratorio.revisar")))
    }
}
