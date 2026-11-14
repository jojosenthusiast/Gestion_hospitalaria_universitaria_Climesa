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
        NOT_STARTED to StatusTone.NEUTRAL,
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

/** [StatusTag] that also understands the clinical codes above. */
@Composable
internal fun ClinicalStatusTag(code: String, modifier: Modifier = Modifier) {
    val tone = StatusCatalogClinico.tone(code)
    if (tone == null) StatusTag(code, modifier) else StatusPill(stringResource(labelRes(code) ?: R.string.clin_estado_sin_iniciar), tone, modifier)
}

/** Pill for a laboratory result mark, coloured like the web (`Normal` green, `Alto` amber, `Crítico` red). */
@Composable
internal fun LabMarkTag(mark: String, label: String, modifier: Modifier = Modifier) =
    StatusPill(label, StatusCatalogClinico.markTone(mark), modifier)
