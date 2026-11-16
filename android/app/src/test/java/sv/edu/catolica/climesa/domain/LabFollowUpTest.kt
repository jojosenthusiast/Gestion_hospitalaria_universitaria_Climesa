package sv.edu.catolica.climesa.domain

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Fase 2, flujo C (S10): external orders, the doctor's "Resultados por revisar" inbox and the grouped worklist. */
class LabFollowUpTest {
    private fun row(state: String, extra: JSONObject.() -> Unit = {}) = JSONObject().put("id", "o-$state").put("patientName", "Paciente Ficticia").put("priority", "rutina")
        .put("state", state).put("version", 2).put("items", JSONArray()).put("reviewedAt", JSONObject.NULL).apply(extra)

    @Test fun parsesExternalFieldsObservationAndResultType() {
        val item = JSONObject().put("id", "i1").put("code", "HB").put("name", "Hemoglobina").put("unit", "g/dL").put("resultType", "numerico")
            .put("result", JSONObject().put("value", 13.4).put("mark", "normal").put("version", 1).put("observation", "Muestra hemolizada").put("relevant", true))
        val order = LaboratoryParser.orders(JSONArray().put(row("pendiente") {
            put("external", true).put("externalPlace", "Clínica Ficticia").put("externalInstructions", "Sin ayuno. Traiga su DUI.")
            put("externalActions", JSONArray().put("cargar_externo")).put("items", JSONArray().put(item))
        })).single()
        assertTrue(order.external)
        assertEquals("Clínica Ficticia", order.externalPlace)
        assertEquals("Sin ayuno. Traiga su DUI.", order.externalInstructions)
        assertTrue(order.allowsExternal(LabExternalAction.LOAD_RESULT))
        assertFalse(order.allowsExternal(LabExternalAction.SEND))
        assertEquals("numerico", order.items.single().resultType)
        assertEquals("Muestra hemolizada", order.items.single().result?.observation)
        assertTrue(order.items.single().result?.relevant == true)
    }

    @Test fun theLabObservationIsStaffOnly() {
        val result = LaboratoryResult(13.4, null, "normal", 1, observation = "Muestra hemolizada", relevant = true)
        assertEquals("Muestra hemolizada", LabFollowUpRules.labNote(result, ownView = false))
        assertNull(LabFollowUpRules.labNote(result, ownView = true))
        assertNull(LabFollowUpRules.labNote(result.copy(observation = null), ownView = false))
    }

    @Test fun olderRowsWithoutExternalFieldsStillParse() {
        val order = LaboratoryParser.orders(JSONArray().put(row("pendiente"))).single()
        assertFalse(order.external)
        assertNull(order.externalPlace)
        assertTrue(order.externalActions.isEmpty())
    }

    @Test fun externalPendingOrderTellsWhereToGo() {
        val order = LaboratoryParser.orders(JSONArray().put(row("pendiente") { put("external", true).put("externalPlace", "Clínica Ficticia") })).single()
        assertEquals("Hazte el examen en Clínica Ficticia y trae el informe.", LabFlow.nextStep(order, ownView = true))
        assertEquals("Siguiente: el paciente se hace el examen en Clínica Ficticia; luego se carga el informe.", LabFlow.nextStep(order))
    }

    @Test fun sendToExternalNeedsPlaceAndInstructions() {
        assertNotNull(LabExternalRules.sendError("ab", "Instrucciones suficientes"))
        assertNotNull(LabExternalRules.sendError("Clínica Ficticia", "corto"))
        assertNull(LabExternalRules.sendError("Clínica Ficticia", "Sin ayuno. Traiga su DUI."))
        val body = LabExternalRules.sendBody(3, "  Clínica Ficticia ", " Sin ayuno. Traiga su DUI. ")
        assertEquals(3, body.getInt("version"))
        assertEquals("Clínica Ficticia", body.getString("place"))
        assertEquals("Sin ayuno. Traiga su DUI.", body.getString("instructions"))
        assertEquals("/laboratorio/ordenes/o1/externa", LabExternalRules.sendPath("o1"))
    }

    @Test fun attachmentMustBePdfOrPhotoUpToTenMegabytes() {
        assertNotNull(LabExternalRules.attachmentError(null))
        assertNotNull(LabExternalRules.attachmentError(LabAttachment("a.zip", "application/zip", 10)))
        assertNotNull(LabExternalRules.attachmentError(LabAttachment("a.pdf", "application/pdf", 11L * 1024 * 1024)))
        assertNull(LabExternalRules.attachmentError(LabAttachment("a.jpg", "image/jpeg", 2048)))
    }

    @Test fun externalResultNeedsAValuePerExamAndSendsValueOrText() {
        val items = listOf(LaboratoryItem("i1", "HB", "Hemoglobina", null, "g/dL", "numerico"), LaboratoryItem("i2", "ORI", "Examen de orina", null, null, "texto"))
        assertNotNull(LabExternalRules.valuesError(items, mapOf("i1" to "12.9")))
        assertNotNull(LabExternalRules.valuesError(items, mapOf("i1" to "doce", "i2" to "Normal")))
        assertNull(LabExternalRules.valuesError(items, mapOf("i1" to "12,9", "i2" to "Normal")))
        val body = LabExternalRules.resultBody(4, LabAttachment("informe.pdf", "application/pdf", 17, "a".repeat(64)), items, mapOf("i1" to "12,9", "i2" to " Normal "), " ")
        assertEquals(4, body.getInt("version"))
        assertEquals("informe.pdf", body.getJSONObject("attachment").getString("fileName"))
        assertEquals("a".repeat(64), body.getJSONObject("attachment").getString("sha256"))
        assertEquals(12.9, body.getJSONArray("results").getJSONObject(0).getDouble("value"), 0.0)
        assertEquals("Normal", body.getJSONArray("results").getJSONObject(1).getString("text"))
        assertFalse(body.has("note"))
    }

    @Test fun parsesTheDoctorInboxCriticalFirst() {
        val rows = JSONArray()
            .put(JSONObject().put("id", "f1").put("orderId", "o1").put("patientName", "Paciente Uno").put("reason", "observacion").put("detail", "Hemoglobina: Normal · hemolizada").put("version", 1).put("createdAt", "2026-11-15T15:00:00Z"))
            .put(JSONObject().put("id", "f2").put("orderId", "o2").put("patientName", "Paciente Dos").put("reason", "critico").put("detail", "Potasio: Crítico alto").put("version", 3).put("createdAt", "2026-11-15T16:00:00Z"))
        val items = LabFollowUpRules.parse(rows)
        assertEquals(listOf("f2", "f1"), items.map { it.id })
        assertTrue(items.first().critical)
        assertEquals("/laboratorio/pendientes/f2/revisar", LabFollowUpRules.reviewPath("f2"))
        assertEquals(3, LabFollowUpRules.reviewBody(3).getInt("version"))
    }

    @Test fun groupsTheWorklistByWhatComesNext() {
        val orders = LaboratoryParser.orders(JSONArray().put(row("completado") { put("reviewedAt", "2026-11-15T15:00:00Z") }).put(row("pendiente") { put("external", true) }).put(row("en_proceso")))
        val groups = LabGroups.group(orders)
        assertEquals(listOf(LabGroup.IN_PROCESS, LabGroup.EXTERNAL, LabGroup.RELEASED), groups.map { it.first })
        assertTrue(LabGroup.RELEASED.folded)
        assertFalse(LabGroup.IN_PROCESS.folded)
    }
}
