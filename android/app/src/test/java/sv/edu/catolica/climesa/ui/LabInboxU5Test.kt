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
import sv.edu.catolica.climesa.domain.LabFollowUpRules
import sv.edu.catolica.climesa.domain.LabInbox
import sv.edu.catolica.climesa.domain.RealtimeSignal

/** C1 (sweep #12): the doctor's inbox, one row per order with critical ones first, released after a confirmation with a summary. */
@OptIn(ExperimentalCoroutinesApi::class)
class LabInboxU5Test {
    private val dispatcher = StandardTestDispatcher()
    @Before fun setUp() = Dispatchers.setMain(dispatcher)
    @After fun tearDown() = Dispatchers.resetMain()
    private val quiet = object : RealtimeRepository { override fun observe(channels: List<String>) = emptyFlow<RealtimeSignal>() }

    private fun value(name: String, value: Double, unit: String, mark: String) = JSONObject().put("code", name.take(3)).put("name", name).put("unit", unit).put("value", value).put("text", JSONObject.NULL).put("mark", mark)
    private fun pending(id: String, order: String, patient: String, reason: String, created: String, values: JSONArray = JSONArray()) = JSONObject()
        .put("id", id).put("orderId", order).put("patientId", "p-$order").put("patientName", patient).put("patientRecord", "EXP-$order").put("reason", reason)
        .put("detail", "Detalle").put("state", "pendiente").put("orderState", "completado").put("priority", "rutina").put("external", false)
        .put("createdAt", created).put("updatedAt", created).put("version", 1).put("orderVersion", 5).put("orderActions", JSONArray().put("revisar")).put("values", values)

    private val inbox = JSONArray()
        .put(pending("f1", "o1", "Luis Ficticio", "observacion", "2026-11-17T13:00:00Z", JSONArray().put(value("Glucosa", 130.0, "mg/dL", "alto"))))
        .put(pending("f2", "o2", "Ana Ficticia", "critico", "2026-11-17T15:00:00Z", JSONArray().put(value("Hemoglobina", 7.1, "g/dL", "critico_bajo"))))
        .put(pending("f3", "o2", "Ana Ficticia", "observacion", "2026-11-17T15:01:00Z"))

    @Test fun oneRowPerOrderCriticalFirstWithKeyValuesInline() {
        val rows = LabInbox.rows(LabFollowUpRules.parse(inbox))
        assertEquals(listOf("o2", "o1"), rows.map { it.orderId })
        val ana = rows.first()
        assertTrue(ana.critical)
        assertEquals(5, ana.orderVersion)
        assertTrue(ana.canRelease)
        assertEquals(listOf("Hemoglobina 7.1 g/dL · Crítico bajo"), ana.keyValues)
        assertEquals(listOf("f2", "f3"), ana.followUpIds)
    }

    @Test fun releaseSendsTheReleasedBodyByDefaultAndSaysTheFollowUpWasProposed() = runTest(dispatcher) {
        val api = FakeGateway()
        api.responses["/laboratorio/pendientes"] = inbox
        api.responses["/laboratorio/ordenes/o2/revisar"] = JSONObject().put("id", "o2").put("version", 6).put("reviewedAt", "2026-11-17T16:00:00Z").put("followUpsClosed", 2).put("followUpProposalId", "s1")
        val vm = LaboratoryViewModel(api, quiet, NoDocuments)
        vm.loadFollowUps(); runCurrent()
        vm.openReview("o2")
        assertEquals("o2", vm.state.value.reviewOrderId)
        val target = vm.reviewTarget()!!
        assertEquals("Ana Ficticia", target.patientName)
        assertTrue(target.lines.contains("Hemoglobina 7.1 g/dL · Crítico bajo"))
        // D71: a critical result is not released until the doctor ticks that the patient was attended or warned.
        vm.release(); runCurrent()
        assertTrue(api.calls.none { it.first == "/laboratorio/ordenes/o2/revisar" })
        // The rows of that order leave only once the API answers.
        api.responses["/laboratorio/pendientes"] = JSONArray().put(inbox.getJSONObject(0))
        vm.setReviewCriticalAck(true); vm.release(); runCurrent()
        val body = api.calls.single { it.first == "/laboratorio/ordenes/o2/revisar" }.third!!
        assertEquals(5, body.getInt("version"))
        assertFalse("the default keeps the released body", body.has("followUp"))
        assertFalse(body.has("patientNote"))
        assertNull(vm.state.value.reviewOrderId)
        assertEquals("Resultados de Ana Ficticia liberados. Se propuso a Recepción una cita de seguimiento.", vm.state.value.notice)
        assertEquals(listOf("o1"), LabInbox.rows(vm.state.value.followUps).map { it.orderId })
    }

