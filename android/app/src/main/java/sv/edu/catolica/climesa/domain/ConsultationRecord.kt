package sv.edu.catolica.climesa.domain

import org.json.JSONArray
import org.json.JSONObject

/** A diagnosis already registered in the consultation (`diagnoses` of `GET /consultas/{id}/detalle`). */
data class RecordedDiagnosis(val id: String, val code: String, val principal: Boolean, val note: String?)

/** One medication of a prescription already issued (`prescriptions[].items`). */
data class RecordedMedication(val medication: String, val dose: String, val frequency: String, val duration: String)

/** Row 3: one set of vital signs already taken in this consultation (`vitalSigns` of the detail), usually by the assistant. */
data class RecordedVitals(val id: String, val takenAt: String, val text: String)

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
    /** False while this consultation's order list could not be read: ordering waits until it is known. */
    val labOrdersKnown: Boolean = true,
    /** Vital signs taken in this consultation, newest first. */
    val vitals: List<RecordedVitals> = emptyList(),
) {
    /** Exams of a non-cancelled order of this consultation: the catalog does not offer them again. */
    fun alreadyOrdered(exam: LabExam): Boolean = exam.id in orderedIds || labOrders.any { it.state != "cancelado" && (exam.id in it.examIds || exam.code in it.examCodes) }
}

object ConsultationRecordRules {
    fun diagnoses(detail: Any?): List<RecordedDiagnosis> = rows((detail as? JSONObject)?.optJSONArray("diagnoses")).map {
        RecordedDiagnosis(it.optString("id"), it.optString("code"), it.optBoolean("principal"), text(it, "note"))
    }

    /**
     * Row 3: "PA 120/80 · FC 72 · FR 16 · T 36.8 °C · SpO₂ 98 %" per set of `vitalSigns`, newest first (same text as iOS
     * `vitalsText`). Temperature, weight and height come as decimal text.
     */
    fun vitals(detail: Any?): List<RecordedVitals> = rows((detail as? JSONObject)?.optJSONArray("vitalSigns")).map { v ->
        val parts = buildList {
            val sys = int(v, "systolic"); val dia = int(v, "diastolic")
            if (sys != null && dia != null) add("PA $sys/$dia")
            int(v, "heartRate")?.let { add("FC $it") }
            int(v, "respiratoryRate")?.let { add("FR $it") }
            text(v, "temperature")?.let { add("T $it °C") }
            int(v, "oxygenSaturation")?.let { add("SpO₂ $it %") }
            text(v, "weightKg")?.let { add("$it kg") }
            text(v, "heightCm")?.let { add("$it cm") }
        }
        RecordedVitals(v.optString("id"), v.optString("takenAt"), parts.ifEmpty { listOf("—") }.joinToString(" · "))
    }.sortedByDescending { it.takenAt }

    /**
     * Row 5: a new diagnosis starts as principal only when the consultation has none yet, so a single diagnosis is principal
     * and a second one never demotes the first by default. Unknown record (still loading): not principal.
     */
    fun defaultPrincipal(record: ConsultationRecord?): Boolean = record?.diagnoses?.none { it.principal } ?: false

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
    fun signSummary(record: ConsultationRecord?): String = signCounts(record).joinToString(" · ") { it.text }

    /** One count of the signature summary; [empty] marks a zero the dialog highlights in amber (D35, owner). */
    data class SignCount(val text: String, val empty: Boolean)

    /** D35 (owner): signing is never blocked by zero counts, but each zero is flagged so the doctor notices it. */
    fun signCounts(record: ConsultationRecord?): List<SignCount> {
        val r = record ?: ConsultationRecord("")
        val exams = r.labOrders.filter { it.state != "cancelado" }.sumOf { it.exams.size }
        return listOf(
            SignCount(plural(r.diagnoses.size, "diagnóstico", "diagnósticos"), r.diagnoses.isEmpty()),
            SignCount(plural(r.medications.size, "medicamento", "medicamentos"), r.medications.isEmpty()),
            SignCount(plural(exams, "examen", "exámenes"), exams == 0),
        )
    }

    /** D35: the success line says "cita atendida" only when the consultation came from an appointment. */
    fun signedNotice(fromAppointment: Boolean) = if (fromAppointment) "Consulta firmada y cita marcada como atendida." else "Consulta firmada."

    /**
     * Preconditions S7: why «Firmar consulta» is disabled, said under it (same texts as iOS); null when it can be signed.
     * The API refuses a signature with an empty motive or plan.
     */
    fun signBlocker(reason: String, plan: String): String? = when {
        reason.isBlank() && plan.isBlank() -> "Completa el motivo y el plan para firmar."
        reason.isBlank() -> "Completa el motivo para firmar."
        plan.isBlank() -> "Completa el plan para firmar."
        else -> null
    }

    private fun plural(n: Int, one: String, many: String) = "$n ${if (n == 1) one else many}"
    private fun rows(array: JSONArray?): List<JSONObject> = array?.let { a -> (0 until a.length()).mapNotNull { a.optJSONObject(it) } }.orEmpty()
    private fun int(row: JSONObject, key: String): Int? = if (!row.has(key) || row.isNull(key)) null else row.optDouble(key).takeIf { !it.isNaN() }?.toInt()
    private fun text(row: JSONObject, key: String) = if (row.isNull(key)) null else row.optString(key).takeIf { it.isNotBlank() }
}
