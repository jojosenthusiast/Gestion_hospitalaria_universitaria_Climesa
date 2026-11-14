package sv.edu.catolica.climesa.ui

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier

/**
 * Operations states (queue, ambulance, inventory) that the shared [StatusCatalog] colours as neutral or differently.
 * Codes missing here fall back to the shared catalog so both stay in sync with the web `Tag`.
 */
internal object OperacionStatus {
    private val tones = mapOf(
        "en_espera" to StatusTone.RESERVED,
        "llamado" to StatusTone.PROCESS,
        "en_atencion" to StatusTone.PROCESS,
        "atendido" to StatusTone.SUCCESS,
        "no_se_presento" to StatusTone.BLOCKED,
        "cancelada" to StatusTone.DANGER,
        "en_servicio" to StatusTone.PROCESS,
        "sin_traslado" to StatusTone.WARNING,
        "rechaza_traslado" to StatusTone.WARNING,
        "bajo_minimo" to StatusTone.DANGER,
        "vencido" to StatusTone.DANGER,
    )
    private val labels = mapOf("atendido" to "Atendido")

    fun tone(code: String): StatusTone = tones[code] ?: StatusCatalog.tone(code)
    fun label(code: String): String = labels[code] ?: StatusCatalog.label(code)
}

/** [StatusTag] with the operations tones; `label` overrides the Spanish name (for example a domain label). */
@Composable
internal fun OperacionStatusTag(code: String, modifier: Modifier = Modifier, label: String? = null) =
    StatusPill(label ?: OperacionStatus.label(code), OperacionStatus.tone(code), modifier)
