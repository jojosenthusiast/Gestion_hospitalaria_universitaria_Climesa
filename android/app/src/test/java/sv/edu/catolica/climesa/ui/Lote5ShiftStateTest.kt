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
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import sv.edu.catolica.climesa.data.ApiGateway
import sv.edu.catolica.climesa.data.AuthRequestException
import sv.edu.catolica.climesa.data.realtime.RealtimeRepository
import sv.edu.catolica.climesa.domain.EventoDominio
import sv.edu.catolica.climesa.domain.MyShifts
import sv.edu.catolica.climesa.domain.RealtimeSignal
import sv.edu.catolica.climesa.domain.ShiftGate
import java.time.Instant
import java.time.LocalDate

private class ShiftBus : RealtimeRepository {
    val signals = MutableSharedFlow<RealtimeSignal>(extraBufferCapacity = 8)
    override fun observe(channels: List<String>): Flow<RealtimeSignal> = signals
}

/** Lote 5 S9: shift state banner, the 403 `sin_turno_activo` text and the read-only «Mis turnos» overview. */
@OptIn(ExperimentalCoroutinesApi::class)
class Lote5ShiftStateTest {
    private val dispatcher = StandardTestDispatcher()
    @Before fun setUp() = Dispatchers.setMain(dispatcher)
    @After fun tearDown() = Dispatchers.resetMain()

    private val now = Instant.parse("2026-11-19T20:00:00Z") // 14:00 in El Salvador

    private fun answer(required: Boolean, active: Boolean, next: Boolean = true) = JSONObject()
        .put("required", required).put("active", active).put("graceMinutes", 30).put("shift", JSONObject.NULL)
        .put("next", if (next) JSONObject().put("id", "t2").put("start", "2026-11-20T13:00:00Z").put("end", "2026-11-20T21:00:00Z").put("area", "Consulta externa").put("state", "publicado") else JSONObject.NULL)
        .put("message", "No tienes un turno activo. Pide a Jefatura que publique tu turno.")

    @Test fun sinTurnoActivoMuestraElAvisoConElProximoTurno() {
        val banner = ShiftGate.banner(ShiftGate.parse(answer(required = true, active = false)), now)!!
        assertEquals("Sin turno activo: puedes consultar pero no registrar.", banner.title)
        assertEquals("Próximo turno: Mañana 07:00 a 15:00 · Consulta externa", banner.next)
    }

    @Test fun sinProximoTurnoElAvisoSoloDiceQueNoPuedeRegistrar() {
        val banner = ShiftGate.banner(ShiftGate.parse(answer(required = true, active = false, next = false)), now)!!
        assertNull(banner.next)
    }

    @Test fun conTurnoActivoOSinRolPorTurnosNoHayAviso() {
        assertNull(ShiftGate.banner(ShiftGate.parse(answer(required = true, active = true)), now))
        assertNull("ADM y DPD no trabajan por turnos", ShiftGate.banner(ShiftGate.parse(answer(required = false, active = true)), now))
    }

    @Test fun unaRespuestaIncompletaNoMuestraAviso() {
        assertNull(ShiftGate.parse(JSONObject().put("active", false)))
        assertNull(ShiftGate.parse(org.json.JSONArray()))
        assertNull(ShiftGate.banner(null, now))
    }

    @Test fun elModeloLeeElTurnoYVuelveAPedirloAlCambiarUnTurno() = runTest(dispatcher) {
        val bus = ShiftBus(); val calls = mutableListOf<String>()
        val api = object : ApiGateway { override suspend fun request(path: String, method: String, body: JSONObject?): Any { calls += path; return answer(required = true, active = false) } }
        val vm = ShiftStatusViewModel(api, bus)
        vm.start(listOf("usuario:u1")); vm.load(); runCurrent()
        assertTrue(ShiftGate.showsBanner(vm.status.value))
        bus.signals.tryEmit(RealtimeSignal.Event(EventoDominio("turno.publicado", "turno", "t2", 1))); runCurrent()
        assertEquals(listOf("/me/turno-activo", "/me/turno-activo"), calls)
    }

    @Test fun unaApiSinElEndpointNoMuestraAviso() = runTest(dispatcher) {
        val api = object : ApiGateway { override suspend fun request(path: String, method: String, body: JSONObject?): Any = throw AuthRequestException("No encontrado", 404, "no_encontrado") }
        val vm = ShiftStatusViewModel(api, ShiftBus())
        vm.load(); runCurrent()
        assertNull(vm.status.value)
        assertFalse(ShiftGate.showsBanner(vm.status.value))
    }

    @Test fun el403SinTurnoActivoMuestraElTextoDeLaApi() {
        val error = AuthRequestException("No tienes un turno activo. Pide a Jefatura que publique tu turno.", 403, "sin_turno_activo")
        assertEquals("No tienes un turno activo. Pide a Jefatura que publique tu turno.", userMessage(error, "No se pudo guardar."))
        val technical = AuthRequestException("Forbidden: shift gate failed", 403, "sin_turno_activo")
        assertEquals(ShiftGate.NO_ACTIVE_SHIFT_TEXT, businessMessage(technical, "No se pudo guardar."))
    }

    @Test fun misTurnosSeparaHoyDeLosProximosYLosAnteriores() {
        val today = LocalDate.of(2026, 11, 19)
        fun shift(id: String, start: String, end: String) = MyShifts.parse(org.json.JSONArray().put(JSONObject().put("id", id).put("area", "Consulta").put("state", "publicado").put("start", start).put("end", end))).single()
        val shifts = listOf(
            shift("hoy", "2026-11-19T13:00:00Z", "2026-11-19T21:00:00Z"),
            shift("manana", "2026-11-20T13:00:00Z", "2026-11-20T21:00:00Z"),
            shift("antes", "2026-11-17T13:00:00Z", "2026-11-17T21:00:00Z"),
        )
        val overview = MyShifts.overview(MyShifts.byDay(shifts, today, now))
        assertEquals(listOf("hoy"), overview.today!!.shifts.map { it.id })
        assertEquals(listOf("manana"), overview.upcoming.flatMap { d -> d.shifts.map { it.id } })
        assertEquals(listOf("antes"), overview.past.flatMap { d -> d.shifts.map { it.id } })
        val none = MyShifts.overview(MyShifts.byDay(shifts.drop(1), today, now))
        assertNull("sin turno hoy, la tarjeta de hoy lo dice", none.today)
    }
}
