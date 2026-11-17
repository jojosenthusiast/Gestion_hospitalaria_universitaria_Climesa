package sv.edu.catolica.climesa.ui

import java.time.LocalDate
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
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
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import sv.edu.catolica.climesa.data.AuthRequestException
import sv.edu.catolica.climesa.data.realtime.RealtimeRepository
import sv.edu.catolica.climesa.domain.EventoDominio
import sv.edu.catolica.climesa.domain.LinkStatus
import sv.edu.catolica.climesa.domain.RealtimeSignal

private class U9Bus : RealtimeRepository {
    val signals = MutableSharedFlow<RealtimeSignal>(extraBufferCapacity = 16)
    override fun observe(channels: List<String>): Flow<RealtimeSignal> = signals
}

/** Sweep U6 fixes owned by U9-android: G2 linking from `GET /me/vinculacion` (defect 3) and CIE-10 search (defect 5). */
@OptIn(ExperimentalCoroutinesApi::class)
class SweepU9AndroidTest {
    private val dispatcher = StandardTestDispatcher()
    @Before fun setUp() = Dispatchers.setMain(dispatcher)
    @After fun tearDown() = Dispatchers.resetMain()

    private fun request(id: String, state: String, createdAt: String = "2026-11-16T15:00:00Z", reason: String? = null) = JSONObject()
        .put("id", id).put("state", state).put("createdAt", createdAt).put("resolvedAt", JSONObject.NULL)
        .put("rejectionReason", reason ?: JSONObject.NULL).put("version", 1)

    private fun mine(request: JSONObject?, linked: Boolean = false, declared: JSONObject? = null) = JSONObject()
        .put("linked", linked).put("request", request ?: JSONObject.NULL).apply { if (declared != null) put("declared", declared) }

    private fun linkModel(api: FakeGateway, bus: RealtimeRepository = U9Bus()) = LinkRecordViewModel(api, bus).also { it.today = { LocalDate.parse("2026-11-17") } }

    // ---- G2: the screen opens in the real state of the request ----

    @Test fun withoutARequestTheScreenOpensOnTheForm() = runTest(dispatcher) {
        val api = FakeGateway(); api.responses["/me/vinculacion"] = mine(null)
        val vm = linkModel(api)
        vm.init(null); runCurrent()
        assertEquals(LinkStatus.FORM, vm.state.value.status)
    }

    // "Paciente: enviar, salir y volver. Se espera 'En revisión desde 16/11' en lugar del formulario."
    @Test fun aPendingRequestOpensPendingWithItsDayEvenAfterSignOut() = runTest(dispatcher) {
        val api = FakeGateway(); api.responses["/me/vinculacion"] = mine(request("r1", "pendiente", "2026-11-16T15:00:00Z"))
        val vm = linkModel(api) // a fresh model, as after sign-out: nothing is stored on the device
        vm.init(null); runCurrent()
        assertEquals(LinkStatus.PENDING, vm.state.value.status)
        assertEquals(LocalDate.parse("2026-11-16"), vm.state.value.since)
    }

    @Test fun theDayIsTheDayInElSalvador() = runTest(dispatcher) {
        val api = FakeGateway(); api.responses["/me/vinculacion"] = mine(request("r1", "pendiente", "2026-11-17T02:00:00Z"))
        val vm = linkModel(api)
        vm.init(null); runCurrent()
        assertEquals(LocalDate.parse("2026-11-16"), vm.state.value.since)
    }

    @Test fun anApprovedRequestOpensApproved() = runTest(dispatcher) {
        val api = FakeGateway(); api.responses["/me/vinculacion"] = mine(request("r1", "aprobada"), linked = true)
        val vm = linkModel(api)
        vm.init(null); runCurrent()
        assertEquals(LinkStatus.APPROVED, vm.state.value.status)
    }

