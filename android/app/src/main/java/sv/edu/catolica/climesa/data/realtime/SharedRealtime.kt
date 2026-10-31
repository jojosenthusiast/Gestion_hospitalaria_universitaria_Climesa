package sv.edu.catolica.climesa.data.realtime

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.emitAll
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.onCompletion
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.flow.shareIn
import sv.edu.catolica.climesa.domain.RealtimeSignal
import java.util.concurrent.ConcurrentHashMap

/**
 * Un solo socket para toda la app: todos los ViewModels que piden los mismos canales comparten la misma conexión.
 * Se abre con el primer suscriptor y se cierra [graceMillis] después de que se va el último (conteo de referencias).
 * Un suscriptor tardío recibe de inmediato el último estado de conexión y de canales; los eventos solo llegan en vivo.
 */
class SharedRealtime(
    private val upstream: RealtimeRepository,
    private val scope: CoroutineScope,
    private val graceMillis: Long = 5_000,
) : RealtimeRepository {
    private class Shared(val events: Flow<RealtimeSignal>) {
        @Volatile var lastState: RealtimeSignal.State? = null
        @Volatile var lastWarning: RealtimeSignal.ChannelsDropped? = null
    }

    private val shared = ConcurrentHashMap<String, Shared>()

    override fun observe(channels: List<String>): Flow<RealtimeSignal> {
        val key = channels.sorted().joinToString("|")
        val entry = shared.getOrPut(key) {
            lateinit var created: Shared
            val source = upstream.observe(channels)
                .onEach { signal ->
                    when (signal) {
                        is RealtimeSignal.State -> created.lastState = signal
                        is RealtimeSignal.ChannelsDropped -> created.lastWarning = signal
                        else -> Unit
                    }
                }
                .onCompletion { created.lastState = null; created.lastWarning = null }
                .shareIn(scope, SharingStarted.WhileSubscribed(graceMillis), replay = 0)
            created = Shared(source)
            created
        }
        return flow {
            entry.lastWarning?.let { emit(it) }
            entry.lastState?.let { emit(it) }
            emitAll(entry.events)
        }
    }
}
