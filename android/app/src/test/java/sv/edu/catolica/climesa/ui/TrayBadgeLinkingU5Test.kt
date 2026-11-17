package sv.edu.catolica.climesa.ui

import java.time.Instant
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
import sv.edu.catolica.climesa.data.ResultsSeen
import sv.edu.catolica.climesa.data.realtime.RealtimeRepository
import sv.edu.catolica.climesa.domain.NoticeInboxParser
import sv.edu.catolica.climesa.domain.NoticeInboxRules
import sv.edu.catolica.climesa.domain.RealtimeSignal
import sv.edu.catolica.climesa.domain.ReceptionLinking

/** U5: "Ingresos indicados" (G3), the notices badge (D1), link requests (G2) and new results reaching 0 (G6). */
@OptIn(ExperimentalCoroutinesApi::class)
class TrayBadgeLinkingU5Test {
    private val dispatcher = StandardTestDispatcher()
    @Before fun setUp() = Dispatchers.setMain(dispatcher)
    @After fun tearDown() = Dispatchers.resetMain()
    private val quiet = object : RealtimeRepository { override fun observe(channels: List<String>) = emptyFlow<RealtimeSignal>() }

    private fun admission(id: String, origin: String, state: String = "pendiente_cama", actions: List<String> = listOf("asignar_cama")) = JSONObject()
        .put("id", id).put("patientId", "p-$id").put("patientName", "Ana Ficticia").put("origin", origin).put("requestedCategory", "semiprivada").put("state", state)
        .put("isolation", false).put("version", 2).put("bed", "").put("attendingDoctorName", "Marta Médica").put("motive", "Neumonía con hipoxemia").put("unstable", false)
        .put("allowedActions", JSONArray(actions))
    private fun bed(id: String, code: String) = JSONObject().put("id", id).put("version", 3).put("code", code).put("roomId", "r1").put("room", "Habitación 203")
        .put("category", "semiprivada").put("state", "libre").put("roomIsolation", false).put("occupiedInRoom", 0).put("reason", "Libre y de la categoría pedida")

    @Test fun indicatedAdmissionsShowWithTheirSuggestedBed() = runTest(dispatcher) {
        val api = FakeGateway()
        api.responses["/admisiones"] = JSONArray().put(admission("a1", "consulta")).put(admission("a2", "emergencia")).put(admission("a3", "consulta", "hospitalizado", emptyList()))
        api.responses["/admisiones/a1/sugerencias-cama"] = JSONArray().put(bed("b1", "HAB-203")).put(bed("b2", "HAB-204"))
        val vm = HospitalizationViewModel(api, quiet)
        vm.load(); runCurrent()
        val tray = vm.state.value.tray
        assertEquals(listOf("a1"), tray.map { it.admission.id })
        assertEquals("HAB-203", tray.single().bed?.code)
        assertEquals("Marta Médica", tray.single().admission.attendingDoctorName)
        assertEquals("Neumonía con hipoxemia", tray.single().admission.motive)
    }

    @Test fun admitSendsTheSuggestedBedAndShowsTheResult() = runTest(dispatcher) {
        val api = FakeGateway()
        api.responses["/admisiones"] = JSONArray().put(admission("a1", "consulta"))
        api.responses["/admisiones/a1/sugerencias-cama"] = JSONArray().put(bed("b1", "HAB-203"))
        val vm = HospitalizationViewModel(api, quiet)
        vm.load(); runCurrent()
        vm.admitIndicated(vm.state.value.tray.single()); runCurrent()
        val post = api.calls.single { it.second == "POST" }
        assertEquals("/admisiones/a1/cama", post.first)
        assertEquals("b1", post.third!!.getString("bedId"))
        assertEquals(3, post.third!!.getInt("version"))
        assertFalse("no invented reason", post.third!!.has("reason"))
        assertEquals("Ana Ficticia: ingresada · Cama HAB-203.", vm.state.value.notice)
    }

    @Test fun withoutCompatibleBedsNothingIsSentAndTheRowSaysSo() = runTest(dispatcher) {
        val api = FakeGateway()
        api.responses["/admisiones"] = JSONArray().put(admission("a1", "consulta"))
        api.responses["/admisiones/a1/sugerencias-cama"] = JSONArray()
        val vm = HospitalizationViewModel(api, quiet)
        vm.load(); runCurrent()
        val row = vm.state.value.tray.single()
        assertTrue(row.noBeds)
        vm.admitIndicated(row); runCurrent()
        assertTrue(api.calls.none { it.second == "POST" })
    }

