package sv.edu.catolica.climesa.ui

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.json.JSONArray
import org.json.JSONException
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test
import sv.edu.catolica.climesa.data.AuthRequestException
import sv.edu.catolica.climesa.data.realtime.RealtimeRepository
import sv.edu.catolica.climesa.domain.AmbulancePrefill
import sv.edu.catolica.climesa.domain.RealtimeSignal
import sv.edu.catolica.climesa.domain.RequestDraft
import sv.edu.catolica.climesa.domain.RequestField

private object A1Bus : RealtimeRepository {
    override fun observe(channels: List<String>): Flow<RealtimeSignal> = emptyFlow()
}

/** S13 A1 (REC, PAC): Spanish errors, prefilled ambulance request. */
@OptIn(ExperimentalCoroutinesApi::class)
class RoleFlowsA1Test {
    private val dispatcher = StandardTestDispatcher()
    @Before fun setUp() = Dispatchers.setMain(dispatcher)
    @After fun tearDown() = Dispatchers.resetMain()

    @Test fun `server errors become Spanish, raw English or parser text never reaches the screen`() {
        assertEquals(
            "La vinculación ya fue resuelta por otra persona. Se actualizó la lista.",
            userMessage(AuthRequestException("x", 409, "vinculacion_resuelta"), "fallback"),
        )
        assertEquals("No se pudo cargar.", userMessage(JSONException("JSONObject[\"rows\"] not found."), "No se pudo cargar."))
        assertEquals("No se pudo cargar.", userMessage(IllegalStateException("Expected BEGIN_OBJECT but was STRING"), "No se pudo cargar."))
        assertEquals("No se pudo cargar.", userMessage(RuntimeException(), "No se pudo cargar."))
        // Domain rules already speak Spanish and are kept.
        assertEquals("La ficha cambió. Vuelve a abrirla.", userMessage(IllegalArgumentException("La ficha cambió. Vuelve a abrirla."), "x"))
        // API messages (already translated by ApiProblems) are kept.
        assertEquals("Sin conexión. Conservamos el formulario; vuelve a intentar.", userMessage(AuthRequestException("Sin conexión. Conservamos el formulario; vuelve a intentar."), "x"))
    }

    @Test fun `the patient's own address and phone prefill only empty fields and the notice names what was filled`() {
        val prefill = AmbulancePrefill(address = "Colonia Ficticia 12, casa 4", phone = "7000-0001")
        val (draft, filled) = prefill.applyTo(RequestDraft(address = "", phone = ""))
        assertEquals("Colonia Ficticia 12, casa 4", draft.address)
        assertEquals("7000-0001", draft.phone)
        assertEquals(listOf(RequestField.ADDRESS, RequestField.PHONE), filled)

        // Something typed is never overwritten, and only what was really filled is announced.
        val (kept, onlyPhone) = prefill.applyTo(RequestDraft(address = "Otra dirección", phone = ""))
        assertEquals("Otra dirección", kept.address)
        assertEquals(listOf(RequestField.PHONE), onlyPhone)

        // A blank record fills nothing (no notice).
        assertEquals(emptyList<RequestField>(), AmbulancePrefill("", "").applyTo(RequestDraft()).second)
    }

    @Test fun `the request screen reads the patient's own data once, silently when it is missing`() = runTest(dispatcher) {
        val api = FakeGateway()
        api.responses["/ambulancia/solicitudes/mias"] = JSONArray()
        api.responses["/me/paciente"] = JSONObject().put("fullName", "Paciente Demo").put("address", "Colonia Ficticia 12").put("phone", "7000-0001").put("version", 1)
        val vm = AmbulanceViewModel(api, A1Bus)
        vm.open(AmbulanceMode.REQUEST); runCurrent()
        assertEquals(AmbulancePrefill("Colonia Ficticia 12", "7000-0001"), vm.state.value.requestPrefill)
        vm.open(AmbulanceMode.REQUEST); runCurrent()
        assertEquals(1, api.gets("/me/paciente"))

        val unlinked = FakeGateway()
        unlinked.responses["/ambulancia/solicitudes/mias"] = JSONArray()
        unlinked.failures["/me/paciente"] = AuthRequestException("Sin expediente", 404, "sin_expediente")
        val vm2 = AmbulanceViewModel(unlinked, A1Bus)
        vm2.open(AmbulanceMode.REQUEST); runCurrent()
        assertNull(vm2.state.value.requestPrefill)
        assertNull(vm2.state.value.error)
    }
}
