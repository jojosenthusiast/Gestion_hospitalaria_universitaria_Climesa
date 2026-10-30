package sv.edu.catolica.climesa.data.realtime

import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.receiveAsFlow
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import java.util.concurrent.TimeUnit

/** Transporte real sobre OkHttp. Cada `open` crea un socket nuevo con su propia cola de eventos. */
class OkHttpRealtimeSocketFactory(
    private val client: OkHttpClient = OkHttpClient.Builder().pingInterval(0, TimeUnit.SECONDS).build(),
) : RealtimeSocketFactory {
    override fun open(url: String): RealtimeSocket {
        val queue = Channel<SocketEvent>(Channel.UNLIMITED)
        val socket = client.newWebSocket(Request.Builder().url(url).build(), object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) { queue.trySend(SocketEvent.Opened) }
            override fun onMessage(webSocket: WebSocket, text: String) { queue.trySend(SocketEvent.Text(text)) }
            override fun onClosing(webSocket: WebSocket, code: Int, reason: String) { webSocket.close(code, reason) }
            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) { queue.trySend(SocketEvent.Closed(reason)); queue.close() }
            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) { queue.trySend(SocketEvent.Closed(t.message)); queue.close() }
        })
        return object : RealtimeSocket {
            override val events: Flow<SocketEvent> = queue.receiveAsFlow()
            override fun send(text: String) = socket.send(text)
            override fun close() { socket.close(1000, null); queue.close() }
        }
    }
}
