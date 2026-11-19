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
import sv.edu.catolica.climesa.data.AuthRequestException
import sv.edu.catolica.climesa.data.parseIsolatedBedCodes
import sv.edu.catolica.climesa.data.realtime.RealtimeRepository
import sv.edu.catolica.climesa.domain.AndroidSection
import sv.edu.catolica.climesa.domain.AppointmentRequestCards
import sv.edu.catolica.climesa.domain.Bed
import sv.edu.catolica.climesa.domain.BedsByType
import sv.edu.catolica.climesa.domain.CallNextConfirmation
import sv.edu.catolica.climesa.domain.CategoryRef
import sv.edu.catolica.climesa.domain.DashboardAttention
import sv.edu.catolica.climesa.domain.DashboardExtras
import sv.edu.catolica.climesa.domain.DashboardModel
import sv.edu.catolica.climesa.domain.DashboardSource
import sv.edu.catolica.climesa.domain.DashboardSplits
import sv.edu.catolica.climesa.domain.DashboardTone
import sv.edu.catolica.climesa.domain.IsolationFilter
import sv.edu.catolica.climesa.domain.QueueColumn
import sv.edu.catolica.climesa.domain.QueueReception
import sv.edu.catolica.climesa.domain.QueueTicket
import sv.edu.catolica.climesa.domain.QuickActionRequest
import sv.edu.catolica.climesa.domain.RealtimeSignal
import sv.edu.catolica.climesa.domain.RequestFranja
import sv.edu.catolica.climesa.domain.WaitingSplit

/** Owner batch 5 (S4, S5, S6, S7, S11) on Recepción: the pure texts and counts the screens draw. */
@OptIn(ExperimentalCoroutinesApi::class)
class Lote5ReceptionTest {
    private val dispatcher = StandardTestDispatcher()
    @Before fun setUp() = Dispatchers.setMain(dispatcher)
    @After fun tearDown() = Dispatchers.resetMain()
    private val quiet = object : RealtimeRepository { override fun observe(channels: List<String>) = emptyFlow<RealtimeSignal>() }

    private fun ticket(id: String, state: String = "en_espera", appointmentAt: String? = null, appointmentId: String? = null, fromArrival: Boolean = false) =
        QueueTicket(id, "consulta_general", id.length, "Paciente $id", state, 0, 1, appointmentAt = appointmentAt, appointmentId = appointmentId, arrivalFromAppointment = fromArrival)

    // --- S4 / S5: waiting split and queue summary ---

    @Test fun waitingSplitsWalkInsFromAppointmentsAndIgnoresOtherStates() {
        val tickets = listOf(
            ticket("a"), ticket("b"), ticket("c", appointmentAt = "2030-11-20T15:00:00Z"), ticket("d", appointmentId = "cita-1"),
            ticket("e", fromArrival = true), ticket("f", state = "llamado", appointmentAt = "2030-11-20T15:00:00Z"), ticket("g", state = "atendido"),
        )
        val split = QueueReception.waitingSplit(tickets)
        assertEquals(WaitingSplit(total = 5, walkIn = 2, booked = 3), split)
        assertEquals("2 de fila · 3 con cita", split.text)
    }

    @Test fun waitingSplitReadsRawQueueRowsLikeTheTickets() {
        val rows = listOf(
            JSONObject().put("state", "en_espera").put("appointmentAt", JSONObject.NULL),
            JSONObject().put("state", "en_espera").put("appointmentAt", "2030-11-20T15:00:00Z"),
            JSONObject().put("state", "en_espera").put("arrivalFromAppointment", true),
            JSONObject().put("state", "llamado"),
        )
        assertEquals(WaitingSplit(3, 1, 2), QueueReception.waitingSplitRows(rows))
    }

    @Test fun queueSummaryListsEveryStageWithZeros() {
        val summary = QueueReception.summary(listOf(ticket("a"), ticket("b"), ticket("c", state = "llamado"), ticket("d", state = "no_se_presento")))
        assertEquals(listOf(QueueColumn.WAITING to 2, QueueColumn.CALLED to 1, QueueColumn.IN_ATTENTION to 0, QueueColumn.CLOSED to 1), summary.map { it.column to it.count })
        assertEquals(listOf("En espera", "Llamados", "En atención", "Terminados"), summary.map { it.label })
    }

