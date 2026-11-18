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
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import sv.edu.catolica.climesa.data.ApiGateway
import sv.edu.catolica.climesa.data.AuthRequestException
import sv.edu.catolica.climesa.data.realtime.RealtimeRepository
import sv.edu.catolica.climesa.domain.PickerPatient
import sv.edu.catolica.climesa.domain.RealtimeSignal

private val silentBus = object : RealtimeRepository { override fun observe(channels: List<String>) = emptyFlow<RealtimeSignal>() }

/** Reception audit (REC) and ENF/AST extras on the queue: void, arrival from Citas, server "calledByMe", reload on 409. */
@OptIn(ExperimentalCoroutinesApi::class)
class ReceptionQueueFixesTest {
    private val dispatcher = StandardTestDispatcher()
    @Before fun setUp() = Dispatchers.setMain(dispatcher)
    @After fun tearDown() = Dispatchers.resetMain()

    private fun ticket(id: String, state: String, calledByMe: Boolean = false) = JSONObject().put("id", id).put("service", "consulta_general").put("numero", 7)
        .put("patientName", "Paciente Ficticio").put("state", state).put("llamados", if (state == "llamado") 1 else 0).put("version", 4)
        .put("allowedActions", JSONArray()).put("blockedActions", JSONArray()).put("undoActions", JSONArray(listOf("deshacer_llamado"))).put("calledByMe", calledByMe)

    /** `/fila` answers the board on GET and the issued number on POST. */
    private class Counter(val board: JSONArray, val issued: JSONObject) : ApiGateway {
        val calls = mutableListOf<Triple<String, String, JSONObject?>>()
        var failWith: Exception? = null
        override suspend fun request(path: String, method: String, body: JSONObject?): Any {
            calls += Triple(path, method, body)
            if (method == "POST") failWith?.let { throw it }
            return when {
                path == "/fila" && method == "POST" -> issued
                path == "/fila" -> board
                method == "POST" -> JSONObject().put("version", 5)
                else -> JSONArray()
            }
        }
    }

    @Test fun theIssuerVoidsTheNumberJustIssuedWithItsVersion() = runTest(dispatcher) {
        val until = java.time.Instant.ofEpochMilli(System.currentTimeMillis() + 600_000).toString()
        val api = Counter(JSONArray(), JSONObject().put("id", "t9").put("numero", 12).put("area", "CON").put("version", 1).put("voidableUntil", until))
        val vm = QueueViewModel(api, silentBus)
        vm.pickIssuePatient(PickerPatient("p1", "EXP-1", "Ana Ficticia", 30))
        vm.issue("consulta_general"); runCurrent()
        assertEquals("CON 12", vm.state.value.issued?.code)
        vm.voidIssued(); runCurrent()
        val void = api.calls.single { it.first == "/fila/t9/anular" }
        assertEquals(1, void.third?.getInt("version"))
        assertNull(vm.state.value.issued)
        assertEquals("CON 12", vm.state.value.voided)
    }

    @Test fun outsideTheWindowNothingIsVoided() = runTest(dispatcher) {
        val past = java.time.Instant.ofEpochMilli(System.currentTimeMillis() - 1_000).toString()
        val api = Counter(JSONArray(), JSONObject().put("id", "t9").put("numero", 12).put("version", 1).put("voidableUntil", past))
        val vm = QueueViewModel(api, silentBus)
        vm.pickIssuePatient(PickerPatient("p1", "EXP-1", "Ana Ficticia", 30))
        vm.issue("consulta_general"); runCurrent()
        vm.voidIssued(); runCurrent()
        assertTrue(api.calls.none { it.first.endsWith("/anular") })
    }

    @Test fun anArrivalFromCitasIssuesTheNumberLinkedToTheAppointment() = runTest(dispatcher) {
        val api = Counter(JSONArray(), JSONObject().put("id", "t3").put("numero", 5).put("area", "CON").put("ahead", 2))
        val vm = QueueViewModel(api, silentBus)
        vm.registerArrivalFor("c1", "p1", "Ana Ficticia"); runCurrent()
        val body = api.calls.single { it.first == "/fila" && it.second == "POST" }.third!!
        assertEquals("consulta_general", body.getString("service"))
        assertEquals("c1", body.getString("appointmentId"))
        assertEquals("p1", body.getString("patientId"))
        assertEquals("Llegada registrada: Ana Ficticia tiene el número CON 5, 2 antes.", vm.state.value.arrival?.text)
    }

    // #10: "Deshacer" comes from the server's `calledByMe`, so it survives a restart of the app.
    @Test fun undoComesFromTheServerCalledByMe() = runTest(dispatcher) {
        val api = Counter(JSONArray().put(ticket("t1", "llamado", calledByMe = true)).put(ticket("t2", "llamado")), JSONObject())
        val vm = QueueViewModel(api, silentBus)
        vm.load(); runCurrent()
        assertEquals(setOf("t1"), vm.state.value.calledByMe)
    }

    // #11: after a 409 the board is read again, so the card shows its real state.
    @Test fun aVersionConflictReloadsTheBoard() = runTest(dispatcher) {
        val api = Counter(JSONArray().put(ticket("t1", "en_espera")), JSONObject())
        val vm = QueueViewModel(api, silentBus)
        vm.load(); runCurrent()
        val before = api.calls.count { it.first == "/fila" && it.second == "GET" }
        api.failWith = AuthRequestException("El número cambió.", 409, "version_conflicto")
        vm.call(sv.edu.catolica.climesa.domain.QueueRules.parse(api.board).single()); runCurrent()
        assertTrue(vm.state.value.error != null)
        assertEquals(before + 1, api.calls.count { it.first == "/fila" && it.second == "GET" })
    }
}
