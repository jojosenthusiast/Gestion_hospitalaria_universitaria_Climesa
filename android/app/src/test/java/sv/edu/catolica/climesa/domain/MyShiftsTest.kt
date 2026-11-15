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

    // ASIS-01: la entrada solo se ofrece cuando la API la incluye en allowedActions; nunca se muestra un código crudo.
    @Test fun checkInFollowsAllowedActionsAndAttendanceIsSpanish() {
        val rows = JSONArray()
            .put(JSONObject().put("id", "t-1").put("version", 3).put("area", "Consulta").put("start", "2026-11-13T14:00:00Z").put("end", "2026-11-13T20:00:00Z")
                .put("state", "en_curso").put("attendance", "sin_confirmar").put("late", false).put("allowedActions", JSONArray().put("marcar_entrada")))
            .put(JSONObject().put("id", "t-2").put("version", 1).put("area", "Consulta").put("start", "2026-11-14T14:00:00Z").put("end", "2026-11-14T20:00:00Z")
                .put("state", "completado").put("attendance", "presente").put("late", true).put("allowedActions", JSONArray()))
        val (open, done) = MyShifts.parse(rows)
        assertTrue(open.canCheckIn)
        assertEquals(false, done.canCheckIn)
        assertEquals("Sin entrada marcada", MyShifts.attendanceLabel(open))
        assertEquals("Entrada marcada · tarde", MyShifts.attendanceLabel(done))
        assertEquals(3, MyShifts.checkInBody(open).getInt("version"))
        assertEquals("En curso", StaffLabels.shiftState("en_curso"))
        assertEquals("Ausente", StaffLabels.shiftState("ausente"))
    }

    @Test fun refusedCheckInIsExplainedByCode() {
        assertEquals("Ya marcaste la entrada de este turno.", MyShifts.checkInError("asistencia_ya_marcada", 409, "x"))
        assertEquals("Solo puedes marcar la entrada de tus propios turnos.", MyShifts.checkInError("turno_ajeno", 403, "x"))
        assertEquals("No se pudo marcar la entrada. Intenta de nuevo.", MyShifts.checkInError(null, null, null))
    }
}
