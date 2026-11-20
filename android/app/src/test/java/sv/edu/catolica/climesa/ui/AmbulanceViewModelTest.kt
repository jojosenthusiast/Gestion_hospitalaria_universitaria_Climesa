package sv.edu.catolica.climesa.ui

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
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
import sv.edu.catolica.climesa.domain.EventoDominio
import sv.edu.catolica.climesa.domain.LogFilters
import sv.edu.catolica.climesa.domain.PrehospitalForm
import sv.edu.catolica.climesa.domain.RealtimeSignal
import java.time.Instant

private class AmbulanceBus : RealtimeRepository {
    val signals = MutableSharedFlow<RealtimeSignal>(extraBufferCapacity = 16)
    override fun observe(channels: List<String>): Flow<RealtimeSignal> = signals
}

@OptIn(ExperimentalCoroutinesApi::class)
class AmbulanceViewModelTest {
    private val dispatcher = StandardTestDispatcher()
    @Before fun setUp() = Dispatchers.setMain(dispatcher)
    @After fun tearDown() = Dispatchers.resetMain()

    private fun status(withService: Boolean = false) = JSONObject()
        .put("unit", JSONObject().put("id", "u1").put("plate", "P-000-001").put("state", if (withService) "en_servicio" else "disponible").put("version", 5))
        .put("paramedicOnDuty", true)
        .put("activeService", if (!withService) JSONObject.NULL else JSONObject().put("id", "s1").put("type", "emergencia_domicilio").put("priority", "roja").put("origin", "Colonia Ficticia").put("destination", "Hospital CLIMESA").put("dispatchedAt", "2026-11-15T14:00:00Z")
            .put("milestones", JSONArray().put(JSONObject().put("type", "salida").put("occurredAt", "2026-11-15T14:05:00Z"))).put("nextMilestones", JSONArray().put("en_escena").put("finalizado")).put("crew", JSONArray()))
        .put("pendingRequests", JSONArray().put(JSONObject().put("id", "r1").put("channel", "telefono").put("address", "Colonia Ficticia 12").put("reason", "Caída").put("contactPhone", "7000-0001").put("createdAt", "2026-11-15T14:00:00Z").put("version", 2)))
        .put("availableCrew", JSONArray()
            .put(JSONObject().put("staffId", "par-1").put("role", "paramedico").put("name", "Ana Paramédica").put("hasAccount", true))
            .put(JSONObject().put("staffId", "par-2").put("role", "paramedico").put("name", "Beto Paramédico").put("hasAccount", false))
            .put(JSONObject().put("staffId", "mot-1").put("role", "motorista").put("name", "Carlos Motorista").put("hasAccount", false)))

    @Test fun despachaConLaVersionDeLaUnidadYLaSolicitud() = runTest(dispatcher) {
        val api = FakeGateway(); api.responses["/ambulancia"] = status()
        val vm = AmbulanceViewModel(api, AmbulanceBus())
        vm.open(AmbulanceMode.STATUS); runCurrent()
        val request = vm.state.value.status!!.pendingRequests.single()
        val pool = vm.state.value.status!!.availableCrew
        assertEquals(listOf("par-1", "mot-1"), sv.edu.catolica.climesa.domain.AmbulanceRules.defaultCrew(pool))
        vm.dispatch(request, "emergencia_domicilio", "roja", "Hospital CLIMESA", listOf("par-1", "mot-1")); runCurrent()
        val body = api.calls.single { it.first == "/ambulancia/servicios" }.third!!
        assertEquals(5, body.getInt("version")); assertEquals("r1", body.getString("requestId")); assertEquals("roja", body.getString("priority"))
        assertEquals(listOf("par-1", "mot-1"), (0 until body.getJSONArray("crew").length()).map { body.getJSONArray("crew").getString(it) })
        assertEquals("Ambulancia despachada.", vm.state.value.notice)
    }

