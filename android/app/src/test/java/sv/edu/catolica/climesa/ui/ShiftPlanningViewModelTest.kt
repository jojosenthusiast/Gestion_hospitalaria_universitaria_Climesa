package sv.edu.catolica.climesa.ui

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.json.JSONArray
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import sv.edu.catolica.climesa.data.AuthRequestException
import sv.edu.catolica.climesa.data.realtime.RealtimeRepository
import sv.edu.catolica.climesa.domain.EventoDominio
import sv.edu.catolica.climesa.domain.RealtimeSignal
import sv.edu.catolica.climesa.domain.ShiftFilters
import sv.edu.catolica.climesa.domain.ShiftForm

private class PlanningBus : RealtimeRepository {
    val signals = MutableSharedFlow<RealtimeSignal>(extraBufferCapacity = 16)
    override fun observe(channels: List<String>): Flow<RealtimeSignal> = signals
}

private class FakePlanning : PlanningDataSource {
    val gets = mutableListOf<String>()
    val sends = mutableListOf<Triple<String, String, JSONObject>>()
    var failWith: Exception? = null
    var catalogFailure: Exception? = null
    /** Everything in the system, including people and areas that have no shift in `listing`. */
    val catalog = JSONObject()
        .put("roles", JSONArray().put(JSONObject().put("code", "medico").put("name", "Médico")).put(JSONObject().put("code", "laboratorista").put("name", "Laboratorio")))
        .put("areas", JSONArray().put(JSONObject().put("id", "a1").put("parentId", JSONObject.NULL).put("type", "area").put("code", "EMG").put("name", "Emergencia"))
            .put(JSONObject().put("id", "a2").put("parentId", JSONObject.NULL).put("type", "area").put("code", "LAB").put("name", "Laboratorio clínico")))
        .put("staff", JSONArray().put(JSONObject().put("id", "p1").put("name", "Ana Prueba").put("type", "medico").put("specialty", JSONObject.NULL).put("areaId", "a1").put("area", "Emergencia").put("registrations", JSONArray()))
            .put(JSONObject().put("id", "p2").put("name", "Luis Laboratorio").put("type", "laboratorista").put("specialty", JSONObject.NULL).put("areaId", "a2").put("area", "Laboratorio clínico").put("registrations", JSONArray())))
    var listing = JSONArray().put(
        JSONObject().put("id", "t1").put("staffId", "p1").put("person", "Ana Prueba").put("areaId", "a1").put("area", "Emergencia")
            .put("start", "2026-11-10T13:00:00.000Z").put("end", "2026-11-10T21:00:00.000Z").put("type", "diurno").put("state", "borrador").put("version", 3),
    ).put(
        JSONObject().put("id", "t2").put("staffId", "p1").put("person", "Ana Prueba").put("areaId", "a1").put("area", "Emergencia")
            .put("start", "2026-11-11T13:00:00.000Z").put("end", "2026-11-11T21:00:00.000Z").put("type", "diurno").put("state", "publicado").put("version", 1),
    )
    override suspend fun get(path: String): Any {
        gets += path
        return when {
            path == "/turnos/catalogo" -> catalogFailure?.let { throw it } ?: catalog
            path.startsWith("/turnos") -> listing
            else -> JSONObject()
        }
    }
    override suspend fun send(path: String, method: String, body: JSONObject): Any {
        sends += Triple(path, method, body)
        failWith?.let { throw it }
        return if (path == "/turnos/publicar") JSONObject().put("from", "2026-11-10").put("to", "2026-11-16").put("published", 2).put("warnings", JSONArray()) else JSONObject()
    }
}

@OptIn(ExperimentalCoroutinesApi::class)
class ShiftPlanningViewModelTest {
    private val dispatcher = StandardTestDispatcher()
    @Before fun setUp() = Dispatchers.setMain(dispatcher)
    @After fun tearDown() = Dispatchers.resetMain()

