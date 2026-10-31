package sv.edu.catolica.climesa.data.realtime

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import sv.edu.catolica.climesa.domain.CatchUp
import sv.edu.catolica.climesa.domain.ConnectionState
import sv.edu.catolica.climesa.domain.EventoDominio
import sv.edu.catolica.climesa.domain.RealtimeSignal

private class FakeSocket : RealtimeSocket {
    val inbox = Channel<SocketEvent>(Channel.UNLIMITED)
    val sent = mutableListOf<String>()
    var closed = false
    override val events: Flow<SocketEvent> = inbox.receiveAsFlow()
    override fun send(text: String): Boolean { sent += text; return true }
    override fun close() { closed = true; inbox.close() }
    fun receive(text: String) { inbox.trySend(SocketEvent.Text(text)) }
}

private fun joined(channel: String) = """{"topic":"realtime:$channel","event":"phx_reply","payload":{"status":"ok"},"ref":"1"}"""
private fun bedEvent(channel: String, id: String) =
    """{"topic":"realtime:$channel","event":"broadcast","payload":{"event":"cama.estado_cambiado","type":"broadcast","payload":{"tipo":"cama.estado_cambiado","entidad":"cama","id":"$id","version":2}}}"""

@OptIn(ExperimentalCoroutinesApi::class)
class RealtimeRepositoryTest {
    private val channels = listOf("rol:MED", "rol:ENF")

    private class Harness(
        val sockets: MutableList<FakeSocket> = mutableListOf(),
        val catchUps: MutableList<String> = mutableListOf(),
        val recovered: CatchUp = CatchUp("9", listOf(EventoDominio("cama.estado_cambiado", "cama", "perdida", 1))),
        val closeOnOpen: Boolean = false,
    ) {
        val factory = RealtimeSocketFactory {
            FakeSocket().also {
                sockets += it
                it.inbox.trySend(SocketEvent.Opened)
                if (closeOnOpen) it.inbox.trySend(SocketEvent.Closed("caida"))
            }
        }
    }

    private fun repository(h: Harness) = SupabaseRealtimeRepository(
        websocketUrl = "wss://ejemplo.test/socket",
        accessToken = { "token-ejemplo" },
        catchUp = { cursor -> h.catchUps += cursor; h.recovered },
        sockets = h.factory,
        heartbeatMillis = 1_000_000,
        backoffMillis = { 10 },
    )

    @Test fun seUneATodosLosCanalesYAvisaCuandoQuedaEnVivo() = runTest {
        val h = Harness()
        val signals = mutableListOf<RealtimeSignal>()
        backgroundScope.launch { repository(h).observe(channels).collect { signals += it } }
        runCurrent()
        assertEquals(2, h.sockets.single().sent.size)
        h.sockets[0].receive(joined("rol:MED"))
        runCurrent()
        assertFalse(RealtimeSignal.Resync in signals)
        h.sockets[0].receive(joined("rol:ENF"))
        runCurrent()
        assertTrue(RealtimeSignal.Resync in signals)
        assertEquals(RealtimeSignal.State(ConnectionState.LIVE), signals.last())
        assertEquals("la primera union solo pide la cabeza del cursor", listOf("0"), h.catchUps)
        assertFalse("la cabeza del cursor no emite eventos", signals.any { it is RealtimeSignal.Event })
    }

    @Test fun noSeUneAlCanalPublicoQueElPortalNoUsa() = runTest {
        val h = Harness()
        val signals = mutableListOf<RealtimeSignal>()
        backgroundScope.launch { repository(h).observe(listOf("publico", "rol:ENF")).collect { signals += it } }
        runCurrent()
        val sent = h.sockets.single().sent
        assertEquals(1, sent.size)
        assertTrue(sent.single().contains("realtime:rol:ENF"))
        assertFalse(sent.any { it.contains("realtime:publico") })
        h.sockets[0].receive(joined("rol:ENF"))
        runCurrent()
        assertEquals(RealtimeSignal.State(ConnectionState.LIVE), signals.last())
    }

    @Test fun reenviaLosEventosDeLosCanales() = runTest {
        val h = Harness()
        val signals = mutableListOf<RealtimeSignal>()
        backgroundScope.launch { repository(h).observe(channels).collect { signals += it } }
        runCurrent()
        h.sockets[0].receive(bedEvent("rol:ENF", "cama-1"))
        runCurrent()
        assertTrue(signals.contains(RealtimeSignal.Event(EventoDominio("cama.estado_cambiado", "cama", "cama-1", 2))))
    }