    /** MA-AMB-02: the dispatcher picks the crew; without a paramedic with an account or a driver nothing is sent. */
    @Test fun laTripulacionElegidaNecesitaParamedicoConCuentaYMotorista() = runTest(dispatcher) {
        val api = FakeGateway(); api.responses["/ambulancia"] = status()
        val vm = AmbulanceViewModel(api, AmbulanceBus())
        vm.open(AmbulanceMode.STATUS); runCurrent()
        val request = vm.state.value.status!!.pendingRequests.single()
        vm.dispatch(request, "emergencia_domicilio", "roja", "Hospital CLIMESA", listOf("par-2", "mot-1")); runCurrent()
        assertEquals("Elige un paramédico con cuenta en la app: registra los hitos del servicio.", vm.state.value.formError)
        vm.dispatch(request, "emergencia_domicilio", "roja", "Hospital CLIMESA", listOf("par-1")); runCurrent()
        assertEquals("Elige un motorista de turno para el servicio.", vm.state.value.formError)
        assertTrue(api.calls.none { it.first == "/ambulancia/servicios" })
    }

    @Test fun quienPierdeLaCarreraVeQueYaFueDespachada() = runTest(dispatcher) {
        val api = FakeGateway(); api.responses["/ambulancia"] = status()
        api.failures["/ambulancia/servicios"] = AuthRequestException("x", 409, "ambulancia_ya_despachada")
        val vm = AmbulanceViewModel(api, AmbulanceBus())
        vm.open(AmbulanceMode.STATUS); runCurrent()
        vm.dispatch(vm.state.value.status!!.pendingRequests.single(), "emergencia_domicilio", "roja", "Hospital CLIMESA", listOf("par-1", "mot-1")); runCurrent()
        assertEquals("La ambulancia ya fue despachada.", vm.state.value.formError)
    }

    @Test fun terminarSinTrasladoExigeMotivoAntesDeLlamarALaApi() = runTest(dispatcher) {
        val api = FakeGateway(); api.responses["/ambulancia"] = status(withService = true)
        val vm = AmbulanceViewModel(api, AmbulanceBus())
        vm.open(AmbulanceMode.STATUS); runCurrent()
        val service = vm.state.value.status!!.activeService!!
        vm.advance(service, "finalizado"); runCurrent()
        assertTrue(api.calls.none { it.first.endsWith("/hitos") })
        assertNotNull(vm.state.value.formError)
        vm.advance(service, "finalizado", "rechaza_traslado", "El paciente firma rechazo"); runCurrent()
        val body = api.calls.single { it.first == "/ambulancia/servicios/s1/hitos" }.third!!
        assertEquals("rechaza_traslado", body.getString("finalState"))
    }

    @Test fun sinSenalElPrehospitalQuedaEnColaYSeReenviaIgualAlReconectar() = runTest(dispatcher) {
        val api = FakeGateway(); api.responses["/ambulancia"] = status(withService = true)
        api.failures["/ambulancia/servicios/s1/prehospital"] = AuthRequestException("Sin conexión.")
        val bus = AmbulanceBus()
        val vm = AmbulanceViewModel(api, bus)
        vm.startLive(listOf("ambulancia")); vm.open(AmbulanceMode.STATUS); runCurrent()
        vm.updatePrehospital(PrehospitalForm(reason = "Dolor torácico", priority = "naranja", heartRate = "110", etaMinutes = "15"))
        vm.sendPrehospital("s1", Instant.parse("2026-11-15T14:10:00Z")); runCurrent()
        assertNotNull(vm.state.value.queued)
        api.failures.remove("/ambulancia/servicios/s1/prehospital")
        bus.signals.tryEmit(RealtimeSignal.Resync); runCurrent()
        val sent = api.calls.filter { it.first == "/ambulancia/servicios/s1/prehospital" }.map { it.third.toString() }
        assertEquals(2, sent.size)
        assertEquals("el reenvío conserva el cuerpo, y con él la clave de idempotencia", sent[0], sent[1])
        assertNull(vm.state.value.queued)
        assertEquals("2026-11-15T14:25:00Z", JSONObject(sent[1]).getString("estimatedArrival"))
    }

