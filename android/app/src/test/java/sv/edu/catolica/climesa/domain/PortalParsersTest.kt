package sv.edu.catolica.climesa.domain

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class PortalParsersTest {
    @Test fun readsTheBedSummaryOfHome() {
        assertEquals(BedSummary(3, 20), PortalParsers.bedSummary(JSONObject().put("beds", JSONObject().put("free", 3).put("total", 20))))
        assertNull(PortalParsers.bedSummary(JSONObject()))
        assertNull(PortalParsers.bedSummary(JSONArray()))
    }

    @Test fun readsPatientRowsAndSkipsMalformedOnes() {
        val rows = JSONArray().put(JSONObject().put("fullName", "Paciente Ficticio").put("record", "EXP-001")).put("no es objeto")
        assertEquals(listOf(PatientHit("Paciente Ficticio", "EXP-001")), PortalParsers.patients(rows))
        assertTrue(PortalParsers.patients(null).isEmpty())
    }

    @Test fun readsTheUnitWithAndWithoutService() {
        val idle = JSONObject().put("unit", JSONObject().put("plate", "P-000-001").put("state", "disponible").put("version", 4)).put("paramedicOnDuty", true)
        val unit = PortalParsers.unit(idle)!!
        assertEquals("P-000-001", unit.plate); assertEquals(4, unit.version); assertTrue(unit.paramedicOnDuty); assertFalse(unit.hasService)
        val busy = PortalParsers.unit(JSONObject(idle.toString()).put("activeService", JSONObject().put("origin", "Colonia").put("destination", "Emergencia")))!!
        assertTrue(busy.hasService); assertEquals("Colonia", busy.serviceOrigin)
        assertNull(PortalParsers.unit(JSONObject()))
    }

    @Test fun readsTheDriverOnDutyAndToleratesOldServers() {
        val idle = JSONObject().put("unit", JSONObject().put("plate", "P-000-001").put("state", "disponible").put("version", 4)).put("paramedicOnDuty", true)
        assertTrue(PortalParsers.unit(idle)!!.driverOnDuty)
        assertFalse(PortalParsers.unit(JSONObject(idle.toString()).put("driverOnDuty", false))!!.driverOnDuty)
    }

    @Test fun aShiftWithMalformedDatesOpensWithEmptyFieldsInsteadOfCrashing() {
        val shift = PlannedShift("t1", "p1", "Persona", "a1", "Área", "no-es-fecha", "", "ordinario", "borrador", null, 1)
        val form = ShiftPlanning.formOf(shift)
        assertEquals("", form.startDate)
        assertEquals("", form.endTime)
    }
}
