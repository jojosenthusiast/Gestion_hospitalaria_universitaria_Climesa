package sv.edu.catolica.climesa.domain

import java.time.Instant

/** Escalera de avisos (D-071): del más urgente al menos. */
enum class NoticePriority(val wire: String) {
    CRITICAL("critico"), URGENT("urgente"), ATTENTION("atencion");

    companion object {
        fun of(wire: String?) = entries.firstOrNull { it.wire == wire } ?: ATTENTION
    }
}

/** Cuándo volver a leer los avisos: una sola vez en `proximoCambio` (igual que iOS y la web), nunca por sondeo. */
object NoticeRefresh {
    /** Margen tras `proximoCambio` para que el servidor ya vea el cambio al volver a leer. */
    const val SLACK_MS = 1_000L

    /** Milisegundos hasta `proximoCambio` (más el margen); null si nada cambia con el tiempo o la fecha no se entiende. */
    fun delayMs(nextChange: String?, nowMs: Long): Long? {
        val at = nextChange?.let { runCatching { Instant.parse(it).toEpochMilli() }.getOrNull() } ?: return null
        return (at - nowMs).coerceAtLeast(0) + SLACK_MS
    }
}

object NoticeEvents {
    /** Los avisos llegan con `aviso.*` por `publico`, por `rol:<código>` y por las cuentas del área dirigida. */
    fun matches(event: EventoDominio) = LiveEntities.matches(event, "aviso")
}
