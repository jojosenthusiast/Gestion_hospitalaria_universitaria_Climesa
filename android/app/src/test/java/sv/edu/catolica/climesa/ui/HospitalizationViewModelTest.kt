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
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import sv.edu.catolica.climesa.data.AuthRequestException
import sv.edu.catolica.climesa.data.realtime.RealtimeRepository
import sv.edu.catolica.climesa.domain.AdmissionAction
import sv.edu.catolica.climesa.domain.DischargePending
import sv.edu.catolica.climesa.domain.HospitalAdmission
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
        assertEquals(4, body.getInt("version"))
        assertEquals("Evolución favorable, afebril 48 h.", body.getString("summary"))
        assertEquals("Dr. Ramírez", body.getJSONArray("pending").getJSONObject(0).getString("responsible"))
        assertNull(vm.state.value.discharge)
        assertEquals("Alta firmada.", vm.state.value.notice)
    }

    @Test fun aShortSummaryNeverReachesTheApi() = runTest(dispatcher) {
        val api = api(); val vm = HospitalizationViewModel(api, quiet)
        vm.openDischarge(admission); vm.onSummary("corto")
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

    @Test fun loadParsesAllowedActionsFromTheServer() = runTest(dispatcher) {
        val api = FakeGateway(JSONArray().put(JSONObject().put("id", "ad1").put("patientName", "Ana").put("state", "pendiente_cama").put("version", 2).put("allowedActions", JSONArray().put("cancelar").put("asignar_cama"))))
        val vm = HospitalizationViewModel(api, quiet)
        vm.load(); runCurrent()
        assertEquals(setOf(AdmissionAction.CANCEL, AdmissionAction.ASSIGN_BED), vm.state.value.admissions.single().allowedActions)
    }

    @Test fun cancelSendsReasonAndVersion() = runTest(dispatcher) {
        val api = api(); val vm = HospitalizationViewModel(api, quiet)
        val pending = admission.copy(state = "pendiente_cama", version = 2, allowedActions = setOf(AdmissionAction.CANCEL))
        vm.openReason(pending, AdmissionAction.CANCEL)
        vm.submitReason(pending); runCurrent()
        assertTrue("a short reason never leaves the phone", api.calls.none { it.first == "/admisiones/ad1/cancelar" })
        vm.onReason("Ingreso duplicado por error")
        vm.submitReason(pending); runCurrent()
        val body = api.calls.single { it.first == "/admisiones/ad1/cancelar" }.third!!
        assertEquals(2, body.getInt("version")); assertEquals("Ingreso duplicado por error", body.getString("reason"))
        assertNull(vm.state.value.reasonDialog)
        assertEquals("Admisión cancelada.", vm.state.value.notice)
    }

    @Test fun requestDischargeNoteIsOptional() = runTest(dispatcher) {
        val api = api(); val vm = HospitalizationViewModel(api, quiet)
        vm.openReason(admission, AdmissionAction.REQUEST_DISCHARGE)
        vm.submitReason(admission); runCurrent()
        val body = api.calls.single { it.first == "/admisiones/ad1/solicitar-alta" }.third!!
        assertEquals(4, body.getInt("version")); assertFalse(body.has("note"))
    }

    @Test fun revokeDischargeNeedsAReason() = runTest(dispatcher) {
        val api = api(); val vm = HospitalizationViewModel(api, quiet)
        val signed = admission.copy(state = "alta_firmada", version = 6)
        vm.openReason(signed, AdmissionAction.REVOKE_DISCHARGE); vm.onReason("Fiebre nueva antes de salir")
        vm.submitReason(signed); runCurrent()
        val body = api.calls.single { it.first == "/admisiones/ad1/revocar-alta" }.third!!
        assertEquals(6, body.getInt("version")); assertEquals("Fiebre nueva antes de salir", body.getString("reason"))
    }

    @Test fun aStaleAdmissionShowsSpanishTextAndReloads() = runTest(dispatcher) {
        val api = api(); api.failures["/admisiones/ad1/cancelar"] = AuthRequestException("State transition not allowed", 409, "transicion_invalida")
        val vm = HospitalizationViewModel(api, quiet)
        vm.load(); runCurrent()
        val before = api.gets("/admisiones")
        vm.openReason(admission, AdmissionAction.CANCEL); vm.onReason("Ingreso duplicado por error")
        vm.submitReason(admission); runCurrent()
        assertEquals("La admisión cambió de estado; vuelve a cargar.", vm.state.value.formError)
        assertEquals("Ingreso duplicado por error", vm.state.value.reasonDialog?.text)
        assertEquals(before + 1, api.gets("/admisiones"))
    }

    @Test fun transferPicksAFreeBedOfTheSameCategory() = runTest(dispatcher) {
        val api = api()
        api.responses["/camas"] = JSONArray()
            .put(JSONObject().put("id", "b1").put("code", "B-101").put("room", "H1").put("category", "semiprivada").put("state", "libre").put("version", 1))
            .put(JSONObject().put("id", "b2").put("code", "B-102").put("room", "H1").put("category", "semiprivada").put("state", "libre").put("version", 1))
            .put(JSONObject().put("id", "b3").put("code", "V-201").put("room", "H9").put("category", "vip").put("state", "libre").put("version", 1))
        val vm = HospitalizationViewModel(api, quiet)
        val row = admission.copy(occupationId = "oc1", bedCategory = "semiprivada", allowedActions = setOf(AdmissionAction.TRANSFER))
        vm.openTransfer(row); runCurrent()
        assertEquals(listOf("b2"), vm.state.value.transfer?.beds?.map { it.id })
        vm.pickTransferBed("b2"); vm.onTransferReason("Traslado por cercanía a enfermería")
        vm.transfer(row); runCurrent()
        val body = api.calls.single { it.first == "/ocupaciones/oc1/traslado" }.third!!
        assertEquals("b2", body.getString("bedId")); assertEquals(4, body.getInt("version")); assertEquals("Traslado por cercanía a enfermería", body.getString("reason"))
        assertNull(vm.state.value.transfer)
    }

    @Test fun nursingNotesLoadAddAndShowFailures() = runTest(dispatcher) {
        val api = api()
        api.responses["/admisiones/ad1/notas-enfermeria"] = JSONArray().put(JSONObject().put("id", "n1").put("text", "Paciente estable").put("createdAt", "2026-11-14T10:00:00Z").put("authorName", "Enf. Pérez"))
        val vm = HospitalizationViewModel(api, quiet)
        vm.openNotes(admission); runCurrent()
        assertEquals("Paciente estable", vm.state.value.notes?.notes?.single()?.text)
        vm.onNoteText("Signos vitales sin novedad")
        vm.addNote(admission); runCurrent()
        assertEquals("Signos vitales sin novedad", api.calls.single { it.first == "/admisiones/ad1/notas-enfermeria" && it.second == "POST" }.third!!.getString("text"))
        assertEquals("", vm.state.value.notes?.text)
        assertEquals(2, api.gets("/admisiones/ad1/notas-enfermeria"))

        api.failGets = true
        vm.closeNotes(); vm.openNotes(admission); runCurrent()
        assertNotNull("a failed read is an error, never an empty list", vm.state.value.notes?.loadError)
    }
}
