package sv.edu.catolica.climesa.ui

import java.time.LocalDate
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
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import sv.edu.catolica.climesa.data.realtime.RealtimeRepository
import sv.edu.catolica.climesa.domain.AppointmentAction
import sv.edu.catolica.climesa.domain.AppointmentActions
import sv.edu.catolica.climesa.domain.AppointmentReasons
import sv.edu.catolica.climesa.domain.CategoryRequestRules
import sv.edu.catolica.climesa.domain.PatientAppointment
import sv.edu.catolica.climesa.domain.PatientAppointmentRules
import sv.edu.catolica.climesa.domain.RealtimeSignal
import sv.edu.catolica.climesa.domain.ReceptionScheduling

/** R7 U2, journeys A2 (assign on another day), A4 (no-show undo, quick reasons) and A5 (next appointment on top). */
@OptIn(ExperimentalCoroutinesApi::class)
class AppointmentJourneysTest {
    private val dispatcher = StandardTestDispatcher()
    @Before fun setUp() = Dispatchers.setMain(dispatcher)
    @After fun tearDown() = Dispatchers.resetMain()

    private val quiet = object : RealtimeRepository { override fun observe(channels: List<String>) = emptyFlow<RealtimeSignal>() }

    private fun appointmentRow(allowed: List<String>) = JSONObject().put("id", "a1").put("patientName", "Ana").put("doctorId", "d1").put("doctorName", "Dr. Prueba")
        .put("start", "2030-11-20T14:00:00Z").put("end", "2030-11-20T14:20:00Z").put("state", "confirmada").put("version", 3)
        .put("allowedActions", JSONArray(allowed)).put("blockedActions", JSONArray())

    // D-3: "No asistió" → "Deshacer" before 8 s: the appointment stays and nothing reaches the API.
    @Test fun noShowUndoneInsideTheWindowSendsNothing() = runTest(dispatcher) {
        val api = FakeGateway()
        val row = ReceptionScheduling.appointments(JSONArray().put(appointmentRow(listOf("no_asistio")))).single()
        val vm = AppointmentActionViewModel(api)
        vm.markNoShow(row)
        assertEquals("a1", vm.state.value.pendingNoShow?.key)
        advanceTimeBy(5_000); runCurrent()
        vm.undoNoShow()
        advanceTimeBy(10_000); runCurrent()
        assertTrue(api.calls.none { it.second == "POST" })
        assertNull(vm.state.value.pendingNoShow)
        assertEquals("Se mantiene la cita.", vm.state.value.done)
    }

    @Test fun noShowIsSentWhenTheWindowEnds() = runTest(dispatcher) {
        val api = FakeGateway()
        val row = ReceptionScheduling.appointments(JSONArray().put(appointmentRow(listOf("no_asistio")))).single()
        val vm = AppointmentActionViewModel(api)
        vm.markNoShow(row)
        advanceTimeBy(8_001); runCurrent()
        val post = api.calls.single { it.second == "POST" }
        assertEquals("/citas/a1/no-asistio", post.first)
        assertEquals(3, post.third!!.getInt("version"))
        assertEquals("Cita de Ana marcada como no asistida.", vm.state.value.done)
    }

    @Test fun noShowIsNotOfferedWhenTheServerDoesNotAllowIt() = runTest(dispatcher) {
        val row = ReceptionScheduling.appointments(JSONArray().put(appointmentRow(listOf("cancelar")))).single()
        val vm = AppointmentActionViewModel(FakeGateway())
        vm.markNoShow(row)
        assertNull(vm.state.value.pendingNoShow)
    }

    // A4 (REC): a frequent reason is one tap and reaches the API as the reason.
    @Test fun receptionCancelsWithAQuickReason() = runTest(dispatcher) {
        val api = FakeGateway()
        val row = ReceptionScheduling.appointments(JSONArray().put(appointmentRow(listOf("cancelar")))).single()
        val vm = AppointmentActionViewModel(api)
        vm.open(row, AppointmentAction.CANCEL)
        vm.quickReason(AppointmentReasons.reception(AppointmentAction.CANCEL).first())
        vm.submit(); runCurrent()
        val post = api.calls.single { it.second == "POST" }
        assertEquals("/citas/a1/cancelar", post.first)
        assertEquals("Lo pidió el paciente", post.third!!.getString("reason"))
        assertEquals("Cita de Ana cancelada.", vm.state.value.done)
    }

