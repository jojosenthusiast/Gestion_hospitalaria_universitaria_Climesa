package sv.edu.catolica.climesa.ui

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
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
import sv.edu.catolica.climesa.domain.DaySlot
import sv.edu.catolica.climesa.domain.EventoDominio
import sv.edu.catolica.climesa.domain.LaboratoryOrder
import sv.edu.catolica.climesa.domain.PickerPatient
import sv.edu.catolica.climesa.domain.RealtimeSignal
import sv.edu.catolica.climesa.domain.SlotStatus

private class ParityBus : sv.edu.catolica.climesa.data.realtime.RealtimeRepository {
    val signals = kotlinx.coroutines.flow.MutableSharedFlow<RealtimeSignal>(extraBufferCapacity = 16)
    override fun observe(channels: List<String>): kotlinx.coroutines.flow.Flow<RealtimeSignal> = signals
}

/** T16: Android view models behave like the web reference. */
@OptIn(ExperimentalCoroutinesApi::class)
class PlatformParityT16ViewModelsTest {
    private val dispatcher = StandardTestDispatcher()
    @Before fun setUp() = Dispatchers.setMain(dispatcher)
    @After fun tearDown() = Dispatchers.resetMain()

    private fun posts(api: FakeGateway) = api.calls.filter { it.second == "POST" }

    // B1: "Emitir número" needs a patient; the search reuses `/pacientes/selector` like booking an appointment.
    @Test fun issuingANumberNeedsAChosenPatient() = runTest(dispatcher) {
        val api = FakeGateway()
        api.responses["/pacientes/selector?query=ana&limit=10&offset=0"] = JSONObject().put("items", JSONArray().put(JSONObject().put("id", "p1").put("record", "EXP-1").put("fullName", "Ana Ficticia"))).put("hasMore", false)
        val vm = QueueViewModel(api, ParityBus()).apply { debounceMs = 0 }
        vm.issue("consulta_general"); runCurrent()
        assertTrue(posts(api).isEmpty())
        assertEquals("Elige al paciente que recibe el número.", vm.state.value.error)
        vm.issueQuery("ana"); runCurrent()
        assertEquals(listOf("p1"), vm.state.value.issueSearch.results.map { it.id })
        vm.pickIssuePatient(vm.state.value.issueSearch.results.single()); runCurrent()
        vm.issue("consulta_general", "urgente"); runCurrent()
        val body = posts(api).single { it.first == "/fila" }.third!!
        assertEquals("p1", body.getString("patientId"))
        assertEquals("urgente", body.getString("priority"))
        assertNull("the chosen patient is cleared after issuing", vm.state.value.issueSearch.patient)
    }

    // B5: an optional consulting room travels with "Llamar siguiente".
    @Test fun callNextCarriesTheChosenOffice() = runTest(dispatcher) {
        val api = FakeGateway()
        api.responses["/espacios"] = JSONArray().put(JSONObject().put("id", "o1").put("type", "consultorio").put("code", "C-101").put("name", "Consultorio 1").put("active", true))
        val vm = QueueViewModel(api, ParityBus())
        vm.loadOffices(); runCurrent()
        assertEquals(listOf("o1"), vm.state.value.offices.map { it.id })
        vm.callNext("consulta_general", "o1"); runCurrent()
        assertEquals("o1", posts(api).single { it.first == "/fila/llamar-siguiente" }.third!!.getString("officeId"))
        vm.callNext("consulta_general", null); runCurrent()
        assertFalse(posts(api).last { it.first == "/fila/llamar-siguiente" }.third!!.has("officeId"))
    }

    // B6: a failed "who goes next" shows an error, not "nobody waiting".
    @Test fun nextProposalErrorIsShown() = runTest(dispatcher) {
        val api = FakeGateway()
        api.failures["/fila/siguiente?service=consulta_general"] = AuthRequestException("No se pudo calcular quién sigue.", 500)
        val vm = QueueViewModel(api, ParityBus())
        vm.chooseArea("consulta_general"); runCurrent()
        assertEquals("No se pudo calcular quién sigue.", vm.state.value.nextError)
        assertFalse(vm.state.value.nextLoading)
    }

    // Audit follow-up: when the queue itself cannot be read, the panel leaves "Calculando…" and says why.
    @Test fun aFailedQueueReadDoesNotLeaveThePanelComputing() = runTest(dispatcher) {
        val api = FakeGateway()
        api.failures["/fila"] = AuthRequestException("Sin conexión.", 0)
        val vm = QueueViewModel(api, ParityBus())
        vm.chooseArea("consulta_general"); runCurrent()
        val s = vm.state.value
        assertEquals(sv.edu.catolica.climesa.domain.NextStatus.ERROR, sv.edu.catolica.climesa.domain.QueueRules.nextStatus(s.next, s.nextLoading, s.nextError))
    }

