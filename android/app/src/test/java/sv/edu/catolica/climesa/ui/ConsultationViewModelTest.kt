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
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import sv.edu.catolica.climesa.data.AuthRequestException
import sv.edu.catolica.climesa.data.realtime.RealtimeRepository
import sv.edu.catolica.climesa.domain.LaboratoryItem
import sv.edu.catolica.climesa.domain.LaboratoryOrder
import sv.edu.catolica.climesa.domain.RealtimeSignal

private object NoRealtime : RealtimeRepository {
    override fun observe(channels: List<String>): Flow<RealtimeSignal> = emptyFlow()
}

@OptIn(ExperimentalCoroutinesApi::class)
class ConsultationViewModelTest {
    private val dispatcher = StandardTestDispatcher()
    @Before fun setUp() = Dispatchers.setMain(dispatcher)
    @After fun tearDown() = Dispatchers.resetMain()

    private fun agenda(version: Int = 3) = JSONArray().put(JSONObject()
        .put("appointmentId", "a1").put("patientId", "p1").put("patientName", "Ana")
        .put("start", "2026-11-13T14:00:00Z").put("end", "2026-11-13T14:20:00Z").put("appointmentState", "confirmada")
        .put("consultationId", "c1").put("consultationState", "abierta").put("version", version))

    @Test fun failedSignatureKeepsTheSavedDraftVersionForTheRetry() = runTest(dispatcher) {
        val api = FakeGateway(agenda(version = 3))
        api.responses["/consultas/c1"] = JSONObject().put("version", 4)
        api.failures["/consultas/c1/firmar"] = AuthRequestException("Sin inscripción vigente.", 422)
        val vm = ConsultationViewModel(api, NoRealtime)
        vm.load(); runCurrent()
        var closed = false
        vm.sign(vm.state.value.appointments.single(), "Dolor de cabeza", "", "Reposo") { closed = true }; runCurrent()
        assertFalse(closed)
        assertEquals("Sin inscripción vigente.", vm.state.value.error)
        assertEquals(4, vm.state.value.appointments.single().version)

        api.failures.clear()
        api.responses["/consultas/c1"] = JSONObject().put("version", 5)
        vm.sign(vm.state.value.appointments.single(), "Dolor de cabeza", "", "Reposo") { closed = true }; runCurrent()
        val patches = api.calls.filter { it.first == "/consultas/c1" && it.second == "PATCH" }
        assertEquals(4, patches.last().third!!.getInt("version"))
        assertEquals(5, api.calls.last { it.first == "/consultas/c1/firmar" }.third!!.getInt("version"))
        assertTrue(closed)
    }

    @Test fun diagnosisFormIsClearedOnlyAfterTheApiAccepts() = runTest(dispatcher) {
        val api = FakeGateway(agenda())
        api.failures["/consultas/c1/diagnosticos"] = AuthRequestException("Código CIE-10 inválido.", 422)
        val vm = ConsultationViewModel(api, NoRealtime)
        vm.load(); runCurrent()
        var cleared = false
        vm.diagnosis(vm.state.value.appointments.single(), "x99", "", true) { cleared = true }; runCurrent()
        assertFalse(cleared)
        api.failures.clear()
        vm.diagnosis(vm.state.value.appointments.single(), "J00", "", true) { cleared = true }; runCurrent()
        assertTrue(cleared)
    }

    @Test fun prescriptionFormIsClearedOnlyAfterTheApiAccepts() = runTest(dispatcher) {
        val api = FakeGateway(agenda())
        api.failures["/consultas/c1/receta"] = AuthRequestException("Sin conexión.")
        val vm = ConsultationViewModel(api, NoRealtime)
        vm.load(); runCurrent()
        var cleared = false
        vm.prescription(vm.state.value.appointments.single(), "Paracetamol", "500 mg", "oral", "cada 8 h", "3 días", "") { cleared = true }; runCurrent()
        assertFalse(cleared)
        assertEquals("Sin conexión.", vm.state.value.error)
    }

    @Test fun laboratorySampleDialogClosesOnlyAfterTheApiAccepts() = runTest(dispatcher) {
        val api = FakeGateway()
        api.failures["/laboratorio/ordenes/o1/muestra"] = AuthRequestException("La identidad no coincide.", 422)
        val vm = LaboratoryViewModel(api, NoRealtime)
        val order = LaboratoryOrder("o1", "Ana", "rutina", "pendiente", 2, listOf(LaboratoryItem("i1", "HB", "Hemoglobina", null)), false)
        var closed = false
        vm.sample(order, "EXP-1", "Ana Pérez") { closed = true }; runCurrent()
        assertFalse(closed)
        api.failures.clear()
        vm.sample(order, "EXP-1", "Ana Pérez") { closed = true }; runCurrent()
        assertTrue(closed)
    }
}
