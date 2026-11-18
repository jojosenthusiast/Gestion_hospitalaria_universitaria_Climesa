package sv.edu.catolica.climesa.domain

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** Laboratory audit: doctor's note, cancel reason, doctor ranges, one number format and the folded patient history. */
class LabFlowDisplayTest {
    @Test fun parsesPatientNoteCancelReasonAndRangeWithoutConsultation() {
        val row = JSONObject().put("id", "o1").put("consultationId", JSONObject.NULL).put("state", "completado").put("reviewedAt", "2026-11-14T10:00:00Z")
            .put("patientNote", "Todo en orden; control en un mes.").put("cancellationReason", JSONObject.NULL)
            .put("items", JSONArray().put(JSONObject().put("id", "i1").put("code", "HB").put("name", "Hemoglobina").put("unit", "g/dL")
                .put("result", JSONObject().put("value", 13.5).put("mark", "normal").put("version", 1))
                .put("referenceRange", JSONObject().put("min", 12).put("max", 15.5).put("criticalLow", 7).put("criticalHigh", 20))))
        val cancelled = JSONObject().put("id", "o2").put("state", "cancelado").put("cancellationReason", "Muestra hemolizada, se repite.").put("items", JSONArray())
        val (order, other) = LaboratoryParser.orders(JSONArray().put(row).put(cancelled))
        assertEquals("Todo en orden; control en un mes.", order.patientNote)
        assertEquals(LabRange(12.0, 15.5, 7.0, 20.0), order.items.single().range)
        assertEquals("12–15.5 · crítico < 7 o > 20", LaboratoryLabels.rangeText(order.items.single().range))
        assertEquals("Muestra hemolizada, se repite.", other.cancellationReason)
        assertNull(other.patientNote)
    }

    @Test fun oneNumberFormatWithUnit() {
        assertEquals("452 mil/µL", LaboratoryLabels.value(LaboratoryResult(452.0, null, "normal", 1), "mil/µL"))
        assertEquals("5.1 g/dL · Crítico bajo", LaboratoryLabels.valueAndMark(LaboratoryResult(5.1, null, "critico_bajo", 1), "g/dL"))
        assertEquals("Negativo", LaboratoryLabels.value(LaboratoryResult(null, "Negativo", "normal", 1)))
    }

    @Test fun foldsClosedResultsBeyondTheNewestThree() {
        fun order(id: String, state: String, reviewed: Boolean) = LaboratoryOrder(id, "Paciente", "rutina", state, 1, emptyList(), reviewed)
        val orders = listOf(order("p", "pendiente", false)) + (1..5).map { order("r$it", "completado", true) } + order("c", "cancelado", false)
        val (shown, folded) = LabPatientList.fold(orders)
        assertEquals(listOf("p", "r1", "r2", "r3"), shown.map { it.id })
        assertEquals(listOf("r4", "r5", "c"), folded.map { it.id })
    }
}