    @Test fun aFailedAdmitStaysOnTheRow() = runTest(dispatcher) {
        val api = FakeGateway()
        api.responses["/admisiones"] = JSONArray().put(admission("a1", "consulta"))
        api.responses["/admisiones/a1/sugerencias-cama"] = JSONArray().put(bed("b1", "HAB-203"))
        api.failures["/admisiones/a1/cama"] = RuntimeException("red")
        val vm = HospitalizationViewModel(api, quiet)
        vm.load(); runCurrent()
        vm.admitIndicated(vm.state.value.tray.single()); runCurrent()
        assertTrue(vm.state.value.tray.single().error != null)
        assertNull(vm.state.value.notice)
    }

    @Test fun aFailedSuggestionReadIsShownOnTheRow() = runTest(dispatcher) {
        val api = FakeGateway()
        api.responses["/admisiones"] = JSONArray().put(admission("a1", "consulta"))
        api.failures["/admisiones/a1/sugerencias-cama"] = RuntimeException("red")
        val vm = HospitalizationViewModel(api, quiet)
        vm.load(); runCurrent()
        val row = vm.state.value.tray.single()
        assertTrue(row.error != null)
        assertFalse("a failed read is not 'no beds'", row.noBeds)
    }

    private fun inbox(unread: Int, vararg notices: Pair<String, Boolean>) = NoticeInboxParser.parse(JSONObject().put("actualizadoEn", "2026-11-17T15:00:00Z").put("noLeidos", unread).put("criticos", 0).put("avisos",
        JSONArray().apply { notices.forEach { (id, read) -> put(JSONObject().put("id", id).put("titulo", "T").put("cuerpo", "C").put("nivel", "importante").put("enteradoEn", if (read) "2026-11-17T14:00:00Z" else JSONObject.NULL)) } }))

    @Test fun noticesBadgeCountsUnreadMinusTheOnesJustAcknowledged() {
        val box = inbox(3, "n1" to false, "n2" to false, "n3" to false)
        assertEquals(3, NoticeInboxRules.badge(box))
        assertEquals(2, NoticeInboxRules.badge(box, hidden = setOf("n1")))
        assertEquals(0, NoticeInboxRules.badge(null))
        assertEquals("9+", NoticeInboxRules.badgeText(12))
        assertEquals("4", NoticeInboxRules.badgeText(4))
        assertNull(NoticeInboxRules.badgeText(0))
    }

    @Test fun linkRequestShowsTheClosestRecordWithoutMakingItApprovable() {
        val rows = ReceptionLinking.parse(JSONArray().put(JSONObject().put("id", "l1").put("version", 1).put("createdAt", "2026-11-17T15:00:00Z")
            .put("account", JSONObject().put("email", "ana@example.com").put("name", "Ana")).put("declared", JSONObject().put("dui", "01234567-8").put("birth", "1990-01-01"))
            .put("candidate", JSONObject.NULL).put("candidates", 0)
            .put("closest", JSONObject().put("id", "p9").put("record", "EXP-9").put("fullName", "Ana Ficticia").put("birth", "1990-01-01").put("dui", "01234567-9"))))
        val row = rows.single()
        assertFalse(row.hasCandidate)
        assertFalse(row.canApprove)
        assertEquals("EXP-9", row.closestRecord)
        assertEquals("01234567-9", row.closestDui)
        assertTrue(row.guidance.contains("EXP-9"))
    }

    @Test fun aFailedRejectKeepsItsErrorAfterTheListReloads() = runTest(dispatcher) {
        val api = FakeGateway()
        api.responses["/cuentas/vinculaciones"] = JSONArray()
        api.failures["/cuentas/vinculaciones/l1/rechazar"] = RuntimeException("red")
        val vm = ReceptionLinkingViewModel(api, quiet)
        val row = sv.edu.catolica.climesa.domain.LinkRequestRow("l1", 1, "", "ana@example.com", "Ana", "01234567-8", "1990-01-01", null, null, null, 0)
        vm.reject(row, "Los datos no coinciden con el DUI"); runCurrent()
        assertTrue("the error stays for the open dialog", vm.state.value.error != null)
    }

    @Test fun openingMyResultsMarksThemSeenWithTheServerTime() = runTest(dispatcher) {
        val api = FakeGateway()
        api.responses["/me/laboratorio"] = JSONArray().put(JSONObject().put("id", "o1").put("state", "completado").put("version", 2).put("reviewedAt", "2030-01-01T10:00:00Z").put("items", JSONArray()))
        val drafts = MemoryDrafts()
        val vm = LaboratoryViewModel(api, quiet, NoDocuments, drafts)
        vm.path = "/me/laboratorio"
        // The phone clock is behind the server: the release would stay "new" if only the phone time were stored.
        vm.markResultsSeen("u1", Instant.parse("2029-12-31T00:00:00Z"))
        vm.load(); runCurrent()
        assertTrue(!ResultsSeen.load(drafts, "u1")!!.isBefore(Instant.parse("2030-01-01T10:00:00Z")))
    }
}
