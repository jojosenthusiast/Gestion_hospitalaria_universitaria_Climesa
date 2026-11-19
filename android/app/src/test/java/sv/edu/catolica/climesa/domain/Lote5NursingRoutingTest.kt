package sv.edu.catolica.climesa.domain

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant

/** Lote 5 S10: Asistencia retired into Enfermería; nurses work every floor; a richer nurse summary. */
class Lote5NursingRoutingTest {
    private val now = Instant.parse("2026-11-19T20:00:00Z")
    private val assistant = listOf("sesion.perfil", "fila.ver", "fila.llamar", "fila.gestionar", "citas.ver", "signos.registrar", "turnos.ver")
    private fun profile(roles: List<String>, permissions: List<String>) = AccessProfile(roles = roles, permissions = permissions, verifiedByBackend = true, platforms = listOf("android"))

    @Test fun asistenciaYaNoEsUnRolDeAndroid() {
        assertFalse("AST" in AndroidSections.roles)
        assertTrue(AndroidSections.visible("AST", AndroidSection.entries.map { it.permission }).isEmpty())
    }

    @Test fun unaCuentaQueAunTieneElRolAstEntraComoEnfermeria() {
        assertEquals(listOf("ENF"), RoleAccess.allowed(profile(listOf("AST"), assistant), "android"))
        assertEquals("Enfermería", RoleAccess.label("AST"))
        assertEquals(AndroidDestination.STAFF_PLACEHOLDER, profile(listOf("AST"), assistant).androidDestination())
        // AST and ENF at once is one role, not two entries in the role switcher.
        assertEquals(listOf("ENF"), RoleAccess.allowed(profile(listOf("AST", "ENF"), assistant + "admision.ver"), "android"))
    }

    @Test fun enfermeriaTieneTodoLoQueTeniaAsistencia() {
        val sections = AndroidSections.visible("ENF", assistant)
        assertTrue(AndroidSection.ASSISTANT_STATION in sections)
        assertTrue(AndroidSection.VITAL_SIGNS in sections)
        assertTrue(AndroidSection.SHIFTS in sections)
        assertTrue(QuickActions.forRole("ENF", assistant).any { it.request.action == QuickAction.CALL_NEXT })
        assertTrue(DashboardSource.QUEUE in RoleDashboard.sources("ENF", assistant))
        assertTrue(DashboardSource.MY_POST in RoleDashboard.sources("ENF", assistant))
    }

    private val beds = JSONArray()
        .put(JSONObject().put("code", "201-A").put("level", 2))
        .put(JSONObject().put("code", "202-A").put("level", 2))
        .put(JSONObject().put("code", "301-A").put("level", 3))
        .put(JSONObject().put("code", "X-1").put("level", JSONObject.NULL))
    private val admissions = JSONArray()
        .put(JSONObject().put("state", "hospitalizado").put("bed", "201-A").put("unstable", true))
        .put(JSONObject().put("state", "alta_firmada").put("bed", "202-A"))
        .put(JSONObject().put("state", "hospitalizado").put("bed", "301-A"))
        .put(JSONObject().put("state", "pendiente_cama").put("bed", ""))

    @Test fun elResumenDeEnfermeriaCuentaPacientesPorPisoEInestables() {
        val perms = AndroidSection.entries.map { it.permission }
        val model = RoleDashboard.build("ENF", perms, mapOf(DashboardSource.ADMISSIONS to admissions, DashboardSource.BEDS to beds), now = now)
        val perFloor = model.charts.first { it.title == "Pacientes por piso" }.slices
        assertEquals(listOf("Piso 2" to 2, "Piso 3" to 1), perFloor.map { it.label to it.value })
        assertEquals("1", model.kpis.first { it.label == "Pacientes inestables" }.value)
    }

    @Test fun elResumenDeEnfermeriaMuestraLasLlegadasPorAmbulancia() {
        val perms = AndroidSection.entries.map { it.permission }
        val arrivals = JSONObject().put("services", JSONArray().put(JSONObject().put("serviceId", "s1").put("dispatchedAt", "2026-11-19T19:00:00Z").put("active", true).put("arrived", false)))
        val model = RoleDashboard.build("ENF", perms, mapOf(DashboardSource.ARRIVALS to arrivals), now = now)
        assertTrue(model.attention.any { it.title == "Ambulancia en camino" })
        // The pending row already tells it: the tile is not repeated.
        assertTrue(model.kpis.none { it.label == "Llegadas por ambulancia" })
        val none = RoleDashboard.build("ENF", perms, mapOf(DashboardSource.ARRIVALS to JSONObject().put("services", JSONArray())), now = now)
        assertEquals("0", none.kpis.first { it.label == "Llegadas por ambulancia" }.value)
    }

    private fun admission(id: String, bed: String) = HospitalAdmission(id, "Paciente $id", "hospitalizado", bed, "general", false, 1)

    @Test fun elPisoEsUnFiltroPorDefectoNuncaUnLimite() {
        val floors = NurseFloors.bedFloors(beds)
        val rows = listOf(admission("a", "201-A"), admission("b", "301-A"), admission("c", ""))
        assertEquals(listOf(2, 3), NurseFloors.floorsOf(rows, floors).mapNotNull { it.level })
        assertEquals(2, NurseFloors.defaultFloor("Planta 2", listOf(2, 3)))
        assertEquals(3, NurseFloors.defaultFloor("Hospitalización · piso 3", listOf(2, 3)))
        assertNull("un piso que la planta no tiene no filtra", NurseFloors.defaultFloor("Planta 5", listOf(2, 3)))
        assertNull(NurseFloors.defaultFloor("Consulta externa", listOf(2, 3)))
        assertEquals(listOf("a", "c"), NurseFloors.filter(rows, floors, 2).map { it.id })
        assertEquals("«Todos los pisos» devuelve todo", listOf("a", "b", "c"), NurseFloors.filter(rows, floors, null).map { it.id })
    }
}