    @Test fun queueTicketParsesTheAppointmentLinkAndItsCategories() {
        val row = JSONObject().put("id", "t1").put("service", "consulta_general").put("numero", 3).put("state", "en_espera").put("llamados", 0).put("version", 1)
            .put("appointmentId", "cita-9").put("arrivalFromAppointment", true)
            .put("categories", JSONArray().put(JSONObject().put("code", "piel").put("name", "Piel").put("icon", "piel")))
        val parsed = sv.edu.catolica.climesa.domain.QueueRules.parse(JSONArray().put(row)).single()
        assertEquals("cita-9", parsed.appointmentId)
        assertTrue(parsed.arrivalFromAppointment)
        assertEquals(listOf(CategoryRef("piel", "Piel", "piel")), parsed.categories)
        assertTrue(QueueReception.booked(parsed))
    }

    // --- S5: call next confirmation ---

    @Test fun callNextConfirmationNamesNumberPatientRoomAndService() {
        val result = JSONObject().put("id", "t7").put("numero", 12).put("area", "CON").put("patientName", "Juan Pérez")
        val call = QueueReception.callNextConfirmation(result, "consulta_general", "C-101 · Consultorio 1")!!
        assertEquals(CallNextConfirmation("t7", "CON 12", "Juan Pérez", "C-101 · Consultorio 1", "Consulta general"), call)
        assertEquals("Llamaste CON 12 · Juan Pérez → C-101 · Consultorio 1 · Consulta general", call.text)
    }

    @Test fun callNextConfirmationWithoutRoomSaysSoAndWithoutNumberIsNull() {
        val call = QueueReception.callNextConfirmation(JSONObject().put("id", "t1").put("numero", 4).put("patientName", JSONObject.NULL), "emergencia", null)!!
        assertEquals("Llamaste EMG 4 → sin consultorio asignado · Emergencia", call.text)
        assertNull(QueueReception.callNextConfirmation(JSONObject().put("numero", 0), "emergencia", null))
        assertNull(QueueReception.callNextConfirmation("texto", "emergencia", null))
    }

    @Test fun theCallNextBannerHidesOnlyWhileItsCardIsShown() {
        val call = CallNextConfirmation("t1", "CON 1", null, null, "Consulta general")
        assertNull(QueueReception.noticeShown("Se llamó al N.º 1 de Consulta general.", call))
        assertNull(QueueReception.noticeShown("Número llamado.", call))
        assertEquals("Número emitido.", QueueReception.noticeShown("Número emitido.", call))
        assertEquals("Se llamó al N.º 1 de Consulta general.", QueueReception.noticeShown("Se llamó al N.º 1 de Consulta general.", null))
    }

    @Test fun callNextKeepsItsNoticeAndAddsTheConfirmationCard() = runTest(dispatcher) {
        val api = FakeGateway(JSONArray())
        api.responses["/fila/llamar-siguiente"] = JSONObject().put("id", "t5").put("numero", 5).put("area", "CON").put("patientName", "Ana López").put("version", 2).put("state", "llamado")
        val vm = QueueViewModel(api, quiet)
        vm.load(); runCurrent()
        vm.callNext("consulta_general"); runCurrent()
        assertEquals("Se llamó al N.º 5 de Consulta general.", vm.state.value.notice)
        assertEquals("Llamaste CON 5 · Ana López → sin consultorio asignado · Consulta general", vm.state.value.lastCall?.text)
        vm.dismissLastCall()
        assertNull(vm.state.value.lastCall)
    }

