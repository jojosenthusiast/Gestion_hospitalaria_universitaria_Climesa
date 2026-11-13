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
)

