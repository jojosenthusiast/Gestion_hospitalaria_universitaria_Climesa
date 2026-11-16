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

    // ASIS-01: la entrada se confirma sola al inicio; la app no ofrece marcarla y nunca muestra un código crudo.
    @Test fun attendanceIsAutomaticAndSpanish() {
        val rows = JSONArray()
            .put(JSONObject().put("id", "t-1").put("version", 3).put("area", "Consulta").put("start", "2026-11-13T14:00:00Z").put("end", "2026-11-13T20:00:00Z")
                .put("state", "en_curso").put("attendance", "presente").put("late", false).put("allowedActions", JSONArray()))
            .put(JSONObject().put("id", "t-2").put("version", 1).put("area", "Consulta").put("start", "2026-11-14T14:00:00Z").put("end", "2026-11-14T20:00:00Z")
                .put("state", "completado").put("attendance", "presente").put("late", true).put("allowedActions", JSONArray()))
            .put(JSONObject().put("id", "t-3").put("version", 1).put("area", "Consulta").put("start", "2026-11-15T14:00:00Z").put("end", "2026-11-15T20:00:00Z")
                .put("state", "publicado").put("attendance", "pendiente").put("late", false).put("allowedActions", JSONArray()))
        val (open, late, next) = MyShifts.parse(rows)
        assertEquals("Entrada confirmada", MyShifts.attendanceLabel(open))
        assertEquals("Entrada corregida · llegó tarde", MyShifts.attendanceLabel(late))
        assertEquals("Se confirma sola al iniciar", MyShifts.attendanceLabel(next))
        assertEquals("Sin registro de entrada", MyShifts.attendanceLabel(next.copy(attendance = "sin_registro")))
        assertEquals("En curso", StaffLabels.shiftState("en_curso"))
        assertEquals("Ausente", StaffLabels.shiftState("ausente"))
    }

    // Obs. orden: "mis turnos" agrupa por el día asignado (el día en que empieza) con Hoy / Mañana / día y fecha.
    @Test fun groupsByAssignedDayInStartOrder() {
        val row = { id: String, start: String, end: String, type: String -> JSONObject().put("id", id).put("area", "Emergencia").put("start", start).put("end", end).put("type", type).put("state", "publicado") }
        val rows = JSONArray()
            .put(row("tarde", "2026-11-12T21:00:00Z", "2026-11-13T03:00:00Z", "diurno"))
            .put(row("guardia", "2026-11-10T13:00:00Z", "2026-11-11T13:00:00Z", "guardia"))
            .put(row("manana", "2026-11-11T14:00:00Z", "2026-11-11T20:00:00Z", "diurno"))
            .put(row("temprano", "2026-11-12T13:00:00Z", "2026-11-12T19:00:00Z", "diurno"))
        val days = MyShifts.byDay(MyShifts.parse(rows), java.time.LocalDate.of(2026, 11, 10))
        assertEquals(listOf("Hoy · martes, 10 de noviembre", "Mañana · miércoles, 11 de noviembre", "Jueves, 12 de noviembre"), days.map { it.title })
        assertEquals(listOf(listOf("guardia"), listOf("manana"), listOf("temprano", "tarde")), days.map { d -> d.shifts.map { it.id } })
        assertEquals("07:00 a 07:00 del día siguiente · Guardia 24 h", days[0].shifts[0].hours)
        assertEquals("15:00 a 21:00", days[2].shifts[1].hours)
    }

    @Test fun shiftsWithoutDateGoLastAndNeverThrow() {
        val rows = JSONArray()
            .put(JSONObject().put("id", "x").put("area", "Planta").put("start", JSONObject.NULL).put("state", "publicado"))
            .put(JSONObject().put("id", "y").put("area", "Planta").put("start", "2026-11-12T13:00:00Z").put("end", "2026-11-12T19:00:00Z").put("state", "publicado"))
        val days = MyShifts.byDay(MyShifts.parse(rows), java.time.LocalDate.of(2026, 11, 10))
        assertEquals(listOf("Jueves, 12 de noviembre", "Sin fecha"), days.map { it.title })
        assertEquals(MyShifts.MISSING_TIME, days[1].shifts[0].hours)
    }

    // "Mis turnos" abre en hoy: hoy, un turno de noche que sigue en curso y lo que viene primero; lo anterior debajo.
    @Test fun opensAtTodayWithPastDaysBelow() {
        val row = { id: String, start: String, end: String -> JSONObject().put("id", id).put("area", "Emergencia").put("start", start).put("end", end).put("type", "diurno").put("state", "publicado") }
        val rows = JSONArray()
            .put(row("martes", "2026-11-10T13:00:00Z", "2026-11-10T21:00:00Z"))
            .put(row("noche", "2026-11-12T04:00:00Z", "2026-11-12T16:00:00Z"))
            .put(row("hoy", "2026-11-12T21:00:00Z", "2026-11-13T03:00:00Z"))
            .put(row("viernes", "2026-11-13T13:00:00Z", "2026-11-13T21:00:00Z"))
            .put(row("lunes", "2026-11-09T13:00:00Z", "2026-11-09T21:00:00Z"))
        val days = MyShifts.byDay(MyShifts.parse(rows), java.time.LocalDate.of(2026, 11, 12), java.time.Instant.parse("2026-11-12T14:00:00Z"))
        assertEquals(listOf(listOf("noche"), listOf("hoy"), listOf("viernes"), listOf("martes"), listOf("lunes")), days.map { d -> d.shifts.map { it.id } })
        assertEquals(listOf(false, false, false, true, true), days.map { it.past })
        assertEquals("Ayer · miércoles, 11 de noviembre", days[0].title)
    }
}
