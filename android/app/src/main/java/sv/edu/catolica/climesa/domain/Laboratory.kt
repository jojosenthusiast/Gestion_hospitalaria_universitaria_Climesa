package sv.edu.catolica.climesa.domain

data class LaboratoryResult(val value: Double?, val text: String?, val mark: String, val version: Int)
data class LaboratoryItem(val id: String, val code: String, val name: String, val result: LaboratoryResult?)
data class LaboratoryOrder(val id: String, val patientName: String, val priority: String, val state: String, val version: Int, val items: List<LaboratoryItem>, val reviewed: Boolean)

object LaboratoryLabels {
    fun state(value: String) = mapOf("pendiente" to "Pendiente", "en_proceso" to "En proceso", "completado" to "Completado", "cancelado" to "Cancelado")[value] ?: value
    fun mark(value: String) = mapOf("normal" to "Normal", "alto" to "Alto", "bajo" to "Bajo", "critico_alto" to "Crítico alto", "critico_bajo" to "Crítico bajo", "sin_rango" to "Sin rango")[value] ?: value
}
