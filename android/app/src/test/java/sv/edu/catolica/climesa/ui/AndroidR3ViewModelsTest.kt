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
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import sv.edu.catolica.climesa.data.AuthRequestException
import sv.edu.catolica.climesa.data.realtime.RealtimeRepository
import sv.edu.catolica.climesa.domain.LaboratoryItem
import sv.edu.catolica.climesa.domain.LaboratoryOrder
import sv.edu.catolica.climesa.domain.LaboratoryResult
import sv.edu.catolica.climesa.domain.RealtimeSignal

private class R3Bus : RealtimeRepository {
    val signals = MutableSharedFlow<RealtimeSignal>(extraBufferCapacity = 16)
    override fun observe(channels: List<String>): Flow<RealtimeSignal> = signals
}

/** R3: Android view-model behaviour behind the audit fixes (A-16, A-23, A-1). */
@OptIn(ExperimentalCoroutinesApi::class)
class AndroidR3ViewModelsTest {
    private val dispatcher = StandardTestDispatcher()
    @Before fun setUp() = Dispatchers.setMain(dispatcher)
    @After fun tearDown() = Dispatchers.resetMain()

    private fun order(id: String) = LaboratoryOrder(id, "Ana", "rutina", "completado", 3, emptyList(), false, allowedActions = setOf("revisar"))

    // A-16: only the row being reviewed is busy; another order can be reviewed meanwhile.
    @Test fun labReviewIsBusyPerRow() = runTest(dispatcher) {
        val api = FakeGateway()
        val vm = LaboratoryViewModel(api, R3Bus(), NoDocuments)
        vm.review(order("o1"))
        assertEquals(setOf("o1"), vm.state.value.busyIds)
        vm.review(order("o2")); vm.review(order("o1"))
        assertEquals(setOf("o1", "o2"), vm.state.value.busyIds)
        runCurrent()
        assertTrue(vm.state.value.busyIds.isEmpty())
        assertEquals(2, api.calls.count { it.second == "POST" })
    }

    // A-16: "Revisar" first opens a confirmation; it closes only when the release succeeds.
    @Test fun labReviewConfirmationClosesOnlyOnSuccess() = runTest(dispatcher) {
        val api = FakeGateway()
        val vm = LaboratoryViewModel(api, R3Bus(), NoDocuments)
        vm.openReview("o1")
        assertEquals("o1", vm.state.value.reviewOrderId)
        assertTrue("opening sends nothing", api.calls.none { it.second == "POST" })
        api.failures["/laboratorio/ordenes/o1/revisar"] = AuthRequestException("El resultado cambió; vuelve a abrirlo.", 409)
        vm.review(order("o1")); runCurrent()
        assertEquals("o1", vm.state.value.reviewOrderId)
        assertEquals("El resultado cambió; vuelve a abrirlo.", vm.state.value.error)
        api.failures.clear()
        vm.review(order("o1")); runCurrent()
        assertNull(vm.state.value.reviewOrderId)
    }

    @Test fun reviewSummarySaysWhatThePatientWillSee() {
        val item = LaboratoryItem("i1", "HB", "Hemoglobina", LaboratoryResult(value = 9.5, text = null, mark = "bajo", version = 1), unit = "g/dL")
        val order = LaboratoryOrder("o1", "Ana", "rutina", "completado", 3, listOf(item, item.copy(id = "i2", name = "Glucosa", result = null)), false)
        assertEquals(listOf("Hemoglobina: 9.5 g/dL · Bajo", "Glucosa: Sin resultado"), LabReviewSummary.lines(order))
    }

    // A-1: the system back leaves "Pedir cita" for the list and keeps the draft; "Cancelar" discards it.
    @Test fun backFromPedirCitaKeepsTheDraft() = runTest(dispatcher) {
        val vm = CategoryRequestsViewModel(FakeGateway(), R3Bus())
        vm.openForm(); vm.note("Dolor de espalda")
        vm.leaveForm()
        assertTrue(!vm.state.value.formOpen)
        vm.openForm()
        assertTrue(vm.state.value.formOpen)
        assertEquals("Dolor de espalda", vm.state.value.note)
        vm.closeForm(); vm.openForm()
        assertEquals("", vm.state.value.note)
    }

    // A-1: back from "Agendar cita" keeps the typed search for when reception comes back.
    @Test fun backFromAgendarCitaKeepsTheForm() = runTest(dispatcher) {
        val vm = ReceptionAppointmentsViewModel(FakeGateway(), R3Bus()).apply { debounceMs = 0 }
        vm.openScheduling(); vm.query("Ana"); runCurrent()
        vm.leaveScheduling()
        assertTrue(!vm.state.value.scheduling)
        vm.openScheduling()
        assertTrue(vm.state.value.scheduling)
        assertEquals("Ana", vm.state.value.query)
        vm.closeScheduling(); vm.openScheduling()
        assertEquals("", vm.state.value.query)
    }

