package sv.edu.catolica.climesa.data.realtime

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
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
    private val channels = listOf("publico", "rol:ENF")

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
        h.sockets[0].receive(joined("publico"))
        runCurrent()
        assertFalse(RealtimeSignal.Resync in signals)
        h.sockets[0].receive(joined("rol:ENF"))
        runCurrent()
        assertTrue(RealtimeSignal.Resync in signals)
        assertEquals(RealtimeSignal.State(ConnectionState.LIVE), signals.last())
        assertTrue("sin caida previa no hay consulta de recuperacion", h.catchUps.isEmpty())
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
        h.sockets[0].receive(joined("publico")); h.sockets[0].receive(joined("rol:ENF"))
        runCurrent()
        h.sockets[0].inbox.trySend(SocketEvent.Closed("red"))
        runCurrent()
        assertEquals(RealtimeSignal.State(ConnectionState.RECONNECTING), signals.last())
        advanceTimeBy(20)
        runCurrent()
        assertEquals(2, h.sockets.size)
        h.sockets[1].receive(joined("publico")); h.sockets[1].receive(joined("rol:ENF"))
        runCurrent()
        assertEquals(listOf("0"), h.catchUps)
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
}