    // Audit follow-up: a failed refresh shows the error instead of an old proposal that may no longer hold.
    @Test fun aFailedRefreshDropsTheOldProposal() = runTest(dispatcher) {
        val api = FakeGateway()
        api.responses["/fila/siguiente?service=consulta_general"] = JSONObject().put("proposal", JSONObject().put("id", "t1").put("numero", 1).put("version", 1))
        val vm = QueueViewModel(api, ParityBus())
        vm.chooseArea("consulta_general"); runCurrent()
        api.failures["/fila/siguiente?service=consulta_general"] = AuthRequestException("No se pudo calcular quién sigue.", 500)
        vm.load(silent = true); runCurrent()
        assertNull(vm.state.value.next)
        assertEquals("No se pudo calcular quién sigue.", vm.state.value.nextError)
    }

    private fun doctorQueue(vararg rows: JSONObject) = JSONArray().apply { rows.forEach { put(it) } }
    private fun ticket(id: String, number: Int, state: String) = JSONObject().put("id", id).put("numero", number).put("patientName", "P$number").put("state", state).put("service", "consulta_general")

    // B4 + B2: the doctor calls the first waiting patient; the API then marks the call as theirs.
    @Test fun doctorCallsTheFirstWaitingPatient() = runTest(dispatcher) {
        val api = FakeGateway(JSONArray())
        api.responses["/fila"] = doctorQueue(ticket("t1", 1, "en_espera"))
        api.responses["/fila/llamar-siguiente"] = JSONObject().put("id", "t1").put("numero", 1).put("version", 2)
        val vm = ConsultationViewModel(api, ParityBus())
        vm.configure("u1", withQueue = true); vm.load(); runCurrent()
        assertTrue(vm.state.value.waitingGeneral)
        assertTrue("waiting numbers are not listed as attendable", vm.state.value.queue.isEmpty())
        api.responses["/fila"] = doctorQueue(ticket("t1", 1, "llamado").put("calledByMe", true))
        vm.callWaiting(); runCurrent()
        val body = posts(api).single { it.first == "/fila/llamar-siguiente" }.third!!
        assertEquals("consulta_general", body.getString("service"))
        assertEquals("Llamaste CON 1.", vm.state.value.notice)
        assertTrue(vm.state.value.queue.single().calledByMe)
        assertFalse(vm.state.value.waitingGeneral)
    }

    @Test fun doctorCallingWaitingIsOneTapOnly() = runTest(dispatcher) {
        val api = FakeGateway(JSONArray()); api.responses["/fila"] = doctorQueue(ticket("t1", 1, "en_espera"))
        val vm = ConsultationViewModel(api, ParityBus())
        vm.configure("u1", withQueue = true); vm.load(); runCurrent()
        vm.callWaiting(); vm.callWaiting(); runCurrent()
        assertEquals(1, posts(api).count { it.first == "/fila/llamar-siguiente" })
    }

    // B3: "Mi día" reloads the doctor's queue when a queue event arrives.
    @Test fun doctorQueueReloadsOnQueueEvents() = runTest(dispatcher) {
        val api = FakeGateway(JSONArray()); val bus = ParityBus()
        val vm = ConsultationViewModel(api, bus)
        vm.configure("u1", withQueue = true); vm.load(); vm.startLive(listOf("rol:MED")); runCurrent()
        bus.signals.tryEmit(RealtimeSignal.Event(EventoDominio("fila.actualizada", "ticket_fila", "t1", 2))); runCurrent()
        assertEquals(2, api.gets("/fila"))
    }

    // C2: a second tap while busy sends nothing; a technical failure is shown in Spanish.
    @Test fun laboratoryWritesAreGuardedAndMessagesAreSpanish() = runTest(dispatcher) {
        val api = FakeGateway()
        val vm = LaboratoryViewModel(api, ParityBus(), NoDocuments)
        val order = LaboratoryOrder("o1", "Ana", "rutina", "completado", 3, emptyList(), false, allowedActions = setOf("revisar"))
        vm.review(order); vm.review(order); runCurrent()
        assertEquals(1, posts(api).size)
        api.failures["/laboratorio/ordenes"] = IllegalStateException("org.json.JSONException: Value null of type")
        vm.load(); runCurrent()
        assertEquals("No se pudo completar la operación.", vm.state.value.error)
    }

    // G1: the dispatch block names the app account, as the web does since #145.
    @Test fun dispatchWithoutParamedicExplainsTheAppAccount() = runTest(dispatcher) {
        val api = FakeGateway()
        api.failures["/ambulancia/servicios"] = AuthRequestException("x", 409, "sin_paramedico_de_turno")
        val vm = AmbulanceViewModel(api, ParityBus())
        api.responses["/ambulancia"] = JSONObject()
            .put("unit", JSONObject().put("id", "u1").put("plate", "P-1").put("state", "disponible").put("version", 1)).put("paramedicOnDuty", true)
            .put("activeService", JSONObject.NULL).put("milestones", JSONArray())
            .put("pendingRequests", JSONArray().put(JSONObject().put("id", "r1").put("channel", "telefono").put("address", "Colonia Ficticia").put("reason", "Caída").put("contactPhone", "7000-0001").put("createdAt", "2026-11-16T15:00:00Z").put("version", 1).put("state", "pendiente")))
            .put("availableCrew", JSONArray().put(JSONObject().put("staffId", "par-1").put("role", "paramedico").put("name", "Ana").put("hasAccount", true)).put(JSONObject().put("staffId", "mot-1").put("role", "motorista").put("name", "Beto").put("hasAccount", false)))
        vm.open(AmbulanceMode.STATUS); runCurrent()
        vm.dispatch(vm.state.value.status!!.pendingRequests.single(), "emergencia_domicilio", "roja", "Hospital CLIMESA", listOf("par-1", "mot-1")); runCurrent()
        assertEquals("No hay paramédico con cuenta en la app con turno en curso.", vm.state.value.formError)
    }

