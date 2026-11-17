package sv.edu.catolica.climesa.ui

import androidx.lifecycle.viewModelScope
import java.time.Instant
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.cancel
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
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import sv.edu.catolica.climesa.data.AuthRequestException
import sv.edu.catolica.climesa.data.realtime.RealtimeRepository
import sv.edu.catolica.climesa.domain.FormDrafts
import sv.edu.catolica.climesa.domain.MedicalAppointment
import sv.edu.catolica.climesa.domain.RealtimeSignal
import sv.edu.catolica.climesa.domain.ReceptionScheduling

/** A deferred action (D-3 undo window) is stored from the tap and never lost: killed app, failure or several at once. */
@OptIn(ExperimentalCoroutinesApi::class)
class DeferredActionsTest {
    private val dispatcher = StandardTestDispatcher()
    @Before fun setUp() = Dispatchers.setMain(dispatcher)
    @After fun tearDown() = Dispatchers.resetMain()

    private val quiet = object : RealtimeRepository { override fun observe(channels: List<String>) = emptyFlow<RealtimeSignal>() }

    private fun appointment(id: String, name: String) = ReceptionScheduling.appointments(JSONArray().put(JSONObject().put("id", id).put("patientName", name).put("doctorId", "d1").put("doctorName", "Dr. Prueba")
        .put("start", "2030-11-20T14:00:00Z").put("end", "2030-11-20T14:20:00Z").put("state", "confirmada").put("version", 3)
        .put("allowedActions", JSONArray().put("no_asistio")).put("blockedActions", JSONArray()))).single()

    private fun ambulance(withService: Boolean = true) = JSONObject()
        .put("unit", JSONObject().put("id", "u1").put("plate", "P-000-001").put("state", "en_servicio").put("version", 5))
        .put("paramedicOnDuty", true)
        .put("activeService", if (!withService) JSONObject.NULL else JSONObject().put("id", "s1").put("type", "emergencia_domicilio").put("priority", "roja").put("origin", "Colonia Ficticia").put("destination", "Hospital CLIMESA").put("dispatchedAt", "2026-11-15T14:00:00Z")
            .put("milestones", JSONArray().put(JSONObject().put("type", "salida").put("occurredAt", "2026-11-15T14:05:00Z"))).put("nextMilestones", JSONArray().put("en_escena").put("finalizado")).put("crew", JSONArray()))
        .put("pendingRequests", JSONArray()).put("availableCrew", JSONArray())

    // "An action pending at process death is sent on restart, with its original tap time."
    @Test fun aMilestoneTappedBeforeTheAppDiedIsSentOnRestartWithItsTapTime() = runTest(dispatcher) {
        val drafts = MemoryDrafts()
        val api = FakeGateway(); api.responses["/ambulancia"] = ambulance()
        val before = AmbulanceViewModel(api, quiet, drafts)
        before.bindUser("par-1"); before.open(AmbulanceMode.PARAMEDIC); runCurrent()
        val service = before.state.value.status!!.activeService!!
        before.advance(service, "en_escena", undoable = true, at = Instant.parse("2026-11-15T14:20:00Z")); runCurrent()
        assertEquals("stored at the tap", 1, drafts.load("par-1", FormDrafts.MILESTONE_QUEUE)!!.getJSONArray("items").length())
        before.viewModelScope.cancel() // the process dies inside the window
        advanceTimeBy(60_000); runCurrent()
        assertTrue(api.calls.none { it.first.endsWith("/hitos") })

        val after = AmbulanceViewModel(api, quiet, drafts).apply { clock = { System.currentTimeMillis() + 60_000 } }
        after.bindUser("par-1"); runCurrent()
        val body = api.calls.single { it.first == "/ambulancia/servicios/s1/hitos" }.third!!
        assertEquals("en_escena", body.getString("type"))
        assertEquals("2026-11-15T14:20:00Z", body.getString("occurredAt"))
        assertNull("removed only after the server confirmed it", drafts.load("par-1", FormDrafts.MILESTONE_QUEUE))
    }

