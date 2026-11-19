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
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test
import sv.edu.catolica.climesa.data.ApiGateway
import sv.edu.catolica.climesa.data.AuthRequestException
import sv.edu.catolica.climesa.data.realtime.RealtimeRepository
import sv.edu.catolica.climesa.domain.AmbulanceCoverage
import sv.edu.catolica.climesa.domain.EventoDominio
import sv.edu.catolica.climesa.domain.RealtimeSignal
import java.time.Instant

private class CoverageBus : RealtimeRepository {
    val signals = MutableSharedFlow<RealtimeSignal>(extraBufferCapacity = 8)
    override fun observe(channels: List<String>): Flow<RealtimeSignal> = signals
}

/** Lote 5 S8: the ambulance crew coverage warning that the roles who dispatch see in the dispatch header. */
@OptIn(ExperimentalCoroutinesApi::class)
class Lote5ShiftCoverageTest {
    private val dispatcher = StandardTestDispatcher()
    @Before fun setUp() = Dispatchers.setMain(dispatcher)
    @After fun tearDown() = Dispatchers.resetMain()

    private val now = Instant.parse("2026-11-19T20:00:00Z") // 14:00 in El Salvador

    private fun coverage(covered: Boolean) = JSONObject()
        .put("from", "2026-11-19T20:00:00Z").put("to", "2026-11-26T20:00:00Z").put("hoursWithoutCrew", if (covered) 0 else 14).put("covered", covered)
        .put("days", JSONArray((0 until 7).map { d -> JSONObject().put("date", "2026-11-${19 + d}").put("hoursWithoutCrew", if (!covered && d in setOf(1, 3)) 7 else 0) }))
        .put("gaps", if (covered) JSONArray() else JSONArray()
            .put(JSONObject().put("date", "2026-11-22").put("start", "2026-11-22T04:00:00Z").put("end", "2026-11-22T11:00:00Z").put("hours", 7).put("missing", "paramedico"))
            .put(JSONObject().put("date", "2026-11-20").put("start", "2026-11-21T04:00:00Z").put("end", "2026-11-21T11:00:00Z").put("hours", 7).put("missing", "motorista")))

    @Test fun conHuecosElAvisoDiceCuantasHorasYElPrimerHueco() {
        assertEquals(
            "Faltan turnos de ambulancia: 14 h sin tripulación completa en 2 de los próximos 7 días. Primer hueco: Mañana 22:00 a 05:00, falta motorista.",
            AmbulanceCoverage.warning(AmbulanceCoverage.parse(coverage(covered = false)), now),
        )
    }

    @Test fun cubiertoONoLeidoNoHayAviso() {
        assertNull(AmbulanceCoverage.warning(AmbulanceCoverage.parse(coverage(covered = true)), now))
        assertNull(AmbulanceCoverage.warning(AmbulanceCoverage.parse(JSONObject()), now))
        assertNull(AmbulanceCoverage.warning(null, now))
    }

    @Test fun faltaLaTripulacionCompleta() {
        assertEquals("falta la tripulación", AmbulanceCoverage.missingLabel("tripulacion"))
        assertEquals("falta paramédico", AmbulanceCoverage.missingLabel("paramedico"))
    }

    @Test fun unaApiSinElEndpointOcultaElAvisoYUnTurnoNuevoLoVuelveALeer() = runTest(dispatcher) {
        val calls = mutableListOf<String>(); var deployed = false
        val api = object : ApiGateway {
            override suspend fun request(path: String, method: String, body: JSONObject?): Any {
                calls += path
                if (!deployed) throw AuthRequestException("No encontrado", 404, "no_encontrado")
                return coverage(covered = false)
            }
        }
        val bus = CoverageBus()
        val vm = AmbulanceViewModel(api, bus)
        vm.startLive(listOf("operacion")); vm.loadCoverage(); runCurrent()
        assertNull(vm.state.value.coverage)
        deployed = true
        bus.signals.tryEmit(RealtimeSignal.Event(EventoDominio("turno.publicado", "turno", "t1", 1))); runCurrent()
        assertEquals(14, vm.state.value.coverage?.hoursWithoutCrew)
        assertEquals(listOf("/ambulancia/cobertura?dias=7", "/ambulancia/cobertura?dias=7"), calls)
    }
}
