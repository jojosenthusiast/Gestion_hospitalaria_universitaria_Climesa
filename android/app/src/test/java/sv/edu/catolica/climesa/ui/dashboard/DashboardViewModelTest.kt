package sv.edu.catolica.climesa.ui.dashboard

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceTimeBy
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
import sv.edu.catolica.climesa.data.realtime.RealtimeRepository
import sv.edu.catolica.climesa.domain.DashboardSource
import sv.edu.catolica.climesa.domain.EventoDominio
import sv.edu.catolica.climesa.domain.RealtimeSignal
import sv.edu.catolica.climesa.ui.FakeGateway

private class DashboardBus : RealtimeRepository {
    val signals = MutableSharedFlow<RealtimeSignal>(extraBufferCapacity = 16)
    override fun observe(channels: List<String>): Flow<RealtimeSignal> = signals
}

@OptIn(ExperimentalCoroutinesApi::class)
class DashboardViewModelTest {
    private val dispatcher = StandardTestDispatcher()
    @Before fun setUp() = Dispatchers.setMain(dispatcher)
    @After fun tearDown() = Dispatchers.resetMain()

    private val permissions = listOf("sesion.perfil", "consulta.iniciar", "laboratorio.ver_cola", "turnos.ver")
    private fun labOrders() = JSONArray().put(JSONObject().put("state", "completado").put("priority", "rutina"))

    @Test fun readsOnlyTheSourcesThePermissionsAllowAndBuildsTheModel() = runTest(dispatcher) {
        val api = FakeGateway(); api.responses["/laboratorio/ordenes"] = labOrders()
        val vm = DashboardViewModel(api, DashboardBus())
        vm.start("MED", permissions, listOf("rol:MED"), true); runCurrent()
        assertEquals(1, api.gets("/laboratorio/ordenes"))
        assertEquals(0, api.gets("/camas"))
        val model = vm.state.value.model
        assertNotNull(model)
        assertEquals("1", model!!.kpis.first { it.label == "Resultados por revisar" }.value)
        assertFalse(vm.state.value.loading)
    }

    @Test fun aFailingSourceIsReportedWithoutInventingZeros() = runTest(dispatcher) {
        val api = FakeGateway(); api.responses["/laboratorio/ordenes"] = labOrders(); api.failures["/consultas/agenda"] = IllegalStateException("sin acceso")
        val vm = DashboardViewModel(api, DashboardBus())
        vm.start("MED", permissions, listOf("rol:MED"), true); runCurrent()
        val model = vm.state.value.model!!
        assertEquals(setOf(DashboardSource.AGENDA), model.unavailable)
        assertTrue(model.kpis.none { it.label == "Citas en mi agenda" })
    }

    @Test fun whenEverySourceFailsTheStateIsAnError() = runTest(dispatcher) {
        val api = FakeGateway(); api.failGets = true
        val vm = DashboardViewModel(api, DashboardBus())
        vm.start("MED", permissions, listOf("rol:MED"), true); runCurrent()
        assertNull(vm.state.value.model)
        assertNotNull(vm.state.value.error)
    }

    @Test fun anUnlinkedPatientReadsNothingAndSeesTheLinkInvitation() = runTest(dispatcher) {
        val api = FakeGateway()
        val vm = DashboardViewModel(api, DashboardBus())
        vm.start("PAC", listOf("sesion.perfil", "citas.ver", "resultados.ver", "fila.ver", "cuenta.vincular"), emptyList(), false); runCurrent()
        assertTrue(api.calls.isEmpty())
        assertEquals("Vincula tu expediente", vm.state.value.model!!.attention.single().title)
    }

    @Test fun realtimeEventsReloadSilentlyAndOnlyForRelevantEntities() = runTest(dispatcher) {
        val api = FakeGateway(); api.responses["/laboratorio/ordenes"] = labOrders(); val bus = DashboardBus()
        val vm = DashboardViewModel(api, bus)
        vm.start("MED", permissions, listOf("rol:MED"), true); runCurrent()
        bus.signals.tryEmit(RealtimeSignal.Event(EventoDominio("paciente.actualizado", "paciente", "x", 1))); runCurrent(); advanceTimeBy(600)
        assertEquals(1, api.gets("/laboratorio/ordenes"))
        bus.signals.tryEmit(RealtimeSignal.Event(EventoDominio("laboratorio.orden_actualizada", "orden_laboratorio", "x", 2))); runCurrent(); advanceTimeBy(600); runCurrent()
        assertEquals(2, api.gets("/laboratorio/ordenes"))
        assertFalse("a live reload does not show the spinner", vm.state.value.loading)
    }

    @Test fun startingTwiceWithTheSameArgumentsDoesNotReadAgain() = runTest(dispatcher) {
        val api = FakeGateway(); api.responses["/laboratorio/ordenes"] = labOrders()
        val vm = DashboardViewModel(api, DashboardBus())
        vm.start("MED", permissions, listOf("rol:MED"), true); runCurrent()
        vm.start("MED", permissions, listOf("rol:MED"), true); runCurrent()
        assertEquals(1, api.gets("/laboratorio/ordenes"))
    }
}
