package sv.edu.catolica.climesa.domain

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ShiftFiltersTest {
    private fun shift(id: String, staff: String, area: String, state: String) =
        PlannedShift(id, staff, "Persona $staff", "a-$area", area, "2026-11-16T14:00:00Z", "2026-11-16T22:00:00Z", "diurno", state, null, 1)

    private val shifts = listOf(
        shift("1", "m1", "Consulta", "publicado"),
        shift("2", "e1", "Hospitalización", "borrador"),
        shift("3", "m1", "Hospitalización", "publicado"),
    )
    private val types = mapOf("m1" to "medico", "e1" to "enfermero")

    @Test fun sinFiltrosSeVeTodo() {
        assertFalse(ShiftFilter().active)
        assertEquals(3, ShiftFilters.apply(shifts, ShiftFilter(), types).size)
    }

    @Test fun losTresFiltrosSeCombinan() {
        assertEquals(listOf("3"), ShiftFilters.apply(shifts, ShiftFilter("publicado", "a-Hospitalización", "medico"), types).map { it.id })
        assertEquals(listOf("2"), ShiftFilters.apply(shifts, ShiftFilter(role = "enfermero"), types).map { it.id })
        assertTrue(ShiftFilters.apply(shifts, ShiftFilter("cancelado"), types).isEmpty())
    }

    @Test fun lasOpcionesSalenDeLosTurnosYSiempreIncluyenTodos() {
        assertEquals(listOf(FILTER_ALL, "a-Consulta", "a-Hospitalización"), ShiftFilters.areaOptions(shifts).map { it.first })
        assertEquals("Todas las áreas", ShiftFilters.areaOptions(shifts).first().second)
        assertEquals(listOf(FILTER_ALL, "enfermero", "medico"), ShiftFilters.roleOptions(shifts, types).map { it.first })
        assertEquals("Todos", ShiftFilters.stateOptions().first().second)
    }

    @Test fun sinListaDePersonalElFiltroDeRolSoloOfreceTodos() {
        assertEquals(listOf(FILTER_ALL), ShiftFilters.roleOptions(shifts, emptyMap()).map { it.first })
    }

    @Test fun elTipoDelPersonalSaleDeLaListaDePersonal() {
        val rows = JSONArray().put(JSONObject().put("id", "m1").put("type", "medico")).put(JSONObject().put("id", "e1").put("type", "enfermero"))
        assertEquals(types, ShiftFilters.staffTypes(rows))
    }
}
