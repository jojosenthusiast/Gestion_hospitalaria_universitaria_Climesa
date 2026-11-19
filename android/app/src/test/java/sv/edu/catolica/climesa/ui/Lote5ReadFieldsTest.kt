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
import sv.edu.catolica.climesa.data.BedRepository
import sv.edu.catolica.climesa.data.parseBeds
import sv.edu.catolica.climesa.data.realtime.RealtimeRepository
import sv.edu.catolica.climesa.domain.Bed
import sv.edu.catolica.climesa.domain.BedAction
import sv.edu.catolica.climesa.domain.BedsByType
import sv.edu.catolica.climesa.domain.CategoryRequestRules
import sv.edu.catolica.climesa.domain.ConsultationResume
import sv.edu.catolica.climesa.domain.IsolationFilter
import sv.edu.catolica.climesa.domain.PatientSummary
import sv.edu.catolica.climesa.domain.QueueReception
import sv.edu.catolica.climesa.domain.QueueRules
import sv.edu.catolica.climesa.domain.RealtimeSignal

/** Lote 5 optional read fields of the API: age and sex on rows, isolation on beds, office code on call next. */
@OptIn(ExperimentalCoroutinesApi::class)
class Lote5ReadFieldsTest {
    private val dispatcher = StandardTestDispatcher()

    @Before fun setUp() = Dispatchers.setMain(dispatcher)
    @After fun tearDown() = Dispatchers.resetMain()

    // --- age and sex ---

    @Test fun ageAndSexReadAsOneLineAndSexCodesMapToSpanish() {
        assertEquals("34 años · Femenino", PatientSummary.fromAge(34, "femenino"))
        assertEquals("1 año · Masculino", PatientSummary.fromAge(1, "masculino"))
        assertEquals("0 años · Indeterminado", PatientSummary.fromAge(0, "indeterminado"))
        assertEquals("70 años", PatientSummary.fromAge(70, "no_registrado"))
        assertEquals("Femenino", PatientSummary.fromAge(null, "femenino"))
        assertNull(PatientSummary.fromAge(null, null))
        assertNull(PatientSummary.fromAge(null, "otro"))
    }

    @Test fun queueRowsCarryAgeAndSexWhenTheApiSendsThem() {
        val rows = JSONArray()
            .put(JSONObject().put("id", "t1").put("service", "consulta_general").put("numero", 3).put("patientName", "Ana").put("state", "en_espera").put("patientAge", 34).put("patientSex", "femenino"))
            .put(JSONObject().put("id", "t2").put("service", "consulta_general").put("numero", 4).put("patientName", "Luis").put("state", "en_espera").put("patientAge", JSONObject.NULL).put("patientSex", JSONObject.NULL))
            .put(JSONObject().put("id", "t3").put("service", "consulta_general").put("numero", 5).put("patientName", "Old").put("state", "en_espera"))
        val tickets = QueueRules.parse(rows)
        assertEquals(34, tickets[0].patientAge)
        assertEquals("femenino", tickets[0].patientSex)
        assertEquals("34 años · Femenino", tickets[0].patientSummary)
        assertNull(tickets[1].patientAge)
        assertNull(tickets[1].patientSummary)
        assertNull(tickets[2].patientSummary)
    }

    @Test fun doctorQueueRowsCarryAgeAndSex() {
        val rows = JSONArray()
            .put(JSONObject().put("id", "t1").put("numero", 3).put("patientName", "Ana").put("state", "en_espera").put("patientAge", 8).put("patientSex", "masculino"))
            .put(JSONObject().put("id", "t2").put("numero", 4).put("patientName", "Luis").put("state", "en_espera"))
        val rowsParsed = ConsultationResume.parseQueue(rows)
        assertEquals("8 años · Masculino", rowsParsed[0].patientSummary)
        assertNull(rowsParsed[1].patientSummary)
    }

    @Test fun categoryRequestsCarryAgeAndSexAndOlderRowsOmitThem() {
        val rows = JSONArray()
            .put(JSONObject().put("id", "r1").put("patientName", "Ana").put("state", "pendiente").put("franja", "manana").put("createdAt", "2026-11-19T10:00:00Z").put("patientAge", 34).put("patientSex", "femenino"))
            .put(JSONObject().put("id", "r2").put("patientName", "Luis").put("state", "pendiente").put("franja", "tarde").put("createdAt", "2026-11-19T10:00:00Z").put("patientAge", JSONObject.NULL).put("patientSex", "masculino"))
            .put(JSONObject().put("id", "r3").put("patientName", "Old").put("state", "pendiente").put("franja", "tarde").put("createdAt", "2026-11-19T10:00:00Z"))
        val requests = CategoryRequestRules.requests(rows)
        assertEquals("34 años · Femenino", requests[0].patientSummary)
        assertEquals("Masculino", requests[1].patientSummary)
        assertNull(requests[2].patientAge)
        assertNull(requests[2].patientSummary)
    }

    // --- beds isolation ---

    private fun bedRow(id: String, code: String, room: String, state: String) =
        JSONObject().put("id", id).put("code", code).put("room", room).put("roomId", room).put("state", state).put("version", 1).put("category", "semiprivada")

