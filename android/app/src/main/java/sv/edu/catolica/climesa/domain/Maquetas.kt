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
        AndroidSection.QUEUE to Maqueta(
            "A05", "Mi turno en fila", "Seguir mi número",
            listOf(MaquetaRow("Mi número", "C-014"), MaquetaRow("Turnos antes que yo", "3"), MaquetaRow("Consultorio", "Se muestra al ser llamado")),
            emptyList(),
        ),
        AndroidSection.APPOINTMENTS to Maqueta(
            "A06", "Mis citas", "Ver, pedir y cancelar",
            listOf(
                MaquetaRow("Próxima", "Ejemplo Rivas · Medicina general · 04/11/2026 09:30"),
                MaquetaRow("Pasada", "Ejemplo Castro · Laboratorio · 12/10/2026 08:00"),
            ),
            listOf("Pedir cita", "Cancelar cita"),
        ),
        AndroidSection.APPOINTMENT_REQUEST to Maqueta(
            "A06", "Pedir cita", "Elegir médico o especialidad, fecha y horario libre",
            listOf(
                MaquetaRow("Médico o especialidad", "Medicina general"),
                MaquetaRow("Fecha", "05/11/2026"),
                MaquetaRow("Horarios libres", "08:00 · 08:30 · 10:15"),
            ),
            listOf("Solicitar cita"),
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
        AndroidSection.AMBULANCE_REQUEST to Maqueta(
            "A09", "Pedir ambulancia", "Solicitud y seguimiento",
            listOf(
                MaquetaRow("Aviso", "Si hay riesgo de vida, llama al 911"),
                MaquetaRow("Ubicación", "Colonia Ejemplo, calle principal 12"),
                MaquetaRow("Estado", "Por confirmar"),
            ),
            listOf("Enviar solicitud", "Cancelar antes de confirmar"),
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
        AndroidSection.LAB to Maqueta(
            "A60", "Cola de laboratorio", "Trabajo del día por estado",
            listOf(
                MaquetaRow("Pendientes", "4 órdenes"),
                MaquetaRow("En proceso", "2 órdenes"),
                MaquetaRow("Completadas hoy", "7 órdenes"),
            ),
            listOf("Tomar muestra", "Capturar resultado"),
        ),
        AndroidSection.SERVICE to Maqueta(
            "A71", "Servicio en curso", "Avanzar cada hito con un botón grande",
            listOf(
                MaquetaRow("Hito actual", "En escena"),
                MaquetaRow("Dirección", "Colonia Ejemplo, calle principal 12"),
                MaquetaRow("Tiempo transcurrido", "00:14"),
            ),
            listOf("Avanzar hito", "Abrir mapa"),
        ),
        AndroidSection.LOG to Maqueta(
            "A74", "Mi bitácora", "Servicios propios con tiempos",
            listOf(
                MaquetaRow("Servicio 1032", "Salida 07:40 · Finalizado 08:55"),
                MaquetaRow("Servicio 1031", "Salida 05:10 · Finalizado 06:02"),
            ),
            emptyList(),
        ),
    )

    fun of(section: AndroidSection): Maqueta? = catalog[section]
}
