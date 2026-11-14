package sv.edu.catolica.climesa.domain

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

    /** Nombres de rol para decir a quién va dirigido: «Medicina, Enfermería»; vacío si solo es público. */
    fun audience(notice: RoleNotice): String = notice.roles.joinToString(", ") { RoleAccess.label(it) }
}

object NoticeEvents {
    /** Los avisos llegan con `aviso.publicado` por `publico` y por `rol:<código>`. */
    fun matches(event: EventoDominio) = LiveEntities.matches(event, "aviso")
}
