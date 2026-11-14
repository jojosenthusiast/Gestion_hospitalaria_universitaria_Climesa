package sv.edu.catolica.climesa.domain

/** Fila de contenido de ejemplo: `label` y `value` ficticios. */
data class MaquetaRow(val label: String, val value: String)

/**
 * Maqueta navegable de una pantalla de `pantallas.csv` (plataforma Android). Es contenido de ejemplo ficticio:
 * no llama a la API y sus acciones están deshabilitadas. `screen` es el código de la pantalla en el catálogo.
 */
data class Maqueta(
    val screen: String,
    val title: String,
    val purpose: String,
    val rows: List<MaquetaRow>,
    val actions: List<String>,
)

object Maquetas {
    const val LABEL = "Maqueta"
    const val NOTE = "Datos ficticios. Esta pantalla no consulta la API."

    private val catalog: Map<AndroidSection, Maqueta> = mapOf(
        AndroidSection.PATIENT_QUEUE to Maqueta(
            "A05", "Mi turno en fila", "Seguir mi número",
            listOf(MaquetaRow("Mi número", "C-014"), MaquetaRow("Turnos antes que yo", "3"), MaquetaRow("Consultorio", "Se muestra al ser llamado")),
            emptyList(),
        ),
        AndroidSection.RESULTS to Maqueta(
            "A07", "Mis exámenes", "Estado de cada examen; el valor aparece cuando el médico lo revisa",
            listOf(
                MaquetaRow("Hemograma", "Completado · valores ocultos hasta revisión"),
                MaquetaRow("Glucosa en ayunas", "En proceso"),
                MaquetaRow("Perfil lipídico", "Pendiente"),
            ),
            emptyList(),
        ),
        AndroidSection.CONSULTATIONS to Maqueta(
            "A21", "Consulta", "Atender al paciente",
            listOf(
                MaquetaRow("Motivo", "Dolor de cabeza de dos días"),
                MaquetaRow("Diagnóstico", "Cefalea tensional (CIE-10 de ejemplo)"),
                MaquetaRow("Receta", "Paracetamol 500 mg · cada 8 horas"),
            ),
            listOf("Guardar borrador", "Firmar consulta"),
        ),
    )

    fun of(section: AndroidSection): Maqueta? = catalog[section] ?: section.takeIf { !it.ready && it.screenId.isNotBlank() }?.let {
        Maqueta(
            screen = it.screenId,
            title = it.label,
            purpose = "Destino catalogado para este rol",
            rows = listOf(MaquetaRow("Estado", "Disponible en una próxima entrega")),
            actions = emptyList(),
        )
    }
}
