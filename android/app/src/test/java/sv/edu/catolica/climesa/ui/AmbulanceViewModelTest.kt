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

    @Test fun despachaConLaVersionDeLaUnidadYLaSolicitud() = runTest(dispatcher) {
        val api = FakeGateway(); api.responses["/ambulancia"] = status()
        val vm = AmbulanceViewModel(api, AmbulanceBus())
        vm.open(AmbulanceMode.STATUS); runCurrent()
        val request = vm.state.value.status!!.pendingRequests.single()
        vm.dispatch(request, "emergencia_domicilio", "roja", "Hospital CLIMESA"); runCurrent()
        val body = api.calls.single { it.first == "/ambulancia/servicios" }.third!!
        assertEquals(5, body.getInt("version")); assertEquals("r1", body.getString("requestId")); assertEquals("roja", body.getString("priority"))
        assertEquals("Ambulancia despachada.", vm.state.value.notice)
    }

    @Test fun quienPierdeLaCarreraVeQueYaFueDespachada() = runTest(dispatcher) {
        val api = FakeGateway(); api.responses["/ambulancia"] = status()
        api.failures["/ambulancia/servicios"] = AuthRequestException("x", 409, "ambulancia_ya_despachada")
        val vm = AmbulanceViewModel(api, AmbulanceBus())
        vm.open(AmbulanceMode.STATUS); runCurrent()
        vm.dispatch(vm.state.value.status!!.pendingRequests.single(), "emergencia_domicilio", "roja", "Hospital CLIMESA"); runCurrent()
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

    @Test fun laSolicitudDelPacienteMuestraElAvisoYSigueLosEventos() = runTest(dispatcher) {
        val api = FakeGateway(); api.responses["/ambulancia/solicitudes"] = JSONObject().put("id", "r7").put("state", "por_confirmar")
        val bus = AmbulanceBus()
        val vm = AmbulanceViewModel(api, bus)
        vm.startLive(listOf("usuario:pac")); vm.open(AmbulanceMode.REQUEST); runCurrent()
        vm.submitRequest("Co", "", "Caída", "7000"); runCurrent()
        assertTrue(api.calls.isEmpty())
        vm.submitRequest("Colonia Ficticia 12", "San Salvador", "Caída en casa", "7000-0001"); runCurrent()
        assertEquals("Si hay riesgo de vida, llama al 911.", vm.state.value.notice)
        bus.signals.tryEmit(RealtimeSignal.Event(EventoDominio("ambulancia.estado_cambiado", "unidad", "u1", 6))); runCurrent()
        assertEquals(listOf("Despacho confirmó tu solicitud: la ambulancia va en camino."), vm.state.value.ownRequest!!.updates)
        assertTrue("el paciente no lee el tablero de despacho", api.calls.none { it.first == "/ambulancia" })
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