    @Test fun aNoShowPendingAtProcessDeathIsSentOnRestartWithTheSameKey() = runTest(dispatcher) {
        val drafts = MemoryDrafts()
        val api = FakeGateway()
        val before = AppointmentActionViewModel(api, drafts)
        before.bindUser("rec-1"); runCurrent()
        before.markNoShow(appointment("a1", "Ana"))
        assertNotNull("stored at the tap", drafts.load("rec-1", FormDrafts.DEFERRED_NO_SHOW))
        before.viewModelScope.cancel()
        advanceTimeBy(60_000); runCurrent()
        assertTrue(api.calls.none { it.second == "POST" })

        val after = AppointmentActionViewModel(api, drafts).apply { clock = { System.currentTimeMillis() + 60_000 } }
        after.bindUser("rec-1"); runCurrent()
        assertEquals("/citas/a1/no-asistio", api.calls.single { it.second == "POST" }.first)
        assertNull(drafts.load("rec-1", FormDrafts.DEFERRED_NO_SHOW))
        assertEquals("Cita de Ana marcada como no asistida.", after.state.value.done)
    }

    // "Undo removes it from the store."
    @Test fun undoRemovesItFromTheStore() = runTest(dispatcher) {
        val drafts = MemoryDrafts()
        val api = FakeGateway(); api.responses["/ambulancia"] = ambulance()
        val vm = AppointmentActionViewModel(api, drafts)
        vm.bindUser("rec-1"); runCurrent()
        vm.markNoShow(appointment("a1", "Ana"))
        assertNotNull(drafts.load("rec-1", FormDrafts.DEFERRED_NO_SHOW))
        vm.undoNoShow()
        assertNull(drafts.load("rec-1", FormDrafts.DEFERRED_NO_SHOW))

        val par = AmbulanceViewModel(api, quiet, drafts)
        par.bindUser("par-1"); par.open(AmbulanceMode.PARAMEDIC); runCurrent()
        par.advance(par.state.value.status!!.activeService!!, "en_escena", undoable = true); runCurrent()
        par.undoMilestone()
        assertNull(drafts.load("par-1", FormDrafts.MILESTONE_QUEUE))
        advanceTimeBy(20_000); runCurrent()
        assertTrue(api.calls.none { it.second == "POST" })
    }

    // "Two pending actions flush in tap order."
    @Test fun twoPendingActionsFlushInTapOrder() = runTest(dispatcher) {
        val drafts = MemoryDrafts()
        val api = FakeGateway()
        val before = AppointmentActionViewModel(api, drafts)
        before.bindUser("rec-1"); runCurrent()
        before.markNoShow(appointment("a1", "Ana"))
        // A second tap sends the first one; kill the app before either is confirmed.
        api.failures["/citas/a1/no-asistio"] = AuthRequestException("Sin conexión.")
        before.markNoShow(appointment("a2", "Beto")); runCurrent()
        before.viewModelScope.cancel()
        assertEquals(listOf("a1", "a2"), drafts.load("rec-1", FormDrafts.DEFERRED_NO_SHOW)!!.getJSONArray("items").let { a -> (0 until a.length()).map { a.getJSONObject(it).getString("key") } })
        api.failures.clear(); api.calls.clear()

        val after = AppointmentActionViewModel(api, drafts).apply { clock = { System.currentTimeMillis() + 60_000 } }
        after.bindUser("rec-1"); runCurrent()
        assertEquals(listOf("/citas/a1/no-asistio", "/citas/a2/no-asistio"), api.calls.filter { it.second == "POST" }.map { it.first })
        assertNull(drafts.load("rec-1", FormDrafts.DEFERRED_NO_SHOW))
    }

    // "A failed send stays stored", with the error in place.
    @Test fun aFailedSendStaysStoredAndSaysWhy() = runTest(dispatcher) {
        val drafts = MemoryDrafts()
        val api = FakeGateway(); api.failures["/citas/a1/no-asistio"] = AuthRequestException("Servidor despertando", 503, null)
        val vm = AppointmentActionViewModel(api, drafts)
        vm.bindUser("rec-1"); runCurrent()
        vm.markNoShow(appointment("a1", "Ana"))
        advanceTimeBy(8_001); runCurrent()
        assertEquals(1, drafts.load("rec-1", FormDrafts.DEFERRED_NO_SHOW)!!.getJSONArray("items").length())
        assertNotNull(vm.state.value.error)
        assertNotNull(vm.state.value.failedNoShow)
        // The next resume retries it with the same idempotency key; once accepted it leaves the store.
        api.failures.clear()
        vm.resume(); runCurrent()
        assertEquals(2, api.calls.count { it.first == "/citas/a1/no-asistio" })
        assertNull(drafts.load("rec-1", FormDrafts.DEFERRED_NO_SHOW))
    }

