package sv.edu.catolica.climesa.ui

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier

internal enum class StatusTone { SUCCESS, PROCESS, RESERVED, WARNING, BLOCKED, DANGER, NEUTRAL }

/** Same state codes, Spanish labels and legacy tones as `Tag` in `web/src/features/common.tsx` and `.status-*` in `modules.css`. */
internal object StatusCatalog {
    private val labels = mapOf(
        "activo" to "Activo", "inactivo" to "Inactivo", "provisional" to "Provisional", "libre" to "Libre", "ocupada" to "Ocupada",
        "reservada" to "Reservada", "limpieza" to "En limpieza", "bloqueada" to "Bloqueada", "borrador" to "Borrador",
        "publicado" to "Pendiente de iniciar", "pendiente" to "Pendiente de iniciar", "en_curso" to "En curso", "completado" to "Completado",
        "cancelado" to "Cancelado", "cancelada" to "Cancelada", "solicitada" to "Solicitada", "confirmada" to "Confirmada",
        "atendida" to "Atendida", "firmada" to "Firmada", "rechazada" to "Rechazada", "no_asistio" to "No asistió",
        "desactivado" to "Desactivado", "pendiente_cama" to "Pendiente de cama", "hospitalizado" to "Hospitalizado",
        "alta_firmada" to "Alta firmada", "egresado" to "Egresado", "exito" to "Correcto", "denegado" to "Denegado", "fallido" to "Fallido",
        "en_espera" to "En espera", "llamado" to "Llamado", "en_atencion" to "En atención", "no_se_presento" to "No se presentó",
        "en_proceso" to "En Proceso", "abierta" to "Abierta", "bajo_minimo" to "Bajo mínimo", "vencido" to "Vencido", "normal" to "Normal",
        "alto" to "Alto", "bajo" to "Bajo", "critico_alto" to "Crítico alto", "critico_bajo" to "Crítico bajo", "sin_rango" to "Sin rango",
        "disponible" to "Disponible", "en_servicio" to "En servicio", "en_mantenimiento" to "En mantenimiento",
        "vencida" to "Vencida", "reprogramada" to "Reprogramada", "cerrado" to "Cerrado sin atender", "aprobada" to "Aprobada",
        "agotado" to "Agotado", "por_vencer" to "Por vencer", "coincide" to "Coincide", "revisar" to "Revisar",
        // Audit 2 D7: same names as the web (`system.tsx`) and iOS (`StatusCatalog.swift`).
        "ok" to "En orden", "atendido" to "Atendido", "requiere_atencion" to "Requiere atención",
    )
    private val tones: Map<String, StatusTone> = buildMap {
        listOf("activo", "libre", "exito", "completado", "disponible").forEach { put(it, StatusTone.SUCCESS) }
        listOf("ocupada", "publicado", "en_curso").forEach { put(it, StatusTone.PROCESS) }
        listOf("reservada", "provisional", "borrador", "pendiente").forEach { put(it, StatusTone.RESERVED) }
        put("limpieza", StatusTone.WARNING)
        listOf("inactivo", "desactivado", "bloqueada", "en_mantenimiento").forEach { put(it, StatusTone.BLOCKED) }
        listOf("denegado", "fallido", "cancelado", "en_servicio").forEach { put(it, StatusTone.DANGER) }
    }

    fun label(code: String): String = labels[code] ?: code.replace('_', ' ')
    fun tone(code: String): StatusTone = tones[code] ?: StatusTone.NEUTRAL
}

/**
 * Pill for an API state value. Since Fase 2 it is a [StatusBadge] (icon + label + pattern), so every screen that calls
 * `StatusTag` gets the shared look. `value` is the API state code; `label` overrides the shared Spanish name.
 */
@Composable
internal fun StatusTag(value: String, modifier: Modifier = Modifier, label: String? = null) =
    StatusBadge(value, modifier, label ?: StatusCatalog.label(value), StatusCatalog.tone(value))

/** UI codes for a check against a record (account linking, admission feasibility): matches is done, the rest waits for review. */
internal object LinkCheck {
    const val MATCH = "coincide"
    const val REVIEW = "revisar"
}

/** Badge for a critical clinical value (critical lab result, critical vital sign): the only free-text badge in red. */
@Composable
internal fun CriticalPill(text: String, modifier: Modifier = Modifier) = FamilyBadge(text, StatusFamily.CRITICO, modifier)
