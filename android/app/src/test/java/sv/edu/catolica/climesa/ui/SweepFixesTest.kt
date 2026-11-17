package sv.edu.catolica.climesa.ui

import java.time.Instant
import java.time.LocalDate
import kotlin.coroutines.coroutineContext
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
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import sv.edu.catolica.climesa.data.ApiGateway
import sv.edu.catolica.climesa.data.AuthRequestException
import sv.edu.catolica.climesa.data.RequestIntent
import sv.edu.catolica.climesa.data.ResultsSeen
import sv.edu.catolica.climesa.data.realtime.RealtimeRepository
import sv.edu.catolica.climesa.domain.DashboardSource
import sv.edu.catolica.climesa.domain.FormDrafts
import sv.edu.catolica.climesa.domain.MedicalAppointment
import sv.edu.catolica.climesa.domain.RealtimeSignal
import sv.edu.catolica.climesa.domain.RoleDashboard

/** Fixes of the 2026-11-17 sweep, U2 items (#1, #3, #4, #6 and the small Android findings). */
@OptIn(ExperimentalCoroutinesApi::class)
class SweepFixesTest {
    private val dispatcher = StandardTestDispatcher()
    @Before fun setUp() = Dispatchers.setMain(dispatcher)
    @After fun tearDown() = Dispatchers.resetMain()
    private val quiet = object : RealtimeRepository { override fun observe(channels: List<String>) = emptyFlow<RealtimeSignal>() }

    /** Records each POST with its Idempotency-Key; [onPost] may throw for the n-th POST. */
    private class KeyedGateway : ApiGateway {
        val posts = mutableListOf<Triple<String, String?, JSONObject?>>()
        val responses = mutableMapOf<String, Any>()
        var onPost: (Int, String) -> Unit = { _, _ -> }
        override suspend fun request(path: String, method: String, body: JSONObject?): Any {
            if (method == "POST") { posts += Triple(path, coroutineContext[RequestIntent]?.idempotencyKey, body); onPost(posts.size, path) }
            return responses[path] ?: if (method == "GET") JSONArray() else JSONObject()
        }
    }

    private fun ticket(id: String, numero: Int, version: Int, state: String, vararg allowed: String) = JSONObject().put("id", id).put("numero", numero).put("service", "consulta_general").put("area", "CON")
        .put("state", state).put("priority", "normal").put("version", version).put("allowedActions", JSONArray(allowed.toList())).put("patientName", "Ana").put("createdAt", "2026-11-15T14:00:00Z")

    // #1: the dialog error shows even without onDone (dispatch, discard, Recibido, PAR finish).
    @Test fun aConfirmDialogShowsItsErrorWithoutOnDone() {
        assertEquals("La ambulancia ya fue despachada.", ConfirmDialogText.shownError("La ambulancia ya fue despachada.", hasOnDone = false))
        assertNull(ConfirmDialogText.shownError(null, hasOnDone = false))
    }

    // #3: a version conflict re-reads the ticket and resends with a new body and a new key.
    @Test fun aVersionConflictResendsWithTheNewVersionAndANewKey() = runTest(dispatcher) {
        val drafts = MemoryDrafts()
        val api = KeyedGateway(); api.responses["/fila"] = JSONArray().put(ticket("t1", 7, 4, "llamado", "no_se_presento"))
        api.onPost = { n, _ -> if (n == 1) { api.responses["/fila"] = JSONArray().put(ticket("t1", 7, 5, "llamado", "no_se_presento")); throw AuthRequestException("Versión", 409, "version_conflicto") } }
        val vm = QueueViewModel(api, quiet, drafts)
        vm.bindUser("rec-1"); vm.load(); runCurrent()
        vm.absent(vm.state.value.tickets.single())
        advanceTimeBy(8_001); runCurrent()
        assertEquals(2, api.posts.size)
        assertEquals(4, api.posts[0].third!!.getInt("version"))
        assertEquals(5, api.posts[1].third!!.getInt("version"))
        assertNotEquals("a new body takes a new key", api.posts[0].second, api.posts[1].second)
        assertNull(drafts.load("rec-1", FormDrafts.DEFERRED_ABSENCE))
    }

    @Test fun aVersionConflictOnATicketThatMovedOnSaysSoAndSendsNothingMore() = runTest(dispatcher) {
        val drafts = MemoryDrafts()
        val api = KeyedGateway(); api.responses["/fila"] = JSONArray().put(ticket("t1", 7, 4, "llamado", "no_se_presento"))
        api.onPost = { n, _ -> if (n == 1) { api.responses["/fila"] = JSONArray().put(ticket("t1", 7, 5, "en_atencion")); throw AuthRequestException("Versión", 409, "version_conflicto") } }
        val vm = QueueViewModel(api, quiet, drafts)
        vm.bindUser("rec-1"); vm.load(); runCurrent()
        vm.absent(vm.state.value.tickets.single())
        advanceTimeBy(8_001); runCurrent()
        vm.resume(); runCurrent()
        assertEquals(1, api.posts.size)
        assertEquals("El número cambió mientras esperaba; no se marcó.", vm.state.value.error)
        assertNull(drafts.load("rec-1", FormDrafts.DEFERRED_ABSENCE))
    }

