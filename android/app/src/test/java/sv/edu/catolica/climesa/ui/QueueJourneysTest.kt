package sv.edu.catolica.climesa.ui

import kotlin.coroutines.coroutineContext
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.emptyFlow
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
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import sv.edu.catolica.climesa.data.ApiGateway
import sv.edu.catolica.climesa.data.RequestIntent
import sv.edu.catolica.climesa.data.realtime.RealtimeRepository
import sv.edu.catolica.climesa.domain.PickerPatient
import sv.edu.catolica.climesa.domain.RealtimeSignal

private val quietBus = object : RealtimeRepository { override fun observe(channels: List<String>) = emptyFlow<RealtimeSignal>() }

/** Records each write with its Idempotency-Key. */
private class KeyRecorder(val inner: FakeGateway = FakeGateway()) : ApiGateway {
    val writes = mutableListOf<Pair<String, String?>>()
    override suspend fun request(path: String, method: String, body: JSONObject?): Any {
        if (method != "GET") writes += path to coroutineContext[RequestIntent]?.idempotencyKey
        return inner.request(path, method, body)
    }
}

/** Holds every write until [release], to observe what the screen shows while it is being sent. */
private class HeldGateway(val inner: FakeGateway = FakeGateway()) : ApiGateway {
    var gate = CompletableDeferred<Unit>()
    override suspend fun request(path: String, method: String, body: JSONObject?): Any {
        if (method != "GET") gate.await()
        return inner.request(path, method, body)
    }
}

/** R7 U2, journeys B1 (counter), B3 (call next and undo) and B5 (Mi turno), through the view model's public interface. */
@OptIn(ExperimentalCoroutinesApi::class)
class QueueJourneysTest {
    private val dispatcher = StandardTestDispatcher()
    @Before fun setUp() = Dispatchers.setMain(dispatcher)
    @After fun tearDown() = Dispatchers.resetMain()

    private fun ticket(id: String, number: Int, state: String = "en_espera", allowed: List<String> = listOf("llamar"), undo: List<String> = emptyList(), service: String = "consulta_general") =
        JSONObject().put("id", id).put("service", service).put("numero", number).put("patientName", "Paciente $number").put("state", state)
            .put("llamados", if (state == "llamado") 1 else 0).put("version", 2).put("issuedAt", "2030-11-20T14:00:00Z")
            .put("allowedActions", JSONArray(allowed)).put("blockedActions", JSONArray()).put("undoActions", JSONArray(undo))

    private val ana = PickerPatient("p1", "EXP-1", "Ana Ficticia", 30)
    private val luis = PickerPatient("p2", "EXP-2", "Luis Ficticio", 41)
    private fun posts(api: FakeGateway) = api.calls.filter { it.second == "POST" }

    // B1: "CON 12 · Ana · 2 antes" stays where it was issued and the search is ready for the next patient.
    @Test fun issuedNumberShowsInPlaceWithPeopleAheadAndClearsTheSearch() = runTest(dispatcher) {
        val api = FakeGateway()
        api.responses["/fila"] = JSONArray().put(ticket("t1", 10)).put(ticket("t2", 11)).put(ticket("t9", 12))
        // GET and POST share `/fila`: the POST answers with the issued ticket.
        val issuing = object : ApiGateway {
            override suspend fun request(path: String, method: String, body: JSONObject?): Any =
                if (path == "/fila" && method == "POST") { api.calls += Triple(path, method, body); JSONObject().put("id", "t9").put("numero", 12).put("area", "CON") } else api.request(path, method, body)
        }
        val counter = QueueViewModel(issuing, quietBus)
        counter.pickIssuePatient(ana)
        counter.issue("laboratorio")
        runCurrent()
        val shown = counter.state.value.issued!!
        assertEquals("CON 12", shown.code)
        assertEquals("Ana Ficticia", shown.patientName)
        assertEquals("the two waiting numbers before it", 2, shown.ahead)
        assertNull("the search is ready for the next patient", counter.state.value.issueSearch.patient)
        assertEquals("the last service is preselected next time", "laboratorio", counter.state.value.lastService)
        assertEquals(1, posts(api).count { it.first == "/fila" })
        assertTrue("the list refreshes after issuing", api.gets("/fila") >= 1)
    }

