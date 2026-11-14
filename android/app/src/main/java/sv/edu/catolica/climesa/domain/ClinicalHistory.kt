package sv.edu.catolica.climesa.domain

import org.json.JSONArray
import org.json.JSONObject

data class HistoryDiagnosis(val code: String, val description: String, val principal: Boolean)
data class HistoryMedication(val medication: String, val dose: String, val route: String, val frequency: String, val duration: String)
data class HistoryConsultation(val id: String, val state: String, val date: String, val doctor: String, val reason: String, val plan: String, val diagnoses: List<HistoryDiagnosis>, val prescriptions: List<HistoryMedication>)
data class HistoryAdmission(val id: String, val state: String, val date: String, val doctor: String)
/** Response of `GET /pacientes/{id}/historial` (spec 106). `access`: propio, relacion or acceso_excepcional. */
data class ClinicalHistory(val patientName: String, val record: String, val access: String, val consultations: List<HistoryConsultation>, val laboratory: List<LaboratoryOrder>, val admissions: List<HistoryAdmission>)

/** Pure parsing of the history so the A08/A22 ViewModel can be tested on the JVM. */
object ClinicalHistoryParser {
    fun parse(value: Any?): ClinicalHistory? {
        val json = value as? JSONObject ?: return null
        val patient = json.optJSONObject("patient") ?: JSONObject()
        return ClinicalHistory(
            patient.optString("fullName"),
            patient.optString("record"),
            json.optString("access"),
            objects(json.optJSONArray("consultations")).map(::consultation),
            objects(json.optJSONArray("laboratory")).map(::order),
            objects(json.optJSONArray("admissions")).map { HistoryAdmission(it.optString("id"), it.optString("state"), it.optString("createdAt").take(10), it.optJSONObject("doctor")?.optString("name").orEmpty()) },
        )
    }

    private fun consultation(row: JSONObject) = HistoryConsultation(
        row.optString("id"),
        row.optString("state"),
        (if (row.isNull("signedAt")) row.optString("startedAt") else row.optString("signedAt")).take(10),
        row.optJSONObject("doctor")?.optString("name").orEmpty(),
        if (row.isNull("reason")) "" else row.optString("reason"),
        if (row.isNull("plan")) "" else row.optString("plan"),
        objects(row.optJSONArray("diagnoses")).map { HistoryDiagnosis(it.optString("code"), it.optString("description"), it.optBoolean("principal")) },
        objects(row.optJSONArray("prescriptions")).flatMap { objects(it.optJSONArray("items")) }.map { HistoryMedication(it.optString("medication"), it.optString("dose"), it.optString("route"), it.optString("frequency"), it.optString("duration")) },
    )

    private fun order(row: JSONObject): LaboratoryOrder {
        val items = objects(row.optJSONArray("items")).map { item ->
            val result = item.optJSONObject("result")?.let { LaboratoryResult(if (it.isNull("value")) null else it.optDouble("value"), it.optString("text").takeIf { text -> text.isNotBlank() && text != "null" }, it.optString("mark"), 1) }
            LaboratoryItem(item.optString("id"), item.optString("code"), item.optString("name"), result)
        }
        return LaboratoryOrder(row.optString("id"), "", row.optString("priority"), row.optString("state"), 1, items, !row.isNull("reviewedAt"))
    }

    private fun objects(array: JSONArray?): List<JSONObject> = if (array == null) emptyList() else (0 until array.length()).mapNotNull(array::optJSONObject)
}

/** History refreshes when a consultation or laboratory order changes (thin events, never clinical data). */
object HistoryEvents {
    fun matches(event: EventoDominio) = ConsultationEvents.matches(event) || LaboratoryEvents.matches(event) || AdmissionEvents.matches(event)
}
