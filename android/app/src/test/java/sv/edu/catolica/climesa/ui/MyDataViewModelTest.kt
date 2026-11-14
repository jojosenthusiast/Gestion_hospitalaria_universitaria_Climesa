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

    @Test fun savesOnlyContactFieldsWithTheLoadedVersion() = runTest(dispatcher) {
        val api = FakeGateway(); api.responses["/me/paciente"] = ficha()
        val vm = MyDataViewModel(api); vm.load(); runCurrent()
        assertEquals("Ana Ejemplo", vm.state.value.data?.fullName)
        vm.save("7000-2222", "nuevo@example.test", "Calle 2"); runCurrent()
        val patch = api.calls.single { it.second == "PATCH" }
        assertEquals("/me/paciente", patch.first)
        assertEquals(setOf("version", "phone", "email", "address"), patch.third!!.keys().asSequence().toSet())
        assertEquals(3, patch.third!!.getInt("version"))
        assertTrue(vm.state.value.saved)
    }

    @Test fun invalidContactIsNotSent() = runTest(dispatcher) {
        val api = FakeGateway(); api.responses["/me/paciente"] = ficha()
        val vm = MyDataViewModel(api); vm.load(); runCurrent()
        vm.save("123", "ana@example.test", ""); runCurrent()
        assertEquals("El teléfono debe tener ocho dígitos.", vm.state.value.error)
        vm.save("7000-2222", "sin-arroba", ""); runCurrent()
        assertEquals("Revisa el correo electrónico.", vm.state.value.error)
        assertTrue(api.calls.none { it.second == "PATCH" })
    }

    @Test fun staleVersionReloadsTheRecord() = runTest(dispatcher) {
        val api = FakeGateway(); api.responses["/me/paciente"] = ficha()
        val vm = MyDataViewModel(api); vm.load(); runCurrent()
        api.failures["/me/paciente"] = AuthRequestException("La ficha cambió.", 409, "version_conflicto")
        vm.save("7000-2222", "", ""); runCurrent()
        assertTrue(vm.state.value.error!!.contains("cambió"))
        assertNull(vm.state.value.data?.takeIf { it.version == 0 })
    }

    @Test fun validateAcceptsEmptyAndRealValues() {
        assertNull(MyDataViewModel.validate("", ""))
        assertNull(MyDataViewModel.validate("2222-3333", "a@b.co"))
    }
}