    // S1 + G3: families shared with the web table.
    @Test fun statusFamiliesMatchTheWeb() {
        assertEquals(StatusFamily.LISTO, StatusFamily.of("ok"))
        assertEquals(StatusFamily.LISTO, StatusFamily.of("atendido"))
        assertEquals(StatusFamily.ESPERA, StatusFamily.resolve(StatusCatalogClinico.NOT_STARTED, StatusCatalogClinico.tone(StatusCatalogClinico.NOT_STARTED)))
    }

    private fun proposals() = JSONArray().put(JSONObject().put("id", "s1").put("orderId", "o1").put("patientId", "p1").put("patientName", "Ana").put("doctorId", "d1")
        .put("doctorName", "Dra. Prueba").put("priority", "rutina").put("resultsAt", "2026-11-16T15:00:00Z").put("createdAt", "2026-11-16T15:00:00Z").put("version", 2))
    private val slot = DaySlot("2026-11-23T15:00:00Z", "2026-11-23T15:20:00Z", SlotStatus.FREE, null)

    // C1: reception confirms a follow-up with POST /citas and links it; then the list reloads.
    @Test fun followUpIsScheduledThenLinkedAndReloaded() = runTest(dispatcher) {
        val api = FakeGateway(); api.responses["/laboratorio/seguimientos"] = proposals(); api.responses["/citas"] = JSONObject().put("id", "a1")
        val vm = LabProposalsViewModel(api, ParityBus())
        vm.load(); runCurrent()
        val p = vm.state.value.proposals.single()
        vm.confirm(p, slot); vm.confirm(p, slot); runCurrent()
        assertEquals(1, posts(api).count { it.first == "/citas" })
        val link = posts(api).single { it.first == "/laboratorio/seguimientos/s1/confirmar" }.third!!
        assertEquals("a1", link.getString("appointmentId")); assertEquals(2, link.getInt("version"))
        assertEquals(2, api.gets("/laboratorio/seguimientos"))
        assertEquals("Cita de seguimiento agendada para Ana.", vm.state.value.notice)
    }

    @Test fun aFailedLinkKeepsTheAppointmentAndRetriesOnlyTheLink() = runTest(dispatcher) {
        val api = FakeGateway(); api.responses["/laboratorio/seguimientos"] = proposals(); api.responses["/citas"] = JSONObject().put("id", "a1")
        api.failures["/laboratorio/seguimientos/s1/confirmar"] = AuthRequestException("La propuesta cambió; vuelve a cargarla.", 409, "version_conflicto")
        val vm = LabProposalsViewModel(api, ParityBus())
        vm.load(); runCurrent()
        val p = vm.state.value.proposals.single()
        vm.confirm(p, slot); runCurrent()
        assertEquals("a1", vm.state.value.scheduled["s1"])
        assertFalse(vm.state.value.error.isNullOrBlank())
        api.failures.clear()
        vm.confirm(p, null); runCurrent()
        assertEquals(1, posts(api).count { it.first == "/citas" })
        assertEquals(2, posts(api).count { it.first == "/laboratorio/seguimientos/s1/confirmar" })
    }

    @Test fun followUpDiscardNeedsAReason() = runTest(dispatcher) {
        val api = FakeGateway(); api.responses["/laboratorio/seguimientos"] = proposals()
        val vm = LabProposalsViewModel(api, ParityBus())
        vm.load(); runCurrent()
        val p = vm.state.value.proposals.single()
        vm.discard(p, "corto"); runCurrent()
        assertTrue(posts(api).isEmpty())
        assertEquals("Escribe el motivo, de al menos 10 caracteres.", vm.state.value.error)
        vm.discard(p, "Ya tiene control agendado"); runCurrent()
        assertEquals("Ya tiene control agendado", posts(api).single().third!!.getString("reason"))
        assertEquals(2, api.gets("/laboratorio/seguimientos"))
    }

    @Test fun followUpsReloadOnLabEvents() = runTest(dispatcher) {
        val api = FakeGateway(); val bus = ParityBus()
        val vm = LabProposalsViewModel(api, bus)
        vm.load(); vm.startLive(listOf("rol:REC")); runCurrent()
        bus.signals.tryEmit(RealtimeSignal.Event(EventoDominio("laboratorio.actualizado", "orden_laboratorio", "o1", 3))); runCurrent()
        assertEquals(2, api.gets("/laboratorio/seguimientos"))
    }
}
