package sv.edu.catolica.climesa.ui

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
import kotlin.coroutines.coroutineContext
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
import sv.edu.catolica.climesa.data.ApiGateway
import sv.edu.catolica.climesa.data.RequestIntent
import sv.edu.catolica.climesa.data.realtime.RealtimeRepository
import sv.edu.catolica.climesa.domain.EventoDominio
import sv.edu.catolica.climesa.domain.RealtimeSignal
import sv.edu.catolica.climesa.domain.VitalMeasure
import sv.edu.catolica.climesa.domain.VitalsCandidate

private class VitalsBus : RealtimeRepository {
    val signals = MutableSharedFlow<RealtimeSignal>(extraBufferCapacity = 16)
    override fun observe(channels: List<String>): Flow<RealtimeSignal> = signals
}

private class VitalsGateway : ApiGateway {
    val calls = mutableListOf<Triple<String, String, JSONObject?>>()
    val keys = mutableListOf<String?>()
    var failGets = false
    var failPosts = 0
    var heartRate = 70
    override suspend fun request(path: String, method: String, body: JSONObject?): Any {
        calls += Triple(path, method, body)
        if (method == "POST") {
            keys += coroutineContext[RequestIntent]?.idempotencyKey
            if (failPosts > 0) { failPosts--; error("sin red") }
            return JSONObject().put("id", "r9")
        }
        if (failGets) error("sin red")
        return when {
            path.startsWith("/pacientes/p1/signos") -> JSONObject().put("patientId", "p1").put("patientName", "Ana Pérez").put("record", "EXP-1").put("age", 34)
                .put("admissionId", "adm-1").put("bed", "HAB-203-A")
                .put("items", JSONArray().put(JSONObject().put("id", "r1").put("takenAt", "2026-11-14T10:00:00Z").put("heartRate", heartRate)))
            path.startsWith("/pacientes/selector") -> JSONObject().put("items", JSONArray().put(JSONObject().put("id", "p1").put("record", "EXP-1").put("fullName", "Ana Pérez")))
            path == "/admisiones" -> JSONArray().put(JSONObject().put("patientId", "p1").put("patientName", "Ana Pérez").put("state", "hospitalizado").put("bed", "HAB-203-A"))
            path == "/fila" -> JSONArray().put(JSONObject().put("patientId", "p2").put("patientName", "Beto").put("state", "llamado").put("service", "emergencia").put("numero", 3))
            else -> JSONArray()
        }
    }
    fun gets(prefix: String) = calls.count { it.second == "GET" && it.first.startsWith(prefix) }
    fun posts() = calls.filter { it.second == "POST" }
}

@OptIn(ExperimentalCoroutinesApi::class)
class VitalSignsViewModelTest {
    private val dispatcher = StandardTestDispatcher()
    @Before fun setUp() = Dispatchers.setMain(dispatcher)
    @After fun tearDown() = Dispatchers.resetMain()

    private val patient = VitalsCandidate("p1", "Ana Pérez", "Cama HAB-203-A")

    @Test fun sourcesLoadOnlyWhatThePermissionsAllow() = runTest(dispatcher) {
        val api = VitalsGateway(); val vm = VitalSignsViewModel(api, VitalsBus())
        vm.loadSources(listOf("signos.registrar", "admision.ver")); runCurrent()
        assertEquals(1, api.gets("/admisiones")); assertEquals(0, api.gets("/fila"))
        assertEquals("Cama HAB-203-A", vm.state.value.ward.items.single().detail)
        vm.loadSources(listOf("signos.registrar", "fila.ver")); runCurrent()
        assertEquals("Beto", vm.state.value.queue.items.single().name)
    }

    @Test fun searchWaitsForThePauseAndIgnoresShortText() = runTest(dispatcher) {
        val api = VitalsGateway(); val vm = VitalSignsViewModel(api, VitalsBus())
        vm.onQuery("a"); advanceTimeBy(1000); runCurrent()
        assertEquals(0, api.gets("/pacientes/selector"))
        vm.onQuery("an"); vm.onQuery("ana"); advanceTimeBy(200); runCurrent()
        assertEquals(0, api.gets("/pacientes/selector"))
        advanceTimeBy(200); runCurrent()
        assertEquals(1, api.gets("/pacientes/selector"))
        assertEquals("Exp. EXP-1", vm.state.value.search.items.single().detail)
    }

