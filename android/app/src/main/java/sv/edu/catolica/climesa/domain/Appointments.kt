package sv.edu.catolica.climesa.domain

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