    // B1: a retry after a failure for Ana never reuses her key for Luis (no false `idempotencia_conflicto`).
    @Test fun eachPatientGetsItsOwnIdempotencyKey() = runTest(dispatcher) {
        val api = KeyRecorder()
        api.inner.failures["/fila"] = RuntimeException("red")
        val vm = QueueViewModel(api, quietBus)
        vm.pickIssuePatient(ana); vm.issue("consulta_general"); runCurrent()
        api.inner.failures.clear()
        vm.pickIssuePatient(luis); vm.issue("consulta_general"); runCurrent()
        val keys = api.writes.filter { it.first == "/fila" }.map { it.second }
        assertEquals(2, keys.size)
        assertNotEquals(keys[0], keys[1])
    }

    // B1: no double submit; only the counter's button spins while it is sent.
    @Test fun doubleTapIssuesOnceAndOnlyTheIssueButtonIsBusy() = runTest(dispatcher) {
        val api = HeldGateway()
        val vm = QueueViewModel(api, quietBus)
        vm.pickIssuePatient(ana)
        vm.issue("consulta_general"); vm.issue("consulta_general"); runCurrent()
        assertEquals(QueueViewModel.ISSUE, vm.state.value.busyKey)
        api.gate.complete(Unit); runCurrent()
        assertEquals(1, api.inner.calls.count { it.first == "/fila" && it.second == "POST" })
        assertNull(vm.state.value.busyKey)
    }

    // B3: calling a number spins only that card.
    @Test fun callingSpinsOnlyTheTouchedCard() = runTest(dispatcher) {
        val api = HeldGateway()
        api.inner.responses["/fila"] = JSONArray().put(ticket("t1", 1)).put(ticket("t2", 2))
        val vm = QueueViewModel(api, quietBus)
        vm.load(); runCurrent()
        vm.call(vm.state.value.tickets.first { it.id == "t2" }); runCurrent()
        assertEquals("t2", vm.state.value.busyKey)
        api.gate.complete(Unit); runCurrent()
        assertNull(vm.state.value.busyKey)
    }

    // B3: call two numbers and undo the first: it goes back, the second stays called with its own undo.
    @Test fun everyCalledNumberKeepsItsOwnUndo() = runTest(dispatcher) {
        val api = FakeGateway()
        api.responses["/fila"] = JSONArray().put(ticket("t1", 1)).put(ticket("t2", 2))
        api.responses["/fila/t1/llamar"] = JSONObject().put("version", 3)
        api.responses["/fila/t2/llamar"] = JSONObject().put("version", 3)
        val vm = QueueViewModel(api, quietBus)
        vm.load(); runCurrent()
        // The reload after each call reads the number as called.
        api.responses["/fila"] = JSONArray().put(ticket("t1", 1, "llamado", undo = listOf("deshacer_llamado"))).put(ticket("t2", 2))
        vm.call(vm.state.value.tickets[0]); runCurrent()
        api.responses["/fila"] = JSONArray().put(ticket("t1", 1, "llamado", undo = listOf("deshacer_llamado"))).put(ticket("t2", 2, "llamado", undo = listOf("deshacer_llamado")))
        vm.call(vm.state.value.tickets.first { it.id == "t2" }); runCurrent()
        assertEquals(setOf("t1", "t2"), vm.state.value.calledByMe)
        vm.undoCall(vm.state.value.tickets.first { it.id == "t1" }); runCurrent()
        assertTrue(posts(api).any { it.first == "/fila/t1/deshacer-llamado" })
        assertEquals(setOf("t2"), vm.state.value.calledByMe)
    }

