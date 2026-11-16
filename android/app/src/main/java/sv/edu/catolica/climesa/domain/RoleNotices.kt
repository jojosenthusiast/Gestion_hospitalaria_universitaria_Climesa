package sv.edu.catolica.climesa.domain

import java.time.Instant
import org.json.JSONObject

/** Escalera de avisos (D-071): del más urgente al menos. */
enum class NoticePriority(val wire: String) {
    CRITICAL("critico"), URGENT("urgente"), ATTENTION("atencion");

    companion object {
        fun of(wire: String?) = entries.firstOrNull { it.wire == wire } ?: ATTENTION
    }
}

/** Aviso de `GET /me/avisos`: público o dirigido a alguno de mis roles (obs. 14). */
data class RoleNotice(
    val id: String,
    val title: String,
    val body: String,
    val priority: NoticePriority,
    val until: String?,
    val isPublic: Boolean,
    val roles: List<String>,
)

object RoleNoticeParser {
    fun parse(value: Any?): List<RoleNotice> {
        val rows = (value as? JSONObject)?.optJSONArray("avisos") ?: return emptyList()
        return (0 until rows.length()).mapNotNull { i ->
            val r = rows.optJSONObject(i) ?: return@mapNotNull null
            val title = r.optString("titulo")
            if (title.isBlank()) return@mapNotNull null
            val roles = r.optJSONArray("roles")?.let { a -> (0 until a.length()).map { a.optString(it) } }.orEmpty()
            RoleNotice(
                r.optString("id"), title, r.optString("cuerpo"), NoticePriority.of(r.optString("prioridad")),
                r.optString("hasta").takeUnless { r.isNull("hasta") || it.isBlank() }, r.optBoolean("publico", true), roles,
            )
        }.sortedBy { it.priority.ordinal }
    }

    /** La lista y su `proximoCambio`: el instante en que cambia solo por el paso del tiempo (un aviso vence o empieza). */
    fun parseFeed(value: Any?): RoleNoticeFeed {
        val next = (value as? JSONObject)?.takeUnless { it.isNull("proximoCambio") }?.optString("proximoCambio")?.takeUnless { it.isBlank() }
        return RoleNoticeFeed(parse(value), next)
    }

    /** Nombres de rol para decir a quién va dirigido: «Medicina, Enfermería»; vacío si solo es público. */
    fun audience(notice: RoleNotice): String = notice.roles.joinToString(", ") { RoleAccess.label(it) }
}

data class RoleNoticeFeed(val notices: List<RoleNotice>, val nextChange: String?)

/** Cuándo volver a leer los avisos y qué mostrar si esa lectura falla (revisión del PR #119, igual que iOS y la web). */
object NoticeRefresh {
    /** Margen tras `proximoCambio` para que el servidor ya vea el cambio al volver a leer. */
    const val SLACK_MS = 1_000L

    /** Milisegundos hasta `proximoCambio` (más el margen); null si nada cambia con el tiempo o la fecha no se entiende. */
    fun delayMs(nextChange: String?, nowMs: Long): Long? {
        val at = nextChange?.let { runCatching { Instant.parse(it).toEpochMilli() }.getOrNull() } ?: return null
        return (at - nowMs).coerceAtLeast(0) + SLACK_MS
    }

    /**
     * Si volver a leer falla, no se deja a la vista lo que ya no vale: se quita el aviso que cambió o se retiró
     * (`event`) y los que ya vencieron a `nowMs`.
     */
    fun afterFailedRefetch(current: List<RoleNotice>, event: EventoDominio?, nowMs: Long): List<RoleNotice> = current.filter { n ->
        n.id != event?.id && n.until?.let { u -> runCatching { Instant.parse(u).toEpochMilli() > nowMs }.getOrDefault(true) } ?: true
    }
}

object NoticeEvents {
    /** Los avisos llegan con `aviso.publicado` por `publico` y por `rol:<código>`. */
    fun matches(event: EventoDominio) = LiveEntities.matches(event, "aviso")
}