    private val jefe = setOf("turnos.ver", "turnos.ver_borradores", "turnos.planificar", "turnos.publicar")
    private val form = ShiftForm("p1", "a1", "2026-11-12", "07:00", "2026-11-12", "15:00", "diurno", "")

    private fun model(source: FakePlanning, bus: PlanningBus = PlanningBus()) = ShiftPlanningViewModel(source, bus)

    @Test fun cargaLosTurnosYLosCatalogosDeQuienPlanifica() = runTest(dispatcher) {
        val source = FakePlanning(); val vm = model(source)
        vm.start(jefe, listOf("publico")); runCurrent()
        assertEquals(2, vm.state.value.shifts.size)
        assertEquals(2, vm.state.value.catalog.staff.size)
        assertEquals(2, vm.state.value.catalog.areas.size)
        assertFalse(vm.state.value.loading)
        assertTrue("/turnos" in source.gets)
    }

    @Test fun sinPermisoDePlanificarEsSoloLecturaPeroLosFiltrosTraenTodasLasOpciones() = runTest(dispatcher) {
        val source = FakePlanning(); val vm = model(source)
        vm.start(setOf("turnos.ver", "turnos.ver_borradores"), listOf("publico")); runCurrent()
        assertEquals(listOf("/turnos", "/turnos/catalogo"), source.gets)
        // Solo hay turnos de Emergencia y de una persona, pero el catálogo ofrece todas las áreas, los roles y a todo el personal.
        assertEquals(listOf("todos", "a1", "a2"), ShiftFilters.areaOptions(vm.state.value.catalog).map { it.first }.let { listOf(it[0]) + it.drop(1).sorted() })
        assertEquals(setOf("todos", "medico", "laboratorista"), ShiftFilters.roleOptions(vm.state.value.catalog).map { it.first }.toSet())
        vm.setPersonFilter("p2"); assertTrue(vm.state.value.visibleShifts.isEmpty())
        vm.clearFilters(); assertEquals(2, vm.state.value.visibleShifts.size)
        vm.save(form, null, ""); vm.publish("2026-11-10", "2026-11-16", null); vm.cancel(vm.state.value.shifts.first(), "Motivo suficiente"); runCurrent()
        assertTrue(source.sends.isEmpty())
    }

    @Test fun siElCatalogoFallaLaPantallaSigueConLasOpcionesDeLosTurnosCargados() = runTest(dispatcher) {
        val source = FakePlanning().apply { catalogFailure = IllegalStateException("sin catálogo") }; val vm = model(source)
        vm.start(jefe, listOf("publico")); runCurrent()
        assertNull(vm.state.value.error)
        assertEquals(listOf("a1"), vm.state.value.catalog.areas.map { it.id })
        assertEquals(2, vm.state.value.shifts.size)
    }

    @Test fun unaDuracionFueraDeLaReglaNoSeEnvia() = runTest(dispatcher) {
        val source = FakePlanning(); val vm = model(source)
        vm.start(jefe, listOf("publico")); runCurrent()
        vm.save(form.copy(endDate = "2026-11-12", endTime = "09:00"), null, ""); runCurrent()
        assertTrue(source.sends.isEmpty())
        assertTrue(vm.state.value.action.error!!.contains("de 4 a 12 horas"))
    }

    @Test fun crearEnviaPostYVuelveAPedirLaLista() = runTest(dispatcher) {
        val source = FakePlanning(); val vm = model(source)
        vm.start(jefe, listOf("publico")); runCurrent()
        vm.save(form, null, ""); runCurrent()
        val (path, method, body) = source.sends.single()
        assertEquals("/turnos", path); assertEquals("POST", method)
        assertEquals("2026-11-12T07:00:00-06:00", body.getString("start"))
        assertTrue(vm.state.value.action.done)
        assertEquals(2, source.gets.count { it == "/turnos" })
    }