    @Test fun elReporteEnColaYElFormularioSobrevivenAQueSeCierreLaApp() = runTest(dispatcher) {
        val store = sv.edu.catolica.climesa.data.FileDraftStore(java.nio.file.Files.createTempDirectory("borradores").toFile(), sv.edu.catolica.climesa.data.TestCipher)
        val api = FakeGateway(); api.responses["/ambulancia"] = status(withService = true)
        api.failures["/ambulancia/servicios/s1/prehospital"] = AuthRequestException("Sin conexión.")
        val first = AmbulanceViewModel(api, AmbulanceBus(), store)
        first.bindUser("par-1"); first.open(AmbulanceMode.STATUS); runCurrent()
        first.updatePrehospital(PrehospitalForm(reason = "Dolor torácico", heartRate = "110"), "s1")
        first.sendPrehospital("s1", Instant.parse("2026-11-15T14:10:00Z")); runCurrent()
        assertNotNull(first.state.value.queued)

        // Process death: a new ViewModel for the same user gets the queued report and the typed form back.
        val again = AmbulanceViewModel(api, AmbulanceBus(), store)
        again.bindUser("par-1")
        assertEquals(first.state.value.queued, again.state.value.queued)
        again.restorePrehospital("s1")
        assertEquals("Dolor torácico", again.state.value.prehospital.reason)
        api.failures.clear()
        again.retryQueued(); runCurrent()
        assertNull(again.state.value.queued)
        assertNull(store.load("par-1", sv.edu.catolica.climesa.domain.FormDrafts.PREHOSPITAL_QUEUE))
        assertNull(store.load("par-1", sv.edu.catolica.climesa.domain.FormDrafts.PREHOSPITAL_FORM))
    }

    @Test fun elPacienteProvisionalSeVinculaEnElSiguienteReporte() = runTest(dispatcher) {
        val api = FakeGateway(); api.responses["/ambulancia"] = status(withService = true)
        api.responses["/pacientes/busquedas"] = JSONObject().put("token", "t1")
        api.responses["/pacientes/provisionales"] = JSONObject().put("id", "p9").put("record", "EXP-9")
        val vm = AmbulanceViewModel(api, AmbulanceBus())
        vm.open(AmbulanceMode.STATUS); runCurrent()
        vm.registerUnidentified("masculino", "40", "Camisa azul"); runCurrent()
        val created = api.calls.single { it.first == "/pacientes/provisionales" }.third!!
        assertEquals("t1", created.getString("searchToken")); assertEquals(40, created.getInt("estimatedAge")); assertEquals("", created.getString("givenNames"))
        vm.updatePrehospital(PrehospitalForm(reason = "Politraumatismo", priority = "roja"))
        vm.sendPrehospital("s1", Instant.parse("2026-11-15T14:10:00Z")); runCurrent()
        assertEquals("p9", api.calls.single { it.first == "/ambulancia/servicios/s1/prehospital" }.third!!.getString("patientId"))
        assertNull(vm.state.value.provisional)
    }

    private fun ownRequest(state: String, actions: JSONArray = JSONArray(), service: Any = JSONObject.NULL) = JSONObject().put("id", "r7").put("state", state).put("channel", "app_paciente")
        .put("address", "Colonia Ficticia 12").put("reason", "Caída en casa").put("createdAt", "2026-11-15T14:00:00Z").put("version", 1)
        .put("service", service).put("allowedActions", actions).put("notice", "Si hay riesgo de vida, llama al 911.")

