package sv.edu.catolica.climesa.ui

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import sv.edu.catolica.climesa.data.AuthRequestException

@OptIn(ExperimentalCoroutinesApi::class)
class MyDataViewModelTest {
    private val dispatcher = StandardTestDispatcher()
    @Before fun setUp() = Dispatchers.setMain(dispatcher)
    @After fun tearDown() = Dispatchers.resetMain()

    private fun ficha(version: Int = 3) = JSONObject().put("id", "p1").put("fullName", "Ana Ejemplo").put("record", "0000001-X")
        .put("phone", "70001111").put("email", "ana@example.test").put("address", "Calle 1").put("version", version)

    @Test fun savesOnlyPhoneAndAddressWithTheLoadedVersion() = runTest(dispatcher) {
        val api = FakeGateway(); api.responses["/me/paciente"] = ficha()
        val vm = MyDataViewModel(api); vm.load(); runCurrent()
        assertEquals("Ana Ejemplo", vm.state.value.data?.fullName)
        // U12: the e-mail is shown read-only and never travels in PATCH /me/paciente.
        assertEquals("ana@example.test", vm.state.value.data?.email)
        vm.save("7000-2222", "Calle 2"); runCurrent()
        val patch = api.calls.single { it.second == "PATCH" }
        assertEquals("/me/paciente", patch.first)
        assertEquals(setOf("version", "phone", "address"), patch.third!!.keys().asSequence().toSet())
        assertEquals(3, patch.third!!.getInt("version"))
        assertTrue(vm.state.value.saved)
    }

    @Test fun invalidPhoneIsNotSent() = runTest(dispatcher) {
        val api = FakeGateway(); api.responses["/me/paciente"] = ficha()
        val vm = MyDataViewModel(api); vm.load(); runCurrent()
        vm.save("123", ""); runCurrent()
        assertEquals("El teléfono debe tener ocho dígitos.", vm.state.value.error)
        assertTrue(api.calls.none { it.second == "PATCH" })
    }

    @Test fun emailOwnedByReceptionShowsTheFixedMessage() = runTest(dispatcher) {
        val api = FakeGateway(); api.responses["/me/paciente"] = ficha()
        val vm = MyDataViewModel(api); vm.load(); runCurrent()
        api.failures["/me/paciente"] = AuthRequestException("Forbidden", 403, "correo_lo_gestiona_recepcion")
        vm.save("7000-2222", "Calle 2"); runCurrent()
        assertEquals("Tu correo lo actualiza Recepción. Pídelo en ventanilla.", vm.state.value.error)
        assertEquals("Tu correo lo actualiza Recepción. Pídelo en ventanilla.", userMessage(AuthRequestException("x", 403, "correo_lo_gestiona_recepcion"), "fallback"))
    }

    @Test fun staleVersionReloadsTheRecord() = runTest(dispatcher) {
        val api = FakeGateway(); api.responses["/me/paciente"] = ficha()
        val vm = MyDataViewModel(api); vm.load(); runCurrent()
        api.failures["/me/paciente"] = AuthRequestException("La ficha cambió.", 409, "version_conflicto")
        vm.save("7000-2222", ""); runCurrent()
        assertTrue(vm.state.value.error!!.contains("cambió"))
        assertNull(vm.state.value.data?.takeIf { it.version == 0 })
    }

    @Test fun validateAcceptsEmptyAndRealValues() {
        assertNull(MyDataViewModel.validate(""))
        assertNull(MyDataViewModel.validate("2222-3333"))
    }
}
