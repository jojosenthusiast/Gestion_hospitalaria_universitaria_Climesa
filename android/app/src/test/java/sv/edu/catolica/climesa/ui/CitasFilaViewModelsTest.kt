package sv.edu.catolica.climesa.ui

import kotlin.coroutines.coroutineContext
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
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import sv.edu.catolica.climesa.data.ApiGateway
import sv.edu.catolica.climesa.data.AuthRequestException
import sv.edu.catolica.climesa.data.RequestIntent
import sv.edu.catolica.climesa.data.realtime.RealtimeRepository
import sv.edu.catolica.climesa.domain.AppointmentAction
import sv.edu.catolica.climesa.domain.RealtimeSignal
import sv.edu.catolica.climesa.domain.ReceptionScheduling

private val silentRealtime = object : RealtimeRepository { override fun observe(channels: List<String>) = emptyFlow<RealtimeSignal>() }

/** [FakeGateway] that also records the Idempotency-Key of each write (the [RequestIntent] in the coroutine context). */
private class KeyedGateway(val inner: FakeGateway = FakeGateway()) : ApiGateway {
    val keys = mutableListOf<String?>()
    override suspend fun request(path: String, method: String, body: JSONObject?): Any {
        if (method != "GET") keys += coroutineContext[RequestIntent]?.idempotencyKey
        return inner.request(path, method, body)
    }
}

@OptIn(ExperimentalCoroutinesApi::class)
class CitasFilaViewModelsTest {
    private val dispatcher = StandardTestDispatcher()
    @Before fun setUp() = Dispatchers.setMain(dispatcher)
    @After fun tearDown() = Dispatchers.resetMain()

    private fun appointment(id: String, state: String, allowed: List<String>, reschedule: JSONObject? = null) = JSONObject()
        .put("id", id).put("patientName", "Ana").put("doctorId", "d1").put("doctorName", "Dr. Prueba")
        .put("start", "2030-11-20T14:00:00Z").put("end", "2030-11-20T14:20:00Z").put("state", state).put("version", 3)
        .put("allowedActions", JSONArray(allowed)).put("blockedActions", JSONArray())
        .apply { reschedule?.let { put("reschedule", it) } }

    private fun pendingRequest(state: String = "pendiente") = JSONObject().put("id", "r1").put("start", "2030-11-21T15:00:00Z").put("end", "2030-11-21T15:20:00Z")
        .put("state", state).put("origin", "paciente").put("reason", JSONObject.NULL).put("rejectionReason", JSONObject.NULL).put("version", 5)

    private fun slots() = JSONObject().put("franjas", JSONArray()
        .put(JSONObject().put("start", "2030-11-20T15:00:00Z").put("end", "2030-11-20T15:20:00Z").put("estado", "libre"))
        .put(JSONObject().put("start", "2030-11-20T15:20:00Z").put("end", "2030-11-20T15:40:00Z").put("estado", "ocupado")))

    // --- Recepción: reschedule and reschedule decisions ---

    @Test fun receptionReschedulesToAFreeSlotOfTheSameDoctor() = runTest(dispatcher) {
        val api = KeyedGateway()
        api.inner.responses["/citas/disponibilidad?doctorId=d1&date=2030-11-20"] = slots()
        val row = ReceptionScheduling.appointments(JSONArray().put(appointment("a1", "confirmada", listOf("reprogramar")))).single()
        val vm = AppointmentActionViewModel(api)
        vm.open(row, AppointmentAction.RESCHEDULE); runCurrent()
        assertEquals(2, vm.state.value.slots.size)
        vm.pickSlot(vm.state.value.slots[1]); assertNull("a busy slot cannot be chosen", vm.state.value.slot)
        vm.submit(); runCurrent()
        assertTrue("nothing is sent without a slot", api.inner.calls.none { it.second == "POST" })
        vm.pickSlot(vm.state.value.slots[0]); vm.submit(); runCurrent()
        val post = api.inner.calls.single { it.second == "POST" }
        assertEquals("/citas/a1/reprogramar", post.first)
        assertEquals("2030-11-20T15:00:00Z", post.third!!.getString("start"))
        assertEquals(3, post.third!!.getInt("version"))
        assertNotNull(api.keys.single())
        assertEquals("Cita de Ana reprogramada.", vm.state.value.done)
    }