    @Test fun theDoctorCanSkipTheFollowUpAndLeaveANoteForThePatient() = runTest(dispatcher) {
        val api = FakeGateway()
        api.responses["/laboratorio/pendientes"] = inbox
        api.responses["/laboratorio/ordenes/o2/revisar"] = JSONObject().put("id", "o2").put("version", 6).put("reviewedAt", "2026-11-17T16:00:00Z").put("followUpsClosed", 2).put("followUpProposalId", JSONObject.NULL).put("followUpSkipped", "no_pedida")
        val vm = LaboratoryViewModel(api, quiet, NoDocuments)
        vm.loadFollowUps(); runCurrent()
        vm.openReview("o2")
        vm.setReviewFollowUp(false)
        vm.setReviewNote("  Tome hierro y vuelva en un mes.  ")
        vm.setReviewCriticalAck(true); vm.release(); runCurrent()
        val body = api.calls.single { it.first == "/laboratorio/ordenes/o2/revisar" }.third!!
        assertEquals(false, body.getBoolean("followUp"))
        assertEquals("Tome hierro y vuelva en un mes.", body.getString("patientNote"))
        assertEquals("Resultados de Ana Ficticia liberados.", vm.state.value.notice)
    }

    @Test fun aFailedReleaseKeepsTheConfirmationOpenWithTheError() = runTest(dispatcher) {
        val api = FakeGateway()
        api.responses["/laboratorio/pendientes"] = inbox
        api.failures["/laboratorio/ordenes/o2/revisar"] = RuntimeException("red")
        val vm = LaboratoryViewModel(api, quiet, NoDocuments)
        vm.loadFollowUps(); runCurrent()
        vm.openReview("o2")
        vm.setReviewCriticalAck(true); vm.release(); runCurrent()
        assertEquals("o2", vm.state.value.reviewOrderId)
        assertTrue(vm.state.value.error != null)
        assertEquals("the inbox keeps the order", listOf("o2", "o1"), LabInbox.rows(vm.state.value.followUps).map { it.orderId })
    }

    @Test fun aFailedInboxReadIsShown() = runTest(dispatcher) {
        val api = FakeGateway()
        api.failures["/laboratorio/pendientes"] = RuntimeException("red")
        val vm = LaboratoryViewModel(api, quiet, NoDocuments)
        vm.loadFollowUps(); runCurrent()
        assertTrue(vm.state.value.followUpsError != null)
    }

    // Verifier B2: with the order loaded, the release summary lists critical values first, then high/low, then normal.
    @Test fun theReleaseSummaryOfALoadedOrderIsCriticalFirst() {
        fun item(id: String, name: String, mark: String) = JSONObject().put("id", id).put("code", id).put("name", name).put("unit", "u")
            .put("result", JSONObject().put("value", 1.0).put("mark", mark))
        val order = sv.edu.catolica.climesa.domain.LaboratoryParser.orders(JSONArray().put(JSONObject().put("id", "o9").put("patientName", "Ana").put("priority", "rutina")
            .put("state", "completado").put("version", 2).put("reviewedAt", JSONObject.NULL).put("items", JSONArray().put(item("i1", "Glucosa", "normal")).put(item("i2", "Sodio", "alto"))
                .put(item("i3", "Hemoglobina", "critico_bajo")).put(item("i4", "Urea", "normal")).put(item("i5", "Potasio", "critico_alto"))))).single()
        val names = LabReviewSummary.lines(order).map { it.substringBefore(":") }
        assertEquals(listOf("Hemoglobina", "Potasio", "Sodio", "Glucosa", "Urea"), names)
    }

    @Test fun skippedFollowUpReasonsAreWorded() {
        assertEquals("Sin cita de seguimiento: el paciente está hospitalizado.", LabInbox.followUpOutcome(null, "hospitalizado"))
        assertEquals("Ya había una cita de seguimiento propuesta.", LabInbox.followUpOutcome(null, "ya_propuesta"))
        assertNull(LabInbox.followUpOutcome(null, "no_pedida"))
    }
}
