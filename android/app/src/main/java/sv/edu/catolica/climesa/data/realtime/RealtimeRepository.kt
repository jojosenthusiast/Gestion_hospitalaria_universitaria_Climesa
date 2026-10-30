package sv.edu.catolica.climesa.data.realtime

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.channelFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import sv.edu.catolica.climesa.domain.CatchUp
import sv.edu.catolica.climesa.domain.ConnectionState
import sv.edu.catolica.climesa.domain.RealtimeFrame
import sv.edu.catolica.climesa.domain.RealtimeProtocol
import sv.edu.catolica.climesa.domain.RealtimeSignal

/** Tiempo real sin sondeo (regla 9): los cambios llegan empujados; nunca se consulta por reloj. */
interface RealtimeRepository {
    /** Abre la conexión mientras se recolecta y la cierra al cancelar. */
    fun observe(channels: List<String>): Flow<RealtimeSignal>
}

sealed interface SocketEvent {
    object Opened : SocketEvent
    data class Text(val text: String) : SocketEvent
    data class Closed(val reason: String?) : SocketEvent
}

interface RealtimeSocket {
    val events: Flow<SocketEvent>
    fun send(text: String): Boolean
    fun close()
}

fun interface RealtimeSocketFactory {
    fun open(url: String): RealtimeSocket
}

/**
 * Cliente mínimo del protocolo Phoenix de Supabase Realtime. Como `web/src/lib/live.ts`: se une a los canales de
 * `/auth/me`, emite los eventos y, solo tras una caída, hace UNA consulta de recuperación a `/eventos?after=<seq>`.
 * Reintenta la conexión con espera creciente; eso es reconexión, no sondeo de datos.
 */
class SupabaseRealtimeRepository(
    private val websocketUrl: String,
    private val accessToken: suspend () -> String?,
    private val catchUp: suspend (cursor: String) -> CatchUp,
    private val sockets: RealtimeSocketFactory,
    private val heartbeatMillis: Long = 25_000,
    private val backoffMillis: (attempt: Int) -> Long = { minOf(30_000L, 1_000L shl (it - 1).coerceIn(0, 5)) },
    private val offlineAfterFailures: Int = 3,
) : RealtimeRepository {

    private class Dropped : Exception()

    override fun observe(channels: List<String>): Flow<RealtimeSignal> = channelFlow {
        var cursor = "0"
        var wasDown = false
        var failures = 0
        while (isActive) {
            send(RealtimeSignal.State(if (failures >= offlineAfterFailures) ConnectionState.OFFLINE else ConnectionState.RECONNECTING))
            val token = runCatching { accessToken() }.getOrNull()
            if (token == null) {
                failures++
                wasDown = true
                delay(backoffMillis(failures))
                continue
            }
            val socket = sockets.open(websocketUrl)
            val joined = mutableSetOf<String>()
            var heartbeat: Job? = null
            var counter = 0
            try {
                socket.events.collect { event ->
                    when (event) {
                        SocketEvent.Opened -> {
                            channels.forEach { socket.send(RealtimeProtocol.join(it, (++counter).toString(), token)) }
                            heartbeat = launch {
                                while (true) {
                                    delay(heartbeatMillis)
                                    socket.send(RealtimeProtocol.heartbeat((++counter).toString()))
                                }
                            }
                        }
                        is SocketEvent.Closed -> throw Dropped()
                        is SocketEvent.Text -> when (val frame = RealtimeProtocol.parse(event.text)) {
                            is RealtimeFrame.JoinReply -> if (!frame.ok) throw Dropped() else if (joined.add(frame.channel) && joined.size == channels.size) {
                                failures = 0
                                if (wasDown) {
                                    val recovered = try {
                                        catchUp(cursor)
                                    } catch (e: CancellationException) {
                                        throw e
                                    } catch (_: Exception) {
                                        throw Dropped()
                                    }
                                    cursor = recovered.cursor
                                    recovered.events.forEach { send(RealtimeSignal.Event(it)) }
                                    wasDown = false
                                }
                                send(RealtimeSignal.Resync)
                                send(RealtimeSignal.State(ConnectionState.LIVE))
                            }
                            is RealtimeFrame.Broadcast -> send(RealtimeSignal.Event(frame.event))
                            is RealtimeFrame.ChannelClosed -> throw Dropped()
                            RealtimeFrame.Ignored -> Unit
                        }
                    }
                }
            } catch (_: Dropped) {
            } finally {
                heartbeat?.cancel()
                socket.close()
            }
            wasDown = true
            failures++
            send(RealtimeSignal.State(if (failures >= offlineAfterFailures) ConnectionState.OFFLINE else ConnectionState.RECONNECTING))
            delay(backoffMillis(failures))
        }
        awaitClose()
    }
}
