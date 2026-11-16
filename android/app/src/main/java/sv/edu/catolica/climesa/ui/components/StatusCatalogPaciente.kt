package sv.edu.catolica.climesa.ui

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier

/**
 * Appointment states (`citas`) shown to the patient, with the Spanish copy the patient screens already use.
 * Kept apart from the shared [StatusCatalog]: codes that only belong to the patient flow live here.
 */
internal object StatusCatalogPaciente {
    private val labels = mapOf(
        "solicitada" to "Solicitud pendiente",
        "confirmada" to "Confirmada",
        "cancelada" to "Cancelada",
        "rechazada" to "Rechazada",
        "atendida" to "Atendida",
        "no_asistio" to "No asistió",
        "vencida" to "Vencida",
        "reprogramada" to "Reprogramada",
    )
    private val tones: Map<String, StatusTone> = mapOf(
        "solicitada" to StatusTone.RESERVED,
        "confirmada" to StatusTone.SUCCESS,
        "cancelada" to StatusTone.DANGER,
        "rechazada" to StatusTone.DANGER,
        "atendida" to StatusTone.SUCCESS,
        "no_asistio" to StatusTone.WARNING,
        "vencida" to StatusTone.NEUTRAL,
        "reprogramada" to StatusTone.NEUTRAL,
    )

    fun label(code: String): String = labels[code] ?: code
    fun tone(code: String): StatusTone = tones[code] ?: StatusTone.NEUTRAL
}

/** Appointment state badge with the patient copy; the family comes from the shared table ([StatusBadge]). */
@Composable
internal fun PatientAppointmentTag(state: String, modifier: Modifier = Modifier) =
    StatusBadge(state, modifier, StatusCatalogPaciente.label(state), StatusCatalogPaciente.tone(state))