    @Test fun laSolicitudDelPacienteSaleDelServidorYSeVuelveAPedirConCadaEvento() = runTest(dispatcher) {
        val api = FakeGateway(); api.responses["/ambulancia/solicitudes/mias"] = JSONArray()
        val bus = AmbulanceBus()
        val vm = AmbulanceViewModel(api, bus)
        vm.startLive(listOf("usuario:pac")); vm.open(AmbulanceMode.REQUEST); runCurrent()
        assertEquals(emptyList<Any>(), vm.state.value.ownRequests)
        vm.submitRequest("Co", "", "Caída", "7000"); runCurrent()
        assertTrue(api.calls.none { it.second == "POST" })
        api.responses["/ambulancia/solicitudes/mias"] = JSONArray().put(ownRequest("por_confirmar", JSONArray().put("cancelar")))
        vm.submitRequest("Colonia Ficticia 12", "San Salvador", "Caída en casa", "7000-0001"); runCurrent()
        assertEquals("Si hay riesgo de vida, llama al 911.", vm.state.value.notice)
        val active = sv.edu.catolica.climesa.domain.AmbulanceRules.activeRequest(vm.state.value.ownRequests!!)!!
        assertTrue(active.canCancel)
        // A dispatch event: the screen asks the server again instead of guessing the new state.
        api.responses["/ambulancia/solicitudes/mias"] = JSONArray().put(ownRequest("confirmada", service = JSONObject().put("dispatchedAt", "2026-11-15T14:05:00Z").put("finalState", JSONObject.NULL)
            .put("milestones", JSONArray().put(JSONObject().put("type", "salida").put("occurredAt", "2026-11-15T14:07:00Z")))))
        bus.signals.tryEmit(RealtimeSignal.Event(EventoDominio("ambulancia.hito", "servicio", "s1", 3))); runCurrent()
        val following = vm.state.value.ownRequests!!.single()
        assertEquals("La ambulancia va en camino.", sv.edu.catolica.climesa.domain.AmbulanceRules.requestProgress(following))
        assertTrue(!following.canCancel && following.active)
        assertTrue("el paciente no lee el tablero de despacho", api.calls.none { it.first == "/ambulancia" })
    }

    @Test fun elPacienteCancelaSoloLoQueLaApiPermiteConLaVersionDeLaSolicitud() = runTest(dispatcher) {
        val api = FakeGateway(); api.responses["/ambulancia/solicitudes/mias"] = JSONArray().put(ownRequest("por_confirmar", JSONArray().put("cancelar")))
        val vm = AmbulanceViewModel(api, AmbulanceBus())
        vm.open(AmbulanceMode.REQUEST); runCurrent()
        val request = vm.state.value.ownRequests!!.single()
        vm.cancelRequest(request, " Me llevó un familiar "); runCurrent()
        val body = api.calls.single { it.first == "/ambulancia/solicitudes/r7/cancelar" }.third!!
        assertEquals(1, body.getInt("version")); assertEquals("Me llevó un familiar", body.getString("reason"))
        assertEquals("Solicitud cancelada.", vm.state.value.notice)
        vm.cancelRequest(request.copy(allowedActions = emptyList()), ""); runCurrent()
        assertEquals(1, api.calls.count { it.first.endsWith("/cancelar") })
    }

    @Test fun elPersonalClinicoMarcaRecibidoSoloCuandoLaApiLoOfrece() = runTest(dispatcher) {
        val api = FakeGateway()
        val view = JSONObject().put("serviceId", "s1").put("version", 7).put("active", true).put("arrived", true).put("clinical", true).put("reports", JSONArray()).put("handover", JSONObject.NULL).put("allowedActions", JSONArray().put("recibir"))
        api.responses["/ambulancia/servicios/s1/prehospital"] = view
        val bus = AmbulanceBus()
        val vm = AmbulanceViewModel(api, bus)
        vm.startLive(listOf("rol:ENF")); vm.open(AmbulanceMode.ARRIVAL, canReadStatus = false); runCurrent()
        bus.signals.tryEmit(RealtimeSignal.Event(EventoDominio("ambulancia.prehospital", "servicio", "s1", 3))); runCurrent()
        assertTrue(vm.state.value.arrival!!.canReceive)
        api.responses["/ambulancia/servicios/s1/prehospital"] = JSONObject(view.toString()).put("allowedActions", JSONArray()).put("handover", JSONObject().put("receivedAt", "2026-11-15T14:40:00Z").put("receivedByName", "Ana Ficticia"))
        vm.receivePatient(); runCurrent()
        // MA-AMB-04: no version (milestones keep changing the service's version while the nurse receives the patient).
        assertEquals(0, api.calls.single { it.first == "/ambulancia/servicios/s1/recepcion" }.third!!.length())
        assertEquals("Ana Ficticia", vm.state.value.arrival!!.handover!!.receivedByName)
        vm.receivePatient(); runCurrent()
        assertEquals("sin la acción de la API no se vuelve a enviar", 1, api.calls.count { it.first.endsWith("/recepcion") })
    }

