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
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import sv.edu.catolica.climesa.data.AuthRequestException
import sv.edu.catolica.climesa.data.realtime.RealtimeRepository
import sv.edu.catolica.climesa.domain.DischargePending
import sv.edu.catolica.climesa.domain.RealtimeSignal

@OptIn(ExperimentalCoroutinesApi::class)
class HospitalizationViewModelTest {
    private val dispatcher = StandardTestDispatcher()
    @Before fun setUp() = Dispatchers.setMain(dispatcher)
    @After fun tearDown() = Dispatchers.resetMain()

    private val quiet = object : RealtimeRepository { override fun observe(channels: List<String>): Flow<RealtimeSignal> = emptyFlow() }
    private val admission = HospitalAdmission("ad1", "Ana", "hospitalizado", "B-101", "semiprivada", false, 4)
    private fun api() = FakeGateway(JSONArray().put(JSONObject().put("id", "ad1").put("patientName", "Ana").put("state", "hospitalizado").put("version", 4)))

    @Test fun dischargeSendsWhatThePhysicianWrote() = runTest(dispatcher) {
        val api = api(); val vm = HospitalizationViewModel(api, quiet)
        vm.load(); runCurrent()
        vm.openDischarge(admission)
        vm.onSummary("Evolución favorable, afebril 48 h.")
        vm.addPending(); vm.onPending(0, DischargePending("Control en consulta externa", "Dr. Ramírez"))
        vm.signDischarge(admission); runCurrent()
        val body = api.calls.single { it.first == "/admisiones/ad1/alta" }.third!!
        assertEquals("Evolución favorable, afebril 48 h.", body.getString("summary"))
        assertEquals("Dr. Ramírez", body.getJSONArray("pending").getJSONObject(0).getString("responsible"))
        assertNull(vm.state.value.discharge)
        assertEquals("Alta firmada.", vm.state.value.notice)
    }

    @Test fun anEmptySummaryNeverReachesTheApi() = runTest(dispatcher) {
        val api = api(); val vm = HospitalizationViewModel(api, quiet)
        vm.openDischarge(admission)
        vm.signDischarge(admission); runCurrent()
        assertTrue(api.calls.none { it.first == "/admisiones/ad1/alta" })
        assertNotNull(vm.state.value.formError)
    }

    @Test fun aRejectedDischargeKeepsTheForm() = runTest(dispatcher) {
        val api = api(); api.failures["/admisiones/ad1/alta"] = AuthRequestException("Solo se puede firmar el alta de un paciente hospitalizado.", 409)
        val vm = HospitalizationViewModel(api, quiet)
        vm.openDischarge(admission); vm.onSummary("Evolución favorable, afebril 48 h.")
        vm.signDischarge(admission); runCurrent()
        assertEquals("Evolución favorable, afebril 48 h.", vm.state.value.discharge?.summary)
        assertEquals("Solo se puede firmar el alta de un paciente hospitalizado.", vm.state.value.formError)
    }

    @Test fun exitSendsTheTypedReasonAndVersion() = runTest(dispatcher) {
        val api = api(); val vm = HospitalizationViewModel(api, quiet)
        val signed = admission.copy(state = "alta_firmada", version = 5)
        vm.openExit(signed); vm.onExitReason("Egreso con familiar responsable")
        vm.registerExit(signed); runCurrent()
        val body = api.calls.single { it.first == "/admisiones/ad1/salida" }.third!!
        assertEquals(5, body.getInt("version"))
        assertEquals("Egreso con familiar responsable", body.getString("reason"))
    }
}
