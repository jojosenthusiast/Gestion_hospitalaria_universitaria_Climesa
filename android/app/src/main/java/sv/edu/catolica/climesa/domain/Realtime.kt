package sv.edu.catolica.climesa.domain

import org.json.JSONObject

/** Evento delgado de dominio (docs/arquitectura/tiempo-real.md): solo dice qué cambió, nunca datos clínicos. */
data class EventoDominio(val type: String, val entity: String, val id: String, val version: Long?)

enum class ConnectionState { LIVE, RECONNECTING, OFFLINE }

/** Lo que una pantalla recibe del repositorio de tiempo real. */
sealed interface RealtimeSignal {
    data class Event(val event: EventoDominio) : RealtimeSignal
    data class State(val state: ConnectionState) : RealtimeSignal

    /** Hay que volver a pedir los datos: se suscribió un canal o se recuperó lo perdido tras una caída. */
    object Resync : RealtimeSignal

    /** Aviso no fatal: estos canales fueron rechazados 3 veces seguidas y se dejaron fuera; el resto sigue en vivo. */
    data class ChannelsDropped(val channels: Set<String>) : RealtimeSignal
}

/** Respuesta de `GET /eventos?after=<seq>`. */
data class CatchUp(val cursor: String, val events: List<EventoDominio>)

sealed interface RealtimeFrame {
    data class JoinReply(val channel: String, val ok: Boolean) : RealtimeFrame
    data class Broadcast(val channel: String, val event: EventoDominio) : RealtimeFrame
    data class ChannelClosed(val channel: String) : RealtimeFrame
    data class HeartbeatReply(val ref: String) : RealtimeFrame
    object Ignored : RealtimeFrame
}

/** Protocolo Phoenix de Supabase Realtime (vsn 1.0.0, JSON). Código puro para poder probarlo sin red. */
object RealtimeProtocol {
    private const val PREFIX = "realtime:"
    const val PUBLIC_CHANNEL = "publico"

    fun topic(channel: String) = PREFIX + channel

    fun websocketUrl(supabaseUrl: String, publishableKey: String): String {
        val base = supabaseUrl.trim().trimEnd('/').replaceFirst("https://", "wss://").replaceFirst("http://", "ws://")
        return "$base/realtime/v1/websocket?apikey=$publishableKey&vsn=1.0.0"
    }

    /** Los canales distintos de `publico` son privados y exigen el token de la sesión. */
    fun join(channel: String, ref: String, accessToken: String): String {
        val config = JSONObject()
            .put("broadcast", JSONObject().put("ack", false).put("self", false))
            .put("presence", JSONObject().put("key", ""))
            .put("postgres_changes", org.json.JSONArray())
            .put("private", channel != PUBLIC_CHANNEL)
        val payload = JSONObject().put("config", config).put("access_token", accessToken)
        return frame(topic(channel), "phx_join", payload, ref, ref)
    }

    /** Latido del protocolo para mantener abierto el socket; no consulta datos. */
    fun heartbeat(ref: String): String = frame("phoenix", "heartbeat", JSONObject(), ref, null)

    /** Renueva el token en un canal ya unido (evento `access_token` de Phoenix). */
    fun accessToken(channel: String, ref: String, accessToken: String): String =
        frame(topic(channel), "access_token", JSONObject().put("access_token", accessToken), ref, null)

    private fun frame(topic: String, event: String, payload: JSONObject, ref: String, joinRef: String?): String {
        val json = JSONObject().put("topic", topic).put("event", event).put("payload", payload).put("ref", ref)
        if (joinRef != null) json.put("join_ref", joinRef)
        return json.toString()
    }

