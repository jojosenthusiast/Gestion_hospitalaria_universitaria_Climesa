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
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import sv.edu.catolica.climesa.data.PatientDetails
import sv.edu.catolica.climesa.data.PatientRepository
import sv.edu.catolica.climesa.data.realtime.RealtimeRepository
import sv.edu.catolica.climesa.domain.EventoDominio
import sv.edu.catolica.climesa.domain.Patient
import sv.edu.catolica.climesa.domain.RealtimeSignal
import sv.edu.catolica.climesa.domain.Registry
import sv.edu.catolica.climesa.domain.Sex

private class SignalBus : RealtimeRepository {
    val signals = MutableSharedFlow<RealtimeSignal>(extraBufferCapacity = 16)
    override fun observe(channels: List<String>): Flow<RealtimeSignal> = signals
}

@OptIn(ExperimentalCoroutinesApi::class)
class LiveViewModelsTest {
    private val dispatcher = StandardTestDispatcher()
    @Before fun setUp() = Dispatchers.setMain(dispatcher)
    @After fun tearDown() = Dispatchers.resetMain()

    private fun event(type: String, entity: String, id: String = "x") = RealtimeSignal.Event(EventoDominio(type, entity, id, 1))

    @Test fun elPortalVuelveAPedirTurnosAlLlegarUnEventoDeTurno() = runTest(dispatcher) {
        val bus = SignalBus(); val calls = mutableListOf<String>()
        val vm = RoleViewModel({ path -> calls += path; org.json.JSONArray() }, bus)
        vm.start(listOf("publico")); vm.load("/turnos/mios"); runCurrent()
        bus.signals.tryEmit(event("turno.publicado", "turno")); runCurrent()
        assertEquals(listOf("/turnos/mios", "/turnos/mios"), calls)
        assertFalse("la recarga en vivo no muestra el indicador de carga", vm.state.value.loading)
    }

    @Test fun elPortalIgnoraEventosDeOtraSeccion() = runTest(dispatcher) {
        val bus = SignalBus(); val calls = mutableListOf<String>()
        val vm = RoleViewModel({ path -> calls += path; org.json.JSONObject() }, bus)
        vm.start(listOf("publico")); vm.load("/ambulancia"); runCurrent()
        bus.signals.tryEmit(event("turno.publicado", "turno")); runCurrent()
        assertEquals(1, calls.size)
        bus.signals.tryEmit(event("ambulancia.estado_cambiado", "ambulancia")); runCurrent()
        assertEquals(2, calls.size)
    }

    @Test fun unaRecargaEnVivoFallidaConservaLosDatosMostrados() = runTest(dispatcher) {
        val bus = SignalBus(); var fail = false
        val vm = RoleViewModel({ if (fail) error("red") else org.json.JSONArray() }, bus)
        vm.start(listOf("publico")); vm.load("/turnos/mios"); runCurrent()
        fail = true
        bus.signals.tryEmit(event("turno.publicado", "turno")); runCurrent()
        assertTrue(vm.state.value.data != null && vm.state.value.error == null)
    }

    private class FakePatients(var rows: List<Patient>) : PatientRepository {
        override val remote = true
        var loads = 0; val details = mutableListOf<String>()
        override suspend fun load() = Registry(rows).also { loads++ }
        override suspend fun update(transform: (Registry) -> Registry) = throw UnsupportedOperationException()
        override suspend fun detail(id: String): PatientDetails { details += id; return PatientDetails(rows.first { it.id == id }, emptyList()) }
    }

    private fun patient(id: String, name: String, version: Int = 1) = Patient(id, "EXP-$id", name, "Ejemplo", null, null, Sex.UNKNOWN, "", true, version)

    @Test fun recepcionRefrescaLaListaAlLlegarUnPacienteNuevo() = runTest(dispatcher) {
        val bus = SignalBus(); val repo = FakePatients(listOf(patient("p1", "Ana")))
        val vm = ReceptionViewModel(repo, bus)
        vm.reload(); vm.startLive(listOf("publico")); runCurrent()
        repo.rows = repo.rows + patient("p2", "Beto")
        bus.signals.tryEmit(event("paciente.creado", "paciente", "p2")); runCurrent()
        assertEquals(2, vm.state.value.registry.patients.size)
    }

    @Test fun recepcionRefrescaLaFichaDelPacienteConocido() = runTest(dispatcher) {
        val bus = SignalBus(); val repo = FakePatients(listOf(patient("p1", "Ana")))
        val vm = ReceptionViewModel(repo, bus)
        vm.reload(); vm.startLive(listOf("publico")); runCurrent()
        repo.rows = listOf(patient("p1", "Ana María", version = 2))
        bus.signals.tryEmit(event("paciente.actualizado", "paciente", "p1")); runCurrent()
        assertEquals(listOf("p1"), repo.details)
        assertEquals(2, vm.state.value.registry.patients.single().version)
    }

    @Test fun recepcionIgnoraEventosQueNoSonDePacientes() = runTest(dispatcher) {
        val bus = SignalBus(); val repo = FakePatients(listOf(patient("p1", "Ana")))
        val vm = ReceptionViewModel(repo, bus)
        vm.reload(); vm.startLive(listOf("publico")); runCurrent()
        bus.signals.tryEmit(event("cama.estado_cambiado", "cama")); runCurrent()
        assertEquals(1, repo.loads)
    }
}