    @Test fun traUnaCaidaReconectaYHaceUnaSolaRecuperacion() = runTest {
        val h = Harness()
        val signals = mutableListOf<RealtimeSignal>()
        backgroundScope.launch { repository(h).observe(channels).collect { signals += it } }
        runCurrent()
        h.sockets[0].receive(joined("rol:MED")); h.sockets[0].receive(joined("rol:ENF"))
        runCurrent()
        h.sockets[0].inbox.trySend(SocketEvent.Closed("red"))
        runCurrent()
        assertEquals(RealtimeSignal.State(ConnectionState.RECONNECTING), signals.last())
        advanceTimeBy(20)
        runCurrent()
        assertEquals(2, h.sockets.size)
        h.sockets[1].receive(joined("rol:MED")); h.sockets[1].receive(joined("rol:ENF"))
        runCurrent()
        assertEquals("cabeza inicial y luego recuperacion desde el cursor devuelto", listOf("0", "9"), h.catchUps)
        assertTrue(signals.contains(RealtimeSignal.Event(EventoDominio("cama.estado_cambiado", "cama", "perdida", 1))))
        assertEquals(RealtimeSignal.State(ConnectionState.LIVE), signals.last())
        assertTrue("el primer socket se cerro", h.sockets[0].closed)
    }

    @Test fun conVariasCaidasSeguidasPasaASinConexion() = runTest {
        val h = Harness(closeOnOpen = true)
        val signals = mutableListOf<RealtimeSignal>()
        backgroundScope.launch { repository(h).observe(channels).collect { signals += it } }
        advanceTimeBy(200)
        runCurrent()
        assertTrue(signals.contains(RealtimeSignal.State(ConnectionState.OFFLINE)))
        assertTrue(h.catchUps.isEmpty())
    }

    private fun TestScope.collectInto(signals: MutableList<RealtimeSignal>, repo: SupabaseRealtimeRepository, list: List<String> = channels) {
        backgroundScope.launch { repo.observe(list).collect { signals += it } }
    }

    private fun hbReply(ref: String) = """{"topic":"phoenix","event":"phx_reply","payload":{"status":"ok"},"ref":"$ref"}"""
    private fun rejected(channel: String) = """{"topic":"realtime:$channel","event":"phx_reply","payload":{"status":"error"},"ref":"1"}"""

    @Test fun sinRespuestaAlLatidoSeDaPorCaidoYReconecta() = runTest {
        val h = Harness(); val signals = mutableListOf<RealtimeSignal>()
        collectInto(signals, SupabaseRealtimeRepository("wss://x", { "t" }, { h.recovered }, h.factory, heartbeatMillis = 1_000, heartbeatTimeoutMillis = 500, backoffMillis = { 10 }))
        runCurrent()
        h.sockets[0].receive(joined("rol:MED")); h.sockets[0].receive(joined("rol:ENF")); runCurrent()
        advanceTimeBy(1_001); runCurrent()
        assertTrue(h.sockets[0].sent.last().contains("heartbeat"))
        assertEquals(1, h.sockets.size)
        advanceTimeBy(501); runCurrent()
        assertTrue("el socket mudo se cerro", h.sockets[0].closed)
        assertEquals(RealtimeSignal.State(ConnectionState.RECONNECTING), signals.last())
        advanceTimeBy(20); runCurrent()
        assertEquals(2, h.sockets.size)
    }

    @Test fun conRespuestaAlLatidoLaConexionSigueAbierta() = runTest {
        val h = Harness(); val signals = mutableListOf<RealtimeSignal>()
        collectInto(signals, SupabaseRealtimeRepository("wss://x", { "t" }, { h.recovered }, h.factory, heartbeatMillis = 1_000, heartbeatTimeoutMillis = 500, backoffMillis = { 10 }))
        runCurrent()
        h.sockets[0].receive(joined("rol:MED")); h.sockets[0].receive(joined("rol:ENF")); runCurrent()
        advanceTimeBy(1_001); runCurrent()
        val ref = JSONObject(h.sockets[0].sent.last()).getString("ref")
        h.sockets[0].receive(hbReply(ref)); runCurrent()
        advanceTimeBy(600); runCurrent()
        assertEquals(1, h.sockets.size)
        assertFalse(h.sockets[0].closed)
        assertEquals(RealtimeSignal.State(ConnectionState.LIVE), signals.last())
    }

    @Test fun cuandoLaSesionRenuevaElTokenLoEnviaALosCanalesAbiertos() = runTest {
        val h = Harness(); val signals = mutableListOf<RealtimeSignal>()
        var token = "token-1"
        collectInto(signals, SupabaseRealtimeRepository("wss://x", { token }, { h.recovered }, h.factory, heartbeatMillis = 1_000, heartbeatTimeoutMillis = 500, backoffMillis = { 10 }))
        runCurrent()
        h.sockets[0].receive(joined("rol:MED")); h.sockets[0].receive(joined("rol:ENF")); runCurrent()
        token = "token-2"
        advanceTimeBy(1_001); runCurrent()
        val renewed = h.sockets[0].sent.map { JSONObject(it) }.filter { it.getString("event") == "access_token" }
        assertEquals(setOf("realtime:rol:MED", "realtime:rol:ENF"), renewed.map { it.getString("topic") }.toSet())
        assertTrue(renewed.all { it.getJSONObject("payload").getString("access_token") == "token-2" })
    }