    @Test fun aRejectionShowsTheReasonAndAsksAgainWithTheDeclaredData() = runTest(dispatcher) {
        val api = FakeGateway()
        api.responses["/me/vinculacion"] = mine(request("r1", "rechazada", reason = "El DUI no coincide."), declared = JSONObject().put("dui", "10000001-9").put("birth", "1990-01-01"))
        val vm = linkModel(api)
        vm.init(null); runCurrent()
        assertEquals(LinkStatus.REJECTED, vm.state.value.status)
        assertEquals("El DUI no coincide.", vm.state.value.rejectionReason)
        vm.retry()
        assertEquals(LinkStatus.FORM, vm.state.value.status)
        assertEquals("10000001-9", vm.state.value.prefill?.dui)
        assertEquals("1990-01-01", vm.state.value.prefill?.birth)
        vm.prefillApplied()
        assertNull("the prefill is applied once, so rotation keeps what is typed", vm.state.value.prefill)
        // Coming back while asking again keeps the form instead of the old rejection.
        vm.init(null); runCurrent()
        assertEquals(LinkStatus.FORM, vm.state.value.status)
    }

    @Test fun aReadErrorIsShownWithARetryAndNeverAsTheForm() = runTest(dispatcher) {
        val api = FakeGateway(); api.failures["/me/vinculacion"] = AuthRequestException("Sin conexión.")
        val vm = linkModel(api)
        vm.init(null); runCurrent()
        assertEquals(LinkStatus.UNAVAILABLE, vm.state.value.status)
        assertNotNull(vm.state.value.readError)
        api.failures.clear(); api.responses["/me/vinculacion"] = mine(request("r1", "pendiente"))
        vm.reload(); runCurrent()
        assertEquals(LinkStatus.PENDING, vm.state.value.status)
        assertNull(vm.state.value.readError)
    }

    @Test fun afterSendingTheScreenStaysPendingUntilAReadReturnsThatRequest() = runTest(dispatcher) {
        val api = FakeGateway()
        api.responses["/me/vinculacion"] = mine(null)
        api.responses["/cuentas/vinculacion"] = request("r2", "pendiente", "2026-11-17T15:00:00Z")
        val vm = linkModel(api)
        vm.init(null); runCurrent()
        vm.submit("10000001-9", "1990-01-01"); runCurrent()
        // The follow-up read still answers with no request (a stale read): never the form again.
        assertEquals(LinkStatus.PENDING, vm.state.value.status)
        assertEquals(LocalDate.parse("2026-11-17"), vm.state.value.since)
        vm.init(null); runCurrent()
        assertEquals(LinkStatus.PENDING, vm.state.value.status)
        assertEquals(1, api.calls.count { it.first == "/cuentas/vinculacion" })
        // Once a read returns it, the API decides from then on.
        api.responses["/me/vinculacion"] = mine(request("r2", "rechazada", "2026-11-17T15:00:00Z", "Datos distintos."))
        vm.init(null); runCurrent()
        assertEquals(LinkStatus.REJECTED, vm.state.value.status)
    }

    @Test fun aRetryReplaysTheSameKeyAndADifferentBodyGetsANewOne() = runTest(dispatcher) {
        val keys = mutableListOf<String?>()
        val api = object : sv.edu.catolica.climesa.data.ApiGateway {
            var fail = true
            override suspend fun request(path: String, method: String, body: JSONObject?): Any {
                if (path == "/me/vinculacion") return mine(null)
                keys += kotlin.coroutines.coroutineContext[sv.edu.catolica.climesa.data.RequestIntent]?.idempotencyKey
                if (fail) throw AuthRequestException("Sin conexión.")
                return request("r3", "pendiente")
            }
        }
        val vm = LinkRecordViewModel(api, U9Bus()).also { it.today = { LocalDate.parse("2026-11-17") } }
        vm.init(null); runCurrent()
        vm.submit("10000001-9", "1990-01-01"); runCurrent()
        vm.submit("10000001-9", "1990-01-01"); runCurrent()
        vm.submit("10000001-9", "1990-01-02"); runCurrent()
        assertEquals(3, keys.size)
        assertEquals("same body, same key", keys[0], keys[1])
        assertTrue("another body, another key", keys[2] != keys[1])
    }

    @Test fun aResolutionEventReadsTheRequestAgain() = runTest(dispatcher) {
        val api = FakeGateway(); val bus = U9Bus()
        api.responses["/me/vinculacion"] = mine(request("r1", "pendiente"))
        val vm = linkModel(api, bus)
        vm.init(null); vm.startLive(listOf("usuario:u1")); runCurrent()
        api.responses["/me/vinculacion"] = mine(request("r1", "aprobada"), linked = true)
        bus.signals.tryEmit(RealtimeSignal.Event(EventoDominio("vinculacion.resuelta", "vinculacion_paciente", "r1", 2))); runCurrent()
        assertEquals(LinkStatus.APPROVED, vm.state.value.status)
    }