    // A-1: on "Ingresar paciente" back closes from the first step and reopening resumes it.
    @Test fun backFromIngresarPacienteResumesTheDraft() = runTest(dispatcher) {
        val vm = AdmissionIntakeViewModel(FakeGateway(), R3Bus())
        vm.open()
        vm.backPressed(canAssignBed = false)
        assertTrue(!vm.state.value.open)
        assertTrue(vm.state.value.kept)
        vm.open()
        assertTrue(vm.state.value.open)
        assertTrue(!vm.state.value.kept)
    }

    // A-23: reloading the queue keeps the tickets on screen, and a failed reload keeps them with the error.
    @Test fun queueKeepsTicketsWhileReloading() = runTest(dispatcher) {
        val api = FakeGateway(org.json.JSONArray().put(org.json.JSONObject().put("id", "t1").put("service", "consulta_general").put("numero", 3).put("state", "en_espera").put("version", 1)))
        val vm = QueueViewModel(api, R3Bus())
        vm.load(); runCurrent()
        assertEquals(listOf("t1"), vm.state.value.tickets.map { it.id })
        vm.load()
        assertTrue(vm.state.value.loading)
        assertEquals("tickets stay while reloading", listOf("t1"), vm.state.value.tickets.map { it.id })
        api.failGets = true
        runCurrent()
        assertEquals(listOf("t1"), vm.state.value.tickets.map { it.id })
        assertTrue(vm.state.value.error != null)
    }

    // A-23: a portal section (Mis turnos, Unidad) keeps its data while the same path reloads, and after a failed reload.
    @Test fun portalSectionKeepsDataWhileReloading() = runTest(dispatcher) {
        var fail = false
        val source = object : RoleDataSource {
            override suspend fun get(path: String): Any = if (fail) throw org.json.JSONException("No value for rows") else org.json.JSONArray().put(path)
            override suspend fun post(path: String, body: org.json.JSONObject): Any = org.json.JSONObject()
        }
        val vm = RoleViewModel(source, R3Bus())
        vm.load("/turnos/mios"); runCurrent()
        val first = vm.state.value.data
        fail = true
        vm.load("/turnos/mios"); runCurrent()
        assertEquals(first, vm.state.value.data)
        assertEquals("No se pudo cargar la información.", vm.state.value.error)
    }

    // A-6: the patient's number is only an active ticket; a finished one is never shown as "my number".
    @Test fun patientQueueShowsOnlyTheOwnActiveTicket() {
        fun t(id: String, state: String, at: Long) = sv.edu.catolica.climesa.domain.QueueTicket(id, "consulta_general", 1, "Ana", state, 0, 1, issuedAtMillis = at)
        val tickets = listOf(t("a", "atendido", 1), t("b", "llamado", 2), t("c", "no_se_presento", 3))
        assertEquals("b", sv.edu.catolica.climesa.domain.PatientQueue.current(tickets)?.id)
        assertEquals(listOf("a", "c"), sv.edu.catolica.climesa.domain.PatientQueue.others(tickets).map { it.id })
        val finished = listOf(t("a", "atendido", 1), t("c", "atendido", 3))
        assertNull(sv.edu.catolica.climesa.domain.PatientQueue.current(finished))
        assertEquals(listOf("a", "c"), sv.edu.catolica.climesa.domain.PatientQueue.others(finished).map { it.id })
        assertNull(sv.edu.catolica.climesa.domain.PatientQueue.current(emptyList()))
    }

    // A-7: upcoming appointments first and ascending; past or closed ones apart, most recent first.
    @Test fun patientAppointmentsSplitUpcomingAndPast() {
        fun a(id: String, start: String, state: String = "confirmada") = sv.edu.catolica.climesa.domain.PatientAppointment(id, "Dra. Ejemplo", start, start.replace("T14", "T15"), state, null, 1)
        val now = java.time.Instant.parse("2026-11-16T12:00:00Z")
        val split = sv.edu.catolica.climesa.domain.PatientAppointmentRules.split(
            listOf(a("old", "2026-11-10T14:00:00Z"), a("late", "2026-11-30T14:00:00Z"), a("soon", "2026-11-17T14:00:00Z"), a("cancel", "2026-11-20T14:00:00Z", "cancelada")), now,
        )
        assertEquals(listOf("soon", "late"), split.upcoming.map { it.id })
        assertEquals(listOf("cancel", "old"), split.past.map { it.id })
    }

    // A-42: the assign panel shows five doctors until reception searches or asks for all; the chosen one stays visible.
    @Test fun assignPanelSearchesDoctors() {
        val choices = sv.edu.catolica.climesa.domain.DoctorChoices
        val doctors = (1..45).map { sv.edu.catolica.climesa.domain.SchedulingDoctor("d$it", "Dr. Médico $it", if (it == 30) "Cardiología" else null, true, null) }
        assertEquals(5, choices.visible(doctors, "", showAll = false, chosenId = null).size)
        assertEquals(40, choices.hidden(doctors, "", showAll = false))
        assertEquals(45, choices.visible(doctors, "", showAll = true, chosenId = null).size)
        assertEquals(listOf("d30"), choices.visible(doctors, "cardiologia", showAll = false, chosenId = null).map { it.id })
        assertEquals("d44", choices.visible(doctors, "", showAll = false, chosenId = "d44").first().id)
    }
}
