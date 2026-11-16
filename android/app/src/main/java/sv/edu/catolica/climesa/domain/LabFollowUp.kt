package sv.edu.catolica.climesa.domain

import org.json.JSONArray
import org.json.JSONObject

/** Metadata of the external report the doctor or the lab picked. The file itself stays on the device (no clinical storage yet). */
data class LabAttachment(val fileName: String, val mimeType: String, val sizeBytes: Long, val sha256: String? = null)

/**
 * Fase 2, flujo C (S10): orders done at another place. Send to external (`POST /laboratorio/ordenes/{id}/externa`) and load the
 * report as attachment metadata plus one key value per exam (`POST /laboratorio/ordenes/{id}/resultado-externo`). The API is the guarantee.
 */
object LabExternalRules {
    const val MIN_PLACE = 3
    const val MAX_PLACE = 200
    const val MIN_INSTRUCTIONS = 10
    const val MAX_INSTRUCTIONS = 1000
    const val MAX_NOTE = 1000
    const val MAX_ATTACHMENT_BYTES = 10L * 1024 * 1024
    val ATTACHMENT_TYPES = setOf("application/pdf", "image/jpeg", "image/png", "image/heic", "image/webp")
    const val INSTRUCTIONS_TEMPLATE = "Presente esta orden y su DUI en el lugar indicado. Siga la preparación que le indiquen. Traiga el informe (foto o PDF) a su próxima cita o al laboratorio."

    fun sendPath(orderId: String) = "/laboratorio/ordenes/$orderId/externa"
    fun resultPath(orderId: String) = "/laboratorio/ordenes/$orderId/resultado-externo"

    fun sendError(place: String, instructions: String): String? = when {
        place.trim().length < MIN_PLACE -> "Indica dónde se realiza el examen."
        place.trim().length > MAX_PLACE -> "El lugar no puede pasar de $MAX_PLACE caracteres."
        instructions.trim().length < MIN_INSTRUCTIONS -> "Escribe las instrucciones para el paciente (al menos $MIN_INSTRUCTIONS caracteres)."
        instructions.trim().length > MAX_INSTRUCTIONS -> "Las instrucciones no pueden pasar de $MAX_INSTRUCTIONS caracteres."
        else -> null
    }

    fun sendBody(version: Int, place: String, instructions: String): JSONObject =
        JSONObject().put("version", version).put("place", place.trim()).put("instructions", instructions.trim())

    fun attachmentError(file: LabAttachment?): String? = when {
        file == null -> "Adjunta la foto o el PDF del informe externo."
        file.mimeType !in ATTACHMENT_TYPES -> "El informe debe ser PDF o una foto (JPG, PNG, HEIC o WEBP)."
        file.sizeBytes <= 0 -> "El archivo está vacío."
        file.sizeBytes > MAX_ATTACHMENT_BYTES -> "El archivo pasa de 10 MB; toma una foto más liviana o comprime el PDF."
        else -> null
    }

    /** Accepts a decimal comma, as people type it in El Salvador. */
    fun number(value: String): Double? = value.trim().replace(',', '.').toDoubleOrNull()

    fun valuesError(items: List<LaboratoryItem>, values: Map<String, String>): String? {
        val missing = items.count { values[it.id].isNullOrBlank() }
        if (missing > 0) return "Falta el valor de $missing examen(es)."
        items.firstOrNull { it.numeric && number(values[it.id].orEmpty()) == null }?.let { return "El valor de ${it.name} debe ser un número." }
        return null
    }

    fun resultBody(version: Int, attachment: LabAttachment, items: List<LaboratoryItem>, values: Map<String, String>, note: String): JSONObject {
        val file = JSONObject().put("fileName", attachment.fileName).put("mimeType", attachment.mimeType).put("sizeBytes", attachment.sizeBytes)
        attachment.sha256?.let { file.put("sha256", it) }
        val results = JSONArray()
        items.forEach { item ->
            val row = JSONObject().put("orderItemId", item.id)
            if (item.numeric) row.put("value", number(values[item.id].orEmpty())) else row.put("text", values[item.id].orEmpty().trim())
            results.put(row)
        }
        return JSONObject().put("version", version).put("attachment", file).put("results", results).apply { if (note.isNotBlank()) put("note", note.trim()) }
    }
}

/** One open item of the doctor's "Resultados por revisar" (`GET /laboratorio/pendientes`). */
data class LabFollowUp(val id: String, val orderId: String, val patientName: String, val record: String?, val critical: Boolean, val detail: String, val version: Int, val createdAtMillis: Long?)

object LabFollowUpRules {
    /** Critical values first, then the oldest; the API already sorts, the app keeps it if a live reload reorders. */
    fun parse(value: Any?): List<LabFollowUp> {
        val rows = value as? JSONArray ?: return emptyList()
        return (0 until rows.length()).mapNotNull { index ->
            rows.optJSONObject(index)?.let { row ->
                LabFollowUp(row.optString("id"), row.optString("orderId"), row.optString("patientName").ifBlank { "Paciente" }, row.optString("patientRecord").ifBlank { null },
                    row.optString("reason") == "critico", row.optString("detail"), row.optInt("version", 1), parseMillis(row.optString("createdAt")))
            }
        }.filter { it.id.isNotBlank() }.sortedWith(compareBy<LabFollowUp>({ if (it.critical) 0 else 1 }, { it.createdAtMillis ?: Long.MAX_VALUE }))
    }

    /** The lab observation is a note from the lab to the doctor: never shown in the patient's own view. */
    fun labNote(result: LaboratoryResult, ownView: Boolean): String? = if (ownView) null else result.observation

    fun reviewPath(id: String) = "/laboratorio/pendientes/$id/revisar"
    fun reviewBody(version: Int): JSONObject = JSONObject().put("version", version)
}

/** Worklist groups in the order work happens; what is closed starts folded. Same groups as the web list. */
enum class LabGroup(val label: String, val folded: Boolean) {
    IN_PROCESS("En proceso", false), SAMPLE("Por tomar muestra", false), EXTERNAL("Externas: esperan el informe", false),
    TO_REVIEW("Esperan revisión médica", false), RELEASED("Liberadas", true), CANCELLED("Canceladas", true),
}

object LabGroups {
    fun of(order: LaboratoryOrder): LabGroup = when {
        order.state == "cancelado" -> LabGroup.CANCELLED
        order.state == "en_proceso" -> LabGroup.IN_PROCESS
        order.state == "pendiente" -> if (order.external) LabGroup.EXTERNAL else LabGroup.SAMPLE
        order.reviewed -> LabGroup.RELEASED
        else -> LabGroup.TO_REVIEW
    }

    /** Keeps the incoming order inside each group and drops empty groups. */
    fun group(orders: List<LaboratoryOrder>): List<Pair<LabGroup, List<LaboratoryOrder>>> =
        LabGroup.entries.map { group -> group to orders.filter { of(it) == group } }.filter { it.second.isNotEmpty() }
}