    @Test fun aLinkedProfileIsApprovedWithoutReading() = runTest(dispatcher) {
        val api = FakeGateway()
        val vm = linkModel(api)
        vm.init("p1"); runCurrent()
        assertEquals(LinkStatus.APPROVED, vm.state.value.status)
        assertTrue(api.calls.isEmpty())
    }

    // ---- CIE-10 search in the diagnosis step ----

    private fun codes(vararg pairs: Pair<String, String>) = JSONArray().apply { pairs.forEach { (c, d) -> put(JSONObject().put("code", c).put("description", d)) } }

    @Test fun theSearchWaitsForTwoCharactersAndTheDebounce() = runTest(dispatcher) {
        val api = FakeGateway(); api.responses["/consultas/cie10?q=j0"] = codes("J06.9" to "Infección aguda de las vías respiratorias superiores")
        val vm = Cie10SearchViewModel(api)
        vm.query("j"); advanceTimeBy(1_000); runCurrent()
        assertTrue("one character never searches", api.calls.isEmpty())
        vm.query("j0"); runCurrent()
        assertTrue("nothing before the debounce", api.calls.isEmpty())
        advanceTimeBy(Cie10SearchViewModel.DEBOUNCE_MS + 1); runCurrent()
        assertEquals(listOf("/consultas/cie10?q=j0"), api.calls.map { it.first })
        assertEquals("J06.9", vm.state.value.results.single().code)
        assertEquals("Infección aguda de las vías respiratorias superiores", vm.state.value.results.single().description)
        assertFalse(vm.state.value.manual)
    }

    @Test fun typingFastSendsOnlyTheLastQuery() = runTest(dispatcher) {
        val api = FakeGateway(); api.responses["/consultas/cie10?q=tos+cr"] = codes("R05" to "Tos")
        val vm = Cie10SearchViewModel(api)
        vm.query("to"); advanceTimeBy(100)
        vm.query("tos"); advanceTimeBy(100)
        vm.query("tos cr"); advanceTimeBy(Cie10SearchViewModel.DEBOUNCE_MS + 1); runCurrent()
        assertEquals(listOf("/consultas/cie10?q=tos+cr"), api.calls.map { it.first })
    }

    @Test fun pickingAResultReturnsCodeAndDescriptionAndClearsTheSearch() = runTest(dispatcher) {
        val api = FakeGateway(); api.responses["/consultas/cie10?q=J06"] = codes("J06.9" to "Infección aguda")
        val vm = Cie10SearchViewModel(api)
        vm.query("J06"); advanceTimeBy(Cie10SearchViewModel.DEBOUNCE_MS + 1); runCurrent()
        val picked = vm.pick(vm.state.value.results.single())
        assertEquals("J06.9", picked.code)
        assertEquals("Infección aguda", picked.description)
        assertEquals("", vm.state.value.query)
        assertTrue(vm.state.value.results.isEmpty())
    }

    @Test fun aFailedSearchSaysWhyAndOnlyThenAllowsTheManualCode() = runTest(dispatcher) {
        val api = FakeGateway(); api.failures["/consultas/cie10?q=J06"] = AuthRequestException("Sin conexión.")
        val vm = Cie10SearchViewModel(api)
        vm.query("J06"); advanceTimeBy(Cie10SearchViewModel.DEBOUNCE_MS + 1); runCurrent()
        assertNotNull(vm.state.value.error)
        assertTrue(vm.state.value.manual)
        api.failures.clear(); api.responses["/consultas/cie10?q=J06"] = codes("J06.9" to "Infección aguda")
        vm.retry(); runCurrent()
        assertNull(vm.state.value.error)
        assertFalse(vm.state.value.manual)
        assertEquals(1, vm.state.value.results.size)
    }

    @Test fun anEmptyAnswerIsSaidAsNoResults() = runTest(dispatcher) {
        val api = FakeGateway(); api.responses["/consultas/cie10?q=zz"] = JSONArray()
        val vm = Cie10SearchViewModel(api)
        vm.query("zz"); advanceTimeBy(Cie10SearchViewModel.DEBOUNCE_MS + 1); runCurrent()
        assertTrue(vm.state.value.searched)
        assertTrue(vm.state.value.results.isEmpty())
        assertFalse(vm.state.value.manual)
    }
}
