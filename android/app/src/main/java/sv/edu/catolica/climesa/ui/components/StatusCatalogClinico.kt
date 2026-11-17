package sv.edu.catolica.climesa.ui

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import sv.edu.catolica.climesa.R

/**
 * State codes of the clinical flows (consultation, laboratory) that the shared [StatusCatalog] does not list.
 * Codes it already knows (`abierta`, `firmada`, `en_proceso`, `completado`, `pendiente_cama`...) fall through to [StatusTag].
 */
internal object StatusCatalogClinico {
    /** Consultation not started yet: the API sends `null`, the UI uses this code. */
    const val NOT_STARTED = "sin_iniciar"
    const val URGENT = "urgente"
    const val ROUTINE = "rutina"
    const val UNDER_REVIEW = "en_revision"

    private val tones = mapOf(
        // Not started yet waits (family ESPERA), like a number in the queue.
        NOT_STARTED to StatusTone.RESERVED,
        URGENT to StatusTone.DANGER,
        ROUTINE to StatusTone.NEUTRAL,
        UNDER_REVIEW to StatusTone.WARNING,
    )

    fun tone(code: String): StatusTone? = tones[code]

    /** Maps a result mark (`normal`, `critico_alto`...) to the tone the web gives it. */
    fun markTone(mark: String): StatusTone = when (mark) {
        "normal" -> StatusTone.SUCCESS
        "alto", "bajo" -> StatusTone.WARNING
        "critico_alto", "critico_bajo" -> StatusTone.DANGER
        else -> StatusTone.NEUTRAL
    }
}

private fun labelRes(code: String): Int? = when (code) {
    StatusCatalogClinico.NOT_STARTED -> R.string.clin_estado_sin_iniciar
    StatusCatalogClinico.URGENT -> R.string.clin_prioridad_urgente
    StatusCatalogClinico.ROUTINE -> R.string.clin_prioridad_rutina
    StatusCatalogClinico.UNDER_REVIEW -> R.string.clin_estado_en_revision
    else -> null
}

/**
 * [StatusTag] that also understands the clinical codes above. `urgente` and `rutina` are priorities, so they render as
 * [PriorityBadge] (amber and gray, never red); the other codes go through [StatusBadge].
 */
@Composable
internal fun ClinicalStatusTag(code: String, modifier: Modifier = Modifier) {
    val tone = StatusCatalogClinico.tone(code) ?: return StatusTag(code, modifier)
    val label = stringResource(labelRes(code) ?: R.string.clin_estado_sin_iniciar)
    when (code) {
        StatusCatalogClinico.URGENT -> PriorityBadge(Priority.URGENTE, modifier, label)
        StatusCatalogClinico.ROUTINE -> PriorityBadge(Priority.RUTINA, modifier, label)
        else -> if (StatusFamily.urgent(code)) PriorityBadge(Priority.URGENTE, modifier, label) else FamilyBadge(label, StatusFamily.of(code) ?: StatusFamily.fromTone(tone), modifier)
    }
}

/**
 * Badge for a laboratory result mark, like the web: `normal` done (check), `critico_*` critical (alert, double border),
 * `alto`/`bajo`/`sin_rango` neutral with a dot.
 */
@Composable
internal fun LabMarkTag(mark: String, label: String, modifier: Modifier = Modifier) =
    StatusBadge(mark, modifier, label, fallback = null)