    // #4: another ticket's action keeps this ticket's undo; two absences keep both undos.
    @Test fun anotherTicketsActionKeepsTheUndoOfThisOne() = runTest(dispatcher) {
        val api = KeyedGateway()
        api.responses["/fila"] = JSONArray().put(ticket("t1", 7, 4, "llamado", "no_se_presento")).put(ticket("t2", 8, 2, "llamado", "no_se_presento", "atender")).put(ticket("t3", 9, 1, "llamado", "atender"))
        val vm = QueueViewModel(api, quiet, MemoryDrafts())
        vm.bindUser("rec-1"); vm.load(); runCurrent()
        val tickets = vm.state.value.tickets
        vm.absent(tickets.first { it.id == "t1" })
        vm.absent(tickets.first { it.id == "t2" }); runCurrent()
        assertEquals(setOf("t1", "t2"), vm.state.value.pendingAbsences.map { it.key }.toSet())
        vm.attend(tickets.first { it.id == "t3" }); runCurrent()
        assertEquals(listOf("/fila/t3/atender"), api.posts.map { it.first })
        assertEquals(setOf("t1", "t2"), vm.state.value.pendingAbsences.map { it.key }.toSet())
        vm.undoAbsence("t1")
        assertEquals(listOf("t2"), vm.state.value.pendingAbsences.map { it.key })
        // An action on the same ticket sends its waiting absence first.
        vm.attend(tickets.first { it.id == "t2" }); runCurrent()
        assertEquals(listOf("/fila/t3/atender", "/fila/t2/no-se-presento", "/fila/t2/atender"), api.posts.map { it.first })
    }

    // #6: an unreadable order list is said and blocks ordering until it is known.
    @Test fun anUnreadableOrderListBlocksOrderingWithTheReason() = runTest(dispatcher) {
        val api = FakeGateway().apply {
            responses["/consultas/c1/detalle"] = JSONObject().put("consultation", JSONObject().put("id", "c1")).put("diagnoses", JSONArray()).put("prescriptions", JSONArray())
            failures["/laboratorio/ordenes"] = AuthRequestException("Sin conexión.")
            responses["/laboratorio/catalogo"] = JSONArray().put(JSONObject().put("id", "e1").put("code", "HEM").put("name", "Hemograma").put("isPanel", false))
        }
        val item = MedicalAppointment("", "p1", "Ana Ficticia", "", "", "", null, "c1", "en_curso", "Tos", "", "", 2)
        val vm = ConsultationViewModel(api, quiet)
        vm.loadRecord("c1", withLabOrders = true); vm.loadLabCatalog(); runCurrent()
        assertNotNull(vm.state.value.recordError)
        assertFalse(vm.state.value.record!!.labOrdersKnown)
        // The reason the screen prints next to the disabled "Emitir orden".
        assertEquals("No se pudieron leer las órdenes de esta consulta; vuelve a cargarlas antes de ordenar.", vm.labOrderBlocker("c1"))
        api.failures.remove("/laboratorio/ordenes")
        vm.orderLab(item, listOf("e1"), urgent = false); runCurrent()
        assertTrue(api.calls.none { it.second == "POST" })
        assertEquals("No se pudieron leer las órdenes de esta consulta; vuelve a cargarlas antes de ordenar.", vm.state.value.error)
        vm.loadRecord("c1"); runCurrent()
        assertTrue(vm.state.value.record!!.labOrdersKnown)
        assertNull(vm.state.value.recordError)
        assertNull(vm.labOrderBlocker("c1"))
    }

    // "Resultados nuevos" reaches 0 once the patient opened them.
    @Test fun resultsSeenByThePatientAreNoLongerNew() {
        val drafts = MemoryDrafts()
        val now = Instant.parse("2026-11-16T15:00:00Z")
        val lab = JSONArray().put(JSONObject().put("state", "completado").put("reviewedAt", "2026-11-16T10:00:00Z"))
        val perms = listOf("sesion.perfil", "resultados.ver")
        assertTrue(RoleDashboard.build("PAC", perms, mapOf(DashboardSource.MY_LAB to lab), now = now, resultsSeenAt = ResultsSeen.load(drafts, "u1")).attention.any { it.title.startsWith("Resultados nuevos") })
        ResultsSeen.mark(drafts, "u1", Instant.parse("2026-11-16T12:00:00Z"))
        assertTrue(RoleDashboard.build("PAC", perms, mapOf(DashboardSource.MY_LAB to lab), now = now, resultsSeenAt = ResultsSeen.load(drafts, "u1")).attention.none { it.title.startsWith("Resultados nuevos") })
        assertNull("per account", ResultsSeen.load(drafts, "u2"))
    }

    // PAC request: the preferred-doctor catalog covers the 7 days reception may assign, not only today.
    @Test fun theRequestDoctorCatalogCoversTheNextSevenDays() = runTest(dispatcher) {
        val today = LocalDate.parse("2030-11-20")
        val api = FakeGateway()
        fun catalog(shift: Boolean) = JSONObject().put("doctors", JSONArray().put(JSONObject().put("id", "d1").put("givenNames", "Doctora").put("surnames", "Dermis").put("specialty", "Dermatología").put("tieneTurno", shift)))
        (0L until 7L).forEach { api.responses["/citas/catalogos?date=${today.plusDays(it)}"] = catalog(it == 3L) }
        val vm = PatientAppointmentsViewModel(api, quiet)
        vm.loadRequestDoctors(today); runCurrent()
        assertEquals(7, (0L until 7L).count { api.gets("/citas/catalogos?date=${today.plusDays(it)}") == 1 })
        assertTrue("on shift on one of the requested days", vm.state.value.requestDoctors.single().hasShift)
    }
}
