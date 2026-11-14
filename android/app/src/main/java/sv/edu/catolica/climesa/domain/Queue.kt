package sv.edu.catolica.climesa.domain

data class QueueTicket(
    val id: String,
    val service: String,
    val number: Int,
    val patientName: String,
    val state: String,
    val calls: Int,
    val version: Int,
    val issuedAtMillis: Long? = null,
)

object QueueLabels {
    val services = listOf("consulta_general" to "Consulta general", "emergencia" to "Emergencia", "laboratorio" to "Laboratorio", "admisiones" to "Admisiones")
    fun service(value: String) = services.firstOrNull { it.first == value }?.second ?: value
    fun state(value: String) = mapOf("en_espera" to "En espera", "llamado" to "Llamado", "en_atencion" to "En atención", "atendido" to "Atendido", "no_se_presento" to "No se presentó")[value] ?: value
}
