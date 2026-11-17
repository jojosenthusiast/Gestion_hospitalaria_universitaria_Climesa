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
import sv.edu.catolica.climesa.data.ApiGateway
import sv.edu.catolica.climesa.data.realtime.RealtimeRepository
import sv.edu.catolica.climesa.domain.PatientQueue
import sv.edu.catolica.climesa.domain.PublicCall
import sv.edu.catolica.climesa.domain.QueueLabels
import sv.edu.catolica.climesa.domain.QueueRules
import sv.edu.catolica.climesa.domain.RealtimeSignal
import sv.edu.catolica.climesa.domain.ReceptionScheduling

private val silentBus = object : RealtimeRepository { override fun observe(channels: List<String>) = emptyFlow<RealtimeSignal>() }

/** U5: "Registrar llegada" (B1, D-1), the caller's post (B3) and "N personas antes de ti" (B5), through the public interface. */
@OptIn(ExperimentalCoroutinesApi::class)
class FrontDeskU5Test {
    private val dispatcher = StandardTestDispatcher()
    @Before fun setUp() = Dispatchers.setMain(dispatcher)
    @After fun tearDown() = Dispatchers.resetMain()

    private fun pickerRow(appointment: JSONObject?, ticket: JSONObject? = null) = JSONObject().put("items", JSONArray().put(
        JSONObject().put("id", "p1").put("record", "EXP-1").put("fullName", "Ana Ficticia").put("age", 30)
            .put("appointmentToday", appointment ?: JSONObject.NULL).put("ticketToday", ticket ?: JSONObject.NULL),
    )).put("offset", 0).put("limit", 10).put("hasMore", false)

    private val appointment = JSONObject().put("id", "c1").put("start", "2026-11-17T15:00:00Z").put("doctorId", "d1").put("doctorName", "Marta Médica")

    // Sweep U6 defect 10: «Cita 09:00», never «Cita 09:00 con ».
    @Test fun aBlankDoctorNameLeavesOnlyTheTimeInTheChip() {
        for (name in listOf<Any>("", "   ", JSONObject.NULL)) {
            val row = JSONObject(appointment.toString()).put("doctorName", name)
            assertEquals("Cita 09:00", ReceptionScheduling.pickerPage(pickerRow(row)).items.single().appointmentToday?.chip)
        }
        val missing = JSONObject(appointment.toString()).apply { remove("doctorName") }
        assertEquals("Cita 09:00", ReceptionScheduling.pickerPage(pickerRow(missing)).items.single().appointmentToday?.chip)
    }

    @Test fun selectorRowsCarryTodaysAppointmentWithTheDoctorInTheChip() {
        val patient = ReceptionScheduling.pickerPage(pickerRow(appointment)).items.single()
        assertEquals("c1", patient.appointmentToday?.id)
        assertEquals("Cita 09:00 con Marta Médica", patient.appointmentToday?.chip)
        assertTrue(patient.canRegisterArrival)
        val none = ReceptionScheduling.pickerPage(pickerRow(null)).items.single()
        assertNull(none.appointmentToday)
        assertFalse(none.canRegisterArrival)
    }

    @Test fun anArrivalAlreadyRegisteredIsNotOfferedAgain() {
        val ticket = JSONObject().put("id", "t1").put("service", "consulta_general").put("numero", 4).put("state", "en_espera").put("appointmentId", "c1")
        val patient = ReceptionScheduling.pickerPage(pickerRow(appointment, ticket)).items.single()
        assertFalse(patient.canRegisterArrival)
        assertEquals("CON 4", patient.ticketToday?.code)
    }

    @Test fun boardChipNamesTheDoctorOfTheAppointment() {
        val row = JSONObject().put("id", "t7").put("service", "consulta_general").put("numero", 7).put("state", "en_espera").put("version", 1)
            .put("appointmentAt", "2026-11-17T16:30:00Z").put("appointmentDoctorName", "Marta Médica").put("walkIn", false)
        assertEquals("Cita 10:30 con Marta Médica", QueueLabels.arrival(QueueRules.parse(JSONArray().put(row)).single()))
    }

