package sv.edu.catolica.climesa.domain

import org.json.JSONArray
import org.json.JSONObject

/** Metadata of the external report picked on the phone; [uri] is the document to read when the file is uploaded (T07c). */
data class LabAttachment(val fileName: String, val mimeType: String, val sizeBytes: Long, val sha256: String? = null, val uri: String? = null)

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
data class LabFollowUp(
    val id: String, val orderId: String, val patientName: String, val record: String?, val critical: Boolean, val detail: String, val version: Int, val createdAtMillis: Long?,
    /** C1: the order's version and actions, so the inbox can release it without reading the order list first. */
    val orderVersion: Int? = null, val orderActions: List<String> = emptyList(),
    /** C1: key values of the order, already worded ("Hemoglobina 7.1 g/dL · Crítico bajo"). */
    val values: List<String> = emptyList(),
)

object LabFollowUpRules {
    /** Critical values first, then the oldest; the API already sorts, the app keeps it if a live reload reorders. */
    fun parse(value: Any?): List<LabFollowUp> {
        val rows = value as? JSONArray ?: return emptyList()
        return (0 until rows.length()).mapNotNull { index ->
            rows.optJSONObject(index)?.let { row ->
                val actions = row.optJSONArray("orderActions")?.let { a -> (0 until a.length()).map { a.optString(it) } }.orEmpty()
                val values = row.optJSONArray("values")?.let { a -> (0 until a.length()).mapNotNull { a.optJSONObject(it)?.let(::valueLine) } }.orEmpty()
                LabFollowUp(row.optString("id"), row.optString("orderId"), row.optString("patientName").ifBlank { "Paciente" }, row.optString("patientRecord").ifBlank { null },
                    row.optString("reason") == "critico", row.optString("detail"), row.optInt("version", 1), parseMillis(row.optString("createdAt")),
                    if (row.has("orderVersion") && !row.isNull("orderVersion")) row.optInt("orderVersion") else null, actions, values)
            }
        }.filter { it.id.isNotBlank() }.sortedWith(compareBy<LabFollowUp>({ if (it.critical) 0 else 1 }, { it.createdAtMillis ?: Long.MAX_VALUE }))
    }

    /** "Glucosa 130 mg/dL · Alto"; a text result shows as typed. */
    private fun valueLine(v: JSONObject): String? {
        val name = v.optString("name").ifBlank { v.optString("code") }.ifBlank { return null }
        val text = if (v.isNull("text")) null else v.optString("text").ifBlank { null }
        val number = if (!v.has("value") || v.isNull("value")) null else v.optDouble("value").takeIf { !it.isNaN() }
        val shown = text ?: number?.let { n -> (if (n == Math.floor(n) && !n.isInfinite()) n.toLong().toString() else n.toString()) + (if (v.isNull("unit")) "" else v.optString("unit").takeIf { it.isNotBlank() }?.let { " $it" }.orEmpty()) }
        val mark = if (v.isNull("mark")) null else v.optString("mark").ifBlank { null }?.let(LaboratoryLabels::mark)
        return listOfNotNull("$name${shown?.let { " $it" }.orEmpty()}", mark).joinToString(" · ")
    }

    /** The lab observation is a note from the lab to the doctor: never shown in the patient's own view. */
    fun labNote(result: LaboratoryResult, ownView: Boolean): String? = if (ownView) null else result.observation

    fun reviewPath(id: String) = "/laboratorio/pendientes/$id/revisar"
    fun reviewBody(version: Int): JSONObject = JSONObject().put("version", version)
}

/** C1: one inbox row per order, with every open item of that order (a critical value and an observation become one row). */
data class LabInboxRow(
    val orderId: String, val patientName: String, val record: String?, val critical: Boolean, val orderVersion: Int?, val orderActions: List<String>,
    val keyValues: List<String>, val details: List<String>, val followUpIds: List<String>,
    /** D71: the values that come from a critical item. */
    val criticalValues: List<String> = emptyList(),
) {
    /** "Revisar y liberar" needs the order version and the API's `revisar` action; an older API sends neither. */
    val canRelease get() = orderVersion != null && "revisar" in orderActions
}

/**
 * C1 (sweep #12): the doctor's results inbox. Releasing goes through `POST /laboratorio/ordenes/{id}/revisar`; the released
 * body is `{version}` and the API proposes the follow-up appointment when `followUp` is left out, so the body only grows when
 * the doctor turns the follow-up off or leaves a note for the patient.
 */
object LabInbox {
    const val NOTE_MAX = 500

    fun rows(items: List<LabFollowUp>): List<LabInboxRow> = items.groupBy { it.orderId }.map { (orderId, group) ->
        val first = group.first()
        LabInboxRow(orderId, first.patientName, first.record, group.any { it.critical }, group.firstNotNullOfOrNull { it.orderVersion },
            group.flatMap { it.orderActions }.distinct(), group.flatMap { it.values }.distinct(), group.map { it.detail }.filter { it.isNotBlank() }.distinct(), group.map { it.id },
            group.filter { it.critical }.flatMap { it.values }.distinct())
    }.sortedWith(compareBy<LabInboxRow>({ if (it.critical) 0 else 1 }, { row -> items.indexOfFirst { it.orderId == row.orderId } }))

