package sv.edu.catolica.climesa.ui

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
import sv.edu.catolica.climesa.domain.ConsultationRecordRules
import sv.edu.catolica.climesa.domain.MedicalAppointment
import sv.edu.catolica.climesa.domain.RealtimeSignal

/** R7 U2, journey B4: the consultation shows what is already recorded and never orders the same exam twice. */
@OptIn(ExperimentalCoroutinesApi::class)
class ConsultationJourneyTest {
    private val dispatcher = StandardTestDispatcher()
    @Before fun setUp() = Dispatchers.setMain(dispatcher)
    @After fun tearDown() = Dispatchers.resetMain()

    private val bus = object : RealtimeRepository { override fun observe(channels: List<String>) = emptyFlow<RealtimeSignal>() }
    private val item = MedicalAppointment("", "p1", "Ana Ficticia", "", "", "", null, "c1", "en_curso", "Tos", "", "", 2)

    private fun gateway() = FakeGateway().apply {
        responses["/consultas/c1/detalle"] = JSONObject()
            .put("consultation", JSONObject().put("id", "c1"))
            .put("diagnoses", JSONArray().put(JSONObject().put("id", "d1").put("code", "J45.9").put("principal", true).put("note", "Asma")))
            .put("prescriptions", JSONArray().put(JSONObject().put("id", "r1").put("items", JSONArray().put(JSONObject().put("medication", "Salbutamol").put("dose", "2 puff").put("frequency", "c/8 h").put("duration", "5 días")))))
        responses["/laboratorio/ordenes"] = JSONArray()
            .put(JSONObject().put("id", "o1").put("consultationId", "c1").put("state", "pendiente").put("items", JSONArray().put(JSONObject().put("examId", "e1").put("code", "HEM").put("name", "Hemograma"))))
            .put(JSONObject().put("id", "o2").put("consultationId", "otra").put("state", "pendiente").put("items", JSONArray().put(JSONObject().put("examId", "e2").put("code", "GLU").put("name", "Glucosa"))))
        responses["/laboratorio/catalogo"] = JSONArray()
            .put(JSONObject().put("id", "e1").put("code", "HEM").put("name", "Hemograma").put("isPanel", false))
            .put(JSONObject().put("id", "e2").put("code", "GLU").put("name", "Glucosa").put("isPanel", false))
    }

    @Test fun recordListsDiagnosesMedicationsAndOnlyThisConsultationsOrders() = runTest(dispatcher) {
        val api = gateway()
        val vm = ConsultationViewModel(api, bus)
        vm.loadRecord("c1", withLabOrders = true); vm.loadLabCatalog(); runCurrent()
        val record = vm.state.value.record!!
        assertEquals(listOf("J45.9"), record.diagnoses.map { it.code })
        assertEquals(listOf("Salbutamol"), record.medications.map { it.medication })
        assertEquals("the order of another consultation is not listed", listOf("o1"), record.labOrders.map { it.id })
        val catalog = vm.state.value.labCatalog
        assertTrue(record.alreadyOrdered(catalog.first { it.id == "e1" }))
        assertFalse(record.alreadyOrdered(catalog.first { it.id == "e2" }))
        assertEquals("1 diagnóstico · 1 medicamento · 1 examen", ConsultationRecordRules.signSummary(record))
    }

    // "Ordenar hemograma, salir y volver: no se puede volver a ordenar."
    @Test fun anExamAlreadyOrderedIsNeverSentAgain() = runTest(dispatcher) {
        val api = gateway()
        val vm = ConsultationViewModel(api, bus)
        vm.loadRecord("c1", withLabOrders = true); vm.loadLabCatalog(); runCurrent()
        vm.orderLab(item, listOf("e1"), urgent = false); runCurrent()
        assertTrue(api.calls.none { it.first == "/laboratorio/ordenes" && it.second == "POST" })
        assertEquals("Ya ordenaste Hemograma en esta consulta.", vm.state.value.error)
    }

    @Test fun orderingListsTheOrderInPlaceAndBlocksARepeat() = runTest(dispatcher) {
        val api = gateway()
        val vm = ConsultationViewModel(api, bus)
        vm.loadRecord("c1", withLabOrders = true); vm.loadLabCatalog(); runCurrent()
        var cleared = false
        vm.orderLab(item, listOf("e2"), urgent = false) { cleared = true }; runCurrent()
        assertTrue(cleared)
        assertEquals(RecordSection.LAB to "Orden emitida: Glucosa.", vm.state.value.stepNotice)
        val glucose = vm.state.value.labCatalog.first { it.id == "e2" }
        assertTrue("counted right away, before the order list shows it", vm.state.value.record!!.alreadyOrdered(glucose))
        assertEquals(2, vm.state.value.record!!.labOrders.size)
        vm.orderLab(item, listOf("e2"), urgent = false); runCurrent()
        assertEquals(1, api.calls.count { it.first == "/laboratorio/ordenes" && it.second == "POST" })
    }

    @Test fun aDiagnosisShowsUnderItsStepAndTheListRefreshes() = runTest(dispatcher) {
        val api = gateway()
        val vm = ConsultationViewModel(api, bus)
        vm.loadRecord("c1"); runCurrent()
        val before = api.gets("/consultas/c1/detalle")
        var cleared = false
        vm.diagnosis(item, "j45.9", "", principal = false) { cleared = true }; runCurrent()
        assertTrue(cleared)
        assertEquals(RecordSection.DIAGNOSIS to "Diagnóstico J45.9 registrado.", vm.state.value.stepNotice)
        assertEquals(before + 1, api.gets("/consultas/c1/detalle"))
    }

    @Test fun vitalSignsClearAndConfirmInPlace() = runTest(dispatcher) {
        val api = gateway()
        val vm = ConsultationViewModel(api, bus)
        var cleared = false
        vm.signs(item, "120", "80", "", "", "") { cleared = true }; runCurrent()
        assertTrue(cleared)
        assertEquals(RecordSection.SIGNS to "Signos vitales registrados.", vm.state.value.stepNotice)
    }

    @Test fun signSaysWhatIsMissing() {
        assertEquals("Completa el plan para firmar.", ConsultationRecordRules.signBlocker("Tos", ""))
        assertEquals("Completa el motivo para firmar.", ConsultationRecordRules.signBlocker("", "Reposo"))
        assertEquals("Completa el motivo y el plan para firmar.", ConsultationRecordRules.signBlocker("", ""))
        assertNull(ConsultationRecordRules.signBlocker("Tos", "Reposo"))
    }
}