    /** MA-AMB-04: Enfermería opens the arrival without an event or a prehospital report: the API says which service it is. */
    @Test fun laLlegadaSeEncuentraSinEventoNiReporte() = runTest(dispatcher) {
        val api = FakeGateway()
        api.responses["/ambulancia/llegada"] = arrivals("s1" to true)
        api.responses["/ambulancia/servicios/s1/prehospital"] = JSONObject().put("serviceId", "s1").put("active", false).put("arrived", true).put("clinical", true).put("reports", JSONArray()).put("handover", JSONObject.NULL).put("allowedActions", JSONArray().put("recibir"))
        val vm = AmbulanceViewModel(api, AmbulanceBus())
        vm.open(AmbulanceMode.ARRIVAL, canReadStatus = false); runCurrent()
        assertTrue(vm.state.value.arrival!!.canReceive)
    }

    /** Re-review of #117: a finished service still to receive stays first and listed while the unit is out on another one. */
    @Test fun laLlegadaSinEntregaNoSeOcultaCuandoLaUnidadSaleAOtroServicio() = runTest(dispatcher) {
        val api = FakeGateway()
        api.responses["/ambulancia"] = status(withService = true)
        api.responses["/ambulancia/llegada"] = arrivals("a1" to true, "s1" to false)
        api.responses["/ambulancia/servicios/a1/prehospital"] = JSONObject().put("serviceId", "a1").put("active", false).put("arrived", true).put("clinical", true).put("reports", JSONArray()).put("allowedActions", JSONArray().put("recibir"))
        api.responses["/ambulancia/servicios/s1/prehospital"] = JSONObject().put("serviceId", "s1").put("active", true).put("arrived", false).put("clinical", true).put("reports", JSONArray())
        val vm = AmbulanceViewModel(api, AmbulanceBus())
        vm.open(AmbulanceMode.ARRIVAL, canReadStatus = true); runCurrent()
        assertEquals("a1", vm.state.value.arrival!!.serviceId)
        assertEquals(listOf("a1" to true, "s1" to false), vm.state.value.arrivals.map { it.serviceId to it.arrived })
        vm.selectArrival("s1"); runCurrent()
        assertEquals("s1", vm.state.value.arrival!!.serviceId)
        vm.load(); runCurrent()
        assertEquals("la elección se mantiene al recargar", "s1", vm.state.value.arrival!!.serviceId)
    }

    private fun arrivals(vararg services: Pair<String, Boolean>) = JSONObject().put("serviceId", services.first().first).put("services", JSONArray().apply {
        services.forEach { (id, arrived) -> put(JSONObject().put("serviceId", id).put("dispatchedAt", "2026-11-15T14:00:00Z").put("active", !arrived).put("arrived", arrived)) }
    })

    private fun queuedTwo(store: sv.edu.catolica.climesa.data.DraftStore, api: FakeGateway, failure: Exception): AmbulanceViewModel {
        api.responses["/ambulancia"] = status(withService = true)
        api.failures["/ambulancia/servicios/s1/hitos"] = AuthRequestException("Sin conexión.")
        val vm = AmbulanceViewModel(api, AmbulanceBus(), store)
        vm.bindUser("par-1"); vm.open(AmbulanceMode.PARAMEDIC)
        return vm.also { api.failures["/ambulancia/servicios/s1/hitos"] = failure }
    }

