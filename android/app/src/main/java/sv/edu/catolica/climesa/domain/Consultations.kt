package sv.edu.catolica.climesa.domain

data class MedicalAppointment(
    val appointmentId: String,
    val patientId: String,
    val patientName: String,
    val start: String,
    val end: String,
    val appointmentState: String,
    val reason: String?,
    val consultationId: String?,
    val consultationState: String?,
    val consultationReason: String?,
    val physicalExam: String?,
    val plan: String?,
    val version: Int,
    /** Queue number when the consultation was started from the queue instead of an appointment. */
    val ticketNumber: Int? = null,
) {
    /** Stable key of the row/dialog: the appointment, or `consulta:<id>:<number>` for a consultation opened by id. */
    val key: String get() = appointmentId.ifBlank { "consulta:$consultationId:${ticketNumber ?: ""}" }
}

/** Number of the day's queue that the doctor can attend; `consultationId` is set only for the doctor's own consultation. */
data class QueueConsultation(
    val ticketId: String,
    val number: Int,
    val patientName: String,
    val state: String,
    val consultationId: String?,
    val consultationState: String?,
)

object ConsultationResume {
    /** Called and in-attention numbers, ordered by number: the ones a doctor starts or resumes. */
    fun attendable(rows: List<QueueConsultation>) = rows.filter { it.state == "llamado" || it.state == "en_atencion" }.sortedBy { it.number }

    fun parseQueue(value: Any): List<QueueConsultation> {
        val rows = value as? org.json.JSONArray ?: return emptyList()
        return (0 until rows.length()).mapNotNull { i -> rows.optJSONObject(i)?.let { row ->
            QueueConsultation(row.optString("id"), row.optInt("numero"), row.optString("patientName").takeIf { it.isNotBlank() && it != "null" } ?: "Paciente no identificado", row.optString("state"), row.text("consultationId"), row.text("consultationState"))
        } }
    }

    /** `consultaId` of a 409 `consulta_ya_iniciada`; the API includes it only when the open consultation is the doctor's own. */
    fun resumableId(code: String?, body: String?): String? {
        if (code != "consulta_ya_iniciada" || body.isNullOrBlank()) return null
        return runCatching { org.json.JSONObject(body).optString("consultaId") }.getOrNull()?.takeIf { it.isNotBlank() }
    }

    /** `GET /consultas/{id}/detalle` as an editable consultation item. */
    fun fromDetail(value: Any, number: Int?): MedicalAppointment? {
        val c = (value as? org.json.JSONObject)?.optJSONObject("consultation") ?: return null
        val id = c.text("id") ?: return null
        return MedicalAppointment("", c.optString("patientId"), c.text("patientName") ?: "Paciente", "", "", "", null, id, c.text("state"), c.text("reason"), c.text("physicalExam"), c.text("plan"), c.optInt("version", 1), number)
    }

    private fun org.json.JSONObject.text(name: String) = if (isNull(name)) null else optString(name).takeIf { it.isNotBlank() }
}
