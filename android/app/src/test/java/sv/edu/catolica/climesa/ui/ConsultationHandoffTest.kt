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
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test
import sv.edu.catolica.climesa.data.realtime.RealtimeRepository
import sv.edu.catolica.climesa.domain.QueueMove
import sv.edu.catolica.climesa.domain.RealtimeSignal

/** Fase 2, flow B (S9): signing proposes who goes next; the queue undoes a call with the version it returned. */
@OptIn(ExperimentalCoroutinesApi::class)
class ConsultationHandoffTest {
    private val dispatcher = StandardTestDispatcher()
    private val noRealtime = object : RealtimeRepository { override fun observe(channels: List<String>): Flow<RealtimeSignal> = emptyFlow() }
    @Before fun setUp() = Dispatchers.setMain(dispatcher)
    @After fun tearDown() = Dispatchers.resetMain()

    private fun agenda() = JSONArray().put(JSONObject()
        .put("appointmentId", "a1").put("patientId", "p1").put("patientName", "Ana")
        .put("start", "2026-11-13T14:00:00Z").put("end", "2026-11-13T14:20:00Z").put("appointmentState", "confirmada")
        .put("consultationId", "c1").put("consultationState", "abierta").put("version", 3))
    private val proposal = JSONObject().put("service", "consulta_general").put("area", "CON").put("rule", "Emergencias primero.")
        .put("proposal", JSONObject().put("id", "t4").put("numero", 4).put("area", "CON").put("patientName", "Paciente Cuatro").put("priority", "emergencia")
            .put("appointmentAt", JSONObject.NULL).put("version", 1).put("reason", "emergencia").put("reasonText", "Emergencia: pasa antes que todos."))

    @Test fun signingShowsTheProposalAndCallingItUsesItsVersion() = runTest(dispatcher) {
        val api = FakeGateway(agenda())
        api.responses["/consultas/c1"] = JSONObject().put("version", 4)
        api.responses["/consultas/c1/firmar"] = JSONObject().put("id", "c1").put("version", 5).put("state", "firmada").put("nextProposal", proposal)
        api.responses["/fila/t4/llamar"] = JSONObject().put("id", "t4").put("version", 2).put("state", "llamado").put("llamados", 1)
        val vm = ConsultationViewModel(api, noRealtime)
        vm.load(); runCurrent()
        vm.sign(vm.state.value.appointments.single(), "Control", "", "Seguimiento"); runCurrent()
        assertEquals("CON 4", vm.state.value.handoff!!.proposal!!.code)
        vm.callProposed(); runCurrent()
        val call = api.calls.last { it.first == "/fila/t4/llamar" }
        assertEquals(1, call.third!!.getInt("version"))
        assertNull(vm.state.value.handoff)
        assertEquals("Llamaste CON 4.", vm.state.value.notice)
    }

    @Test fun signingWithoutProposalLeavesNoHandoff() = runTest(dispatcher) {
        val api = FakeGateway(agenda())
        api.responses["/consultas/c1"] = JSONObject().put("version", 4)
        api.responses["/consultas/c1/firmar"] = JSONObject().put("id", "c1").put("version", 5).put("state", "firmada").put("nextProposal", JSONObject.NULL)
        val vm = ConsultationViewModel(api, noRealtime)
        vm.load(); runCurrent()
        vm.sign(vm.state.value.appointments.single(), "Control", "", "Seguimiento"); runCurrent()
        assertNull(vm.state.value.handoff)
    }

    @Test fun queueCallOffersUndoWithTheReturnedVersion() = runTest(dispatcher) {
        val row = JSONObject().put("id", "t7").put("service", "laboratorio").put("numero", 7).put("state", "en_espera").put("llamados", 0).put("version", 2)
            .put("allowedActions", JSONArray().put("llamar")).put("blockedActions", JSONArray()).put("undoActions", JSONArray())
        val api = FakeGateway(JSONArray().put(row))
        api.responses["/fila"] = JSONArray().put(row)
        api.responses["/fila/t7/llamar"] = JSONObject().put("id", "t7").put("version", 3).put("state", "llamado").put("llamados", 1)
        api.responses["/fila/t7/deshacer-llamado"] = JSONObject().put("id", "t7").put("version", 4).put("state", "en_espera").put("llamados", 0)
        val vm = QueueViewModel(api, noRealtime)
        vm.load(); runCurrent()
        vm.move(vm.state.value.tickets.single(), QueueMove.CALL); runCurrent()
        assertEquals("Llamaste LAB 7.", vm.state.value.undo!!.label)
        vm.undoLastCall(); runCurrent()
        assertEquals(3, api.calls.last { it.first == "/fila/t7/deshacer-llamado" }.third!!.getInt("version"))
        assertNull(vm.state.value.undo)
    }
}
