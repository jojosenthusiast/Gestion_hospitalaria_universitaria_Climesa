package sv.edu.catolica.climesa.ui

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import sv.edu.catolica.climesa.data.AuthRequestException
import sv.edu.catolica.climesa.data.BedRepository
import sv.edu.catolica.climesa.data.realtime.RealtimeRepository
import sv.edu.catolica.climesa.domain.*

private class FakeBeds(var rows: List<Bed>) : BedRepository {
    var loads = 0
    var failure: Exception? = null
    val actions = mutableListOf<Triple<String, BedAction, String>>()
    override suspend fun beds(): List<Bed> { loads++; return rows }
    override suspend fun act(bedId: String, action: BedAction, version: Int, reason: String) {
        failure?.let { throw it }
        actions += Triple(bedId, action, "$version:$reason")
    }
}

private class FakeRealtime : RealtimeRepository {
    val signals = MutableSharedFlow<RealtimeSignal>(extraBufferCapacity = 16)
    override fun observe(channels: List<String>): Flow<RealtimeSignal> = signals
}

@OptIn(ExperimentalCoroutinesApi::class)
class BedsViewModelTest {
    private val dispatcher = StandardTestDispatcher()
    private val libre = Bed("b1", "C-101", "Habitación 101", "libre", 3)
    private val jefatura = setOf("camas.ver_tablero", "camas.bloquear")

    @Before fun setUp() = Dispatchers.setMain(dispatcher)
    @After fun tearDown() = Dispatchers.resetMain()

    private fun TestScope.model(beds: FakeBeds, rt: FakeRealtime = FakeRealtime()) =
        BedsViewModel(beds, rt).also { it.start(listOf("publico", "rol:JOP"), jefatura); runCurrent() }

    @Test fun cargaElTableroAlIniciar() = kotlinx.coroutines.test.runTest(dispatcher) {
        val vm = model(FakeBeds(listOf(libre)))
        assertEquals(listOf(libre), vm.state.value.beds)
        assertEquals(false, vm.state.value.loading)
    }

    @Test fun unEventoDeCamaVuelveAPedirElTablero() = kotlinx.coroutines.test.runTest(dispatcher) {
        val beds = FakeBeds(listOf(libre)); val rt = FakeRealtime()
        val vm = model(beds, rt)
        beds.rows = listOf(libre.copy(state = "ocupada", version = 4))
        rt.signals.tryEmit(RealtimeSignal.Event(EventoDominio("cama.estado_cambiado", "cama", "b1", 4)))
        runCurrent()
        assertEquals(2, beds.loads)
        assertEquals("ocupada", vm.state.value.beds.single().state)
    }

    @Test fun losEventosAjenosALasCamasSeIgnoran() = kotlinx.coroutines.test.runTest(dispatcher) {
        val beds = FakeBeds(listOf(libre)); val rt = FakeRealtime()
        model(beds, rt)
        rt.signals.tryEmit(RealtimeSignal.Event(EventoDominio("lab.estado_cambiado", "orden", "o1", 1)))
        runCurrent()
        assertEquals(1, beds.loads)
    }

    @Test fun reflejaElEstadoDeLaConexion() = kotlinx.coroutines.test.runTest(dispatcher) {
        val rt = FakeRealtime()
        val vm = model(FakeBeds(listOf(libre)), rt)
        rt.signals.tryEmit(RealtimeSignal.State(ConnectionState.LIVE)); runCurrent()
        assertEquals(ConnectionState.LIVE, vm.state.value.connection)
        rt.signals.tryEmit(RealtimeSignal.State(ConnectionState.OFFLINE)); runCurrent()
        assertEquals(ConnectionState.OFFLINE, vm.state.value.connection)
    }

    @Test fun reintentarResincronizaTrasRecuperarLaConexion() = kotlinx.coroutines.test.runTest(dispatcher) {
        val beds = FakeBeds(listOf(libre)); val rt = FakeRealtime()
        model(beds, rt)
        rt.signals.tryEmit(RealtimeSignal.Resync); runCurrent()
        assertEquals(2, beds.loads)
    }

    @Test fun noOfreceAccionesSinPermiso() = kotlinx.coroutines.test.runTest(dispatcher) {
        val vm = BedsViewModel(FakeBeds(listOf(libre)), FakeRealtime())
        vm.start(listOf("publico"), setOf("camas.ver_tablero")); runCurrent()
        vm.select(libre, BedAction.BLOCK)
        assertNull(vm.state.value.pending)
    }

    @Test fun exigeUnMotivoValidoAntesDeEnviar() = kotlinx.coroutines.test.runTest(dispatcher) {
        val beds = FakeBeds(listOf(libre)); val vm = model(beds)
        vm.select(libre, BedAction.BLOCK)
        vm.onReason("ab"); vm.confirm(); runCurrent()
        assertNotNull(vm.state.value.reasonError)
        assertTrue(beds.actions.isEmpty())
    }

    @Test fun bloqueaConLaVersionVigenteYRecargaElTablero() = kotlinx.coroutines.test.runTest(dispatcher) {
        val beds = FakeBeds(listOf(libre)); val vm = model(beds)
        vm.select(libre, BedAction.BLOCK)
        vm.onReason("Fuga de agua en el techo"); vm.confirm(); runCurrent()
        assertEquals(listOf(Triple("b1", BedAction.BLOCK, "3:Fuga de agua en el techo")), beds.actions)
        assertNull(vm.state.value.pending)
        assertEquals("Bloqueo registrado.", vm.state.value.message)
        assertEquals(2, beds.loads)
    }

    @Test fun unConflictoDeVersionMuestraElMensajeYActualiza() = kotlinx.coroutines.test.runTest(dispatcher) {
        val beds = FakeBeds(listOf(libre)); val vm = model(beds)
        beds.failure = AuthRequestException("El registro cambió", 409, "version_conflicto")
        vm.select(libre, BedAction.BLOCK)
        vm.onReason("Fuga de agua en el techo"); vm.confirm(); runCurrent()
        assertTrue(vm.state.value.actionError!!.startsWith("La cama cambió"))
        assertNotNull(vm.state.value.pending)
        assertEquals(2, beds.loads)
    }

    @Test fun unRechazoDePermisoSeTraduceAlEspanol() = kotlinx.coroutines.test.runTest(dispatcher) {
        val beds = FakeBeds(listOf(libre)); val vm = model(beds)
        beds.failure = AuthRequestException("Forbidden", 403)
        vm.select(libre, BedAction.BLOCK)
        vm.onReason("Fuga de agua en el techo"); vm.confirm(); runCurrent()
        assertEquals("No tienes permiso para realizar esta acción.", vm.state.value.actionError)
    }
}