    @Test fun aQueueAbsenceSurvivesAKilledApp() = runTest(dispatcher) {
        val drafts = MemoryDrafts()
        val api = FakeGateway()
        api.responses["/fila"] = JSONArray().put(JSONObject().put("id", "t1").put("numero", 7).put("service", "consulta_general").put("area", "CON").put("state", "llamado").put("priority", "normal").put("version", 4)
            .put("allowedActions", JSONArray().put("no_se_presento")).put("patientName", "Ana").put("createdAt", "2026-11-15T14:00:00Z"))
        val before = QueueViewModel(api, quiet, drafts)
        before.bindUser("rec-1"); before.load(); runCurrent()
        before.absent(before.state.value.tickets.single())
        before.viewModelScope.cancel()
        assertNotNull(drafts.load("rec-1", FormDrafts.DEFERRED_ABSENCE))

        val after = QueueViewModel(api, quiet, drafts).apply { clock = { System.currentTimeMillis() + 60_000 } }
        after.bindUser("rec-1"); runCurrent()
        assertEquals("/fila/t1/no-se-presento", api.calls.single { it.second == "POST" }.first)
        assertNull(drafts.load("rec-1", FormDrafts.DEFERRED_ABSENCE))
    }

    // Ordered exams stay blocked after leaving and reopening the consultation.
    @Test fun anOrderedExamStaysBlockedAfterReopeningTheConsultation() = runTest(dispatcher) {
        val drafts = MemoryDrafts()
        val api = FakeGateway().apply {
            responses["/consultas/c1/detalle"] = JSONObject().put("consultation", JSONObject().put("id", "c1")).put("diagnoses", JSONArray()).put("prescriptions", JSONArray())
            responses["/laboratorio/ordenes"] = JSONArray() // the list does not show the new order yet (panels show by component)
            responses["/laboratorio/catalogo"] = JSONArray().put(JSONObject().put("id", "panel").put("code", "PQ").put("name", "Perfil químico").put("isPanel", true))
        }
        val item = MedicalAppointment("", "p1", "Ana Ficticia", "", "", "", null, "c1", "en_curso", "Tos", "", "", 2)
        val first = ConsultationViewModel(api, quiet, drafts)
        first.configure("med-1", withQueue = false)
        first.loadRecord("c1", withLabOrders = true); first.loadLabCatalog(); runCurrent()
        first.orderLab(item, listOf("panel"), urgent = false); runCurrent()

        val reopened = ConsultationViewModel(api, quiet, drafts)
        reopened.configure("med-1", withQueue = false)
        reopened.loadRecord("c1", withLabOrders = true); reopened.loadLabCatalog(); runCurrent()
        reopened.orderLab(item, listOf("panel"), urgent = false); runCurrent()
        assertEquals(1, api.calls.count { it.first == "/laboratorio/ordenes" && it.second == "POST" })
        assertEquals("Ya ordenaste Perfil químico en esta consulta.", reopened.state.value.error)
    }

    // Sweep U6 defect 9: the «No asistió» failure row survives another dialog action (open, success, close).
    @Test fun theFailedNoShowRowSurvivesAnotherDialogAction() = runTest(dispatcher) {
        val drafts = MemoryDrafts()
        val api = FakeGateway(); api.failures["/citas/a1/no-asistio"] = AuthRequestException("Servidor despertando", 503, null)
        val vm = AppointmentActionViewModel(api, drafts)
        vm.bindUser("rec-1"); runCurrent()
        vm.markNoShow(appointment("a1", "Ana"))
        advanceTimeBy(8_001); runCurrent()
        val failure = vm.state.value.error
        assertNotNull(failure)
        val failed = vm.state.value.failedNoShow
        assertNotNull(failed)
        vm.open(appointment("a2", "Beto"), sv.edu.catolica.climesa.domain.AppointmentAction.CONFIRM)
        assertEquals(failed, vm.state.value.failedNoShow)
        assertNull("the dialog does not show the no-show error", vm.state.value.error)
        vm.submit(); runCurrent()
        assertNotNull(vm.state.value.done)
        assertEquals(failed, vm.state.value.failedNoShow)
        assertEquals(failure, vm.state.value.error)
        vm.open(appointment("a2", "Beto"), sv.edu.catolica.climesa.domain.AppointmentAction.CONFIRM)
        vm.close()
        assertEquals(failed, vm.state.value.failedNoShow)
        assertEquals(failure, vm.state.value.error)
        // The retry still goes through and the row leaves.
        api.failures.clear()
        vm.resume(); runCurrent()
        assertNull(vm.state.value.failedNoShow)
        assertNull(vm.state.value.error)
        assertNull(drafts.load("rec-1", FormDrafts.DEFERRED_NO_SHOW))
    }

