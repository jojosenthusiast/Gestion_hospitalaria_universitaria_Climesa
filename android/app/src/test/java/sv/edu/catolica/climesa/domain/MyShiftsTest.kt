package sv.edu.catolica.climesa.domain

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class MyShiftsTest {
    @Test fun formatsUtcInstantsInElSalvadorTime() {
        assertEquals("13/11/2026 08:00", MyShifts.formatInstant("2026-11-13T14:00:00Z"))
    }

    @Test fun acceptsOffsetTimestamps() {
        assertEquals("13/11/2026 08:00", MyShifts.formatInstant("2026-11-13T08:00:00-06:00"))
    }

    @Test fun malformedOrMissingTimesNeverThrow() {
        assertEquals("mañana", MyShifts.formatInstant("mañana"))
        assertEquals(MyShifts.MISSING_TIME, MyShifts.formatInstant(null))
        assertEquals(MyShifts.MISSING_TIME, MyShifts.formatInstant(""))
    }

    @Test fun parsesRowsWithNullOrMissingDates() {
        val rows = JSONArray()
            .put(JSONObject().put("area", "Consulta").put("start", "2026-11-13T14:00:00Z").put("end", "2026-11-13T20:00:00Z").put("state", "publicado"))
            .put(JSONObject().put("area", "Planta").put("start", JSONObject.NULL).put("state", "publicado"))
        val shifts = MyShifts.parse(rows)
        assertEquals(2, shifts.size)
        assertEquals("13/11/2026 08:00 — 13/11/2026 14:00", shifts[0].period)
        assertEquals("${MyShifts.MISSING_TIME} — ${MyShifts.MISSING_TIME}", shifts[1].period)
    }

    @Test fun nonArrayPayloadIsEmpty() {
        assertTrue(MyShifts.parse(JSONObject()).isEmpty())
        assertTrue(MyShifts.parse(null).isEmpty())
    }
}