    fun parse(text: String): RealtimeFrame {
        val json = runCatching { JSONObject(text) }.getOrNull() ?: return RealtimeFrame.Ignored
        val topic = json.optString("topic")
        if (topic == "phoenix") {
            val ref = json.optString("ref")
            return if (json.optString("event") == "phx_reply" && ref.isNotBlank() && ref != "null") RealtimeFrame.HeartbeatReply(ref) else RealtimeFrame.Ignored
        }
        if (!topic.startsWith(PREFIX)) return RealtimeFrame.Ignored
        val channel = topic.removePrefix(PREFIX)
        val payload = json.optJSONObject("payload")
        return when (json.optString("event")) {
            "phx_reply" -> RealtimeFrame.JoinReply(channel, payload?.optString("status") == "ok")
            "phx_close", "phx_error" -> RealtimeFrame.ChannelClosed(channel)
            "broadcast" -> {
                val carga = payload?.optJSONObject("payload") ?: return RealtimeFrame.Ignored
                val type = carga.optString("tipo").ifBlank { payload.optString("event") }
                if (type.isBlank()) RealtimeFrame.Ignored
                else RealtimeFrame.Broadcast(channel, toEvent(type, carga.optString("entidad"), carga.opt("id"), carga.opt("version")))
            }
            else -> RealtimeFrame.Ignored
        }
    }

    fun parseCatchUp(json: JSONObject): CatchUp {
        val rows = json.optJSONArray("events")
        val events = (0 until (rows?.length() ?: 0)).mapNotNull { i ->
            rows!!.optJSONObject(i)?.let { toEvent(it.optString("type"), it.optString("entity"), it.opt("id"), it.opt("version")) }
        }
        return CatchUp(json.opt("cursor")?.toString() ?: "0", events)
    }

    private fun toEvent(type: String, entity: String, id: Any?, version: Any?): EventoDominio =
        EventoDominio(
            type,
            entity,
            id?.takeUnless { it == JSONObject.NULL }?.toString().orEmpty(),
            (version as? Number)?.toLong() ?: version?.takeUnless { it == JSONObject.NULL }?.toString()?.toLongOrNull(),
        )
}

/** Filtros puros de eventos: cada pantalla decide qué entidades le importan y vuelve a pedir sus datos. */
object LiveEntities {
    fun matches(event: EventoDominio, vararg entities: String) =
        event.entity in entities || entities.any { event.type.startsWith("$it.") }
}

/** Filtro de eventos que le importan al tablero de camas. `espacio` cubre mover o desactivar una cama. */
object BedEvents {
    fun matches(event: EventoDominio) = LiveEntities.matches(event, "cama", "espacio")
}

object PatientEvents {
    fun matches(event: EventoDominio) = LiveEntities.matches(event, "paciente")

    /**
     * Qué volver a pedir al llegar un evento de paciente. Con una búsqueda activa no se reemplaza la lista (los
     * candidatos son un resultado de búsqueda), solo se refresca la ficha o el paciente conocido.
     */
    sealed interface Refresh {
        object None : Refresh
        data class Detail(val id: String) : Refresh
        object List : Refresh
    }

    fun refreshFor(event: EventoDominio, knownIds: Set<String>, selectedId: String?, searchActive: Boolean): Refresh {
        if (!matches(event)) return Refresh.None
        if (event.id.isNotBlank() && (event.id in knownIds || event.id == selectedId)) return Refresh.Detail(event.id)
        return if (searchActive) Refresh.None else Refresh.List
    }
}

/** Se vuelve a leer `/auth/me` y se vuelven a unir los canales cuando cambia la cuenta. */
object ProfileEvents {
    fun matches(event: EventoDominio) = LiveEntities.matches(event, "usuario")
}

/** Qué eventos refrescan cada pantalla del portal por rol, según la ruta que carga. */
object PortalEvents {
    fun matches(path: String?, event: EventoDominio): Boolean = when {
        path == null -> false
        path.startsWith("/inicio") -> BedEvents.matches(event) || PatientEvents.matches(event)
        path.startsWith("/turnos") -> LiveEntities.matches(event, "turno", "personal")
        path.startsWith("/pacientes") -> PatientEvents.matches(event)
        path.startsWith("/ambulancia") -> LiveEntities.matches(event, "ambulancia")
        else -> false
    }
}
