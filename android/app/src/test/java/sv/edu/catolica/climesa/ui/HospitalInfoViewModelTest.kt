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
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test
import sv.edu.catolica.climesa.data.ApiGateway
import sv.edu.catolica.climesa.data.realtime.RealtimeRepository
import sv.edu.catolica.climesa.domain.EventoDominio
import sv.edu.catolica.climesa.domain.HospitalInfoParser
import sv.edu.catolica.climesa.domain.RealtimeSignal

private class PublicSignalBus : RealtimeRepository {
    val signals = MutableSharedFlow<RealtimeSignal>(extraBufferCapacity = 16)
    val joined = mutableListOf<List<String>>()
    override fun observe(channels: List<String>): Flow<RealtimeSignal> { joined += channels; return signals }
}

/** Public endpoints double: [free] is the semiprivate free bed count on floor 2. */
private class PublicGateway(var free: Int = 4, var fail: Boolean = false) : ApiGateway {
    val calls = mutableListOf<String>()
    override suspend fun request(path: String, method: String, body: JSONObject?): Any {
        calls += path
        if (fail) throw IllegalStateException("Sin conexión")
        return when (path) {
            "/publico/ocupacion" -> JSONObject("""{"ocupacion":[{"planta":2,"categoria":"semiprivada","camas":10,"libres":$free,"ocupadas":${10 - free}},{"planta":3,"categoria":"vip","camas":2,"libres":1,"ocupadas":1}]}""")
            "/publico/medicos-de-turno" -> JSONObject("""{"medicos":[{"nombre":"Ana Ficticia","especialidad":"Pediatría","area":"Consulta externa","hasta":"2026-11-15T20:00:00.000Z"}],"proximoCambio":null}""")
            "/publico/avisos" -> JSONObject("""{"avisos":[{"id":"a-1","titulo":"Laboratorio cerrado","cuerpo":"Laboratorio cerrado el domingo.","desde":"2026-11-15T00:00:00.000Z","hasta":"2026-11-17T00:00:00.000Z"}],"proximoCambio":null}""")
            else -> error("Ruta inesperada: $path")
        }
    }
}

@OptIn(ExperimentalCoroutinesApi::class)
class HospitalInfoViewModelTest {
    private val dispatcher = StandardTestDispatcher()
    @Before fun setUp() = Dispatchers.setMain(dispatcher)
    @After fun tearDown() = Dispatchers.resetMain()

    @Test fun cargaOcupacionMedicosYAvisosPublicos() = runTest(dispatcher) {
        val api = PublicGateway()
        val vm = HospitalInfoViewModel(api, PublicSignalBus())
        vm.load(); runCurrent()
        val state = vm.state.value
        assertFalse(state.loading)
        assertNull(state.error)
        assertEquals(listOf("/publico/ocupacion", "/publico/medicos-de-turno", "/publico/avisos"), api.calls)
        assertEquals("Ana Ficticia", state.info.doctors.single().name)
        assertEquals("Laboratorio cerrado", state.info.notices.single().title)
        assertEquals(listOf(Triple<Int?, Int, Int>(2, 4, 10), Triple<Int?, Int, Int>(3, 1, 2)), HospitalInfoParser.byFloor(state.info.occupancy))
    }

    @Test fun unEventoDelCanalPublicoVuelveAPedirYSoloCambiaElConteo() = runTest(dispatcher) {
        val api = PublicGateway(); val bus = PublicSignalBus()
        val vm = HospitalInfoViewModel(api, bus)
        vm.startLive(); vm.load(); runCurrent()
        assertEquals(listOf(listOf("publico")), bus.joined)
        api.free = 3
        bus.signals.tryEmit(RealtimeSignal.Event(EventoDominio("cama.estado_cambiado", "publico", "ocupacion", 2))); runCurrent()
        assertEquals(3, vm.state.value.info.occupancy.first().free)
        assertFalse(vm.state.value.loading)
    }

    @Test fun avisoPublicadoRecargaYEventosAjenosNo() = runTest(dispatcher) {
        val api = PublicGateway(); val bus = PublicSignalBus()
        val vm = HospitalInfoViewModel(api, bus)
        vm.startLive(); vm.load(); runCurrent()
        bus.signals.tryEmit(RealtimeSignal.Event(EventoDominio("paciente.actualizado", "paciente", "p-1", 2))); runCurrent()
        assertEquals(3, api.calls.size)
        bus.signals.tryEmit(RealtimeSignal.Event(EventoDominio("aviso.publicado", "aviso", "a-2", 1))); runCurrent()
        assertEquals(6, api.calls.size)
    }

    @Test fun unErrorSeMuestraYUnaRecargaEnVivoFallidaConservaLoMostrado() = runTest(dispatcher) {
        val api = PublicGateway(fail = true)
        val vm = HospitalInfoViewModel(api, PublicSignalBus())
        vm.load(); runCurrent()
        assertEquals("Sin conexión", vm.state.value.error)
        api.fail = false; vm.load(); runCurrent()
        assertNull(vm.state.value.error)
        api.fail = true; vm.load(silent = true); runCurrent()
        assertEquals("Ana Ficticia", vm.state.value.info.doctors.single().name)
        assertNull(vm.state.value.error)
    }
}