    /** Review of #117: a 503 (cold start), 429 or 401 keeps the queue; it never drops a milestone and sends the next one. */
    @Test fun unErrorTransitorioNoDescartaElHitoNiEnviaLosSiguientes() = runTest(dispatcher) {
        for (failure in listOf(AuthRequestException("Despertando.", 503), AuthRequestException("Muchas.", 429), AuthRequestException("Sesión.", 401))) {
            val store = sv.edu.catolica.climesa.data.FileDraftStore(java.nio.file.Files.createTempDirectory("hitos").toFile(), sv.edu.catolica.climesa.data.TestCipher)
            val api = FakeGateway()
            val vm = queuedTwo(store, api, AuthRequestException("Sin conexión.")); runCurrent()
            val service = vm.state.value.status!!.activeService!!
            vm.advance(service, "en_escena", at = Instant.parse("2026-11-15T14:12:00Z")); runCurrent()
            vm.advance(vm.projected(service), "trasladando", at = Instant.parse("2026-11-15T14:30:00Z")); runCurrent()
            api.failures["/ambulancia/servicios/s1/hitos"] = failure
            val before = api.calls.count { it.first == "/ambulancia/servicios/s1/hitos" }
            vm.retryMilestones(); runCurrent()
            assertEquals("${failure.statusCode}: solo se intenta el primero", before + 1, api.calls.count { it.first == "/ambulancia/servicios/s1/hitos" })
            assertEquals(listOf("en_escena", "trasladando"), vm.state.value.queuedMilestones.map { it.type })
            assertNull(vm.state.value.formError)
        }
    }

    /** Review of #117: a definitive 4xx drops that milestone and every later one of the same service, and says so. */
    @Test fun unRechazoDefinitivoDescartaElHitoYLosSiguientesDelServicio() = runTest(dispatcher) {
        val store = sv.edu.catolica.climesa.data.FileDraftStore(java.nio.file.Files.createTempDirectory("hitos").toFile(), sv.edu.catolica.climesa.data.TestCipher)
        val api = FakeGateway()
        val vm = queuedTwo(store, api, AuthRequestException("Sin conexión.")); runCurrent()
        val service = vm.state.value.status!!.activeService!!
        vm.advance(service, "en_escena", at = Instant.parse("2026-11-15T14:12:00Z")); runCurrent()
        vm.advance(vm.projected(service), "trasladando", at = Instant.parse("2026-11-15T14:30:00Z")); runCurrent()
        api.failures["/ambulancia/servicios/s1/hitos"] = AuthRequestException("Fuera de orden.", 409, "hito_fuera_de_orden")
        val before = api.calls.count { it.first == "/ambulancia/servicios/s1/hitos" }
        vm.retryMilestones(); runCurrent()
        assertEquals(before + 1, api.calls.count { it.first == "/ambulancia/servicios/s1/hitos" })
        assertTrue(vm.state.value.queuedMilestones.isEmpty())
        assertNull(store.load("par-1", sv.edu.catolica.climesa.domain.FormDrafts.MILESTONE_QUEUE))
        assertEquals("No se registró «En escena». Ese hito no sigue al último registrado. Se actualizó el servicio. Los hitos siguientes de este servicio se descartaron; revísalo y regístralos de nuevo.", vm.state.value.formError)
    }

    /** Re-review of #117: the API rejects a queued milestone older than the last recorded one or than 24 h; the message is in Spanish. */
    @Test fun unHitoConHoraInvalidaSeDescartaConSuMensaje() = runTest(dispatcher) {
        val store = sv.edu.catolica.climesa.data.FileDraftStore(java.nio.file.Files.createTempDirectory("hitos").toFile(), sv.edu.catolica.climesa.data.TestCipher)
        val api = FakeGateway()
        val vm = queuedTwo(store, api, AuthRequestException("Sin conexión.")); runCurrent()
        vm.advance(vm.state.value.status!!.activeService!!, "en_escena", at = Instant.parse("2026-11-15T14:12:00Z")); runCurrent()
        api.failures["/ambulancia/servicios/s1/hitos"] = AuthRequestException("La hora del hito tiene más de 24 horas.", 409, "hito_hora_invalida")
        vm.retryMilestones(); runCurrent()
        assertTrue(vm.state.value.queuedMilestones.isEmpty())
        assertEquals("No se registró «En escena». La hora del hito es anterior al último registrado o tiene más de 24 horas. Los hitos siguientes de este servicio se descartaron; revísalo y regístralos de nuevo.", vm.state.value.formError)
    }

