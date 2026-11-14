package sv.edu.catolica.climesa.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ShiftAssignmentTest {
    private fun person(id: String = "p", type: String = "medico", areaId: String? = null, valid: List<Pair<String, String>> = listOf("2026-01-01" to "2026-12-31")) =
        CatalogStaff(id, "Persona $id", type, null, areaId, null, valid)

    private fun shift(start: String, end: String, type: String = "diurno", state: String = "publicado", staff: String = "p") =
        PlannedShift("t-$start", staff, "Persona", "a", "A", start, end, type, state, null, 1)

    @Test fun elFinNoPosteriorAlInicioCruzaLaMedianoche() {
        val (start, end) = ShiftAssignment.window("2026-11-20", "19:00", "07:00")!!
        assertEquals("2026-11-21", end.toLocalDate().toString())
        assertEquals(12.0, ShiftAssignment.hours(start, end), 0.001)
        assertNull(ShiftAssignment.window("2026-11-20", "7:00", "15:00"))
    }

    @Test fun reglaDeCuatroAVeinticuatroHoras() {
        val (s, e3) = ShiftAssignment.window("2026-11-20", "07:00", "10:00")!!
        assertTrue(ShiftAssignment.durationProblem(s, e3, "diurno")!!.contains("de 4 a 12 horas"))
        val (_, e8) = ShiftAssignment.window("2026-11-20", "07:00", "15:00")!!
        assertNull(ShiftAssignment.durationProblem(s, e8, "diurno"))
        val (_, e24) = ShiftAssignment.window("2026-11-20", "07:00", "07:00")!!
        assertNull(ShiftAssignment.durationProblem(s, e24, "guardia"))
        assertEquals("guardia", ShiftAssignment.suggestKind(s, e24))
        val (n, nEnd) = ShiftAssignment.window("2026-11-20", "19:00", "07:00")!!
        assertEquals("nocturno", ShiftAssignment.suggestKind(n, nEnd))
    }

    @Test fun detectaTraslapeDescansoEInscripcionVencida() {
        val (start, end) = ShiftAssignment.window("2026-11-20", "09:00", "17:00")!!
        val overlap = shift("2026-11-20T14:00:00Z", "2026-11-20T22:00:00Z")
        assertTrue(ShiftAssignment.conflicts(person(), start, end, "diurno", listOf(overlap)).any { it.code == "traslape" })
        val night = shift("2026-11-20T00:00:00Z", "2026-11-20T12:00:00Z", "nocturno")
        assertTrue(ShiftAssignment.conflicts(person(), start, end, "diurno", listOf(night)).any { it.code == "descanso" })
        assertEquals(listOf("inscripcion"), ShiftAssignment.conflicts(person(valid = emptyList()), start, end, "diurno", emptyList()).map { it.code })
        assertTrue(ShiftAssignment.conflicts(person(type = "asistente", valid = emptyList()), start, end, "diurno", emptyList()).isEmpty())
        assertTrue(ShiftAssignment.conflicts(person(), start, end, "diurno", listOf(overlap.copy(state = "cancelado"))).isEmpty())
        assertTrue(ShiftAssignment.conflicts(person(), start, end, "diurno", listOf(overlap), ignoreId = overlap.id).isEmpty())
    }

    @Test fun elPersonalElegibleIncluyeElAreaSusContenedoresYAQuienNoTieneArea() {
        val catalog = ShiftCatalog(
            areas = listOf(CatalogArea("h", null, "hospital", "H", "Hospital"), CatalogArea("a", "h", "area", "A", "A"), CatalogArea("b", "h", "area", "B", "B")),
            staff = listOf(person("1", areaId = "a"), person("2", areaId = "b"), person("3", areaId = "h"), person("4"), person("5", type = "enfermero", areaId = "a")),
        )
        assertEquals(listOf("1", "3", "4", "5"), ShiftAssignment.eligible(catalog, "a", FILTER_ALL, false).map { it.id })
        assertEquals(listOf("5"), ShiftAssignment.eligible(catalog, "a", "enfermero", false).map { it.id })
        assertEquals(5, ShiftAssignment.eligible(catalog, "a", FILTER_ALL, true).size)
    }

    @Test fun laBusquedaNoDistingueTildesNiMayusculas() {
        assertTrue(ShiftAssignment.matches("maria", "María Ficticia"))
        assertTrue(ShiftAssignment.matches("ÁNGEL", "angel prueba"))
        assertTrue(!ShiftAssignment.matches("zzz", "María"))
        assertNotNull(ShiftCatalogs.fallback(emptyList()))
    }
}