    @Test fun conElMismoTokenNoMandaAccessToken() = runTest {
        val h = Harness(); val signals = mutableListOf<RealtimeSignal>()
        collectInto(signals, SupabaseRealtimeRepository("wss://x", { "token-1" }, { h.recovered }, h.factory, heartbeatMillis = 1_000, heartbeatTimeoutMillis = 500, backoffMillis = { 10 }))
        runCurrent()
        h.sockets[0].receive(joined("rol:MED")); h.sockets[0].receive(joined("rol:ENF")); runCurrent()
        advanceTimeBy(1_001); runCurrent()
        assertTrue(h.sockets[0].sent.none { JSONObject(it).getString("event") == "access_token" })
    }

    @Test fun trasTresRechazosSeguidosElCanalSeDejaFueraYElRestoQuedaEnVivo() = runTest {
        val h = Harness(); val signals = mutableListOf<RealtimeSignal>()
        collectInto(signals, repository(h))
        runCurrent()
        for (i in 0..2) {
            if (i > 0) { advanceTimeBy(11); runCurrent() }
            h.sockets[i].receive(joined("rol:MED")); h.sockets[i].receive(rejected("rol:ENF")); runCurrent()
            if (i < 2) assertFalse("aun no se reporta en vivo", RealtimeSignal.State(ConnectionState.LIVE) in signals)
        }
        assertEquals(3, h.sockets.size)
        assertTrue(signals.contains(RealtimeSignal.ChannelsDropped(setOf("rol:ENF"))))
        assertTrue(RealtimeSignal.Resync in signals)
        assertEquals(RealtimeSignal.State(ConnectionState.LIVE), signals.last())
        advanceTimeBy(100); runCurrent()
        assertEquals("no sigue reintentando", 3, h.sockets.size)
    }

    @Test fun unRechazoAisladoNoDejaFueraElCanal() = runTest {
        val h = Harness(); val signals = mutableListOf<RealtimeSignal>()
        collectInto(signals, repository(h))
        runCurrent()
        h.sockets[0].receive(joined("rol:MED")); h.sockets[0].receive(rejected("rol:ENF")); runCurrent()
        advanceTimeBy(11); runCurrent()
        h.sockets[1].receive(joined("rol:MED")); h.sockets[1].receive(joined("rol:ENF")); runCurrent()
        assertTrue(signals.none { it is RealtimeSignal.ChannelsDropped })
        assertEquals(RealtimeSignal.State(ConnectionState.LIVE), signals.last())
    }

    @Test fun laRecuperacionPideOtraPaginaMientrasVengaLlena() = runTest {
        val h = Harness(); val signals = mutableListOf<RealtimeSignal>(); val calls = mutableListOf<String>()
        val full = (1..200).map { EventoDominio("cama.estado_cambiado", "cama", "c$it", 1) }
        val repo = SupabaseRealtimeRepository("wss://x", { "t" }, { cursor ->
            calls += cursor
            when (cursor) { "0" -> CatchUp("5", emptyList()); "5" -> CatchUp("6", full); else -> CatchUp("7", full.take(3)) }
        }, h.factory, heartbeatMillis = 1_000_000, backoffMillis = { 10 })
        collectInto(signals, repo)
        runCurrent()
        h.sockets[0].receive(joined("rol:MED")); h.sockets[0].receive(joined("rol:ENF")); runCurrent()
        h.sockets[0].inbox.trySend(SocketEvent.Closed("red")); runCurrent()
        advanceTimeBy(11); runCurrent()
        h.sockets[1].receive(joined("rol:MED")); h.sockets[1].receive(joined("rol:ENF")); runCurrent()
        assertEquals(listOf("0", "5", "6"), calls)
        assertEquals(203, signals.count { it is RealtimeSignal.Event })
        assertEquals(RealtimeSignal.State(ConnectionState.LIVE), signals.last())
    }

    @Test fun siFallaLaCabezaDelCursorReintentaSinDarseEnVivo() = runTest {
        val h = Harness(); val signals = mutableListOf<RealtimeSignal>(); var attempts = 0
        val repo = SupabaseRealtimeRepository("wss://x", { "t" }, { attempts++; if (attempts == 1) error("sin red") else CatchUp("1", emptyList()) },
            h.factory, heartbeatMillis = 1_000_000, backoffMillis = { 10 })
        collectInto(signals, repo)
        runCurrent()
        h.sockets[0].receive(joined("rol:MED")); h.sockets[0].receive(joined("rol:ENF")); runCurrent()
        assertFalse(RealtimeSignal.State(ConnectionState.LIVE) in signals)
        advanceTimeBy(11); runCurrent()
        h.sockets[1].receive(joined("rol:MED")); h.sockets[1].receive(joined("rol:ENF")); runCurrent()
        assertEquals(RealtimeSignal.State(ConnectionState.LIVE), signals.last())
    }
}

