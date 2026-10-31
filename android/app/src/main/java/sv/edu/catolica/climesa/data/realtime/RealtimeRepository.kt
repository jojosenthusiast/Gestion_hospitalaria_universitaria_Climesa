package sv.edu.catolica.climesa.data.realtime

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Job
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.channelFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
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

/** Tamaño de página de `GET /eventos`: una página llena indica que puede haber más. */
const val CATCH_UP_PAGE_SIZE = 200

/**
 * Cliente mínimo del protocolo Phoenix de Supabase Realtime. Como `web/src/lib/live.ts`: se une a los canales de
 * `/auth/me` y emite los eventos. Tras la primera unión pide la cabeza del cursor (`GET /eventos` sin `after` no trae
 * eventos) y, solo tras una caída, recupera lo perdido desde ese cursor, página por página.
 * Reintenta la conexión con espera creciente; eso es reconexión, no sondeo de datos.
 *
 * - El latido espera su `phx_reply`; sin respuesta en [heartbeatTimeoutMillis] el socket se da por caído.
 * - En cada latido se comprueba el token de la sesión; si cambió (la sesión lo renovó) se manda `access_token` a los canales unidos.
 * - Un canal rechazado [maxJoinRejections] veces seguidas se deja fuera y el resto sigue en vivo, con un aviso no fatal.
 */
class SupabaseRealtimeRepository(
    private val websocketUrl: String,
    private val accessToken: suspend () -> String?,
    private val catchUp: suspend (cursor: String) -> CatchUp,
    private val sockets: RealtimeSocketFactory,
    private val heartbeatMillis: Long = 25_000,
    private val heartbeatTimeoutMillis: Long = 10_000,
    private val backoffMillis: (attempt: Int) -> Long = { minOf(30_000L, 1_000L shl (it - 1).coerceIn(0, 5)) },
    private val offlineAfterFailures: Int = 3,
    private val maxJoinRejections: Int = 3,
) : RealtimeRepository {

    private class Dropped : Exception()

    override fun observe(requested: List<String>): Flow<RealtimeSignal> = channelFlow {
        // publico es el canal de la pantalla sin sesión; el portal no lo usa, así que no se une a él.
        val channels = requested.filter { it != RealtimeProtocol.PUBLIC_CHANNEL }
        var cursor: String? = null
        var wasDown = false
        var failures = 0
        val rejections = mutableMapOf<String, Int>()
        val dropped = linkedSetOf<String>()

        suspend fun fetch(from: String): CatchUp = try {
            catchUp(from)
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            throw Dropped()
        }

        while (isActive) {
            val active = channels.filter { it !in dropped }
            if (active.isEmpty()) {
                send(RealtimeSignal.State(ConnectionState.OFFLINE))
                awaitCancellation()
            }
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
            var liveReported = false
            var counter = 0
            var pendingRef: String? = null
            var pendingAck: CompletableDeferred<Unit>? = null

            suspend fun checkLive() {
                val needed = channels.filter { it !in dropped }
                if (liveReported || needed.isEmpty() || !joined.containsAll(needed)) return
                liveReported = true
                failures = 0
                val known = cursor
                if (known == null) {
                    cursor = fetch("0").cursor
                } else if (wasDown) {
                    var from: String = known
                    do {
                        val page = fetch(from)
                        val before = from
                        from = page.cursor
                        cursor = from
                        page.events.forEach { send(RealtimeSignal.Event(it)) }
                    } while (page.events.size >= CATCH_UP_PAGE_SIZE && from != before)
                }
                wasDown = false
                send(RealtimeSignal.Resync)
                send(RealtimeSignal.State(ConnectionState.LIVE))
            }

            try {
                coroutineScope {
                    val scope = this
                    var reader: Job? = null
                    var heartbeat: Job? = null
                    reader = launch {
                        socket.events.collect { event ->
                            when (event) {
                                SocketEvent.Opened -> {
                                    var current: String = token
                                    active.forEach { socket.send(RealtimeProtocol.join(it, (++counter).toString(), current)) }
                                    heartbeat = scope.launch {
                                        while (true) {
                                            delay(heartbeatMillis)
                                            // La sesión renueva el token si está por vencer; si cambió, los canales abiertos lo reciben.
                                            val fresh = runCatching { accessToken() }.getOrNull()
                                            if (fresh != null && fresh != current) {
                                                current = fresh
                                                joined.toList().forEach { socket.send(RealtimeProtocol.accessToken(it, (++counter).toString(), fresh)) }
                                            }
                                            val ref = (++counter).toString()
                                            val ack = CompletableDeferred<Unit>()
                                            pendingRef = ref
                                            pendingAck = ack
                                            val sent = socket.send(RealtimeProtocol.heartbeat(ref))
                                            if (!sent || withTimeoutOrNull(heartbeatTimeoutMillis) { ack.await() } == null) {
                                                reader?.cancel()
                                                return@launch
                                            }
                                        }
                                    }
                                }
                                is SocketEvent.Closed -> throw Dropped()
                                is SocketEvent.Text -> when (val frame = RealtimeProtocol.parse(event.text)) {
                                    is RealtimeFrame.JoinReply -> when {
                                        frame.ok -> if (joined.add(frame.channel)) {
                                            rejections.remove(frame.channel)
                                            checkLive()
                                        }
                                        frame.channel in joined -> throw Dropped()
                                        else -> {
                                            val count = (rejections[frame.channel] ?: 0) + 1
                                            rejections[frame.channel] = count
                                            if (count < maxJoinRejections) throw Dropped()
                                            dropped += frame.channel
                                            send(RealtimeSignal.ChannelsDropped(dropped.toSet()))
                                            if (channels.all { it in dropped }) throw Dropped()
                                            checkLive()
                                        }
                                    }
                                    is RealtimeFrame.HeartbeatReply -> if (frame.ref == pendingRef) pendingAck?.complete(Unit)
                                    is RealtimeFrame.Broadcast -> send(RealtimeSignal.Event(frame.event))
                                    is RealtimeFrame.ChannelClosed -> throw Dropped()
                                    RealtimeFrame.Ignored -> Unit
                                }
                            }
                        }
                    }
                    reader.join()
                    heartbeat?.cancel()
                }
            } catch (_: Dropped) {
            } finally {
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

