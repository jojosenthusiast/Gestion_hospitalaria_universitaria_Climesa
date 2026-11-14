package sv.edu.catolica.climesa.data.realtime

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class AppWakeupsTest {
    private var now = 0L
    private val wakeups = AppWakeups(resumeAfterMillis = 30_000, clock = { now })

    @Test fun volverAlFrenteTrasUnRatoLargoPideResincronizarYUnVistazoCortoNo() = runTest {
        var count = 0
        backgroundScope.launch { wakeups.wakeups.collect { count++ } }
        runCurrent()
        wakeups.activityStarted()
        runCurrent()
        assertEquals("abrir la app no cuenta", 0, count)
        wakeups.activityStopped(); now += 5_000; wakeups.activityStarted()
        runCurrent()
        assertEquals("cinco segundos fuera no reconecta", 0, count)
        wakeups.activityStopped(); now += 45_000; wakeups.activityStarted()
        runCurrent()
        assertEquals(1, count)
    }

    @Test fun cambiarDePantallaDentroDeLaAppNoCuentaComoSalir() = runTest {
        var count = 0
        backgroundScope.launch { wakeups.wakeups.collect { count++ } }
        runCurrent()
        wakeups.activityStarted()
        wakeups.activityStarted(); wakeups.activityStopped()
        now += 60_000
        wakeups.activityStarted()
        runCurrent()
        assertEquals(0, count)
    }

    @Test fun laRedSoloCuentaCuandoVuelveTrasPerderse() = runTest {
        var count = 0
        backgroundScope.launch { wakeups.wakeups.collect { count++ } }
        runCurrent()
        wakeups.networkAvailable()
        runCurrent()
        assertEquals("el aviso inicial de la red actual no cuenta", 0, count)
        wakeups.networkLost(); wakeups.networkAvailable()
        runCurrent()
        assertEquals(1, count)
    }
}
