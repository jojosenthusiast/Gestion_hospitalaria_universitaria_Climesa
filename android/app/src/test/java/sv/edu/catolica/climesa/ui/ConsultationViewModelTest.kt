package sv.edu.catolica.climesa.ui

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.emptyFlow
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
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import sv.edu.catolica.climesa.data.AuthRequestException
import sv.edu.catolica.climesa.data.FileDraftStore
import sv.edu.catolica.climesa.domain.ConsultationResume
import sv.edu.catolica.climesa.data.realtime.RealtimeRepository
import sv.edu.catolica.climesa.domain.LaboratoryItem
import sv.edu.catolica.climesa.domain.LaboratoryOrder
import sv.edu.catolica.climesa.domain.RealtimeSignal

private object NoRealtime : RealtimeRepository {
    override fun observe(channels: List<String>): Flow<RealtimeSignal> = emptyFlow()
}

@OptIn(ExperimentalCoroutinesApi::class)
class ConsultationViewModelTest {
    private val dispatcher = StandardTestDispatcher()
    @Before fun setUp() = Dispatchers.setMain(dispatcher)
    @After fun tearDown() = Dispatchers.resetMain()

    private fun agenda(version: Int = 3) = JSONArray().put(JSONObject()
        .put("appointmentId", "a1").put("patientId", "p1").put("patientName", "Ana")
        .put("start", "2026-11-13T14:00:00Z").put("end", "2026-11-13T14:20:00Z").put("appointmentState", "confirmada")
        .put("consultationId", "c1").put("consultationState", "abierta").put("version", version))

    @Test fun failedSignatureKeepsTheSavedDraftVersionForTheRetry() = runTest(dispatcher) {
        val api = FakeGateway(agenda(version = 3))
        api.responses["/consultas/c1"] = JSONObject().put("version", 4)
        api.failures["/consultas/c1/firmar"] = AuthRequestException("Sin inscripción vigente.", 422)
        val vm = ConsultationViewModel(api, NoRealtime)
        vm.load(); runCurrent()
        var closed = false
        vm.sign(vm.state.value.appointments.single(), "Dolor de cabeza", "", "Reposo") { closed = true }; runCurrent()
        assertFalse(closed)
        assertEquals("Sin inscripción vigente.", vm.state.value.error)
        assertEquals(4, vm.state.value.appointments.single().version)

        api.failures.clear()
        api.responses["/consultas/c1"] = JSONObject().put("version", 5)
        vm.sign(vm.state.value.appointments.single(), "Dolor de cabeza", "", "Reposo") { closed = true }; runCurrent()
        val patches = api.calls.filter { it.first == "/consultas/c1" && it.second == "PATCH" }
        assertEquals(4, patches.last().third!!.getInt("version"))
        assertEquals(5, api.calls.last { it.first == "/consultas/c1/firmar" }.third!!.getInt("version"))
        assertTrue(closed)
    }

    @Test fun diagnosisFormIsClearedOnlyAfterTheApiAccepts() = runTest(dispatcher) {
        val api = FakeGateway(agenda())
        api.failures["/consultas/c1/diagnosticos"] = AuthRequestException("Código CIE-10 inválido.", 422)
        val vm = ConsultationViewModel(api, NoRealtime)
        vm.load(); runCurrent()
        var cleared = false
        vm.diagnosis(vm.state.value.appointments.single(), "x99", "", true) { cleared = true }; runCurrent()
        assertFalse(cleared)
        api.failures.clear()
        vm.diagnosis(vm.state.value.appointments.single(), "J00", "", true) { cleared = true }; runCurrent()
        assertTrue(cleared)
    }

    @Test fun prescriptionFormIsClearedOnlyAfterTheApiAccepts() = runTest(dispatcher) {
        val api = FakeGateway(agenda())
        api.failures["/consultas/c1/receta"] = AuthRequestException("Sin conexión.")
        val vm = ConsultationViewModel(api, NoRealtime)
        vm.load(); runCurrent()
        var cleared = false
        vm.prescription(vm.state.value.appointments.single(), "Paracetamol", "500 mg", "oral", "cada 8 h", "3 días", "") { cleared = true }; runCurrent()
        assertFalse(cleared)
        assertEquals("Sin conexión.", vm.state.value.error)
    }

    @Test fun physicianOrdersLabExamsFromTheConsultation() = runTest(dispatcher) {
        val api = FakeGateway(agenda())
        api.responses["/laboratorio/catalogo"] = JSONArray().put(JSONObject().put("id", "e1").put("code", "HEM").put("name", "Hemograma"))
        val vm = ConsultationViewModel(api, NoRealtime)
        vm.load(); runCurrent()
        vm.loadLabCatalog(); runCurrent()
        assertEquals(listOf("e1"), vm.state.value.labCatalog.map { it.id })
        var cleared = false
        vm.orderLab(vm.state.value.appointments.single(), setOf("e1"), urgent = false) { cleared = true }; runCurrent()
        val body = api.calls.single { it.first == "/laboratorio/ordenes" && it.second == "POST" }.third!!
        assertEquals("c1", body.getString("consultationId"))
        assertEquals("e1", body.getJSONArray("exams").getString(0))
        assertTrue(cleared)
        assertEquals("Orden de laboratorio emitida.", vm.state.value.notice)
    }

