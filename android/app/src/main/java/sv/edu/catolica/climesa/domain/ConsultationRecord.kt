package sv.edu.catolica.climesa.domain

import org.json.JSONArray
import org.json.JSONObject

/** A diagnosis already registered in the consultation (`diagnoses` of `GET /consultas/{id}/detalle`). */
data class RecordedDiagnosis(val id: String, val code: String, val principal: Boolean, val note: String?)

/** One medication of a prescription already issued (`prescriptions[].items`). */
data class RecordedMedication(val medication: String, val dose: String, val frequency: String, val duration: String)

/** A lab order of this consultation (`GET /laboratorio/ordenes` filtered by `consultationId`). */
data class RecordedLabOrder(val id: String, val state: String, val exams: List<String>, val examIds: Set<String>, val examCodes: Set<String>)

/**
 * B4: what the consultation already has, so the physician sees what was saved and does not repeat it. The detail brings
 * diagnoses and prescriptions; lab orders come from the physician's own order list (B-6: the detail does not carry them).
 */
data class ConsultationRecord(
    val consultationId: String,
    val diagnoses: List<RecordedDiagnosis> = emptyList(),
    val medications: List<RecordedMedication> = emptyList(),
    val labOrders: List<RecordedLabOrder> = emptyList(),
    /** Catalog ids ordered from this device for this consultation (a panel is listed later by its component exams). */
    val orderedIds: Set<String> = emptySet(),
) {
    /** Exams of a non-cancelled order of this consultation: the catalog does not offer them again. */
    fun alreadyOrdered(exam: LabExam): Boolean = exam.id in orderedIds || labOrders.any { it.state != "cancelado" && (exam.id in it.examIds || exam.code in it.examCodes) }
}

object ConsultationRecordRules {
    fun diagnoses(detail: Any?): List<RecordedDiagnosis> = rows((detail as? JSONObject)?.optJSONArray("diagnoses")).map {
        RecordedDiagnosis(it.optString("id"), it.optString("code"), it.optBoolean("principal"), text(it, "note"))
    }

    fun medications(detail: Any?): List<RecordedMedication> = rows((detail as? JSONObject)?.optJSONArray("prescriptions")).flatMap { prescription ->
        rows(prescription.optJSONArray("items")).map { RecordedMedication(it.optString("medication"), it.optString("dose"), it.optString("frequency"), it.optString("duration")) }
    }

    fun labOrders(orders: Any?, consultationId: String): List<RecordedLabOrder> = rows(orders as? JSONArray)
        .filter { it.optString("consultationId") == consultationId }
        .map { order ->
            val items = rows(order.optJSONArray("items"))
            RecordedLabOrder(order.optString("id"), order.optString("state"), items.map { it.optString("name").ifBlank { it.optString("code") } },
                items.mapNotNull { text(it, "examId") }.toSet(), items.mapNotNull { text(it, "code") }.toSet())
        }

    /** "2 diagnósticos · 1 medicamento · 3 exámenes": what the signature closes. */
    fun signSummary(record: ConsultationRecord?): String {
        val r = record ?: ConsultationRecord("")
        val exams = r.labOrders.filter { it.state != "cancelado" }.sumOf { it.exams.size }
        return listOf(
            plural(r.diagnoses.size, "diagnóstico", "diagnósticos"),
            plural(r.medications.size, "medicamento", "medicamentos"),
            plural(exams, "examen", "exámenes"),
        ).joinToString(" · ")
    }

    /** Why "Firmar" is disabled, said next to it; null when it can be signed. */
    fun signBlocker(reason: String, plan: String): String? = when {
        reason.isBlank() && plan.isBlank() -> "Falta el motivo y el plan"
        reason.isBlank() -> "Falta el motivo"
        plan.isBlank() -> "Falta el plan"
        else -> null
    }

    private fun plural(n: Int, one: String, many: String) = "$n ${if (n == 1) one else many}"
    private fun rows(array: JSONArray?): List<JSONObject> = array?.let { a -> (0 until a.length()).mapNotNull { a.optJSONObject(it) } }.orEmpty()
    private fun text(row: JSONObject, key: String) = if (row.isNull(key)) null else row.optString(key).takeIf { it.isNotBlank() }
}