    // D-8: "PAC cancela con 'No puedo a esa hora': 3 toques, sin teclado."
    @Test fun patientCancelsWithAChipAndNoTyping() = runTest(dispatcher) {
        val api = FakeGateway()
        val vm = PatientAppointmentsViewModel(api, quiet)
        val mine = PatientAppointment("a1", "Dr. Prueba", "2030-11-20T14:00:00Z", "2030-11-20T14:20:00Z", "confirmada", null, 3)
        vm.cancel(mine, "No puedo a esa hora"); runCurrent()
        val post = api.calls.single { it.second == "POST" }
        assertEquals("/citas/a1/cancelar", post.first)
        assertEquals("No puedo a esa hora", post.third!!.getString("reason"))
        assertEquals("Cita cancelada.", vm.state.value.notice)
    }

    @Test fun everyQuickReasonMeetsTheApiMinimum() {
        val all = AppointmentReasons.patientCancel + AppointmentReasons.reception(AppointmentAction.CANCEL) + AppointmentReasons.requestReject
        all.forEach { assertTrue(it, it.length >= AppointmentActions.REASON_MIN) }
        AppointmentReasons.requestReject.forEach { assertNull(it, CategoryRequestRules.rejectError(it)) }
    }

    // A5: one future and three past: the future on top, the past folded with their count.
    @Test fun nextAppointmentFirstAndPastFolded() {
        fun a(id: String, start: String) = PatientAppointment(id, "Dra.", start, start, "confirmada", null, 1)
        val split = PatientAppointmentRules.split(listOf(a("p1", "2020-01-01T14:00:00Z"), a("f2", "2031-02-01T14:00:00Z"), a("f1", "2031-01-01T14:00:00Z"), a("p2", "2020-02-01T14:00:00Z"), a("p3", "2020-03-01T14:00:00Z")), java.time.Instant.parse("2030-01-01T00:00:00Z"))
        assertEquals(listOf("f1", "f2"), split.upcoming.map { it.id })
        assertEquals(3, split.past.size)
    }

    // A2 (break #6): the panel opens on the first day with a free slot in the requested time of day and the day can change.
    @Test fun assignOpensOnTheFirstDayWithRoomAndTheDayCanChange() = runTest(dispatcher) {
        val today = LocalDate.parse("2030-11-20")
        val tomorrow = today.plusDays(1)
        val api = FakeGateway()
        val request = JSONObject().put("id", "s1").put("patientName", "Paciente Ficticio").put("record", "EXP-1")
            .put("categories", JSONArray().put(JSONObject().put("code", "piel").put("name", "Piel").put("icon", "piel"))).put("specialties", JSONArray().put("Dermatología"))
            .put("franja", "cualquiera").put("note", JSONObject.NULL).put("preferredDoctorId", JSONObject.NULL).put("preferredDoctorName", JSONObject.NULL).put("state", "pendiente")
            .put("rejectionReason", JSONObject.NULL).put("appointment", JSONObject.NULL).put("createdAt", "2030-11-19T14:00:00Z").put("version", 4).put("allowedActions", JSONArray(listOf("asignar", "rechazar")))
        api.responses["/citas/solicitudes-categoria"] = JSONArray().put(request)
        val doctors = JSONObject().put("doctors", JSONArray().put(JSONObject().put("id", "d3").put("givenNames", "Doctora").put("surnames", "Dermis").put("specialty", "Dermatología").put("tieneTurno", true)))
        api.responses["/citas/catalogos?date=$today"] = doctors
        api.responses["/citas/catalogos?date=$tomorrow"] = doctors
        api.responses["/citas/disponibilidad?doctorId=d3&date=$today"] = JSONObject().put("franjas", JSONArray().put(JSONObject().put("start", "2030-11-20T15:00:00Z").put("end", "2030-11-20T15:20:00Z").put("estado", "ocupado")))
        api.responses["/citas/disponibilidad?doctorId=d3&date=$tomorrow"] = JSONObject().put("franjas", JSONArray().put(JSONObject().put("start", "2030-11-21T15:00:00Z").put("end", "2030-11-21T15:20:00Z").put("estado", "libre")))
        val vm = CategoryRequestsViewModel(api, quiet)
        vm.load(); runCurrent()
        vm.openAssign(vm.state.value.requests.single(), today); runCurrent()
        assertEquals(tomorrow, vm.state.value.date)
        assertEquals("2030-11-21T15:00:00Z", vm.state.value.slot?.start)
        assertFalse(vm.state.value.searchingDay)
        // "Android REC: cambiar el día del panel a mañana. Se espera: las franjas se recargan."
        val before = api.gets("/citas/disponibilidad?doctorId=d3&date=$today")
        vm.selectDate(today); runCurrent()
        assertEquals(today, vm.state.value.date)
        assertEquals(before + 1, api.gets("/citas/disponibilidad?doctorId=d3&date=$today"))
        assertNull("no free slot that day", vm.state.value.slot)
    }
}
