package sv.edu.catolica.climesa.data.realtime

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.onCompletion
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import sv.edu.catolica.climesa.domain.ConnectionState
import sv.edu.catolica.climesa.domain.EventoDominio
import sv.edu.catolica.climesa.domain.RealtimeSignal

@OptIn(ExperimentalCoroutinesApi::class)
class SharedRealtimeTest {
    private class FakeUpstream : RealtimeRepository {
        var opened = 0
        var active = 0
        val bus = MutableSharedFlow<RealtimeSignal>(extraBufferCapacity = 16)
        override fun observe(channels: List<String>): Flow<RealtimeSignal> = flow {
            opened++; active++
            emit(RealtimeSignal.State(ConnectionState.LIVE))
            bus.collect { emit(it) }
        }.onCompletion { active-- }
    }

    private val event = RealtimeSignal.Event(EventoDominio("paciente.actualizado", "paciente", "p1", 2))

    @Test fun variosSuscriptoresComparteUnSoloSocket() = runTest {
        val up = FakeUpstream(); val hub = SharedRealtime(up, backgroundScope, graceMillis = 100)
        val a = mutableListOf<RealtimeSignal>(); val b = mutableListOf<RealtimeSignal>()
        val ja = backgroundScope.launch { hub.observe(listOf("publico", "rol:ENF")).collect { a += it } }
        runCurrent()
        val jb = backgroundScope.launch { hub.observe(listOf("rol:ENF", "publico")).collect { b += it } }
        runCurrent()
        assertEquals(1, up.opened)
        assertEquals("el suscriptor tardio recibe el ultimo estado", RealtimeSignal.State(ConnectionState.LIVE), b.first())
        up.bus.tryEmit(event); runCurrent()
        assertTrue(event in a && event in b)
        ja.cancel(); jb.cancel()
    }

    @Test fun elSocketSeCierraTrasIrseElUltimoSuscriptor() = runTest {
        val up = FakeUpstream(); val hub = SharedRealtime(up, backgroundScope, graceMillis = 100)
        val ja = backgroundScope.launch { hub.observe(listOf("publico")).collect { } }
        val jb = backgroundScope.launch { hub.observe(listOf("publico")).collect { } }
        runCurrent()
        ja.cancel(); runCurrent(); advanceTimeBy(200); runCurrent()
        assertEquals("sigue abierto con un suscriptor", 1, up.active)
        jb.cancel(); runCurrent(); advanceTimeBy(200); runCurrent()
        assertEquals(0, up.active)
    }

    @Test fun canalesDistintosAbrenConexionesDistintas() = runTest {
        val up = FakeUpstream(); val hub = SharedRealtime(up, backgroundScope, graceMillis = 100)
        val ja = backgroundScope.launch { hub.observe(listOf("publico")).collect { } }
        val jb = backgroundScope.launch { hub.observe(listOf("publico", "rol:MED")).collect { } }
        runCurrent()
        assertEquals(2, up.opened)
        ja.cancel(); jb.cancel()
    }

    @Test fun elAvisoDeCanalesRechazadosLlegaAlSuscriptorTardio() = runTest {
        val warning = RealtimeSignal.ChannelsDropped(setOf("rol:ENF"))
        val up = object : RealtimeRepository {
            override fun observe(channels: List<String>): Flow<RealtimeSignal> = flow {
                emit(warning); emit(RealtimeSignal.State(ConnectionState.LIVE)); kotlinx.coroutines.awaitCancellation()
            }
        }
        val hub = SharedRealtime(up, backgroundScope, graceMillis = 100)
        val ja = backgroundScope.launch { hub.observe(listOf("publico")).collect { } }
        runCurrent()
        val late = mutableListOf<RealtimeSignal>()
        val jb = backgroundScope.launch { hub.observe(listOf("publico")).collect { late += it } }
        runCurrent()
        assertTrue(warning in late)
        ja.cancel(); jb.cancel()
    }
}
