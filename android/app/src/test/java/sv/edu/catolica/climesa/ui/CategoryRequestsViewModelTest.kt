package sv.edu.catolica.climesa.ui

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
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
import sv.edu.catolica.climesa.data.realtime.RealtimeRepository
import sv.edu.catolica.climesa.domain.RealtimeSignal
import sv.edu.catolica.climesa.domain.RequestFranja
import java.time.LocalDate

/** Fase 2, flow A (S8) on Android: the patient asks by reason; reception assigns from the pending inbox. */
@OptIn(ExperimentalCoroutinesApi::class)
class CategoryRequestsViewModelTest {
    private val dispatcher = StandardTestDispatcher()
    @Before fun setUp() = Dispatchers.setMain(dispatcher)
    @After fun tearDown() = Dispatchers.resetMain()

    private val quiet = object : RealtimeRepository { override fun observe(channels: List<String>) = emptyFlow<RealtimeSignal>() }
    private val day = LocalDate.parse("2030-11-20")

    private fun categories() = JSONArray()
        .put(JSONObject().put("code", "consulta_general").put("name", "Consulta general").put("description", "Malestar").put("icon", "general").put("specialties", JSONArray().put("Medicina general")).put("keywords", "fiebre"))
        .put(JSONObject().put("code", "piel").put("name", "Piel").put("description", "Manchas").put("icon", "piel").put("specialties", JSONArray().put("Dermatología")).put("keywords", "acne"))

    private fun pending(allowed: List<String>, state: String = "pendiente") = JSONObject().put("id", "s1").put("patientName", "Paciente Ficticio").put("record", "EXP-1")
        .put("categories", JSONArray().put(JSONObject().put("code", "piel").put("name", "Piel").put("icon", "piel"))).put("specialties", JSONArray().put("Dermatología"))
        .put("franja", "tarde").put("note", "Mancha").put("preferredDoctorId", JSONObject.NULL).put("preferredDoctorName", JSONObject.NULL).put("state", state)
        .put("rejectionReason", JSONObject.NULL).put("appointment", JSONObject.NULL).put("createdAt", "2030-11-19T14:00:00Z").put("version", 4).put("allowedActions", JSONArray(allowed))

    private fun gateway(rows: JSONArray) = FakeGateway().apply {
        responses["/citas/categorias"] = categories()
        responses["/citas/solicitudes-categoria"] = rows
        responses["/citas/catalogos?date=$day"] = JSONObject().put("doctors", JSONArray()
            .put(JSONObject().put("id", "d1").put("givenNames", "Médica").put("surnames", "General").put("specialty", "Medicina general").put("tieneTurno", true))
            .put(JSONObject().put("id", "d3").put("givenNames", "Doctora").put("surnames", "Dermis").put("specialty", "Dermatología").put("tieneTurno", true)))
        // 09:00, 13:00 (ocupada) y 13:20 hora de El Salvador.
        responses["/citas/disponibilidad?doctorId=d3&date=$day"] = JSONObject().put("franjas", JSONArray()
            .put(JSONObject().put("start", "2030-11-20T15:00:00Z").put("end", "2030-11-20T15:20:00Z").put("estado", "libre"))
            .put(JSONObject().put("start", "2030-11-20T19:00:00Z").put("end", "2030-11-20T19:20:00Z").put("estado", "ocupado"))
            .put(JSONObject().put("start", "2030-11-20T19:20:00Z").put("end", "2030-11-20T19:40:00Z").put("estado", "libre")))
    }

    @Test fun patientSendsCategoriesTimeOfDayAndNoteWithoutADoctor() = runTest(dispatcher) {
        val api = gateway(JSONArray())
        val vm = CategoryRequestsViewModel(api, quiet)
        vm.load(withCategories = true); runCurrent()
        vm.openForm()
        vm.search("acné")
        assertEquals(listOf("piel"), vm.state.value.visibleCategories.map { it.code })
        vm.toggle("piel"); vm.search(""); vm.toggle("consulta_general")
        vm.franja(RequestFranja.AFTERNOON); vm.note("  Mancha en el brazo  ")
        vm.send(); runCurrent()
        val post = api.calls.single { it.second == "POST" }
        assertEquals("/citas/solicitudes-categoria", post.first)
        val body = post.third!!
        assertEquals(listOf("piel", "consulta_general"), (0 until body.getJSONArray("categories").length()).map { body.getJSONArray("categories").getString(it) })
        assertEquals("tarde", body.getString("franja"))
        assertEquals("Mancha en el brazo", body.getString("note"))
        assertEquals(setOf("categories", "franja", "note"), body.keys().asSequence().toSet())
        assertFalse(vm.state.value.formOpen)
        assertTrue(vm.state.value.notice!!.startsWith("Solicitud enviada"))
    }