    @Test fun doctorRowSaysTheReasonTheAppointmentAndTheWait() {
        val now = 1_900_000_000_000L
        val withReason = ticket("a", appointmentAt = null).copy(issuedAtMillis = now - 25 * 60_000, categories = listOf(CategoryRef("piel", "Piel", "piel")))
        assertEquals("Piel · Sin cita · Espera 25 min", QueueReception.doctorSummary(withReason, now))
        val plain = ticket("b", state = "llamado").copy(issuedAtMillis = now - 5 * 60_000)
        assertEquals("Consulta general · Sin cita", QueueReception.doctorSummary(plain, now))
    }

    // --- S6: request cards ---

    @Test fun requestCardLabelsTellWhenItIsWantedFromWhenItWasAsked() {
        assertEquals("Para: Mañana, de 7:00 a 12:00", AppointmentRequestCards.requestedFor(RequestFranja.MORNING))
        assertEquals("Para: Tarde, de 12:00 a 17:00", AppointmentRequestCards.requestedFor(RequestFranja.AFTERNOON))
        assertEquals("Para: Cualquier hora", AppointmentRequestCards.requestedFor(RequestFranja.ANY))
        val created = "2030-11-20T14:00:00Z"
        val now = java.time.Instant.parse("2030-11-20T16:05:00Z").toEpochMilli()
        assertEquals("Pedida: hace 2 h", AppointmentRequestCards.askedAt(created, now))
        assertNull(AppointmentRequestCards.askedAt("no es fecha", now))
        assertEquals("Expediente EXP-1", AppointmentRequestCards.record("EXP-1"))
        assertNull(AppointmentRequestCards.record(" "))
        assertEquals("Por asignar", AppointmentRequestCards.stateLabel("pendiente"))
    }

    @Test fun noStaffShowsItsOwnApiTextAndFallsBackToTheMappedOne() {
        val own = AuthRequestException("No hay dermatólogos con turno en los próximos 14 días.", 409, NO_STAFF)
        assertEquals("No hay dermatólogos con turno en los próximos 14 días.", businessMessage(own, "x"))
        assertEquals(NO_STAFF_TEXT, businessMessage(AuthRequestException("", 409, NO_STAFF), "x"))
    }

    private fun request(id: String, staffAvailable: Boolean?) = JSONObject().put("id", id).put("patientName", "Paciente $id").put("record", "EXP-$id")
        .put("categories", JSONArray().put(JSONObject().put("code", "piel").put("name", "Piel").put("icon", "piel"))).put("specialties", JSONArray().put("Dermatología"))
        .put("franja", "tarde").put("note", JSONObject.NULL).put("preferredDoctorId", JSONObject.NULL).put("preferredDoctorName", JSONObject.NULL).put("state", "pendiente")
        .put("rejectionReason", JSONObject.NULL).put("appointment", JSONObject.NULL).put("createdAt", "2030-11-19T14:00:00Z").put("version", 1)
        .put("allowedActions", JSONArray().put("asignar").put("rechazar")).apply { if (staffAvailable != null) put("staffAvailable", staffAvailable) }

    @Test fun requestsWithoutStaffAreMarkedAndARejectErrorStaysOnItsCard() = runTest(dispatcher) {
        val api = FakeGateway()
        api.responses["/citas/solicitudes-categoria"] = JSONArray().put(request("s1", false)).put(request("s2", true)).put(request("s3", null))
        val vm = CategoryRequestsViewModel(api, quiet)
        vm.load(); runCurrent()
        assertEquals(setOf("s1"), vm.state.value.noStaff)
        api.failures["/citas/solicitudes-categoria/s2/rechazar"] = AuthRequestException("La solicitud cambió.", 409, "conflicto_version")
        vm.reject(vm.state.value.inbox.first { it.id == "s2" }, "No hay agenda disponible para esa fecha"); runCurrent()
        assertEquals("s2", vm.state.value.errorRequestId)
        assertFalse(vm.state.value.error.isNullOrBlank())
        vm.clearMessages()
        assertNull(vm.state.value.errorRequestId)
    }

    // --- S4 / S7: beds by type and isolation ---

    private fun bed(code: String, state: String, category: String, room: String = "H1") = Bed(code, code, room, state, 1, roomId = room, category = category)