    @Test fun acceptingARescheduleUsesTheRequestIdAndItsVersion() = runTest(dispatcher) {
        val api = KeyedGateway()
        val row = ReceptionScheduling.appointments(JSONArray().put(appointment("a1", "confirmada", listOf("aceptar_reprogramacion"), pendingRequest()))).single()
        val vm = AppointmentActionViewModel(api)
        vm.open(row, AppointmentAction.ACCEPT_RESCHEDULE); vm.submit(); runCurrent()
        val post = api.inner.calls.single()
        assertEquals("/citas/reprogramaciones/r1/aceptar", post.first)
        assertEquals(5, post.third!!.getInt("version"))
    }

    @Test fun aBusinessCodeIsShownInSpanish() = runTest(dispatcher) {
        val api = KeyedGateway()
        api.inner.failures["/citas/a1/no-asistio"] = AuthRequestException("raw", 409, "cita_con_consulta")
        val row = ReceptionScheduling.appointments(JSONArray().put(appointment("a1", "confirmada", listOf("no_asistio")))).single()
        val vm = AppointmentActionViewModel(api)
        vm.open(row, AppointmentAction.NO_SHOW); vm.submit(); runCurrent()
        assertEquals("La cita ya tiene una consulta iniciada; no se puede cambiar.", vm.state.value.error)
    }

    @Test fun receptionCanListOnlyTheRequests() = runTest(dispatcher) {
        val api = FakeGateway(JSONArray().put(appointment("a1", "solicitada", listOf("confirmar"))).put(appointment("a2", "confirmada", emptyList())))
        val vm = ReceptionAppointmentsViewModel(api, silentRealtime)
        vm.load(); runCurrent()
        assertEquals(2, vm.state.value.shown.size)
        vm.showRequests(true)
        assertEquals(listOf("a1"), vm.state.value.shown.map { it.id })
    }

    // --- Paciente ---

    @Test fun patientCancelsOnlyThroughAnIntentAndSeesTheDeadlineError() = runTest(dispatcher) {
        val api = KeyedGateway(FakeGateway(JSONArray().put(appointment("a1", "confirmada", listOf("cancelar")))))
        api.inner.failures["/citas/a1/cancelar"] = AuthRequestException("raw", 409, "cancelacion_fuera_de_plazo")
        val vm = PatientAppointmentsViewModel(api, silentRealtime)
        vm.load(); runCurrent()
        val a = vm.state.value.appointments.single()
        vm.cancel(a, "corto"); runCurrent()
        assertTrue(api.inner.calls.none { it.second == "POST" })
        vm.cancel(a, "Tengo otro compromiso"); runCurrent()
        assertEquals("Ya pasó el plazo para cancelar o reprogramar esta cita.", vm.state.value.error)
        api.inner.failures.clear()
        vm.cancel(a, "Tengo otro compromiso"); runCurrent()
        assertEquals("the retry of the same intent reuses its key", api.keys[0], api.keys[1])
        assertEquals("Cita cancelada.", vm.state.value.notice)
    }

    @Test fun patientRequestsARescheduleAndItStaysPending() = runTest(dispatcher) {
        val api = KeyedGateway(FakeGateway(JSONArray().put(appointment("a1", "confirmada", listOf("reprogramar")))))
        api.inner.responses["/citas/disponibilidad?doctorId=d1&date=2030-11-20"] = slots()
        api.inner.responses["/citas/a1/reprogramar"] = JSONObject().put("id", "a1").put("version", 4).put("state", "confirmada").put("rescheduleId", "r1").put("rescheduleState", "pendiente")
        val vm = PatientAppointmentsViewModel(api, silentRealtime)
        vm.load(); runCurrent()
        vm.openReschedule(vm.state.value.appointments.single()); runCurrent()
        vm.pickRescheduleSlot(vm.state.value.rescheduleSlots[0]); vm.reschedule(); runCurrent()
        val post = api.inner.calls.single { it.second == "POST" }
        assertEquals("/citas/a1/reprogramar", post.first)
        assertEquals(3, post.third!!.getInt("version"))
        assertNull(vm.state.value.rescheduleTarget)
        assertTrue(vm.state.value.notice!!.startsWith("Solicitud de reprogramación enviada"))
    }

    @Test fun aBlockedRescheduleIsNeverOpened() = runTest(dispatcher) {
        val api = FakeGateway(JSONArray().put(appointment("a1", "confirmada", listOf("cancelar"))))
        val vm = PatientAppointmentsViewModel(api, silentRealtime)
        vm.load(); runCurrent()
        vm.openReschedule(vm.state.value.appointments.single()); runCurrent()
        assertNull(vm.state.value.rescheduleTarget)
    }

    // --- Fila ---

