package sv.edu.catolica.climesa.ui

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import sv.edu.catolica.climesa.data.AuthRequestException
import sv.edu.catolica.climesa.data.ForbiddenMessages
import sv.edu.catolica.climesa.data.realtime.RealtimeRepository
import sv.edu.catolica.climesa.domain.PatientAppointment
import sv.edu.catolica.climesa.domain.PatientAppointmentRules
import sv.edu.catolica.climesa.domain.RealtimeSignal
import sv.edu.catolica.climesa.domain.ReceptionScheduling

/**
 * S8 «Mis citas»: «Reintentar» belongs only to a failed read of the list (`loadError`, drawn by the shared ErrorState); a
 * failed command is a plain notice (`error`), and a 403 on the list is a refusal the ErrorState shows without «Reintentar».
 */
@OptIn(ExperimentalCoroutinesApi::class)
class PatientAppointmentsRetryTest {
    private val dispatcher = StandardTestDispatcher()
    @Before fun setUp() { Dispatchers.setMain(dispatcher); ForbiddenMessages.clear() }
    @After fun tearDown() { Dispatchers.resetMain(); ForbiddenMessages.clear() }
    private val quiet = object : RealtimeRepository { override fun observe(channels: List<String>) = emptyFlow<RealtimeSignal>() }
    private val listPath get() = PatientAppointmentRules.listPath(ReceptionScheduling.today())
    private val mine = PatientAppointment("a1", "Dr. Prueba", "2030-11-20T14:00:00Z", "2030-11-20T14:20:00Z", "confirmada", null, 3)

    @Test fun aListThatLoadsHasNoErrorAndNoRetry() = runTest(dispatcher) {
        val vm = PatientAppointmentsViewModel(FakeGateway(), quiet)
        vm.load(); runCurrent()
        assertNull(vm.state.value.loadError)
        assertNull(vm.state.value.error)
    }

    @Test fun aFailedListReadIsTheRetryableLoadError() = runTest(dispatcher) {
        val api = FakeGateway().apply { failures[listPath] = AuthRequestException("El servidor no pudo completar la operación. Intenta de nuevo en un momento.", 503) }
        val vm = PatientAppointmentsViewModel(api, quiet)
        vm.load(); runCurrent()
        val error = vm.state.value.loadError
        assertEquals("El servidor no pudo completar la operación. Intenta de nuevo en un momento.", error)
        assertFalse("a 5xx keeps «Reintentar»", ForbiddenMessages.isForbidden(error))
        api.failures.clear()
        vm.clearMessages(); vm.load(); runCurrent()
        assertNull(vm.state.value.loadError)
    }

    @Test fun a403OnTheListIsARefusalWithoutRetry() = runTest(dispatcher) {
        val api = FakeGateway().apply { failures[listPath] = AuthRequestException("La cuenta no está vinculada a un expediente.", 403, "sin_permiso") }
        val vm = PatientAppointmentsViewModel(api, quiet)
        vm.load(); runCurrent()
        val error = vm.state.value.loadError
        assertEquals("La cuenta no está vinculada a un expediente.", error)
        assertTrue("ErrorState draws it as info, without «Reintentar»", ForbiddenMessages.isForbidden(error))
    }

    @Test fun aFailedCommandIsANoticeNotARetryableLoadError() = runTest(dispatcher) {
        val api = FakeGateway().apply { failures["/citas/a1/cancelar"] = AuthRequestException("Ya pasó el plazo para cancelar o reprogramar esta cita.", 409, "conflicto") }
        val vm = PatientAppointmentsViewModel(api, quiet)
        vm.load(); runCurrent()
        vm.cancel(mine, "Viaje", other = true); runCurrent()
        assertTrue(vm.state.value.error != null)
        assertNull(vm.state.value.loadError)
    }
}
