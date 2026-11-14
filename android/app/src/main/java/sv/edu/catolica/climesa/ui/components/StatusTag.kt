package sv.edu.catolica.climesa.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

internal enum class StatusTone { SUCCESS, PROCESS, RESERVED, WARNING, BLOCKED, DANGER, NEUTRAL }

/** Same state codes, Spanish labels and colour families as `Tag` in `web/src/features/common.tsx` and `.status-*` in `modules.css`. */
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
        "en_proceso" to "En proceso", "abierta" to "Abierta", "bajo_minimo" to "Bajo mínimo", "vencido" to "Vencido", "normal" to "Normal",
        "alto" to "Alto", "bajo" to "Bajo", "critico_alto" to "Crítico alto", "critico_bajo" to "Crítico bajo", "sin_rango" to "Sin rango",
        "disponible" to "Disponible", "en_servicio" to "En servicio", "en_mantenimiento" to "En mantenimiento",
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

@Composable
private fun StatusTone.colors(): Pair<Color, Color> {
    val c = MaterialTheme.climesa
    return when (this) {
        StatusTone.SUCCESS -> c.success to c.successSoft
        StatusTone.PROCESS -> c.process to c.processSoft
        StatusTone.RESERVED -> c.reserved to c.reservedSoft
        StatusTone.WARNING -> c.warning to c.warningSoft
        StatusTone.BLOCKED -> c.blocked to c.blockedSoft
        StatusTone.DANGER -> c.danger to c.dangerSoft
        StatusTone.NEUTRAL -> MaterialTheme.colorScheme.onSurfaceVariant to MaterialTheme.colorScheme.background
    }
}

/** Pill with a dot, like the web `.status-tag`. `value` is the API state code; `label` overrides the shared Spanish name. */
@Composable
internal fun StatusTag(value: String, modifier: Modifier = Modifier, label: String? = null) =
    StatusPill(label ?: StatusCatalog.label(value), StatusCatalog.tone(value), modifier)

@Composable
internal fun StatusPill(text: String, tone: StatusTone, modifier: Modifier = Modifier) {
    val (fg, bg) = tone.colors()
    Surface(modifier, shape = CircleShape, color = bg, contentColor = fg, border = BorderStroke(1.dp, fg.copy(alpha = .24f))) {
        Row(Modifier.padding(horizontal = 9.dp, vertical = 5.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
            androidx.compose.foundation.layout.Box(Modifier.size(7.dp).background(fg, CircleShape))
            Text(text, style = MaterialTheme.typography.labelLarge.copy(fontSize = 12.sp, fontWeight = FontWeight.Bold), maxLines = 1)
        }
    }
}