    @Test fun callNextAsksTheServerForTheServiceInsteadOfPickingLocally() = runTest(dispatcher) {
        val api = KeyedGateway()
        api.inner.responses["/fila/llamar-siguiente"] = JSONObject().put("id", "t9").put("version", 2).put("state", "llamado").put("llamados", 1).put("numero", 12).put("patientName", JSONObject.NULL)
        val vm = QueueViewModel(api, silentRealtime)
        vm.callNext("emergencia"); runCurrent()
        val post = api.inner.calls.single { it.second == "POST" }
        assertEquals("/fila/llamar-siguiente", post.first)
        assertEquals("emergencia", post.third!!.getString("service"))
        assertNotNull(api.keys.single())
        assertEquals("Se llamó al N.º 12 de Emergencia.", vm.state.value.notice)
    }

    @Test fun callNextWithoutWaitingNumbersExplainsIt() = runTest(dispatcher) {
        val api = FakeGateway()
        api.failures["/fila/llamar-siguiente"] = AuthRequestException("raw", 409, "fila_sin_espera")
        val vm = QueueViewModel(api, silentRealtime)
        vm.callNext("consulta_general"); runCurrent()
        assertEquals("No hay números en espera en este servicio.", vm.state.value.error)
    }

    // --- Médico ---

    private fun agendaEntry(allowed: List<String>, blocked: List<Pair<String, String>> = emptyList()) = JSONArray().put(JSONObject()
        .put("appointmentId", "a1").put("patientId", "p1").put("patientName", "Ana").put("start", "2030-11-20T14:00:00Z").put("end", "2030-11-20T14:20:00Z")
        .put("appointmentState", "confirmada").put("consultationId", JSONObject.NULL).put("version", JSONObject.NULL)
        .put("allowedActions", JSONArray(allowed))
        .put("blockedActions", JSONArray().apply { blocked.forEach { (a, r) -> put(JSONObject().put("action", a).put("reason", r)) } }))

    @Test fun theDoctorSeesOnlyTheRescheduleRequestsHeCanDecideAndTheUnsignedConsultations() = runTest(dispatcher) {
        val api = FakeGateway(agendaEntry(listOf("iniciar_consulta")))
        api.responses["/citas"] = JSONArray()
            .put(appointment("a1", "confirmada", listOf("aceptar_reprogramacion", "rechazar_reprogramacion"), pendingRequest()))
            .put(appointment("a2", "confirmada", emptyList(), pendingRequest()))
            .put(appointment("a3", "confirmada", listOf("aceptar_reprogramacion"), pendingRequest(state = "rechazada")))
        api.responses["/consultas/sin-firmar"] = JSONArray().put(JSONObject().put("id", "c7").put("patientId", "p2").put("patientName", "Luis").put("appointmentId", JSONObject.NULL)
            .put("ticketId", "t1").put("reason", "Dolor").put("startedAt", "2030-11-19T15:00:00Z").put("version", 2))
        api.responses["/consultas/c7/detalle"] = JSONObject().put("consultation", JSONObject().put("id", "c7").put("patientId", "p2").put("patientName", "Luis").put("state", "abierta").put("version", 2))
        val vm = ConsultationViewModel(api, silentRealtime)
        vm.configure("u1", withQueue = false, withUnsigned = true, withReschedules = true)
        vm.load(); runCurrent()
        assertEquals(listOf("a1"), vm.state.value.reschedules.map { it.id })
        assertEquals("c7", vm.state.value.unsigned.single().id)
        vm.resume(vm.state.value.unsigned.single()); runCurrent()
        assertEquals("c7", vm.state.value.resumed?.consultationId)
    }

    @Test fun withoutThoseListsNothingExtraIsRequested() = runTest(dispatcher) {
        val api = FakeGateway(agendaEntry(listOf("iniciar_consulta")))
        val vm = ConsultationViewModel(api, silentRealtime)
        vm.configure("u1", withQueue = false); vm.load(); runCurrent()
        assertEquals(0, api.gets("/citas")); assertEquals(0, api.gets("/consultas/sin-firmar"))
        assertTrue(vm.state.value.reschedules.isEmpty())
    }

    @Test fun aConsultationIsStartedOnlyWhenTheServerAllowsIt() = runTest(dispatcher) {
        val api = FakeGateway(agendaEntry(emptyList(), listOf("iniciar_consulta" to "Solo el día de la cita.")))
        val vm = ConsultationViewModel(api, silentRealtime)
        vm.load(); runCurrent()
        val item = vm.state.value.appointments.single()
        assertEquals("Solo el día de la cita.", item.startBlockedReason)
        vm.start(item, "Dolor de cabeza"); runCurrent()
        assertTrue(api.calls.none { it.second == "POST" })
        assertEquals("Solo el día de la cita.", vm.state.value.error)
    }
}