    @Test fun aLabOrderWithoutExamsNeverReachesTheApi() = runTest(dispatcher) {
        val api = FakeGateway(agenda())
        val vm = ConsultationViewModel(api, NoRealtime)
        vm.load(); runCurrent()
        vm.orderLab(vm.state.value.appointments.single(), emptySet(), urgent = false); runCurrent()
        assertTrue(api.calls.none { it.first == "/laboratorio/ordenes" })
    }

    private fun queue(consultationId: String? = null) = JSONArray().put(JSONObject().put("id", "t1").put("numero", 7).put("patientName", "Luis").put("state", "en_atencion")
        .put("consultationId", consultationId ?: JSONObject.NULL).put("consultationState", if (consultationId == null) JSONObject.NULL else "abierta"))
    private val detail = JSONObject().put("consultation", JSONObject().put("id", "c9").put("patientId", "p2").put("patientName", "Luis").put("reason", "Fiebre").put("state", "abierta").put("version", 2))

    @Test fun theDoctorsOwnNumberInAttentionResumesWithoutStartingAgain() = runTest(dispatcher) {
        val api = FakeGateway(agenda())
        api.responses["/fila"] = queue("c9"); api.responses["/consultas/c9/detalle"] = detail
        val vm = ConsultationViewModel(api, NoRealtime)
        vm.configure("u-1", withQueue = true); vm.load(); runCurrent()
        val ticket = vm.state.value.queue.single()
        assertEquals("c9", ticket.consultationId)
        vm.attend(ticket); runCurrent()
        assertTrue(api.calls.none { it.first == "/consultas" && it.second == "POST" })
        assertEquals("Fiebre", vm.state.value.resumed?.consultationReason)
        assertEquals(7, vm.state.value.resumed?.ticketNumber)
    }

    @Test fun aConflictWithTheOwnConsultationIdOpensIt() = runTest(dispatcher) {
        val api = FakeGateway(agenda())
        api.responses["/fila"] = queue(); api.responses["/consultas/c9/detalle"] = detail
        api.failures["/consultas"] = AuthRequestException("La consulta ya fue iniciada para este número.", 409, "consulta_ya_iniciada", """{"codigo":"consulta_ya_iniciada","consultaId":"c9"}""")
        val vm = ConsultationViewModel(api, NoRealtime)
        vm.configure("u-1", withQueue = true); vm.load(); runCurrent()
        vm.attend(vm.state.value.queue.single()); runCurrent()
        assertNull(vm.state.value.error)
        assertEquals("c9", vm.state.value.resumed?.consultationId)
    }

    @Test fun anotherDoctorsConsultationIsAnErrorAndOpensNothing() = runTest(dispatcher) {
        val api = FakeGateway(agenda())
        api.responses["/fila"] = queue()
        api.failures["/consultas"] = AuthRequestException("La consulta ya fue iniciada para este número.", 409, "consulta_ya_iniciada", """{"codigo":"consulta_ya_iniciada"}""")
        val vm = ConsultationViewModel(api, NoRealtime)
        vm.configure("u-1", withQueue = true); vm.load(); runCurrent()
        vm.attend(vm.state.value.queue.single()); runCurrent()
        assertEquals("La consulta ya fue iniciada para este número.", vm.state.value.error)
        assertNull(vm.state.value.resumed)
    }

    @Test fun withoutQueuePermissionTheQueueIsNotRequested() = runTest(dispatcher) {
        val api = FakeGateway(agenda())
        val vm = ConsultationViewModel(api, NoRealtime)
        vm.configure("u-1", withQueue = false); vm.load(); runCurrent()
        assertEquals(0, api.gets("/fila"))
    }

    @Test fun draftsAreKeptPerUserAndRemovedAfterSigning() = runTest(dispatcher) {
        val store = FileDraftStore(java.nio.file.Files.createTempDirectory("borradores").toFile())
        val api = FakeGateway(agenda())
        api.responses["/consultas/c1"] = JSONObject().put("version", 4)
        val vm = ConsultationViewModel(api, NoRealtime, store)
        vm.configure("u-1", withQueue = false); vm.load(); runCurrent()
        assertTrue(vm.saveDraft("c1", JSONObject().put("plan", "Reposo")))
        assertEquals("Reposo", vm.draft("c1")?.getString("plan"))
        assertNull(store.load("u-2", "consulta:c1"))
        vm.sign(vm.state.value.appointments.single(), "Dolor", "", "Reposo"); runCurrent()
        assertNull(vm.draft("c1"))
    }

    @Test fun signingInAsAnotherUserDropsThePreviousUsersDrafts() {
        val store = FileDraftStore(java.nio.file.Files.createTempDirectory("borradores").toFile())
        store.save("u-1", "consulta:c1", JSONObject().put("plan", "a"))
        ConsultationViewModel(FakeGateway(), NoRealtime, store).configure("u-2", withQueue = false)
        assertNull(store.load("u-1", "consulta:c1"))
    }

    @Test fun resumableIdIsReadOnlyFromTheConsultationConflict() {
        assertEquals("c9", ConsultationResume.resumableId("consulta_ya_iniciada", """{"consultaId":"c9"}"""))
        assertNull(ConsultationResume.resumableId("consulta_ya_iniciada", """{"codigo":"consulta_ya_iniciada"}"""))
        assertNull(ConsultationResume.resumableId("version_conflicto", """{"consultaId":"c9"}"""))
    }
}
