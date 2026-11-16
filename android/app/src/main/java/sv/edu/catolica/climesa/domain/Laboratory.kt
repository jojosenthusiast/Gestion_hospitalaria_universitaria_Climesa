package sv.edu.catolica.climesa.domain

import org.json.JSONArray
import org.json.JSONObject

/** [observation] is the lab note on the value; [relevant] means it opened an item in the doctor's "Resultados por revisar" (S10). */
data class LaboratoryResult(val value: Double?, val text: String?, val mark: String, val version: Int, val observation: String? = null, val relevant: Boolean = false)
/** [resultType] is `numerico` or `texto` (null on older API rows: then a unit means numeric). */
data class LaboratoryItem(val id: String, val code: String, val name: String, val result: LaboratoryResult?, val unit: String? = null, val resultType: String? = null) {
    val numeric get() = resultType?.let { it == "numerico" } ?: (unit != null)
}

/** Actions the API allows the reader on an order (`allowedActions`, enum `AccionOrdenLaboratorio`). */
enum class LabOrderAction(val wire: String) {
    TAKE_SAMPLE("tomar_muestra"), CAPTURE("capturar"), COMPLETE("completar"), REVIEW("revisar"), CANCEL("cancelar"), AMEND("enmendar"),
}

/** S10: the external path (`externalActions`, enum `AccionExternaLaboratorio`), apart so `allowedActions` stays as older clients read it. */
enum class LabExternalAction(val wire: String) { SEND("enviar_externo"), LOAD_RESULT("cargar_externo") }

/**
 * [age] is already worded for the role ("34 años" or the decade "30-39 años"); null when the role does not see it.
 * [allowedActions] comes from the server for this reader: buttons follow it, never the role or the state.
 * [amendedAtMillis] is set when a lab technician amended a result of the completed order (it went back to the doctor's review).
 */
data class LaboratoryOrder(
    val id: String, val patientName: String, val priority: String, val state: String, val version: Int, val items: List<LaboratoryItem>, val reviewed: Boolean,
    val record: String? = null, val sex: String? = null, val age: String? = null, val doctorName: String? = null, val createdAtMillis: Long? = null,
    val allowedActions: Set<String> = emptySet(), val amendedAtMillis: Long? = null,
    val external: Boolean = false, val externalPlace: String? = null, val externalInstructions: String? = null, val externalActions: Set<String> = emptySet(),
) {
    fun allows(action: LabOrderAction) = action.wire in allowedActions
    fun allowsExternal(action: LabExternalAction) = action.wire in externalActions
}

/** Reads `GET /laboratorio/ordenes` and `GET /me/laboratorio` rows (LabOrderResponse). */
object LaboratoryParser {
    fun orders(value: Any?): List<LaboratoryOrder> {
        val rows = value as? JSONArray ?: return emptyList()
        return (0 until rows.length()).mapNotNull { index -> rows.optJSONObject(index)?.let(::order) }
    }

    private fun order(row: JSONObject): LaboratoryOrder {
        val items = row.optJSONArray("items")?.let { array -> (0 until array.length()).mapNotNull { index -> array.optJSONObject(index)?.let(::item) } } ?: emptyList()
        val actions = strings(row.optJSONArray("allowedActions"))
        return LaboratoryOrder(
            row.optString("id"), row.optString("patientName").ifBlank { "Paciente" }, row.optString("priority"), row.optString("state"), row.optInt("version", 1), items, !row.isNull("reviewedAt"),
            record = row.optString("patientRecord").ifBlank { null }, sex = row.optString("patientSex").ifBlank { null },
            age = if (!row.isNull("patientAge")) "${row.optInt("patientAge")} años" else row.optString("patientAgeRange").takeIf(String::isNotBlank)?.let { "$it años" },
            doctorName = row.optString("doctorName").ifBlank { null }, createdAtMillis = parseMillis(row.optString("createdAt")),
            allowedActions = actions, amendedAtMillis = if (row.isNull("amendedAt")) null else parseMillis(row.optString("amendedAt")),
            external = row.optBoolean("external"), externalPlace = text(row, "externalPlace"), externalInstructions = text(row, "externalInstructions"),
            externalActions = strings(row.optJSONArray("externalActions")),
        )
    }

    private fun strings(array: JSONArray?) = array?.let { (0 until it.length()).mapNotNull { index -> it.optString(index).takeIf(String::isNotBlank) }.toSet() } ?: emptySet()
    private fun text(row: JSONObject, key: String) = if (row.isNull(key)) null else row.optString(key).ifBlank { null }

    private fun item(item: JSONObject): LaboratoryItem {
        val result = item.optJSONObject("result")?.let {
            LaboratoryResult(if (it.isNull("value")) null else it.optDouble("value"), text(it, "text"), it.optString("mark"), it.optInt("version", 1), text(it, "observation"), it.optBoolean("relevant"))
        }
        return LaboratoryItem(item.optString("id"), item.optString("code"), item.optString("name"), result, unit = text(item, "unit"), resultType = text(item, "resultType"))
    }
}

/** RN-25: critical values the doctor still has to review (only orders the API lets this reader review). */
object LabCritical {
    fun pendingReview(orders: List<LaboratoryOrder>) = orders.count { it.allows(LabOrderAction.REVIEW) && LabWorklist.isCritical(it) }
}

object LaboratoryLabels {
    fun state(value: String) = mapOf("pendiente" to "Pendiente", "en_proceso" to "En proceso", "completado" to "Completado", "cancelado" to "Cancelado")[value] ?: value
    /** Value (or text) followed by its mark, for the result rows. */
    fun valueAndMark(result: LaboratoryResult, unit: String? = null) =
        listOfNotNull((result.text ?: result.value?.toString())?.let { value -> if (result.text == null && unit != null) "$value $unit" else value }, mark(result.mark)).joinToString(" · ")
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

    /** Cancel reason bounds, the same as the web (D-13); the API is the guarantee. */
    const val MIN_CANCEL_REASON = 10
    const val MAX_CANCEL_REASON = 500

    fun cancelPath(orderId: String) = "/laboratorio/ordenes/$orderId/cancelar"

    fun cancelReasonError(reason: String): String? = when {
        reason.trim().length < MIN_CANCEL_REASON -> "Indica el motivo, de al menos $MIN_CANCEL_REASON caracteres."
        reason.trim().length > MAX_CANCEL_REASON -> "El motivo no puede pasar de $MAX_CANCEL_REASON caracteres."
        else -> null
    }

    /** `POST /laboratorio/ordenes/{id}/cancelar` body: the order version and the trimmed reason. */
    fun cancelBody(version: Int, reason: String): JSONObject = JSONObject().put("version", version).put("reason", reason.trim())
}
