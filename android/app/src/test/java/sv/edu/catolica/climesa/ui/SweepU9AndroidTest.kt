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

/** Sweep U6 fixes owned by U9-android: CIE-10 search (defect 5). Linking by verified email (U12) lives in PatientRecordViewModelsTest. */
@OptIn(ExperimentalCoroutinesApi::class)
class SweepU9AndroidTest {
    private val dispatcher = StandardTestDispatcher()
    @Before fun setUp() = Dispatchers.setMain(dispatcher)
    @After fun tearDown() = Dispatchers.resetMain()

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
