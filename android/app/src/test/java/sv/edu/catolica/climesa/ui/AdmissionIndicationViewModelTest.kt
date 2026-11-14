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
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import sv.edu.catolica.climesa.data.AuthRequestException
import sv.edu.catolica.climesa.data.apiErrorMessage
import sv.edu.catolica.climesa.domain.AdmissionIndication
import sv.edu.catolica.climesa.domain.IndicationContext

@OptIn(ExperimentalCoroutinesApi::class)
class AdmissionIndicationViewModelTest {
    private val dispatcher = StandardTestDispatcher()
    @Before fun setUp() = Dispatchers.setMain(dispatcher)
    @After fun tearDown() = Dispatchers.resetMain()
    private val context = IndicationContext("p1", "Ana", "c1", "s1", "Dra. Prueba")

    @Test fun anIncompleteFormShowsFieldErrorsAndSendsNothing() = runTest(dispatcher) {
        val api = FakeGateway()
        val vm = AdmissionIndicationViewModel(api)
        vm.open(context); vm.motive("corto"); vm.submit(); runCurrent()
        assertTrue(api.calls.isEmpty())
        assertTrue("motive" in vm.state.value.fields)
        assertTrue("requestedCategory" in vm.state.value.fields)
    }

    @Test fun theServerFieldErrorLandsOnItsFieldAndTheBannerStaysSpanish() = runTest(dispatcher) {
        val api = FakeGateway()
        val problem = """{"codigo":"validacion","detail":"motive must be longer than or equal to 10 characters","requestId":"req-1ua","errors":[{"field":"motive","message":"El motivo debe tener al menos 10 caracteres."}]}"""
        api.failures[AdmissionIndication.PATH] = AuthRequestException(apiErrorMessage(problem, 400), 400, "validacion", problem)
        val vm = AdmissionIndicationViewModel(api)
        vm.open(context); vm.motive("Dolor abdominal con fiebre"); vm.category("semiprivada"); vm.submit(); runCurrent()
        assertEquals("El motivo debe tener al menos 10 caracteres.", vm.state.value.fields["motive"])
        val banner = vm.state.value.error.orEmpty()
        assertFalse(banner.contains("must")); assertTrue(banner.contains("req-1ua"))
        vm.motive("Dolor abdominal con fiebre alta")
        assertFalse("motive" in vm.state.value.fields)
    }

    @Test fun aValidIndicationIsSentOnceWithItsIdempotentIntent() = runTest(dispatcher) {
        val api = FakeGateway()
        val vm = AdmissionIndicationViewModel(api)
        vm.open(context); vm.motive("Dolor abdominal con fiebre"); vm.category("vip"); vm.submit(); runCurrent()
        val call = api.calls.single()
        assertEquals(AdmissionIndication.PATH, call.first)
        assertEquals("consulta", call.third!!.getString("origin"))
        assertTrue(vm.state.value.sent)
    }
}
