package sv.edu.catolica.climesa.domain

import org.json.JSONArray
import org.json.JSONObject
import java.time.Clock
import java.time.LocalDate
import java.time.ZoneId

/** Row of `GET /pacientes/selector`: lo mínimo para elegir a alguien en una lista con búsqueda. */
data class PickerPatient(val id: String, val record: String, val name: String, val age: Int?) {
    val detail get() = "Expediente $record" + (age?.let { " · $it años" } ?: "")
}
data class PickerPage(val items: List<PickerPatient>, val hasMore: Boolean)

/** Estados de una franja del día (`estado` de `/citas/disponibilidad`). Solo `FREE` se puede elegir. */
enum class SlotStatus(val wire: String, val defaultReason: String?) {
    FREE("libre", null), BUSY("ocupado", "Ocupado"), NO_SHIFT("sin_turno", "Médico sin turno"), PAST("pasado", "Ya pasó");
    companion object { fun of(wire: String) = entries.firstOrNull { it.wire == wire } ?: NO_SHIFT }
}
data class DaySlot(val start: String, val end: String, val status: SlotStatus, val reason: String?) {
    val selectable get() = status == SlotStatus.FREE
    val label get() = reason ?: status.defaultReason ?: ""
}
/** Médico del selector: sin turno ese día se muestra apagado y con su motivo. */
data class SchedulingDoctor(val id: String, val name: String, val specialty: String?, val hasShift: Boolean, val reason: String?) {
    val detail get() = specialty ?: "Medicina general"
}
/** Cita de `GET /citas` tal como la ve Recepción. */
data class ReceptionAppointment(val id: String, val patientName: String, val doctorName: String, val start: String, val end: String, val state: String, val version: Int)

object ReceptionScheduling {
    /** Día con que abre el formulario de cita: hoy en El Salvador. Abrir en mañana dejaba la cita "de hoy" para el día siguiente. */
    fun today(clock: Clock = Clock.systemUTC()): LocalDate = LocalDate.now(clock.withZone(ZoneId.of("America/El_Salvador")))

    /** El selector busca desde dos caracteres, sin tener en cuenta tildes (la API normaliza igual). */
    const val MIN_QUERY = 2
    const val DEBOUNCE_MS = 250L
    fun canSearch(query: String) = PatientRules.normalize(query).replace(" ", "").length >= MIN_QUERY

    private fun JSONObject.text(key: String) = if (isNull(key)) null else optString(key).takeIf { it.isNotBlank() }
    private fun JSONArray?.objects() = (0 until (this?.length() ?: 0)).mapNotNull { this?.optJSONObject(it) }

    fun pickerPage(json: JSONObject) = PickerPage(
        json.optJSONArray("items").objects().map { PickerPatient(it.getString("id"), it.optString("record"), it.optString("fullName"), if (it.has("age") && !it.isNull("age")) it.optInt("age") else null) },
        json.optBoolean("hasMore"),
    )

    fun doctors(json: JSONObject) = json.optJSONArray("doctors").objects().filter { it.optBoolean("active", true) }.map {
        SchedulingDoctor(
            it.getString("id"), "${it.optString("givenNames")} ${it.optString("surnames")}".trim(), it.text("specialty"),
            hasShift = !it.has("tieneTurno") || it.isNull("tieneTurno") || it.optBoolean("tieneTurno"),
            reason = it.text("motivo"),
        )
    }

    /** Todas las franjas del día; si el servidor es antiguo y no manda `franjas`, las libres de `slots`. */
    fun daySlots(json: JSONObject): List<DaySlot> {
        val all = json.optJSONArray("franjas")
        if (all != null) return all.objects().map { DaySlot(it.optString("start"), it.optString("end"), SlotStatus.of(it.optString("estado")), it.text("motivo")) }
        return json.optJSONArray("slots").objects().map { DaySlot(it.optString("start"), it.optString("end"), SlotStatus.FREE, null) }
    }

    fun appointments(array: JSONArray) = array.objects().map {
        ReceptionAppointment(it.optString("id"), it.optString("patientName"), it.optString("doctorName"), it.optString("start"), it.optString("end"), it.optString("state"), it.optInt("version", 1))
    }

    fun canConfirm(patient: PickerPatient?, doctor: SchedulingDoctor?, slot: DaySlot?) = patient != null && doctor != null && doctor.hasShift && slot != null && slot.selectable

    fun createBody(patient: PickerPatient, doctor: SchedulingDoctor, slot: DaySlot, reason: String): JSONObject =
        JSONObject().put("patientId", patient.id).put("doctorId", doctor.id).put("start", slot.start).put("end", slot.end)
            .apply { if (reason.isNotBlank()) put("reason", reason.trim()) }
}

/** Fila de `GET /cuentas/vinculaciones` (A33): una cuenta de paciente que pide unirse a su expediente. */
data class LinkRequestRow(
    val id: String, val version: Int, val createdAt: String, val email: String, val accountName: String,
    val declaredDui: String, val declaredBirth: String,
    val candidateRecord: String?, val candidateName: String?, val candidateBirth: String?, val candidates: Int,
) {
    val hasCandidate get() = candidateRecord != null
    /** Regla de la pantalla: aprobar solo si un expediente coincide en DUI y nacimiento; la API lo vuelve a validar. */
    val canApprove get() = hasCandidate
    val birthMatches get() = hasCandidate && candidateBirth == declaredBirth
    val guidance get() = when {
        hasCandidate -> "DUI y fecha de nacimiento coinciden con el expediente $candidateRecord. Verifica la identidad antes de aprobar."
        candidates > 1 -> "Más de un expediente coincide: resuelve el posible duplicado antes de aprobar."
        else -> "No hay expediente con ese DUI y esa fecha: búscalo en Pacientes y regístralo si no existe; después aprueba."
    }
}
object ReceptionLinking {
    fun parse(array: JSONArray) = (0 until array.length()).mapNotNull { array.optJSONObject(it) }.map { row ->
        val account = row.optJSONObject("account"); val declared = row.optJSONObject("declared"); val candidate = row.optJSONObject("candidate")
        LinkRequestRow(
            row.optString("id"), row.optInt("version", 1), row.optString("createdAt"), account?.optString("email").orEmpty(), account?.optString("name").orEmpty(),
            declared?.optString("dui").orEmpty(), declared?.optString("birth").orEmpty(),
            candidate?.optString("record"), candidate?.optString("fullName"), candidate?.let { if (it.isNull("birth")) null else it.optString("birth") }, row.optInt("candidates"),
        )
    }
    fun rejectError(reason: String) = if (reason.trim().length < 10) "El motivo debe tener al menos 10 caracteres." else null
    fun approveBody(row: LinkRequestRow) = JSONObject().put("version", row.version)
    fun rejectBody(row: LinkRequestRow, reason: String) = JSONObject().put("version", row.version).put("reason", reason.trim())
}