    @Test fun bedsReadIsolationAndRoomIsolationFromTheBoard() {
        val beds = parseBeds(JSONArray()
            .put(bedRow("b1", "A-1", "R1", "ocupada").put("isolation", true).put("roomIsolation", true))
            .put(bedRow("b2", "A-2", "R1", "libre").put("isolation", false).put("roomIsolation", true))
            .put(bedRow("b3", "B-1", "R2", "ocupada").put("isolation", false).put("roomIsolation", false)))
        assertTrue(BedsByType.reportsIsolation(beds))
        assertEquals(listOf(true, false, false), beds.map { it.isolated })
        assertEquals(listOf(true, true, false), beds.map { it.roomIsolated })
        // Room in isolation: the free bed of that room counts even without an isolated patient in it.
        assertEquals(1, BedsByType.count(beds, IsolationFilter.PATIENT))
        assertEquals(2, BedsByType.count(beds, IsolationFilter.ROOM))
        assertTrue(BedsByType.matches(beds[1], IsolationFilter.ROOM))
        assertFalse(BedsByType.matches(beds[1], IsolationFilter.PATIENT))
    }

    @Test fun bedsWithoutTheFieldsDoNotReportIsolation() {
        val beds = parseBeds(JSONArray().put(bedRow("b1", "A-1", "R1", "ocupada")))
        assertFalse(BedsByType.reportsIsolation(beds))
        assertFalse(beds.single().isolated)
        assertFalse(beds.single().roomIsolated)
        assertFalse(BedsByType.reportsIsolation(emptyList()))
    }

    private class FakeBeds(val rows: List<Bed>, val isolated: Set<String>) : BedRepository {
        var admissionReads = 0
        override suspend fun beds(): List<Bed> = rows
        override suspend fun act(bedId: String, action: BedAction, version: Int, reason: String) = Unit
        override suspend fun isolatedBedCodes(): Set<String> { admissionReads++; return isolated }
    }

    private val noRealtime = object : RealtimeRepository { override fun observe(channels: List<String>) = emptyFlow<RealtimeSignal>() }

    @Test fun theBoardPrefersTheApiFieldsAndSkipsTheAdmissions() = runTest(dispatcher) {
        val board = parseBeds(JSONArray()
            .put(bedRow("b1", "A-1", "R1", "ocupada").put("isolation", true).put("roomIsolation", true))
            .put(bedRow("b2", "A-2", "R1", "libre").put("isolation", false).put("roomIsolation", true)))
        // The admissions would say otherwise; the board fields win and `/admisiones` is not read.
        val repo = FakeBeds(board, setOf("A-2"))
        val vm = BedsViewModel(repo, noRealtime)
        vm.start(emptyList(), setOf("camas.ver_tablero", "admision.ver")); runCurrent()
        assertEquals(0, repo.admissionReads)
        assertTrue(vm.state.value.isolationKnown)
        assertEquals(listOf(true, false), vm.state.value.beds.map { it.isolated })
        assertEquals(listOf(true, true), vm.state.value.beds.map { it.roomIsolated })
    }

    @Test fun withoutTheFieldsTheBoardFallsBackToTheAdmissions() = runTest(dispatcher) {
        val board = parseBeds(JSONArray().put(bedRow("b1", "A-1", "R1", "ocupada")).put(bedRow("b2", "A-2", "R1", "libre")).put(bedRow("b3", "B-1", "R2", "libre")))
        val repo = FakeBeds(board, setOf("A-1"))
        val vm = BedsViewModel(repo, noRealtime)
        vm.start(emptyList(), setOf("camas.ver_tablero", "admision.ver")); runCurrent()
        assertEquals(1, repo.admissionReads)
        assertTrue(vm.state.value.isolationKnown)
        assertEquals(listOf(true, false, false), vm.state.value.beds.map { it.isolated })
        assertEquals(listOf(true, true, false), vm.state.value.beds.map { it.roomIsolated })
    }

    @Test fun withoutTheFieldsNorAdmissionAccessTheFilterStaysHidden() = runTest(dispatcher) {
        val repo = FakeBeds(parseBeds(JSONArray().put(bedRow("b1", "A-1", "R1", "ocupada"))), setOf("A-1"))
        val vm = BedsViewModel(repo, noRealtime)
        vm.start(emptyList(), setOf("camas.ver_tablero")); runCurrent()
        assertEquals(0, repo.admissionReads)
        assertFalse(vm.state.value.isolationKnown)
    }

    // --- call next office code ---

    @Test fun callNextUsesTheOfficeCodeOfTheAnswerWhenPresent() {
        val result = JSONObject().put("id", "t7").put("numero", 12).put("area", "CON").put("patientName", "Juan Pérez").put("officeId", "o1").put("officeCode", "P1-CON-02")
        val call = QueueReception.callNextConfirmation(result, "consulta_general", "C-101 · Consultorio 1")!!
        assertEquals("P1-CON-02", call.office)
        assertEquals("Llamaste CON 12 · Juan Pérez → P1-CON-02 · Consulta general", call.text)
        // Without a picked room, the answer's code still names where the patient goes.
        assertEquals("P1-CON-02", QueueReception.callNextConfirmation(result, "consulta_general", null)!!.office)
    }

    @Test fun callNextWithoutOfficeCodeKeepsThePickedRoom() {
        val result = JSONObject().put("id", "t7").put("numero", 12).put("area", "CON").put("officeId", JSONObject.NULL).put("officeCode", JSONObject.NULL)
        assertEquals("C-101 · Consultorio 1", QueueReception.callNextConfirmation(result, "consulta_general", "C-101 · Consultorio 1")!!.office)
        assertEquals("Llamaste CON 12 → sin consultorio asignado · Consulta general", QueueReception.callNextConfirmation(result, "consulta_general", null)!!.text)
    }
}
