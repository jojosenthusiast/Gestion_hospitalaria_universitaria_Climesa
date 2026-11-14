package sv.edu.catolica.climesa.domain

import org.json.JSONArray
import org.json.JSONObject

data class LaboratoryResult(val value: Double?, val text: String?, val mark: String, val version: Int)
data class LaboratoryItem(val id: String, val code: String, val name: String, val result: LaboratoryResult?)
data class LaboratoryOrder(val id: String, val patientName: String, val priority: String, val state: String, val version: Int, val items: List<LaboratoryItem>, val reviewed: Boolean)

object LaboratoryLabels {
    fun state(value: String) = mapOf("pendiente" to "Pendiente", "en_proceso" to "En proceso", "completado" to "Completado", "cancelado" to "Cancelado")[value] ?: value
    fun mark(value: String) = mapOf("normal" to "Normal", "alto" to "Alto", "bajo" to "Bajo", "critico_alto" to "Crítico alto", "critico_bajo" to "Crítico bajo", "sin_rango" to "Sin rango")[value] ?: value
}

/** An active exam or panel of `GET /laboratorio/catalogo`. */
data class LabExam(val id: String, val code: String, val name: String, val isPanel: Boolean)

/** Lab orders created by the physician from a consultation (`POST /laboratorio/ordenes`, permission `laboratorio.ordenar`). */
object LabOrderRules {
    const val MAX_EXAMS = 50

    fun parseCatalog(value: Any?): List<LabExam> {
        val rows = value as? JSONArray ?: return emptyList()
        return (0 until rows.length()).mapNotNull { index ->
            rows.optJSONObject(index)?.let { row -> LabExam(row.optString("id"), row.optString("code"), row.optString("name"), row.optBoolean("isPanel")) }
        }.filter { it.id.isNotBlank() }
    }

    fun error(consultationId: String?, exams: Collection<String>): String? = when {
        consultationId.isNullOrBlank() -> "Inicia la consulta antes de ordenar exámenes."
        exams.isEmpty() -> "Selecciona al menos un examen."
        exams.size > MAX_EXAMS -> "Selecciona como máximo $MAX_EXAMS exámenes."
        else -> null
    }

    fun body(consultationId: String, exams: Collection<String>, urgent: Boolean): JSONObject =
        JSONObject().put("consultationId", consultationId).put("exams", JSONArray(exams.distinct())).put("priority", if (urgent) "urgente" else "rutina")
}
