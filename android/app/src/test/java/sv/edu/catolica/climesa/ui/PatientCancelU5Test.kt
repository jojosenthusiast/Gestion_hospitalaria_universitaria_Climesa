package sv.edu.catolica.climesa.ui

import kotlin.coroutines.coroutineContext
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
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import sv.edu.catolica.climesa.data.ApiGateway
import sv.edu.catolica.climesa.data.AuthRequestException
import sv.edu.catolica.climesa.data.RequestIntent
import sv.edu.catolica.climesa.data.realtime.RealtimeRepository
import sv.edu.catolica.climesa.domain.AppointmentReasons
import sv.edu.catolica.climesa.domain.PatientAppointment
import sv.edu.catolica.climesa.domain.RealtimeSignal

/** D-8 (sweep #14): the patient cancels with a quick reason code, and a server without `reasonCode` still gets the old body. */
@OptIn(ExperimentalCoroutinesApi::class)
class PatientCancelU5Test {
    private val dispatcher = StandardTestDispatcher()
    @Before fun setUp() = Dispatchers.setMain(dispatcher)
    @After fun tearDown() = Dispatchers.resetMain()
    private val quiet = object : RealtimeRepository { override fun observe(channels: List<String>) = emptyFlow<RealtimeSignal>() }
    private val mine = PatientAppointment("a1", "Dr. Prueba", "2030-11-20T14:00:00Z", "2030-11-20T14:20:00Z", "confirmada", null, 3)

    /** A server released before D-8: `reasonCode` is not whitelisted (400 on that field), the rest is the old rule. */
    private class OldServer : ApiGateway {
        val posts = mutableListOf<Pair<JSONObject, String?>>()
        override suspend fun request(path: String, method: String, body: JSONObject?): Any {
            if (method == "GET") return JSONArray()
            posts += body!! to coroutineContext[RequestIntent]?.idempotencyKey
            if (body.has("reasonCode")) throw AuthRequestException("Este campo no se admite en la solicitud.", 400, "validacion",
                JSONObject().put("codigo", "validacion").put("errors", JSONArray().put(JSONObject().put("field", "reasonCode").put("message", "Este campo no se admite en la solicitud."))).toString())
            return JSONObject().put("id", "a1").put("version", 4).put("state", "cancelada")
        }
    }

    @Test fun aQuickReasonSendsItsCodeAndKeepsTheText() = runTest(dispatcher) {
        val api = FakeGateway()
        val vm = PatientAppointmentsViewModel(api, quiet)
        vm.cancel(mine, AppointmentReasons.patientCancel[1]); runCurrent()
        val body = api.calls.single { it.second == "POST" }.third!!
        assertEquals("no_puedo_a_esa_hora", body.getString("reasonCode"))
        assertEquals("No puedo a esa hora", body.getString("reason"))
        assertEquals(3, body.getInt("version"))
        assertEquals("Cita cancelada.", vm.state.value.notice)
    }

    @Test fun otherNeedsOnlyAShortText() = runTest(dispatcher) {
        val api = FakeGateway()
        val vm = PatientAppointmentsViewModel(api, quiet)
        vm.cancel(mine, "Viaje", other = true); runCurrent()
        val body = api.calls.single { it.second == "POST" }.third!!
        assertEquals("otro", body.getString("reasonCode"))
        assertEquals("Viaje", body.getString("reason"))
    }

    @Test fun otherWithLessThanThreeCharactersSendsNothingAndSaysWhy() = runTest(dispatcher) {
        val api = FakeGateway()
        val vm = PatientAppointmentsViewModel(api, quiet)
        vm.cancel(mine, "no", other = true); runCurrent()
        assertTrue(api.calls.none { it.second == "POST" })
        assertEquals("Escribe brevemente el motivo (al menos 3 caracteres).", vm.state.value.error)
    }

    @Test fun aServerWithoutReasonCodeGetsTheReleasedBodyWithANewKey() = runTest(dispatcher) {
        val api = OldServer()
        val vm = PatientAppointmentsViewModel(api, quiet)
        vm.cancel(mine, AppointmentReasons.patientCancel[0]); runCurrent()
        assertEquals(2, api.posts.size)
        val released = api.posts[1].first
        assertFalse("the released body has no reasonCode", released.has("reasonCode"))
        assertEquals("Ya no lo necesito", released.getString("reason"))
        assertEquals(3, released.getInt("version"))
        assertNotEquals("a different body never reuses the key", api.posts[0].second, api.posts[1].second)
        assertEquals("Cita cancelada.", vm.state.value.notice)
    }

    // PAC request: when no day of the doctor catalog can be read, the form says so (never an empty silent list).
    @Test fun aDoctorCatalogThatFailsEveryDayIsShown() = runTest(dispatcher) {
        val api = FakeGateway()
        val today = java.time.LocalDate.parse("2030-11-20")
        (0L until 7L).forEach { api.failures["/citas/catalogos?date=${today.plusDays(it)}"] = RuntimeException("red") }
        val vm = PatientAppointmentsViewModel(api, quiet)
        vm.loadRequestDoctors(today); runCurrent()
        assertEquals("No se pudo cargar la lista de médicos. Vuelve a intentar.", vm.state.value.error)
    }

    @Test fun aShortOtherOnAServerWithoutReasonCodeShowsItsError() = runTest(dispatcher) {
        val api = OldServer()
        val vm = PatientAppointmentsViewModel(api, quiet)
        vm.cancel(mine, "Viaje", other = true); runCurrent()
        assertEquals("only the coded body is sent: the old rule needs 10 characters", 1, api.posts.size)
        assertEquals("Escribe un motivo de al menos 10 caracteres.", vm.state.value.error)
    }
}
