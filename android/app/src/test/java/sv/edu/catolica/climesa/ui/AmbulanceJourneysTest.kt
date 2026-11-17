package sv.edu.catolica.climesa.ui

import java.time.Instant
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.json.JSONArray
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import sv.edu.catolica.climesa.data.AuthRequestException
import sv.edu.catolica.climesa.data.realtime.RealtimeRepository
import sv.edu.catolica.climesa.domain.AmbulanceLabels
import sv.edu.catolica.climesa.domain.RealtimeSignal

/** R7 U2, journey G4: dispatch keeps its data on failure, the paramedic can undo a milestone, signs read at a glance. */
@OptIn(ExperimentalCoroutinesApi::class)
class AmbulanceJourneysTest {
    private val dispatcher = StandardTestDispatcher()
    @Before fun setUp() = Dispatchers.setMain(dispatcher)
    @After fun tearDown() = Dispatchers.resetMain()

    private val quiet = object : RealtimeRepository { override fun observe(channels: List<String>) = emptyFlow<RealtimeSignal>() }

    private fun status(withService: Boolean) = JSONObject()
        .put("unit", JSONObject().put("id", "u1").put("plate", "P-000-001").put("state", if (withService) "en_servicio" else "disponible").put("version", 5))
        .put("paramedicOnDuty", true)
        .put("activeService", if (!withService) JSONObject.NULL else JSONObject().put("id", "s1").put("type", "emergencia_domicilio").put("priority", "roja").put("origin", "Colonia Ficticia").put("destination", "Hospital CLIMESA").put("dispatchedAt", "2026-11-15T14:00:00Z")
            .put("milestones", JSONArray().put(JSONObject().put("type", "salida").put("occurredAt", "2026-11-15T14:05:00Z"))).put("nextMilestones", JSONArray().put("en_escena").put("finalizado")).put("crew", JSONArray()))
        .put("pendingRequests", JSONArray().put(JSONObject().put("id", "r1").put("channel", "telefono").put("address", "Colonia Ficticia 12").put("reason", "Caída").put("contactPhone", "7000-0001").put("createdAt", "2026-11-15T14:00:00Z").put("version", 2)))
        .put("availableCrew", JSONArray()
            .put(JSONObject().put("staffId", "par-1").put("role", "paramedico").put("name", "Ana Paramédica").put("hasAccount", true))
            .put(JSONObject().put("staffId", "mot-1").put("role", "motorista").put("name", "Carlos Motorista").put("hasAccount", false)))

    // "PAR: tocar 'Llegué a la escena' y 'Deshacer' antes de 10 s. Se espera: no se registra nada."
    @Test fun aMilestoneUndoneInsideTheWindowNeverLeavesThePhone() = runTest(dispatcher) {
        val api = FakeGateway(); api.responses["/ambulancia"] = status(withService = true)
        val vm = AmbulanceViewModel(api, quiet)
        vm.open(AmbulanceMode.PARAMEDIC); runCurrent()
        val service = vm.state.value.status!!.activeService!!
        vm.advance(service, "en_escena", undoable = true, at = Instant.parse("2026-11-15T14:20:00Z")); runCurrent()
        assertEquals("s1", vm.state.value.pendingMilestone?.key)
        assertTrue(vm.state.value.pendingMilestone!!.label.contains("08:20"))
        advanceTimeBy(6_000); runCurrent()
        vm.undoMilestone()
        advanceTimeBy(20_000); runCurrent()
        assertTrue(api.calls.none { it.first.endsWith("/hitos") })
        assertTrue(vm.state.value.queuedMilestones.isEmpty())
        assertNull(vm.state.value.pendingMilestone)
    }

    @Test fun aMilestoneIsSentWithItsTapTimeWhenTheWindowEnds() = runTest(dispatcher) {
        val api = FakeGateway(); api.responses["/ambulancia"] = status(withService = true)
        val vm = AmbulanceViewModel(api, quiet)
        vm.open(AmbulanceMode.PARAMEDIC); runCurrent()
        val service = vm.state.value.status!!.activeService!!
        vm.advance(service, "en_escena", undoable = true, at = Instant.parse("2026-11-15T14:20:00Z")); runCurrent()
        assertTrue(api.calls.none { it.first.endsWith("/hitos") })
        advanceTimeBy(AmbulanceViewModel.MILESTONE_UNDO_MS + 1); runCurrent()
        val body = api.calls.single { it.first == "/ambulancia/servicios/s1/hitos" }.third!!
        assertEquals("en_escena", body.getString("type"))
        assertEquals("2026-11-15T14:20:00Z", body.getString("occurredAt"))
    }

    // "REC: despachar sin red. Se espera: el diálogo sigue abierto con los datos y el error dentro."
    @Test fun aFailedDispatchKeepsTheErrorForTheOpenDialog() = runTest(dispatcher) {
        val api = FakeGateway(); api.responses["/ambulancia"] = status(withService = false)
        api.failures["/ambulancia/servicios"] = AuthRequestException("x", 409, "ambulancia_ya_despachada")
        val vm = AmbulanceViewModel(api, quiet)
        vm.open(AmbulanceMode.STATUS); runCurrent()
        val request = vm.state.value.status!!.pendingRequests.single()
        vm.dispatch(request, "emergencia_domicilio", "roja", "Hospital CLIMESA", listOf("par-1", "mot-1")); runCurrent()
        assertEquals("La ambulancia ya fue despachada.", vm.state.value.formError)
        assertNull(vm.state.value.notice)
    }

    @Test fun aShortReasonIsNotSent() = runTest(dispatcher) {
        val api = FakeGateway()
        val vm = AmbulanceViewModel(api, quiet)
        vm.submitRequest("Colonia Ficticia 12", "", "Mal", "70000001")
        runCurrent()
        assertTrue(api.calls.none { it.second == "POST" })
        assertEquals("Indica el motivo, de al menos 5 caracteres.", vm.state.value.formError)
    }

    @Test fun signsReadAsOneSheet() {
        val signs = AmbulanceLabels.readableSigns(mapOf("diastolic" to "80", "heartRate" to "110", "systolic" to "120", "oxygenSaturation" to "94", "glasgow" to "14"))
        assertEquals(listOf("Presión" to "120/80 mmHg", "Pulso" to "110 lpm", "Saturación" to "94 %", "Glasgow" to "14/15"), signs)
    }
}
