package sv.edu.catolica.climesa.ui

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import sv.edu.catolica.climesa.data.AuthRequestException
import sv.edu.catolica.climesa.domain.AppointmentAction
import sv.edu.catolica.climesa.domain.ReceptionAppointment

@OptIn(ExperimentalCoroutinesApi::class)
class AppointmentActionViewModelTest {
    private val dispatcher = StandardTestDispatcher()
    @Before fun setUp() = Dispatchers.setMain(dispatcher)
    @After fun tearDown() = Dispatchers.resetMain()
    private val request = ReceptionAppointment("a1", "Ana", "Dr. Prueba", "2026-11-20T14:00:00Z", "2026-11-20T14:20:00Z", "solicitada", 2)

    @Test fun rejectingWithoutAMotiveSendsNothing() = runTest(dispatcher) {
        val api = FakeGateway()
        val vm = AppointmentActionViewModel(api)
        vm.open(request, AppointmentAction.REJECT); vm.reason("corto"); vm.submit(); runCurrent()
        assertTrue(api.calls.isEmpty())
        assertNotNull(vm.state.value.reasonError)
    }

    @Test fun confirmingSendsTheVersionAndAnnouncesIt() = runTest(dispatcher) {
        val api = FakeGateway()
        val vm = AppointmentActionViewModel(api)
        vm.open(request, AppointmentAction.CONFIRM); vm.submit(); runCurrent()
        val call = api.calls.single()
        assertEquals("/citas/solicitudes/a1/confirmar", call.first)
        assertEquals(2, call.third!!.getInt("version"))
        assertEquals("Solicitud de Ana confirmada.", vm.state.value.done)
        assertNull(vm.state.value.target)
    }

    @Test fun aRejectedActionKeepsTheDialogWithTheSpanishMessage() = runTest(dispatcher) {
        val api = FakeGateway()
        api.failures["/citas/a1/cancelar"] = AuthRequestException("La cita ya empezó o pasó; no se puede cancelar.", 409, "transicion_invalida")
        val vm = AppointmentActionViewModel(api)
        vm.open(request.copy(state = "confirmada"), AppointmentAction.CANCEL); vm.reason("El paciente pidió reprogramar"); vm.submit(); runCurrent()
        assertEquals("La cita ya empezó o pasó; no se puede cancelar.", vm.state.value.error)
        assertNotNull(vm.state.value.target)
    }
}
