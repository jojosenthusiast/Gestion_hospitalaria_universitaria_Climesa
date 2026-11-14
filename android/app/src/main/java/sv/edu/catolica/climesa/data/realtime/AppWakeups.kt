package sv.edu.catolica.climesa.data.realtime

import android.app.Activity
import android.app.Application
import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.os.Bundle
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.asSharedFlow

/**
 * Señales para volver a sincronizar el tiempo real cuando el socket pudo quedar viejo sin enterarse:
 * - la app vuelve al frente tras estar en segundo plano al menos [resumeAfterMillis] (teléfono bloqueado, otra app);
 * - el teléfono recupera la red después de perderla.
 *
 * No es sondeo (regla 9): no hay temporizador, solo se compara la hora al irse con la hora al volver.
 * [SupabaseRealtimeRepository] reacciona reconectando: se une otra vez, recupera desde el cursor y emite `Resync`,
 * y cada pantalla vuelve a pedir sus datos.
 */
class AppWakeups(
    private val resumeAfterMillis: Long = RESUME_AFTER_MILLIS,
    private val clock: () -> Long = System::currentTimeMillis,
) {
    private val signals = MutableSharedFlow<Unit>(extraBufferCapacity = 1, onBufferOverflow = BufferOverflow.DROP_OLDEST)
    val wakeups: Flow<Unit> = signals.asSharedFlow()

    private var started = 0
    private var backgroundSince: Long? = null
    @Volatile private var networkLost = false

    /** Una actividad pasó a visible. Solo la primera (la app vuelve al frente) cuenta. */
    fun activityStarted() {
        if (started++ > 0) return
        val since = backgroundSince ?: return
        backgroundSince = null
        if (clock() - since >= resumeAfterMillis) signals.tryEmit(Unit)
    }

    /** Una actividad dejó de verse; con la última, la app queda en segundo plano. */
    fun activityStopped() {
        if (started == 0) return
        if (--started == 0) backgroundSince = clock()
    }

    fun networkLost() { networkLost = true }

    /** El aviso inicial de la red actual no cuenta: solo se recupera tras una pérdida. */
    fun networkAvailable() {
        if (!networkLost) return
        networkLost = false
        signals.tryEmit(Unit)
    }

    /** Conecta las señales reales del sistema. Se llama una vez desde `ClimesaApplication`. */
    fun install(application: Application) {
        application.registerActivityLifecycleCallbacks(object : Application.ActivityLifecycleCallbacks {
            override fun onActivityStarted(activity: Activity) = activityStarted()
            override fun onActivityStopped(activity: Activity) = activityStopped()
            override fun onActivityCreated(activity: Activity, savedInstanceState: Bundle?) = Unit
            override fun onActivityResumed(activity: Activity) = Unit
            override fun onActivityPaused(activity: Activity) = Unit
            override fun onActivitySaveInstanceState(activity: Activity, outState: Bundle) = Unit
            override fun onActivityDestroyed(activity: Activity) = Unit
        })
        val connectivity = application.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager ?: return
        runCatching {
            connectivity.registerDefaultNetworkCallback(object : ConnectivityManager.NetworkCallback() {
                override fun onAvailable(network: Network) = networkAvailable()
                override fun onLost(network: Network) = networkLost()
            })
        }
    }

    companion object {
        const val RESUME_AFTER_MILLIS = 30_000L
    }
}
