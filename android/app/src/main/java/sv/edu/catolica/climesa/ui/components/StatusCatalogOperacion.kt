package sv.edu.catolica.climesa.ui

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import sv.edu.catolica.climesa.domain.UnitStatusBadge

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
        "cerrado" to StatusTone.BLOCKED,
        "cancelada" to StatusTone.DANGER,
        "en_servicio" to StatusTone.PROCESS,
        "sin_traslado" to StatusTone.WARNING,
        "rechaza_traslado" to StatusTone.WARNING,
        "bajo_minimo" to StatusTone.DANGER,
        "vencido" to StatusTone.DANGER,
        UnitStatusBadge.BLOCKED to StatusTone.WARNING,
    )
    private val labels = mapOf("atendido" to "Atendido", "cerrado" to "Cerrado sin atender")

    fun tone(code: String): StatusTone = tones[code] ?: StatusCatalog.tone(code)
    fun label(code: String): String = labels[code] ?: StatusCatalog.label(code)
}

/** [StatusBadge] with the operations tones as fallback for codes the shared table lacks (`atendido`, `sin_traslado`); `label` overrides the Spanish name (for example a domain label). */
@Composable
internal fun OperacionStatusTag(code: String, modifier: Modifier = Modifier, label: String? = null) =
    StatusBadge(code, modifier, label ?: OperacionStatus.label(code), OperacionStatus.tone(code))