    // B1: a definitive 4xx is final: dropped from the store, said once, never resent.
    @Test fun aDefinitiveRejectionIsDroppedAndSaidOnce() = runTest(dispatcher) {
        val drafts = MemoryDrafts()
        val api = FakeGateway(); api.failures["/citas/a1/no-asistio"] = AuthRequestException("La cita ya no admite ese cambio.", 409, "transicion_invalida")
        val vm = AppointmentActionViewModel(api, drafts)
        vm.bindUser("rec-1"); runCurrent()
        vm.markNoShow(appointment("a1", "Ana"))
        advanceTimeBy(8_001); runCurrent()
        vm.resume(); runCurrent()
        assertEquals(1, api.calls.count { it.first == "/citas/a1/no-asistio" })
        assertNull(drafts.load("rec-1", FormDrafts.DEFERRED_NO_SHOW))
        assertNotNull(vm.state.value.error)
        assertNull(vm.state.value.failedNoShow)
    }

    // Advisory: another account on the same device never sends the previous account's waiting actions.
    @Test fun bindingAnotherAccountDropsThePreviousOnesInMemory() = runTest(dispatcher) {
        val drafts = MemoryDrafts()
        val api = FakeGateway()
        val vm = AppointmentActionViewModel(api, drafts)
        vm.bindUser("rec-1"); runCurrent()
        vm.markNoShow(appointment("a1", "Ana"))
        vm.bindUser("rec-2"); runCurrent()
        advanceTimeBy(20_000); runCurrent()
        assertTrue(api.calls.none { it.second == "POST" })
        assertNull(vm.state.value.pendingNoShow)
        assertNotNull("still stored for its own account", drafts.load("rec-1", FormDrafts.DEFERRED_NO_SHOW))
    }

    // Another ticket's action does not end this ticket's window (same-ticket order: SweepFixesTest).
    @Test fun anotherTicketsActionLeavesThePendingAbsenceAlone() = runTest(dispatcher) {
        val drafts = MemoryDrafts()
        val api = FakeGateway()
        api.responses["/fila"] = JSONArray().put(JSONObject().put("id", "t1").put("numero", 7).put("service", "consulta_general").put("area", "CON").put("state", "llamado").put("priority", "normal").put("version", 4)
            .put("allowedActions", JSONArray().put("no_se_presento").put("atender")).put("patientName", "Ana").put("createdAt", "2026-11-15T14:00:00Z"))
            .put(JSONObject().put("id", "t2").put("numero", 8).put("service", "consulta_general").put("area", "CON").put("state", "llamado").put("priority", "normal").put("version", 2)
            .put("allowedActions", JSONArray().put("atender")).put("patientName", "Beto").put("createdAt", "2026-11-15T14:01:00Z"))
        val vm = QueueViewModel(api, quiet, drafts)
        vm.bindUser("rec-1"); vm.load(); runCurrent()
        vm.absent(vm.state.value.tickets.first { it.id == "t1" })
        vm.attend(vm.state.value.tickets.first { it.id == "t2" }); runCurrent()
        // Sweep #4: another ticket's action leaves t1 in its window, with its undo.
        assertEquals(listOf("/fila/t2/atender"), api.calls.filter { it.second == "POST" }.map { it.first })
        assertEquals(listOf("t1"), vm.state.value.pendingAbsences.map { it.key })
    }
}