    @Test fun sinSenalLosHitosQuedanEnColaConSuHoraSobrevivenALaAppYSeEnvianEnOrden() = runTest(dispatcher) {
        val store = sv.edu.catolica.climesa.data.FileDraftStore(java.nio.file.Files.createTempDirectory("hitos").toFile(), sv.edu.catolica.climesa.data.TestCipher)
        val api = FakeGateway(); api.responses["/ambulancia"] = status(withService = true)
        api.failures["/ambulancia/servicios/s1/hitos"] = AuthRequestException("Sin conexión.")
        val first = AmbulanceViewModel(api, AmbulanceBus(), store)
        first.bindUser("par-1"); first.open(AmbulanceMode.PARAMEDIC); runCurrent()
        val service = first.state.value.status!!.activeService!!
        first.advance(service, "en_escena", at = Instant.parse("2026-11-15T14:12:00Z")); runCurrent()
        // The paramedic keeps going without signal: the projected service already offers the next step.
        val projected = first.projected(service)
        assertEquals(listOf("trasladando", "finalizado"), projected.nextMilestones)
        first.advance(projected, "trasladando", at = Instant.parse("2026-11-15T14:30:00Z")); runCurrent()
        assertEquals(listOf("en_escena", "trasladando"), first.state.value.queuedMilestones.map { it.type })
        assertEquals(listOf("fallecido", "desviado", "cancelado"), first.projected(service).finalStates)

        val again = AmbulanceViewModel(api, AmbulanceBus(), store)
        again.bindUser("par-1"); again.open(AmbulanceMode.PARAMEDIC); runCurrent()
        assertEquals(first.state.value.queuedMilestones, again.state.value.queuedMilestones)
        api.failures.clear()
        again.retryMilestones(); runCurrent()
        val sent = api.calls.filter { it.first == "/ambulancia/servicios/s1/hitos" }.map { it.third!! }.takeLast(2)
        assertEquals(listOf("en_escena", "trasladando"), sent.map { it.getString("type") })
        assertEquals(listOf("2026-11-15T14:12:00Z", "2026-11-15T14:30:00Z"), sent.map { it.getString("occurredAt") })
        assertTrue(again.state.value.queuedMilestones.isEmpty())
        assertNull(store.load("par-1", sv.edu.catolica.climesa.domain.FormDrafts.MILESTONE_QUEUE))
    }

    @Test fun elPacienteProvisionalSobreviveAQueSeCierreLaApp() = runTest(dispatcher) {
        val store = sv.edu.catolica.climesa.data.FileDraftStore(java.nio.file.Files.createTempDirectory("provisional").toFile(), sv.edu.catolica.climesa.data.TestCipher)
        val api = FakeGateway(); api.responses["/ambulancia"] = status(withService = true)
        api.responses["/pacientes/busquedas"] = JSONObject().put("token", "t1")
        api.responses["/pacientes/provisionales"] = JSONObject().put("id", "p9").put("record", "EXP-9")
        val first = AmbulanceViewModel(api, AmbulanceBus(), store)
        first.bindUser("par-1"); first.open(AmbulanceMode.PARAMEDIC); runCurrent()
        first.registerUnidentified("masculino", "40", "Camisa azul"); runCurrent()
        val again = AmbulanceViewModel(api, AmbulanceBus(), store)
        again.bindUser("par-1")
        assertEquals("p9", again.state.value.provisional!!.id)
        again.updatePrehospital(PrehospitalForm(reason = "Politraumatismo", priority = "roja"))
        again.sendPrehospital("s1", Instant.parse("2026-11-15T14:10:00Z")); runCurrent()
        assertEquals("p9", api.calls.single { it.first == "/ambulancia/servicios/s1/prehospital" }.third!!.getString("patientId"))
        assertNull(store.load("par-1", sv.edu.catolica.climesa.domain.FormDrafts.PROVISIONAL_PATIENT))
    }

