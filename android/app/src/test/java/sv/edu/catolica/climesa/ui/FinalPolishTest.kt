package sv.edu.catolica.climesa.ui

import java.io.File
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
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import sv.edu.catolica.climesa.data.realtime.RealtimeRepository
import sv.edu.catolica.climesa.domain.RealtimeSignal

/** Final QA polish: the inactive patient's calm reason at the counter and the Citas empty line that agrees with the filters. */
@OptIn(ExperimentalCoroutinesApi::class)
class FinalPolishTest {
    private val dispatcher = StandardTestDispatcher()
    @Before fun setUp() = Dispatchers.setMain(dispatcher)
    @After fun tearDown() = Dispatchers.resetMain()

    private val silent = object : RealtimeRepository { override fun observe(channels: List<String>) = emptyFlow<RealtimeSignal>() }

    @Test fun anInactivePatientFromTheRecordShowsACalmReasonNotASearchError() = runTest(dispatcher) {
        val api = FakeGateway()
        api.responses["/pacientes/selector?query=9900001&limit=10&offset=0"] = JSONObject().put("items", JSONArray().put(
            JSONObject().put("id", "p1").put("record", "9900001").put("fullName", "[DEMO] Ana").put("active", false),
        )).put("hasMore", false)
        val vm = QueueViewModel(api, silent)
        vm.preselectIssuePatient("p1", "9900001", "[DEMO] Ana"); runCurrent()
        val search = vm.state.value.issueSearch
        assertEquals("Paciente inactivo: actívalo en Pacientes para atenderlo.", search.blocked)
        assertNull(search.error)
        assertNull(search.patient)
        // A new search clears the reason.
        vm.issueQuery("x"); runCurrent()
        assertNull(vm.state.value.issueSearch.blocked)
    }

    @Test fun theCitasEmptyLinesNameOnlyTheRequestsByCategory() {
        val dir = listOf(File("src/main/res/values"), File("app/src/main/res/values"), File("android/app/src/main/res/values")).first { it.isDirectory }
        val text = dir.listFiles()!!.filter { it.name.startsWith("strings") }.joinToString("\n") { it.readText(Charsets.UTF_8) }
        fun string(name: String) = Regex("<string name=\"$name\">([^<]*)</string>").find(text)!!.groupValues[1]
        for (name in listOf("cat_bandeja_vacia", "citas_bandejas_al_dia")) {
            assertTrue(name, string(name).contains("por especialidad"))
            assertFalse(name, string(name).contains("Al día"))
        }
    }
}