    @Test fun openLoadsHistoryWithHeaderData() = runTest(dispatcher) {
        val api = VitalsGateway(); val vm = VitalSignsViewModel(api, VitalsBus())
        vm.open(patient); runCurrent()
        val history = vm.state.value.history!!
        assertEquals("EXP-1", history.record); assertEquals(34, history.age); assertEquals("HAB-203-A", history.bed)
        assertFalse(vm.state.value.loading)
    }

    @Test fun invalidFormNeverReachesTheApi() = runTest(dispatcher) {
        val api = VitalsGateway(); val vm = VitalSignsViewModel(api, VitalsBus())
        vm.open(patient); runCurrent()
        vm.save(); runCurrent()
        assertEquals("Registra al menos una medida.", vm.state.value.formError)
        assertTrue(api.posts().isEmpty())
    }

    @Test fun saveSendsTheBodyWithTheAdmissionClearsTheFormAndReloads() = runTest(dispatcher) {
        val api = VitalsGateway(); val vm = VitalSignsViewModel(api, VitalsBus())
        vm.open(patient); runCurrent()
        vm.edit(VitalMeasure.HEART_RATE, "88"); vm.edit(VitalMeasure.TEMPERATURE, "36,8"); api.heartRate = 88
        vm.save(); runCurrent()
        val (path, method, body) = api.posts().single()
        assertEquals("/pacientes/p1/signos", path); assertEquals("POST", method)
        assertEquals(88, body!!.getInt("heartRate")); assertEquals("adm-1", body.getString("admissionId"))
        assertNotNull(api.keys.single())
        assertEquals("", vm.state.value.form.value(VitalMeasure.HEART_RATE))
        assertEquals("Signos guardados.", vm.state.value.notice)
        assertEquals(2, api.gets("/pacientes/p1/signos"))
        assertEquals(88.0, vm.state.value.history!!.latest!!.values.getValue(VitalMeasure.HEART_RATE), 0.0)
    }

    @Test fun failedSaveKeepsTheFormAndRetriesWithTheSameKey() = runTest(dispatcher) {
        val api = VitalsGateway(); val vm = VitalSignsViewModel(api, VitalsBus())
        vm.open(patient); runCurrent()
        vm.edit(VitalMeasure.HEART_RATE, "88")
        api.failPosts = 1
        vm.save(); runCurrent()
        assertEquals("sin red", vm.state.value.formError)
        assertEquals("88", vm.state.value.form.value(VitalMeasure.HEART_RATE))
        vm.save(); runCurrent()
        assertEquals(2, api.keys.size)
        assertEquals(api.keys[0], api.keys[1])
        assertNull(vm.state.value.formError)
    }

    @Test fun failedLiveReloadKeepsTheShownHistory() = runTest(dispatcher) {
        val api = VitalsGateway(); val bus = VitalsBus(); val vm = VitalSignsViewModel(api, bus)
        vm.loadSources(listOf("signos.registrar")); vm.open(patient); vm.startLive(listOf("rol:ENF")); runCurrent()
        api.failGets = true
        bus.signals.tryEmit(RealtimeSignal.Event(EventoDominio("signos.registrados", "paciente", "p1", 1))); runCurrent()
        assertNotNull(vm.state.value.history)
        assertNull(vm.state.value.error)
        assertEquals(2, api.gets("/pacientes/p1/signos"))
    }

    @Test fun closeReturnsToThePickerAndDropsTheDraft() = runTest(dispatcher) {
        val api = VitalsGateway(); val vm = VitalSignsViewModel(api, VitalsBus())
        vm.open(patient); runCurrent(); vm.edit(VitalMeasure.HEART_RATE, "90")
        vm.close()
        assertNull(vm.state.value.patientId); assertNull(vm.state.value.history)
        assertEquals("", vm.state.value.form.value(VitalMeasure.HEART_RATE))
    }
}