    @Test fun laBitacoraVuelveAPedirConLaBusquedaYLosFiltros() = runTest(dispatcher) {
        val api = FakeGateway()
        api.responses["/ambulancia/bitacora"] = JSONArray()
        api.responses["/ambulancia/bitacora?q=Apopa&priority=roja"] = JSONArray().put(JSONObject().put("id", "s1").put("type", "emergencia_domicilio").put("priority", "roja").put("origin", "Calle a Apopa").put("destination", "Hospital CLIMESA").put("dispatchedAt", "2026-11-15T14:00:00Z"))
        val vm = AmbulanceViewModel(api, AmbulanceBus())
        vm.open(AmbulanceMode.LOG); runCurrent()
        assertTrue(vm.state.value.log.isEmpty())
        vm.setLogFilters(LogFilters(query = "Apopa", priority = "roja")); runCurrent()
        assertEquals("s1", vm.state.value.log.single().id)
        assertEquals(2, api.calls.count { it.first.startsWith("/ambulancia/bitacora") })
        vm.setLogFilters(LogFilters()); runCurrent()
        assertTrue(vm.state.value.log.isEmpty())
    }

    @Test fun elInicioDelParamedicoCargaEstadoYUltimosServiciosYSoloMuestraElEstadoSiLaBitacoraFalla() = runTest(dispatcher) {
        val api = FakeGateway(); api.responses["/ambulancia"] = status(withService = true)
        api.responses["/ambulancia/bitacora"] = JSONArray().put(JSONObject().put("id", "s0").put("type", "emergencia_domicilio").put("priority", "roja").put("origin", "A").put("destination", "B").put("dispatchedAt", "2026-11-14T10:00:00Z"))
        val vm = AmbulanceViewModel(api, AmbulanceBus())
        vm.open(AmbulanceMode.PARAMEDIC); runCurrent()
        assertEquals("s1", vm.state.value.status!!.activeService!!.id)
        assertEquals("s0", vm.state.value.log.single().id)
        api.failures["/ambulancia/bitacora"] = AuthRequestException("x", 500, "error")
        vm.load(); runCurrent()
        assertNull(vm.state.value.error)
        assertEquals("s1", vm.state.value.status!!.activeService!!.id)
    }

    @Test fun enviarUbicacionPublicaElPuntoYVuelveAPedirElEstado() = runTest(dispatcher) {
        val api = FakeGateway(); api.responses["/ambulancia"] = status(withService = true)
        val vm = AmbulanceViewModel(api, AmbulanceBus())
        vm.open(AmbulanceMode.PARAMEDIC); runCurrent()
        vm.sendLocation(13.69, -89.19, Instant.parse("2026-11-15T14:10:00Z")); runCurrent()
        val body = api.calls.single { it.first == "/ambulancia/ubicacion" }.third!!
        assertEquals(13.69, body.getDouble("latitude"), 0.0)
        assertEquals("Ubicación enviada a despacho.", vm.state.value.notice)
        assertEquals(2, api.gets("/ambulancia"))
    }

    @Test fun enfermeriaAbreElReporteDelServicioQueLlegaPorEvento() = runTest(dispatcher) {
        val api = FakeGateway()
        api.responses["/ambulancia/servicios/s1/prehospital"] = JSONObject().put("serviceId", "s1").put("active", true).put("clinical", true)
            .put("reports", JSONArray().put(JSONObject().put("id", "rp1").put("priority", "roja").put("capturedAt", "2026-11-15T14:10:00Z").put("reason", "Dolor").put("vitalSigns", JSONObject().put("heartRate", 110))))
        val bus = AmbulanceBus()
        val vm = AmbulanceViewModel(api, bus)
        vm.startLive(listOf("rol:ENF")); vm.open(AmbulanceMode.ARRIVAL, canReadStatus = false); runCurrent()
        assertNull(vm.state.value.arrival)
        bus.signals.tryEmit(RealtimeSignal.Event(EventoDominio("ambulancia.prehospital", "servicio", "s1", 3))); runCurrent()
        val report = vm.state.value.arrival!!.reports.single()
        assertEquals("Dolor", report.reason); assertEquals("110", report.vitalSigns["heartRate"])
        assertTrue(api.calls.none { it.first == "/ambulancia" })
    }
}
