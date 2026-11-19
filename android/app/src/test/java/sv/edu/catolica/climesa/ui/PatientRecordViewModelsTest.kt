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
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import sv.edu.catolica.climesa.data.AuthRequestException
import sv.edu.catolica.climesa.data.realtime.RealtimeRepository
import sv.edu.catolica.climesa.domain.EventoDominio
import sv.edu.catolica.climesa.domain.LinkStatus
import sv.edu.catolica.climesa.domain.RealtimeSignal
import java.time.LocalDate

private class RecordSignalBus : RealtimeRepository {
    val signals = MutableSharedFlow<RealtimeSignal>(extraBufferCapacity = 16)
    override fun observe(channels: List<String>): Flow<RealtimeSignal> = signals
}

@OptIn(ExperimentalCoroutinesApi::class)
class PatientRecordViewModelsTest {
    private val dispatcher = StandardTestDispatcher()
    @Before fun setUp() = Dispatchers.setMain(dispatcher)
    @After fun tearDown() = Dispatchers.resetMain()
    private val resolved = RealtimeSignal.Event(EventoDominio("vinculacion.resuelta", "vinculacion_paciente", "v1", 2))

    private fun linkModel(api: FakeGateway, bus: RecordSignalBus) = LinkRecordViewModel(api, bus)
    private fun mine(linked: Boolean, verified: Boolean, email: String? = "ana@example.test") =
        JSONObject().put("linked", linked).put("email", email ?: JSONObject.NULL).put("emailVerified", verified).put("request", JSONObject.NULL)

    @Test fun unverifiedEmailAsksToConfirmItFirst() = runTest(dispatcher) {
        val api = FakeGateway(); api.responses["/me/vinculacion"] = mine(linked = false, verified = false)
        val vm = linkModel(api, RecordSignalBus()); vm.init(null); runCurrent()
        assertEquals(LinkStatus.EMAIL_NOT_VERIFIED, vm.state.value.status)
        assertEquals("ana@example.test", vm.state.value.email)
    }

    @Test fun notLinkedShowsTheEmailForReceptionAndJoinsLive() = runTest(dispatcher) {
        val api = FakeGateway(); val bus = RecordSignalBus()
        api.responses["/me/vinculacion"] = mine(linked = false, verified = true)
        val vm = linkModel(api, bus)
        vm.startLive(listOf("usuario:u1")); vm.init(null); runCurrent()
        assertEquals(LinkStatus.NOT_LINKED, vm.state.value.status)
        assertEquals("ana@example.test", vm.state.value.email)
        api.responses["/me/vinculacion"] = mine(linked = true, verified = true)
        bus.signals.tryEmit(resolved); runCurrent()
        assertEquals(LinkStatus.LINKED, vm.state.value.status)
        // U12: there is no request to send any more.
        assertTrue(api.calls.none { it.first == "/cuentas/vinculacion" })
    }

    @Test fun failedReadIsUnavailableNotNotLinked() = runTest(dispatcher) {
        val api = FakeGateway(); api.failures["/me/vinculacion"] = AuthRequestException("Sin conexión.")
        val vm = linkModel(api, RecordSignalBus()); vm.init(null); runCurrent()
        assertEquals(LinkStatus.UNAVAILABLE, vm.state.value.status)
        api.failures.clear(); api.responses["/me/vinculacion"] = mine(linked = false, verified = true)
        vm.reload(); runCurrent()
        assertEquals(LinkStatus.NOT_LINKED, vm.state.value.status)
        assertNull(vm.state.value.readError)
    }

    @Test fun linkedProfileShowsLinkedWithoutCallingTheApi() = runTest(dispatcher) {
        val api = FakeGateway(); val vm = linkModel(api, RecordSignalBus())
        vm.init("p1")
        assertEquals(LinkStatus.LINKED, vm.state.value.status)
        assertTrue(api.calls.isEmpty())
    }

    private fun history() = JSONObject().put("patient", JSONObject().put("fullName", "Paciente Ficticio").put("record", "000412-7")).put("access", "relacion")
        .put("consultations", JSONArray()).put("laboratory", JSONArray()).put("admissions", JSONArray())

    @Test fun historyLoadsTheSelectedPatientAndRefreshesOnClinicalEvents() = runTest(dispatcher) {
        val api = FakeGateway(); val bus = RecordSignalBus()
        api.responses["/pacientes/p1/historial"] = history()
        val vm = ClinicalHistoryViewModel(api, bus)
        vm.startLive(listOf("rol:MED")); vm.open("p1"); runCurrent()
        assertEquals("000412-7", vm.state.value.history!!.record)
        bus.signals.tryEmit(RealtimeSignal.Event(EventoDominio("cama.estado_cambiado", "cama", "b1", 1))); runCurrent()
        assertEquals(1, api.gets("/pacientes/p1/historial"))
        bus.signals.tryEmit(RealtimeSignal.Event(EventoDominio("consulta.actualizada", "consulta", "c1", 3))); runCurrent()
        assertEquals(2, api.gets("/pacientes/p1/historial"))
        vm.close()
        assertNull(vm.state.value.history)
    }

    @Test fun deniedHistoryShowsTheSharedWording() = runTest(dispatcher) {
        val api = FakeGateway()
        api.failures["/pacientes/p2/historial"] = AuthRequestException("El historial requiere una relación de atención.", 403)
        val vm = ClinicalHistoryViewModel(api, RecordSignalBus())
        vm.open("p2"); runCurrent()
        assertEquals(ClinicalHistoryViewModel.DENIED, vm.state.value.error)
        assertNull(vm.state.value.history)
    }

    @Test fun clinicianSearchListsCandidates() = runTest(dispatcher) {
        val api = FakeGateway(JSONArray().put(JSONObject().put("id", "p1").put("fullName", "Paciente Ficticio").put("record", "000412-7")))
        val vm = ClinicalHistoryViewModel(api, RecordSignalBus())
        vm.search("Pac"); runCurrent()
        assertEquals("p1", vm.state.value.candidates.single().id)
        assertEquals("/pacientes?query=Pac&limit=50", api.calls.single().first)
    }

    @Test fun patientResultsUseTheOwnEndpoint() = runTest(dispatcher) {
        val api = FakeGateway()
        val vm = LaboratoryViewModel(api, RecordSignalBus(), NoDocuments)
        vm.path = "/me/laboratorio"
        vm.load(); runCurrent()
        assertEquals(listOf("/me/laboratorio"), api.calls.map { it.first })
    }
}