    @Test fun registerArrivalIssuesTheNumberLinkedToTheAppointment() = runTest(dispatcher) {
        val api = FakeGateway()
        api.responses["/pacientes/selector?query=ana&limit=10&offset=0"] = pickerRow(appointment)
        val issuing = object : ApiGateway {
            override suspend fun request(path: String, method: String, body: JSONObject?): Any =
                if (path == "/fila" && method == "POST") { api.calls += Triple(path, method, body); JSONObject().put("id", "t9").put("numero", 12).put("area", "CON").put("ahead", 3) }
                else api.request(path, method, body)
        }
        val vm = QueueViewModel(issuing, silentBus)
        vm.debounceMs = 0
        vm.issueQuery("ana"); runCurrent()
        vm.pickIssuePatient(vm.state.value.issueSearch.results.single())
        vm.registerArrival(); runCurrent()
        val body = api.calls.single { it.first == "/fila" && it.second == "POST" }.third!!
        assertEquals("consulta_general", body.getString("service"))
        assertEquals("p1", body.getString("patientId"))
        assertEquals("c1", body.getString("appointmentId"))
        assertFalse("routine is the server default", body.has("priority"))
        val shown = vm.state.value.issued!!
        assertEquals("CON 12", shown.code)
        assertEquals("the API's count of people before it", 3, shown.ahead)
    }

    @Test fun walkInIssueSendsNoAppointment() = runTest(dispatcher) {
        val api = FakeGateway()
        val vm = QueueViewModel(api, silentBus)
        vm.pickIssuePatient(ReceptionScheduling.pickerPage(pickerRow(appointment)).items.single())
        vm.issue("laboratorio"); runCurrent()
        assertFalse(api.calls.single { it.first == "/fila" && it.second == "POST" }.third!!.has("appointmentId"))
    }

    @Test fun registerArrivalWithoutAnAppointmentSendsNothingAndSaysWhy() = runTest(dispatcher) {
        val api = FakeGateway()
        val vm = QueueViewModel(api, silentBus)
        vm.pickIssuePatient(ReceptionScheduling.pickerPage(pickerRow(null)).items.single())
        vm.registerArrival(); runCurrent()
        assertTrue(api.calls.none { it.second == "POST" })
        assertEquals("Ana Ficticia no tiene cita confirmada hoy.", vm.state.value.error)
    }

    @Test fun callerPostPreselectsServiceAndRoom() = runTest(dispatcher) {
        val api = FakeGateway()
        api.responses["/fila/mi-puesto"] = JSONObject().put("service", "consulta_general").put("area", "CON").put("areaName", "Consulta externa")
            .put("officeId", "o2").put("officeCode", "CON-2").put("shiftEnd", "2026-11-17T22:00:00Z")
        val vm = QueueViewModel(api, silentBus)
        vm.loadMyPost(); runCurrent()
        assertEquals("consulta_general", vm.state.value.myPost?.service)
        assertEquals("o2", vm.state.value.myPost?.officeId)
    }

    @Test fun withoutAShiftThePostIsEmptyAndAFailureIsShown() = runTest(dispatcher) {
        val api = FakeGateway()
        api.responses["/fila/mi-puesto"] = JSONObject().put("service", JSONObject.NULL).put("area", JSONObject.NULL).put("areaName", JSONObject.NULL)
            .put("officeId", JSONObject.NULL).put("officeCode", JSONObject.NULL).put("shiftEnd", JSONObject.NULL)
        val vm = QueueViewModel(api, silentBus)
        vm.loadMyPost(); runCurrent()
        assertNull(vm.state.value.myPost?.service)
        api.failures["/fila/mi-puesto"] = RuntimeException("red")
        vm.loadMyPost(); runCurrent()
        assertTrue("the failure is on screen", vm.state.value.myPostError != null)
    }

    @Test fun patientSeesPeopleBeforeThemFromTheTicketWhenTheApiSendsIt() {
        val own = QueueRules.parse(JSONArray().put(JSONObject().put("id", "own").put("service", "consulta_general").put("numero", 12).put("state", "en_espera").put("version", 1).put("ahead", 4))).single()
        assertEquals(4, PatientQueue.ahead(own, listOf(PublicCall(9, null))))
        val older = own.copy(ahead = null)
        assertEquals("falls back to the public board", 2, PatientQueue.ahead(older, listOf(PublicCall(9, null))))
    }
}
