package sv.edu.catolica.climesa.data.realtime

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import sv.edu.catolica.climesa.domain.ProfileEvents
import sv.edu.catolica.climesa.domain.RealtimeSignal

/** Suscripción de un ViewModel al tiempo real: idempotente por lista de canales, y se puede detener. */
class LiveSubscription(private val realtime: RealtimeRepository) {
    private var job: Job? = null
    private var key: String? = null

    /** Devuelve `false` si ya estaba suscrito a esos mismos canales. */
    fun start(scope: CoroutineScope, channels: List<String>, onSignal: suspend (RealtimeSignal) -> Unit): Boolean {
        val next = channels.joinToString("|")
        if (next == key) return false
        job?.cancel()
        key = next
        if (channels.isEmpty()) return true
        job = scope.launch { realtime.observe(channels).collect { onSignal(it) } }
        return true
    }

    fun stop() {
        job?.cancel()
        job = null
        key = null
    }
}

/**
 * Refresca la cuenta cuando llega un evento `usuario`: vuelve a leer `/auth/me` y, si cambian los canales, se vuelve
 * a unir con la lista nueva. Un 401 o 403 significa que la cuenta perdió el acceso y se avisa con [onLost].
 */
class ProfileLiveRefresh<T : Any>(
    realtime: RealtimeRepository,
    private val load: suspend () -> T?,
    private val channelsOf: (T) -> List<String>,
    private val apply: (T) -> Unit,
    private val onLost: () -> Unit,
) {
    private val subscription = LiveSubscription(realtime)

    fun start(scope: CoroutineScope, channels: List<String>) {
        subscription.start(scope, channels) { signal ->
            if (signal is RealtimeSignal.Event && ProfileEvents.matches(signal.event)) refresh(scope)
        }
    }

    fun stop() = subscription.stop()

    private suspend fun refresh(scope: CoroutineScope) {
        val fresh = try {
            load()
        } catch (e: kotlinx.coroutines.CancellationException) {
            throw e
        } catch (e: sv.edu.catolica.climesa.data.AuthRequestException) {
            if (e.statusCode == 401 || e.statusCode == 403) onLost()
            return
        } catch (_: Exception) {
            return
        }
        if (fresh == null) { onLost(); return }
        apply(fresh)
        start(scope, channelsOf(fresh))
    }
}