    @Test fun freeBedsByTypeAlwaysListKnownTypesAndAddUnknownOnes() {
        val counts = BedsByType.ofBeds(listOf(bed("1", "libre", "semiprivada"), bed("2", "ocupada", "semiprivada"), bed("3", "ocupada", "vip"), bed("4", "libre", "general")))
        assertEquals(listOf("VIP" to (0 to 1), "Semiprivada" to (1 to 2), "General" to (1 to 1)), counts.map { it.label to (it.free to it.total) })
        assertEquals("VIP 0 · Semiprivada 1 · General 1", BedsByType.text(counts))
        assertEquals("VIP 0 · Semiprivada 0", BedsByType.text(BedsByType.ofBeds(emptyList())))
        val rows = listOf(JSONObject().put("category", "vip").put("state", "libre"), JSONObject().put("category", "vip").put("state", "limpieza"))
        assertEquals(listOf(1 to 2, 0 to 0), BedsByType.ofRows(rows).map { it.free to it.total })
    }

    @Test fun isolationMarksTheBedAndItsRoomFromTheAdmissions() {
        val admissions = JSONArray()
            .put(JSONObject().put("bed", "A-1").put("isolation", true).put("state", "hospitalizado"))
            .put(JSONObject().put("bed", "B-1").put("isolation", true).put("state", "egresado"))
            .put(JSONObject().put("bed", "C-1").put("isolation", false).put("state", "hospitalizado"))
            .put(JSONObject().put("bed", "").put("isolation", true).put("state", "pendiente_cama"))
            .put(JSONObject().put("bed", "D-1").put("isolation", true).put("state", "alta_firmada"))
        assertEquals(setOf("A-1", "D-1"), parseIsolatedBedCodes(admissions))
        val beds = BedsByType.withIsolation(listOf(bed("A-1", "ocupada", "vip", "R1"), bed("A-2", "libre", "vip", "R1"), bed("C-1", "ocupada", "vip", "R2")), setOf("A-1"))
        assertEquals(listOf(true, false, false), beds.map { it.isolated })
        assertEquals(listOf(true, true, false), beds.map { it.roomIsolated })
        assertEquals(1, BedsByType.count(beds, IsolationFilter.PATIENT))
        assertEquals(2, BedsByType.count(beds, IsolationFilter.ROOM))
        assertEquals(3, beds.count { BedsByType.matches(it, null) })
    }

    // --- S4: dashboard ---

    @Test fun dashboardExtrasSplitTheQueueAndCountFreeBedsByType() {
        val data = mapOf<DashboardSource, Any>(
            DashboardSource.QUEUE to JSONArray().put(JSONObject().put("state", "en_espera")).put(JSONObject().put("state", "en_espera").put("appointmentId", "c1")),
            DashboardSource.BEDS to JSONArray().put(JSONObject().put("category", "semiprivada").put("state", "libre")),
        )
        val extras = DashboardSplits.extras(data)
        assertEquals("1 de fila · 1 con cita", extras.waiting?.text)
        assertEquals("VIP 0 · Semiprivada 1", BedsByType.text(extras.bedTypes))
        assertNull(DashboardSplits.extras(emptyMap()).waiting)
    }

    @Test fun waitingTileComesBackInResumenWhenAPendingRowCoveredIt() {
        val row = DashboardAttention("3 números esperando", "Revisa la fila del día.", DashboardTone.WARNING, "Abrir fila", QuickActionRequest(AndroidSection.QUEUE), covers = DashboardSplits.WAITING)
        val model = DashboardModel(kpis = emptyList(), charts = emptyList(), attention = listOf(row), actions = emptyList())
        val withTile = DashboardSplits.withWaitingTile(model, DashboardExtras(waiting = WaitingSplit(3, 2, 1)))
        val tile = withTile.kpis.single()
        assertEquals(DashboardSplits.WAITING to "3", tile.label to tile.value)
        assertEquals(AndroidSection.QUEUE, tile.target)
        assertEquals(model, DashboardSplits.withWaitingTile(model, DashboardExtras()))
    }
}