    fun releasePath(orderId: String) = "/laboratorio/ordenes/$orderId/revisar"

    fun releaseBody(version: Int, followUp: Boolean, note: String): JSONObject = JSONObject().put("version", version).apply {
        if (!followUp) put("followUp", false)
        note.trim().takeIf { it.isNotEmpty() }?.let { put("patientNote", it.take(NOTE_MAX)) }
    }

    /** What happened with the follow-up appointment; null when the doctor did not ask for one. */
    fun followUpOutcome(proposalId: String?, skipped: String?): String? = when {
        proposalId != null -> "Se propuso a Recepción una cita de seguimiento."
        skipped == "hospitalizado" -> "Sin cita de seguimiento: el paciente está hospitalizado."
        skipped == "ya_propuesta" -> "Ya había una cita de seguimiento propuesta."
        skipped == "sin_consulta" -> "Sin cita de seguimiento: la orden no viene de una consulta."
        else -> null
    }

    fun releasedNotice(patientName: String, answer: Any?): String {
        val body = answer as? JSONObject
        fun text(key: String) = body?.takeIf { it.has(key) && !it.isNull(key) }?.optString(key)?.ifBlank { null }
        return listOfNotNull("Resultados de $patientName liberados.", followUpOutcome(text("followUpProposalId"), text("followUpSkipped"))).joinToString(" ")
    }
}

/**
 * S10 «Citas de seguimiento por confirmar» (`GET /laboratorio/seguimientos`): when an order's results arrive, the system
 * proposes an appointment with the doctor who asked for them. Reception never sees exams or values.
 */
data class LabProposal(
    val id: String, val orderId: String, val patientId: String, val patientName: String, val patientRecord: String?,
    val doctorId: String, val doctorName: String?, val priority: String, val resultsAt: String, val createdAt: String, val version: Int,
) {
    val urgent get() = priority == "urgente"
    /** "Exp. EXP-1 · Con Dra. Prueba · Resultados del 16/11/2026 09:00", the same line as the web row. */
    val detail get() = listOfNotNull(patientRecord?.let { "Exp. $it" }, doctorName?.let { "Con $it" }, "Resultados del ${LabProposalRules.dateTime(resultsAt)}").joinToString(" · ")
}

object LabProposalRules {
    const val PATH = "/laboratorio/seguimientos"
    /** Reason of the follow-up appointment, the same text the web sends. */
    const val REASON = "Seguimiento de resultados de laboratorio"
    const val DISCARD_MIN = 10
    const val DISCARD_MAX = 500
    /** R4: "16 nov, 09:00", without the year (follow-ups are about this week). */
    private val formatter = java.time.format.DateTimeFormatter.ofPattern("d MMM, HH:mm", java.util.Locale.forLanguageTag("es-SV"))
    private val zone = java.time.ZoneId.of("America/El_Salvador")

    fun dateTime(iso: String) = runCatching { formatter.format(java.time.Instant.parse(iso).atZone(zone)).replace(".", "") }.getOrDefault(iso)

    private fun JSONObject.text(key: String) = if (!has(key) || isNull(key)) null else optString(key).takeIf { it.isNotBlank() }

    fun parse(value: Any?): List<LabProposal> {
        val rows = value as? JSONArray ?: return emptyList()
        return (0 until rows.length()).mapNotNull { rows.optJSONObject(it) }.mapNotNull { row ->
            val id = row.text("id") ?: return@mapNotNull null
            LabProposal(id, row.optString("orderId"), row.optString("patientId"), row.text("patientName") ?: "Paciente", row.text("patientRecord"),
                row.optString("doctorId"), row.text("doctorName"), row.text("priority") ?: "rutina", row.optString("resultsAt"), row.optString("createdAt"), row.optInt("version", 1))
        }
    }

    fun confirmPath(id: String) = "$PATH/$id/confirmar"
    fun discardPath(id: String) = "$PATH/$id/descartar"
    fun confirmBody(version: Int, appointmentId: String): JSONObject = JSONObject().put("version", version).put("appointmentId", appointmentId)
    fun discardBody(version: Int, reason: String): JSONObject = JSONObject().put("version", version).put("reason", reason.trim())
    fun discardError(reason: String): String? = when {
        reason.trim().length < DISCARD_MIN -> "Escribe el motivo, de al menos $DISCARD_MIN caracteres."
        reason.trim().length > DISCARD_MAX -> "El motivo no puede pasar de $DISCARD_MAX caracteres."
        else -> null
    }

    /** `POST /citas` for the proposal: same patient and doctor, the chosen free slot and the follow-up reason. */
    fun appointmentBody(proposal: LabProposal, slot: DaySlot): JSONObject =
        JSONObject().put("patientId", proposal.patientId).put("doctorId", proposal.doctorId).put("start", slot.start).put("end", slot.end).put("reason", REASON)
}

/** Worklist groups in the order work happens; what is closed starts folded. Same groups as the web list. */
enum class LabGroup(val label: String, val folded: Boolean) {
    IN_PROCESS("En Proceso", false), SAMPLE("Por tomar muestra", false), EXTERNAL("Externas: esperan el informe", false),
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
