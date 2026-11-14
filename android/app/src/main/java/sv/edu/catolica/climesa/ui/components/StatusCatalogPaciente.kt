package sv.edu.catolica.climesa.ui

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
    )
    private val tones: Map<String, StatusTone> = mapOf(
        "solicitada" to StatusTone.RESERVED,
        "confirmada" to StatusTone.SUCCESS,
        "cancelada" to StatusTone.DANGER,
        "rechazada" to StatusTone.DANGER,
        "atendida" to StatusTone.SUCCESS,
        "no_asistio" to StatusTone.WARNING,
    )

    fun label(code: String): String = labels[code] ?: code
    fun tone(code: String): StatusTone = tones[code] ?: StatusTone.NEUTRAL
}