    @Test fun editarEnviaPatchConVersionYExigeMotivo() = runTest(dispatcher) {
        val source = FakePlanning(); val vm = model(source)
        vm.start(jefe, listOf("publico")); runCurrent()
        val shift = vm.state.value.shifts.first()
        vm.save(form, shift, "corto"); runCurrent()
        assertTrue(source.sends.isEmpty()); assertNotNull(vm.state.value.action.error)
        vm.save(form, shift, "Cambio de horario acordado"); runCurrent()
        val (path, method, body) = source.sends.single()
        assertEquals("/turnos/t1", path); assertEquals("PATCH", method); assertEquals(3, body.getInt("version"))
    }

    @Test fun cancelarEnviaPatchCanceladoYUnConflictoDeVersionNoGuardaNada() = runTest(dispatcher) {
        val source = FakePlanning(); val vm = model(source)
        vm.start(jefe, listOf("publico")); runCurrent()
        val shift = vm.state.value.shifts.first()
        source.failWith = AuthRequestException("Versión distinta", 409, "version_conflicto")
        vm.cancel(shift, "Falta de personal en el area"); runCurrent()
        val (path, method, body) = source.sends.single()
        assertEquals("/turnos/t1", path); assertEquals("PATCH", method); assertEquals("cancelado", body.getString("state"))
        assertTrue(vm.state.value.action.conflict); assertFalse(vm.state.value.action.done)
    }

    @Test fun elMotivoCortoNoSeEnvia() = runTest(dispatcher) {
        val source = FakePlanning(); val vm = model(source)
        vm.start(jefe, listOf("publico")); runCurrent()
        vm.cancel(vm.state.value.shifts.first(), "corto"); runCurrent()
        assertTrue(source.sends.isEmpty()); assertNotNull(vm.state.value.action.error)
    }

    @Test fun publicarMuestraElResultadoYValidaElRango() = runTest(dispatcher) {
        val source = FakePlanning(); val vm = model(source)
        vm.start(jefe, listOf("publico")); runCurrent()
        vm.publish("2026-11-16", "2026-11-10", null); runCurrent()
        assertTrue(source.sends.isEmpty()); assertNotNull(vm.state.value.action.error)
        vm.publish("2026-11-10", "2026-11-16", "a1"); runCurrent()
        assertEquals("/turnos/publicar", source.sends.single().first)
        assertEquals(2, vm.state.value.summary?.published)
        vm.dismissSummary()
        assertNull(vm.state.value.summary)
    }

    @Test fun unEventoDeTurnoRefrescaSinMostrarCargaYUnoAjenoSeIgnora() = runTest(dispatcher) {
        val source = FakePlanning(); val bus = PlanningBus(); val vm = model(source, bus)
        vm.start(jefe, listOf("publico")); runCurrent()
        val before = source.gets.count { it == "/turnos" }
        bus.signals.tryEmit(RealtimeSignal.Event(EventoDominio("cama.liberada", "cama", "x", 1))); runCurrent()
        assertEquals(before, source.gets.count { it == "/turnos" })
        bus.signals.tryEmit(RealtimeSignal.Event(EventoDominio("turno.publicado", "turno", "x", 2))); runCurrent()
        assertEquals(before + 1, source.gets.count { it == "/turnos" })
        assertFalse(vm.state.value.loading)
    }

    @Test fun elFiltroDeEstadoSoloMuestraEseEstado() = runTest(dispatcher) {
        val vm = model(FakePlanning())
        vm.start(jefe, listOf("publico")); runCurrent()
        vm.setFilter("borrador")
        assertEquals(listOf("t1"), vm.state.value.visibleShifts.map { it.id })
        vm.setFilter("todos")
        assertEquals(2, vm.state.value.visibleShifts.size)
    }

    @Test fun unResyncVuelveAPedirLaListaYLaReemplaza() = runTest(dispatcher) {
        val source = FakePlanning(); val bus = PlanningBus(); val vm = model(source, bus)
        vm.start(jefe, listOf("publico")); runCurrent()
        source.listing = JSONArray()
        bus.signals.tryEmit(RealtimeSignal.Resync); runCurrent()
        assertEquals(0, vm.state.value.shifts.size)
    }
}
