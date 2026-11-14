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
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test
import sv.edu.catolica.climesa.data.ApiGateway
import sv.edu.catolica.climesa.data.realtime.RealtimeRepository
import sv.edu.catolica.climesa.domain.EventoDominio
import sv.edu.catolica.climesa.domain.RealtimeSignal

private class ClinicalSignalBus : RealtimeRepository {
    val signals = MutableSharedFlow<RealtimeSignal>(extraBufferCapacity = 16)
    override fun observe(channels: List<String>): Flow<RealtimeSignal> = signals
}

/** Records every call; GETs answer with [rows] unless [failGets] is set. */
internal class FakeGateway(var rows: Any = JSONArray()) : ApiGateway {
    val calls = mutableListOf<Triple<String, String, JSONObject?>>()
    var failGets = false
    val failures = mutableMapOf<String, Exception>()
    val responses = mutableMapOf<String, Any>()
    override suspend fun request(path: String, method: String, body: JSONObject?): Any {
        calls += Triple(path, method, body)
        failures[path]?.let { throw it }
        if (method == "GET" && failGets) error("red")
        return responses[path] ?: if (method == "GET") rows else JSONObject()
    }
    fun gets(path: String) = calls.count { it.first == path && it.second == "GET" }
}

@OptIn(ExperimentalCoroutinesApi::class)
class ClinicalLiveViewModelsTest {
    private val dispatcher = StandardTestDispatcher()
    @Before fun setUp() = Dispatchers.setMain(dispatcher)
    @After fun tearDown() = Dispatchers.resetMain()

    private fun event(type: String, entity: String) = RealtimeSignal.Event(EventoDominio(type, entity, "x", 1))

    @Test fun queueReloadsOnQueueEventsOnly() = runTest(dispatcher) {
        val api = FakeGateway(); val bus = ClinicalSignalBus()
        val vm = QueueViewModel(api, bus)
        vm.load(); vm.startLive(listOf("rol:REC")); runCurrent()
        bus.signals.tryEmit(event("cama.estado_cambiado", "cama")); runCurrent()
        assertEquals(1, api.gets("/fila"))
        bus.signals.tryEmit(event("fila.actualizada", "ticket_fila")); runCurrent()
        assertEquals(2, api.gets("/fila"))
        assertFalse("a live reload does not show the spinner", vm.state.value.loading)
    }

    @Test fun queueReloadsAfterResync() = runTest(dispatcher) {
        val api = FakeGateway(); val bus = ClinicalSignalBus()
        val vm = QueueViewModel(api, bus)
        vm.load(); vm.startLive(listOf("rol:REC")); runCurrent()
        bus.signals.tryEmit(RealtimeSignal.Resync); runCurrent()
        assertEquals(2, api.gets("/fila"))
    }

    @Test fun failedLiveReloadKeepsTheShownTickets() = runTest(dispatcher) {
        val api = FakeGateway(JSONArray().put(JSONObject().put("id", "t1").put("service", "consulta").put("numero", 1).put("state", "en_espera"))); val bus = ClinicalSignalBus()
        val vm = QueueViewModel(api, bus)
        vm.load(); vm.startLive(listOf("rol:REC")); runCurrent()
        api.failGets = true
        bus.signals.tryEmit(event("fila.actualizada", "ticket_fila")); runCurrent()
        assertEquals(1, vm.state.value.tickets.size)
        assertNull(vm.state.value.error)
    }

    @Test fun laboratoryReloadsOnLaboratoryEvents() = runTest(dispatcher) {
        val api = FakeGateway(); val bus = ClinicalSignalBus()
        val vm = LaboratoryViewModel(api, bus)
        vm.load(); vm.startLive(listOf("rol:LAB")); runCurrent()
        bus.signals.tryEmit(event("fila.actualizada", "ticket_fila")); runCurrent()
        assertEquals(1, api.gets("/laboratorio/ordenes"))
        bus.signals.tryEmit(event("laboratorio.critico", "orden_laboratorio")); runCurrent()
        assertEquals(2, api.gets("/laboratorio/ordenes"))
    }

    @Test fun consultationReloadsOnConsultationAndAppointmentEvents() = runTest(dispatcher) {
        val api = FakeGateway(); val bus = ClinicalSignalBus()
        val vm = ConsultationViewModel(api, bus)
        vm.load(); vm.startLive(listOf("rol:MED")); runCurrent()
        bus.signals.tryEmit(event("consulta.actualizada", "consulta")); runCurrent()
        bus.signals.tryEmit(event("cita.actualizada", "cita")); runCurrent()
        bus.signals.tryEmit(event("inventario.actualizado", "articulo")); runCurrent()
        assertEquals(3, api.gets("/consultas/agenda"))
    }

    @Test fun hospitalizationReloadsOnAdmissionEvents() = runTest(dispatcher) {
        val api = FakeGateway(); val bus = ClinicalSignalBus()
        val vm = HospitalizationViewModel(api, bus)
        vm.load(); vm.startLive(listOf("rol:ENF")); runCurrent()
        bus.signals.tryEmit(event("admision.cama_asignada", "admision")); runCurrent()
        assertEquals(2, api.gets("/admisiones"))
    }

    @Test fun inventoryReloadsOnInventoryEvents() = runTest(dispatcher) {
        val api = FakeGateway(); val bus = ClinicalSignalBus()
        val vm = InventoryViewModel(api, bus)
        vm.load(); vm.startLive(listOf("rol:ENF")); runCurrent()
        bus.signals.tryEmit(event("inventario.actualizado", "articulo")); runCurrent()
        bus.signals.tryEmit(event("admision.creada", "admision")); runCurrent()
        assertEquals(2, api.gets("/inventario/existencias"))
    }
}
