package sv.edu.catolica.climesa.data.realtime

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import sv.edu.catolica.climesa.data.AuthRequestException
import sv.edu.catolica.climesa.domain.EventoDominio
import sv.edu.catolica.climesa.domain.RealtimeSignal

@OptIn(ExperimentalCoroutinesApi::class)
class ProfileLiveRefreshTest {
    private class Rt : RealtimeRepository {
        val observed = mutableListOf<List<String>>()
        val signals = MutableSharedFlow<RealtimeSignal>(extraBufferCapacity = 16)
        override fun observe(channels: List<String>): Flow<RealtimeSignal> { observed += channels; return signals }
    }

    private data class Account(val channels: List<String>)
    private val usuario = RealtimeSignal.Event(EventoDominio("usuario.actualizado", "usuario", "u1", 3))

    @Test fun unEventoUsuarioRelaeElPerfilYSeUneALosCanalesNuevos() = runTest {
        val rt = Rt(); val applied = mutableListOf<Account>()
        val next = Account(listOf("publico", "rol:MED"))
        val refresh = ProfileLiveRefresh<Account>(rt, { next }, { it.channels }, { applied += it }, { })
        refresh.start(backgroundScope, listOf("publico", "rol:ENF")); runCurrent()
        rt.signals.tryEmit(usuario); runCurrent()
        assertEquals(listOf(next), applied)
        assertEquals(listOf(listOf("publico", "rol:ENF"), listOf("publico", "rol:MED")), rt.observed)
    }

    @Test fun conLosMismosCanalesNoSeVuelveASuscribir() = runTest {
        val rt = Rt(); val applied = mutableListOf<Account>()
        val same = Account(listOf("publico"))
        val refresh = ProfileLiveRefresh<Account>(rt, { same }, { it.channels }, { applied += it }, { })
        refresh.start(backgroundScope, listOf("publico")); runCurrent()
        rt.signals.tryEmit(usuario); runCurrent()
        assertEquals(1, applied.size)
        assertEquals(1, rt.observed.size)
    }

    @Test fun otrosEventosNoRelaenElPerfil() = runTest {
        val rt = Rt(); var loads = 0
        val refresh = ProfileLiveRefresh<Account>(rt, { loads++; Account(listOf("publico")) }, { it.channels }, { }, { })
        refresh.start(backgroundScope, listOf("publico")); runCurrent()
        rt.signals.tryEmit(RealtimeSignal.Event(EventoDominio("cama.estado_cambiado", "cama", "b1", 1))); runCurrent()
        assertEquals(0, loads)
    }

    @Test fun unaCuentaSinAccesoAvisaYUnFalloDeRedNo() = runTest {
        val rt = Rt(); var lost = 0; var failure: Exception = AuthRequestException("Forbidden", 403)
        val refresh = ProfileLiveRefresh<Account>(rt, { throw failure }, { it.channels }, { }, { lost++ })
        refresh.start(backgroundScope, listOf("publico")); runCurrent()
        rt.signals.tryEmit(usuario); runCurrent()
        assertEquals(1, lost)
        failure = AuthRequestException("Sin conexion")
        rt.signals.tryEmit(usuario); runCurrent()
        assertEquals(1, lost)
        assertFalse(rt.observed.isEmpty())
    }
}
