package sv.edu.catolica.climesa.domain

import org.json.JSONObject

data class PatientAppointment(
    val id: String,
    val doctorName: String,
    val start: String,
    val end: String,
    val state: String,
    val reason: String?,
    val version: Int,
)

data class AppointmentDoctor(
    val id: String,
    val name: String,
    val specialty: String?,
    val hasShift: Boolean = true,
    val reason: String? = null,
)

data class AppointmentSlot(
    val start: String,
    val end: String,
)

data class AppointmentWorkPeriod(
    val start: String,
    val end: String,
)

/** `POST /citas/solicitudes`: the patient asks for a slot; Recepción confirms or rejects it. */
object PatientAppointmentRules {
    fun requestBody(doctorId: String, slot: AppointmentSlot, reason: String): JSONObject = JSONObject()
        .put("doctorId", doctorId).put("start", slot.start).put("end", slot.end)
        .apply { if (reason.isNotBlank()) put("reason", reason.trim()) }
}
