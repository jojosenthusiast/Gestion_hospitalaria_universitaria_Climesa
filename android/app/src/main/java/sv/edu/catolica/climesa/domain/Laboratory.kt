package sv.edu.catolica.climesa.domain

import org.json.JSONArray
import org.json.JSONObject

/** [observation] is the lab note on the value; [relevant] means it opened an item in the doctor's "Resultados por revisar" (S10). */
data class LaboratoryResult(val value: Double?, val text: String?, val mark: String, val version: Int, val observation: String? = null, val relevant: Boolean = false)
/** C-3: reference and critical limits valid for this patient; the API sends them only to staff who see values. */
data class LabRange(val min: Double?, val max: Double?, val criticalLow: Double?, val criticalHigh: Double?)

/** [resultType] is `numerico` or `texto` (null on older API rows: then a unit means numeric). [range] is null for the patient. */
data class LaboratoryItem(val id: String, val code: String, val name: String, val result: LaboratoryResult?, val unit: String? = null, val resultType: String? = null, val range: LabRange? = null) {
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
    /** R7 C1: the doctor's note for the patient, only once released; [cancellationReason] only on a cancelled order. */
    val patientNote: String? = null, val cancellationReason: String? = null,
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
            patientNote = text(row, "patientNote"), cancellationReason = text(row, "cancellationReason"),
        )
    }

    private fun strings(array: JSONArray?) = array?.let { (0 until it.length()).mapNotNull { index -> it.optString(index).takeIf(String::isNotBlank) }.toSet() } ?: emptySet()
    private fun text(row: JSONObject, key: String) = if (row.isNull(key)) null else row.optString(key).ifBlank { null }

    private fun item(item: JSONObject): LaboratoryItem {
        val result = item.optJSONObject("result")?.let {
            LaboratoryResult(if (it.isNull("value")) null else it.optDouble("value"), text(it, "text"), it.optString("mark"), it.optInt("version", 1), text(it, "observation"), it.optBoolean("relevant"))
        }
        val range = item.optJSONObject("referenceRange")?.let { LabRange(number(it, "min"), number(it, "max"), number(it, "criticalLow"), number(it, "criticalHigh")) }
        return LaboratoryItem(item.optString("id"), item.optString("code"), item.optString("name"), result, unit = text(item, "unit"), resultType = text(item, "resultType"), range = range)
    }
    private fun number(row: JSONObject, key: String) = if (row.isNull(key) || !row.has(key)) null else row.optDouble(key).takeUnless { it.isNaN() }
}

/** RN-25: critical values the doctor still has to review (only orders the API lets this reader review). */
object LabCritical {
    fun pendingReview(orders: List<LaboratoryOrder>) = orders.count { it.allows(LabOrderAction.REVIEW) && LabWorklist.isCritical(it) }
}

object LaboratoryLabels {
    fun state(value: String) = mapOf("pendiente" to "Pendiente", "en_proceso" to "En Proceso", "completado" to "Completado", "cancelado" to "Cancelado")[value] ?: value
    /** One es-SV number format for lab values on every screen («13.5», «452», at most three decimals, no grouping). */
    fun number(value: Double): String = java.text.NumberFormat.getNumberInstance(java.util.Locale.forLanguageTag("es-SV")).apply { maximumFractionDigits = 3; isGroupingUsed = false }.format(value)
    /** The value (or text) of a result; a number carries its unit when the exam has one («5.1 g/dL»). */
    fun value(result: LaboratoryResult, unit: String? = null): String? = result.text ?: result.value?.let { n -> if (unit.isNullOrBlank()) number(n) else "${number(n)} $unit" }
    /** Value (or text) followed by its mark, for the result rows. */
    fun valueAndMark(result: LaboratoryResult, unit: String? = null) = listOfNotNull(value(result, unit), mark(result.mark)).joinToString(" · ")
    /** «12–15.5 · crítico < 7 o > 20» for doctors; null without limits. */
    fun rangeText(range: LabRange?): String? {
        range ?: return null
        val normal = when {
            range.min != null && range.max != null -> "${number(range.min)}–${number(range.max)}"
            range.max != null -> "≤ ${number(range.max)}"
            range.min != null -> "≥ ${number(range.min)}"
            else -> null
        }
        val limits = listOfNotNull(range.criticalLow?.let { "< ${number(it)}" }, range.criticalHigh?.let { "> ${number(it)}" }).joinToString(" o ")
        return listOfNotNull(normal, limits.takeIf(String::isNotEmpty)?.let { "crítico $it" }).joinToString(" · ").ifEmpty { null }
    }
    /**
     * D1: the range a patient sees next to a released result, never the critical limits (the API does not send them
     * to the patient either). «12–15.5»; null without limits.
     */
    fun patientRangeText(range: LabRange?): String? = range?.let { rangeText(it.copy(criticalLow = null, criticalHigh = null)) }
    /** D1: the result fell outside its reference range (high, low or critical); `sin_rango` and `normal` are not. */
    fun outOfRange(mark: String?) = mark in setOf("alto", "bajo", "critico_alto", "critico_bajo")
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

/** The patient's "Mis exámenes": open orders always show; closed ones (released or cancelled) beyond the newest [KEEP] fold under "Ver N más". */
object LabPatientList {
    const val KEEP = 3
    private val day = java.time.format.DateTimeFormatter.ofPattern("d MMM", java.util.Locale.forLanguageTag("es-SV")).withZone(java.time.ZoneId.of("America/El_Salvador"))

    private fun closed(order: LaboratoryOrder) = order.state == "cancelado" || (order.state == "completado" && order.reviewed)

    /** (shown, folded), keeping the incoming order. */
    fun fold(orders: List<LaboratoryOrder>): Pair<List<LaboratoryOrder>, List<LaboratoryOrder>> {
        val keep = orders.filter(::closed).take(KEEP).toSet()
        return orders.partition { !closed(it) || it in keep }
    }

    /** Short date without year («16 nov»); empty when unknown. */
    fun shortDate(millis: Long?): String = millis?.let { day.format(java.time.Instant.ofEpochMilli(it)) }.orEmpty()
}
