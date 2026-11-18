package sv.edu.catolica.climesa.domain

import org.json.JSONArray
import org.json.JSONObject

/** One exam of `GET /laboratorio/catalogo` (`LabExamResponse`) that can carry a value: never a panel. */
data class ExternalExam(val id: String, val code: String, val name: String, val unit: String?, val numeric: Boolean)

/**
 * D4 (R7 C-5, D-5): the patient brings an exam done elsewhere that nobody ordered here. The doctor with a care
 * relationship records it from the patient record with `POST /laboratorio/pacientes/{id}/resultado-externo`
 * (`LabExternalRecordDto`, permission `laboratorio.ordenar`); the file goes up next as with an external order.
 * Same bounds as the API and the web `RegisterExternalResultDialog`; the API stays the guarantee.
 */
object ExternalRecordRules {
    const val PERMISSION = "laboratorio.ordenar"
    const val MIN_PLACE = 3
    const val MAX_PLACE = 200
    const val MAX_EXAMS = 50
    const val MAX_TEXT = 5000

    fun path(patientId: String) = "/laboratorio/pacientes/$patientId/resultado-externo"

    /** Rule 8: the action depends on the permission, never on the role. */
    fun canRecord(permissions: Collection<String>) = PERMISSION in permissions

    const val ACTION = "resultado_externo"

    /**
     * Preconditions S4: «Registrar resultado externo» shows only when the history's `allowedActions` holds it, so the API's
     * relation check never refuses it after the tap. A history from an older API (no `allowedActions`) keeps the permission rule.
     */
    fun canOffer(permissions: Collection<String>, allowedActions: List<String>?) =
        canRecord(permissions) && (allowedActions == null || ACTION in allowedActions)

    /** Exams one by one, sorted by name; panels are refused by the API ("sin paneles"). */
    fun parseCatalog(value: Any?): List<ExternalExam> {
        val rows = value as? JSONArray ?: return emptyList()
        return (0 until rows.length()).mapNotNull(rows::optJSONObject)
            .filter { !it.optBoolean("isPanel") && it.optString("id").isNotBlank() }
            .map { ExternalExam(it.optString("id"), it.optString("code"), it.optString("name"), it.optString("unit").takeIf { u -> u.isNotBlank() && u != "null" }, it.optString("resultType", "numerico") != "texto") }
            .sortedBy { it.name.lowercase() }
    }

    /** A finite number, with the decimal comma people type in El Salvador ("NaN" and "Infinity" are not numbers). */
    fun number(value: String): Double? = LabExternalRules.number(value)?.takeIf { it.isFinite() }

    /** First blocking problem of the form, or null when it can be sent. */
    fun error(place: String, exams: List<ExternalExam>, values: Map<String, String>, attachment: LabAttachment?, note: String): String? {
        val where = place.trim()
        if (where.length < MIN_PLACE) return "Indica dónde se hizo el examen (al menos $MIN_PLACE caracteres)."
        if (where.length > MAX_PLACE) return "El lugar no puede pasar de $MAX_PLACE caracteres."
        if (exams.isEmpty()) return "Agrega al menos un examen."
        if (exams.size > MAX_EXAMS) return "Registra como máximo $MAX_EXAMS exámenes."
        if (exams.map { it.id }.toSet().size != exams.size) return "Cada examen va una sola vez."
        val missing = exams.count { values[it.id].isNullOrBlank() }
        if (missing > 0) return "Falta el valor de $missing examen(es)."
        exams.firstOrNull { it.numeric && number(values[it.id].orEmpty()) == null }?.let { return "El valor de ${it.name} debe ser un número." }
        exams.firstOrNull { !it.numeric && values[it.id].orEmpty().trim().length > MAX_TEXT }?.let { return "El valor de ${it.name} no puede pasar de $MAX_TEXT caracteres." }
        if (note.trim().length > LabExternalRules.MAX_NOTE) return "La nota no puede pasar de ${LabExternalRules.MAX_NOTE} caracteres."
        return LabExternalRules.attachmentError(attachment)
    }

    /** `LabExternalRecordDto`: place, file reference, one value per exam (`value` if numeric, `text` otherwise) and the optional note. */
    fun body(place: String, attachment: LabAttachment, exams: List<ExternalExam>, values: Map<String, String>, note: String): JSONObject {
        val file = JSONObject().put("fileName", attachment.fileName).put("mimeType", attachment.mimeType).put("sizeBytes", attachment.sizeBytes)
        attachment.sha256?.let { file.put("sha256", it) }
        val results = JSONArray()
        exams.forEach { exam ->
            val row = JSONObject().put("examId", exam.id)
            val raw = values[exam.id].orEmpty()
            if (exam.numeric) row.put("value", number(raw)) else row.put("text", raw.trim())
            results.put(row)
        }
        return JSONObject().put("place", place.trim()).put("attachment", file).put("results", results).apply {
            note.trim().takeIf { it.isNotEmpty() }?.let { put("note", it) }
        }
    }

    const val DONE = "Resultado externo registrado: queda en «Resultados por revisar» para liberarlo."
}