    // D-3 on the board: "No se presentó" waits 8 s; "Deshacer" inside the window sends nothing.
    @Test fun absenceIsHeldEightSecondsAndUndoSendsNothing() = runTest(dispatcher) {
        val api = FakeGateway()
        api.responses["/fila"] = JSONArray().put(ticket("t1", 7, "llamado", allowed = listOf("no_se_presento")))
        val vm = QueueViewModel(api, quietBus)
        vm.load(); runCurrent()
        vm.absent(vm.state.value.tickets.single())
        assertEquals("t1", vm.state.value.pendingAbsence?.key)
        advanceTimeBy(7_000); runCurrent()
        assertTrue(posts(api).isEmpty())
        vm.undoAbsence()
        advanceTimeBy(10_000); runCurrent()
        assertTrue("nothing reached the server", posts(api).isEmpty())
        assertNull(vm.state.value.pendingAbsence)
        assertEquals("Se mantiene en la fila.", vm.state.value.notice)
    }

    @Test fun absenceIsSentWhenTheWindowEnds() = runTest(dispatcher) {
        val api = FakeGateway()
        api.responses["/fila"] = JSONArray().put(ticket("t1", 7, "llamado", allowed = listOf("no_se_presento")))
        val vm = QueueViewModel(api, quietBus)
        vm.load(); runCurrent()
        vm.absent(vm.state.value.tickets.single())
        advanceTimeBy(8_001); runCurrent()
        assertEquals(listOf("/fila/t1/no-se-presento"), posts(api).map { it.first })
        assertEquals("CON 7 marcado como no presentado.", vm.state.value.notice)
    }

    // B3: "Llamar siguiente" closes its dialog only when the API called someone.
    @Test fun callNextClosesOnlyOnSuccess() = runTest(dispatcher) {
        val api = FakeGateway()
        api.failures["/fila/llamar-siguiente"] = RuntimeException("red")
        val vm = QueueViewModel(api, quietBus)
        var closed = false
        vm.callNext("consulta_general") { closed = true }; runCurrent()
        assertFalse(closed)
        assertTrue(vm.state.value.error != null)
        api.failures.clear()
        api.responses["/fila/llamar-siguiente"] = JSONObject().put("id", "t5").put("numero", 5).put("version", 3)
        vm.callNext("consulta_general") { closed = true }; runCurrent()
        assertTrue(closed)
        assertEquals("Se llamó al N.º 5 de Consulta general.", vm.state.value.notice)
    }

    // B5: the patient sees how many people are before them and, once called, the room.
    @Test fun patientSeesPeopleAheadAndTheRoomOnceCalled() = runTest(dispatcher) {
        val api = FakeGateway()
        api.responses["/fila"] = JSONArray().put(ticket("own", 12, allowed = emptyList()))
        api.responses["/publico/fila/consulta_general"] = JSONObject().put("llamados", JSONArray().put(JSONObject().put("numero", 8).put("consultorio", "Consultorio 2")).put(JSONObject().put("numero", 9).put("consultorio", JSONObject.NULL)))
        val vm = QueueViewModel(api, quietBus)
        vm.followOwnTicket(); vm.load(); runCurrent()
        val mine = sv.edu.catolica.climesa.domain.PatientQueue.current(vm.state.value.tickets)!!
        assertEquals(2, sv.edu.catolica.climesa.domain.PatientQueue.ahead(mine.number, vm.state.value.publicCalls))
        api.responses["/fila"] = JSONArray().put(ticket("own", 12, "llamado", allowed = emptyList()))
        api.responses["/publico/fila/consulta_general"] = JSONObject().put("llamados", JSONArray().put(JSONObject().put("numero", 12).put("consultorio", "Consultorio 3")))
        vm.load(silent = true); runCurrent()
        val called = sv.edu.catolica.climesa.domain.PatientQueue.current(vm.state.value.tickets)!!
        assertEquals("Consultorio 3", sv.edu.catolica.climesa.domain.PatientQueue.office(called, vm.state.value.publicCalls))
    }
}