    @Test fun nothingIsSentWithoutACategoryAndTheServerLimitIsShown() = runTest(dispatcher) {
        val api = gateway(JSONArray())
        api.failures["/citas/solicitudes-categoria"] = AuthRequestException("raw", 409, "limite_solicitudes")
        val vm = CategoryRequestsViewModel(api, quiet)
        vm.load(withCategories = true); runCurrent()
        vm.openForm(); vm.send(); runCurrent()
        assertTrue(api.calls.none { it.second == "POST" })
        vm.toggle("piel"); vm.preferredDoctor("d3"); vm.send(); runCurrent()
        assertEquals("d3", api.calls.single { it.second == "POST" }.third!!.getString("preferredDoctorId"))
        assertTrue(vm.state.value.formOpen)
        assertTrue(vm.state.value.error != null)
    }

    @Test fun patientWithdrawsOnlyWhenTheServerAllowsIt() = runTest(dispatcher) {
        val api = gateway(JSONArray().put(pending(listOf("cancelar"))))
        val vm = CategoryRequestsViewModel(api, quiet)
        vm.load(); runCurrent()
        vm.withdraw(vm.state.value.requests.single()); runCurrent()
        val post = api.calls.single { it.second == "POST" }
        assertEquals("/citas/solicitudes-categoria/s1/cancelar", post.first)
        assertEquals(4, post.third!!.getInt("version"))
        api.responses["/citas/solicitudes-categoria"] = JSONArray().put(pending(emptyList()))
        vm.load(); runCurrent()
        vm.withdraw(vm.state.value.requests.single()); runCurrent()
        assertEquals("no action without allowedActions", 1, api.calls.count { it.second == "POST" })
    }

    @Test fun receptionAssignPrefillsTheSuggestedDoctorAndTheFirstFreeAfternoonSlot() = runTest(dispatcher) {
        val api = gateway(JSONArray().put(pending(listOf("asignar", "rechazar"))))
        val vm = CategoryRequestsViewModel(api, quiet)
        vm.load(); runCurrent()
        assertEquals(1, vm.state.value.inbox.size)
        vm.openAssign(vm.state.value.inbox.single(), day); runCurrent()
        assertEquals("d3", vm.state.value.doctor?.id)
        assertEquals("2030-11-20T19:20:00Z", vm.state.value.slot?.start)
        assertEquals("only afternoon slots by default", 2, vm.state.value.visibleSlots.size)
        vm.wholeDay(true)
        assertEquals(3, vm.state.value.visibleSlots.size)
        vm.assign(); runCurrent()
        val post = api.calls.single { it.second == "POST" }
        assertEquals("/citas/solicitudes-categoria/s1/asignar", post.first)
        val body = post.third!!
        assertEquals(4, body.getInt("version")); assertEquals("d3", body.getString("doctorId"))
        assertEquals("2030-11-20T19:20:00Z", body.getString("start")); assertEquals("2030-11-20T19:40:00Z", body.getString("end"))
        assertNull(vm.state.value.assigning)
        assertEquals("Cita asignada a Paciente Ficticio.", vm.state.value.notice)
    }

    @Test fun receptionRejectsWithAReasonOfTenCharacters() = runTest(dispatcher) {
        val api = gateway(JSONArray().put(pending(listOf("asignar", "rechazar"))))
        val vm = CategoryRequestsViewModel(api, quiet)
        vm.load(); runCurrent()
        val row = vm.state.value.inbox.single()
        vm.reject(row, "corto"); runCurrent()
        assertTrue(api.calls.none { it.second == "POST" })
        vm.reject(row, " No hay dermatología este mes "); runCurrent()
        val post = api.calls.single { it.second == "POST" }
        assertEquals("/citas/solicitudes-categoria/s1/rechazar", post.first)
        assertEquals("No hay dermatología este mes", post.third!!.getString("rejectionReason"))
    }

    @Test fun theInboxListsOnlyPendingRequestsTheReaderCanAssign() = runTest(dispatcher) {
        val api = gateway(JSONArray().put(pending(listOf("asignar", "rechazar"))).put(pending(emptyList(), state = "asignada").put("id", "s2")))
        val vm = CategoryRequestsViewModel(api, quiet)
        vm.load(); runCurrent()
        assertEquals(listOf("s1"), vm.state.value.inbox.map { it.id })
        assertEquals(2, vm.state.value.requests.size)
    }
}
