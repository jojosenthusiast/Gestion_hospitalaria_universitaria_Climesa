package sv.edu.catolica.climesa.domain

import org.json.JSONArray
import org.json.JSONObject

/**
 * Actions the API may offer on one appointment (`allowedActions` / `blockedActions` of `GET /citas` and `GET /consultas/agenda`).
 * [wire] is the `AccionCita` value of the contract; unknown values are ignored.
 */
enum class AppointmentAction(val wire: String, val label: String, val needsReason: Boolean) {
    CONFIRM("confirmar", "Confirmar", false),
    REJECT("rechazar", "Rechazar", true),
    RESCHEDULE("reprogramar", "Reprogramar", false),
    CANCEL("cancelar", "Cancelar cita", true),
    NO_SHOW("no_asistio", "No asistió", false),
    ACCEPT_RESCHEDULE("aceptar_reprogramacion", "Aceptar nuevo horario", false),
    REJECT_RESCHEDULE("rechazar_reprogramacion", "Rechazar nuevo horario", true),
    START_CONSULTATION("iniciar_consulta", "Iniciar consulta", false),
    ;

    /** Accepting or rejecting a patient's reschedule request (acts on the request, not on the appointment). */
    val decidesReschedule get() = this == ACCEPT_RESCHEDULE || this == REJECT_RESCHEDULE

    companion object { fun of(wire: String?): AppointmentAction? = entries.firstOrNull { it.wire == wire } }
}

/** Latest reschedule request of an appointment (`reschedule` of `GET /citas`). */
data class RescheduleRequest(
    val id: String,
    val start: String,
    val end: String,
    val state: String,
    val origin: String?,
    val reason: String?,
    val rejectionReason: String?,
    val version: Int,
) {
    val pending get() = state == "pendiente"
}

/** Server-driven action lists shared by appointments, the agenda and the queue. */
object ServerActions {
    private fun JSONObject.textOf(key: String) = if (isNull(key)) null else optString(key).takeIf { it.isNotBlank() }

    /** `allowedActions` as raw wire values, in the server order. */
    fun allowed(row: JSONObject): List<String> {
        val array = row.optJSONArray("allowedActions") ?: return emptyList()
        return (0 until array.length()).mapNotNull { array.optString(it).takeIf(String::isNotBlank) }
    }

    /** `blockedActions` as wire value to the Spanish reason the screen shows next to the disabled action. */
    fun blocked(row: JSONObject): Map<String, String> {
        val array: JSONArray = row.optJSONArray("blockedActions") ?: return emptyMap()
        val out = linkedMapOf<String, String>()
        for (i in 0 until array.length()) {
            val item = array.optJSONObject(i) ?: continue
            val action = item.textOf("action") ?: continue
            out.putIfAbsent(action, item.textOf("reason") ?: "No disponible por ahora.")
        }
        return out
    }

    fun appointmentAllowed(row: JSONObject): List<AppointmentAction> = allowed(row).mapNotNull(AppointmentAction::of).distinct()
    fun appointmentBlocked(row: JSONObject): Map<AppointmentAction, String> =
        blocked(row).mapNotNull { (k, v) -> AppointmentAction.of(k)?.let { it to v } }.toMap()

    fun reschedule(row: JSONObject): RescheduleRequest? {
        val r = row.optJSONObject("reschedule") ?: return null
        val id = r.textOf("id") ?: return null
        return RescheduleRequest(id, r.optString("start"), r.optString("end"), r.optString("state"), r.textOf("origin"), r.textOf("reason"), r.textOf("rejectionReason"), r.optInt("version", 1))
    }

    fun text(row: JSONObject, key: String) = row.textOf(key)
}

/**
 * CITA-04: the screen offers only what the API says it accepts now (`allowedActions`), and shows the reason of what it
 * blocks (`blockedActions`). The client never guesses from the state or the clock; the API repeats every rule.
 */
object AppointmentActions {
    const val REASON_MIN = 10
    const val REASON_MAX = 500
    const val EXPIRED = "vencida"
    const val RESCHEDULED = "reprogramada"

    /** Order of the buttons of one Recepción row. Starting a consultation is the doctor's, never offered here. */
    private val receptionOrder = listOf(
        AppointmentAction.CONFIRM, AppointmentAction.REJECT, AppointmentAction.ACCEPT_RESCHEDULE, AppointmentAction.REJECT_RESCHEDULE,
        AppointmentAction.RESCHEDULE, AppointmentAction.CANCEL, AppointmentAction.NO_SHOW,
    )

    /** Deciding a reschedule needs the request's own id (`/citas/reprogramaciones/{id}`): without one it is not offered. */
    fun available(a: ReceptionAppointment): List<AppointmentAction> =
        receptionOrder.filter { it in a.allowedActions && (!it.decidesReschedule || a.reschedule != null) }
    fun blocked(a: ReceptionAppointment): List<Pair<AppointmentAction, String>> =
        receptionOrder.filter { it !in a.allowedActions }.mapNotNull { action -> a.blockedActions[action]?.let { action to it } }

    /** Live counter of a reason field: "N/500 ✓" when valid, "Faltan N caracteres" while short. */
    fun counter(reason: String, required: Boolean = true): String {
        val length = reason.trim().length
        return if (required && length < REASON_MIN) "Faltan ${REASON_MIN - length} caracteres" else "$length/$REASON_MAX ✓"
    }

    fun reasonError(action: AppointmentAction, reason: String): String? {
        if (!action.needsReason) return if (reason.trim().length > REASON_MAX) "El comentario admite hasta $REASON_MAX caracteres." else null
        val length = reason.trim().length
        return when {
            length < REASON_MIN -> "Escribe el motivo, de al menos $REASON_MIN caracteres."
            length > REASON_MAX -> "El motivo admite hasta $REASON_MAX caracteres."
            else -> null
        }
    }

    /**
     * [rescheduleId] is required for the decision on a reschedule request: the appointment id there would be a 404, so
     * [available] hides those actions when the row carries no request and the view model never sends them.
     */
    fun path(action: AppointmentAction, id: String, rescheduleId: String? = null) = when (action) {
        AppointmentAction.CONFIRM -> "/citas/solicitudes/$id/confirmar"
        AppointmentAction.REJECT -> "/citas/solicitudes/$id/rechazar"
        AppointmentAction.CANCEL -> "/citas/$id/cancelar"
        AppointmentAction.RESCHEDULE -> "/citas/$id/reprogramar"
        AppointmentAction.NO_SHOW -> "/citas/$id/no-asistio"
        AppointmentAction.ACCEPT_RESCHEDULE -> "/citas/reprogramaciones/${requireNotNull(rescheduleId) { "rescheduleId" }}/aceptar"
        AppointmentAction.REJECT_RESCHEDULE -> "/citas/reprogramaciones/${requireNotNull(rescheduleId) { "rescheduleId" }}/rechazar"
        AppointmentAction.START_CONSULTATION -> "/consultas"
    }

    /** API field of the typed text: `rejectionReason` for a rejection, `reason` for a cancellation or a no-show note. */
    fun reasonField(action: AppointmentAction) = when (action) {
        AppointmentAction.REJECT, AppointmentAction.REJECT_RESCHEDULE -> "rejectionReason"
        else -> "reason"
    }

    /**
     * Body of the command. [version] is the appointment version, or the reschedule request version for
     * [AppointmentAction.ACCEPT_RESCHEDULE] / [AppointmentAction.REJECT_RESCHEDULE]. [slot] is the new time of a reschedule.
     */
    fun body(action: AppointmentAction, version: Int, reason: String, slot: DaySlot? = null): JSONObject = JSONObject().put("version", version).apply {
        if (action.needsReason) put(reasonField(action), reason.trim())
        if (action == AppointmentAction.NO_SHOW && reason.isNotBlank()) put("reason", reason.trim())
        if (action == AppointmentAction.RESCHEDULE && slot != null) put("start", slot.start).put("end", slot.end)
    }

    fun doneNotice(action: AppointmentAction, patient: String, rescheduleState: String? = null) = when (action) {
        AppointmentAction.CONFIRM -> "Solicitud de $patient confirmada."
        AppointmentAction.REJECT -> "Solicitud de $patient rechazada."
        AppointmentAction.CANCEL -> "Cita de $patient cancelada."
        AppointmentAction.RESCHEDULE -> if (rescheduleState == "pendiente") "Solicitud de reprogramación enviada." else "Cita de $patient reprogramada."
        AppointmentAction.NO_SHOW -> "Cita de $patient marcada como no asistida."
        AppointmentAction.ACCEPT_RESCHEDULE -> "Nuevo horario de $patient aceptado."
        AppointmentAction.REJECT_RESCHEDULE -> "Nuevo horario de $patient rechazado."
        AppointmentAction.START_CONSULTATION -> "Consulta iniciada."
    }
}

/** Spanish text for the stable business error codes of appointments and the queue; null keeps the generic API message. */
object BusinessErrors {
    fun message(code: String?): String? = when (code) {
        "cita_con_consulta" -> "La cita ya tiene una consulta iniciada; no se puede cambiar."
        "cita_fuera_de_dia" -> "La consulta solo se puede iniciar el día de la cita."
        "fila_llamados_insuficientes" -> "Todavía no se completan los llamados necesarios para marcar la ausencia."
        "fila_sin_espera" -> "No hay números en espera en este servicio."
        "solicitudes_pendientes_max" -> "Ya tienes el máximo de solicitudes pendientes. Espera a que Recepción las atienda."
        "cancelacion_fuera_de_plazo" -> "Ya pasó el plazo para cancelar o reprogramar esta cita."
        "franja_ocupada" -> "Esa franja se acaba de ocupar. Elige otra."
        "vinculacion_resuelta" -> "La vinculación ya fue resuelta por otra persona. Se actualizó la lista."
        "sin_vinculacion" -> "Tu cuenta todavía no está vinculada a un expediente."
        "expediente_ya_vinculado" -> "Ese expediente ya está vinculado a otra cuenta."
        "cuenta_ya_vinculada" -> "Esta cuenta ya está vinculada a un expediente."
        "vinculacion_pendiente" -> "Ya tienes una solicitud de vinculación en revisión."
        "consulta_firmada" -> "La consulta ya está firmada; no se puede modificar."
        "existencia_insuficiente" -> "No hay existencia suficiente en ese lote o bodega."
        // trabajo_abierto and capacidad_excedida keep the API text: it lists what to reassign / names the full room.
        else -> null
    }
}

/**
 * Quick reasons as chips (A4, D-8). Each one meets the API minimum of [AppointmentActions.REASON_MIN] characters, so a
 * tap is enough; only [OTHER] asks for text.
 */
object AppointmentReasons {
    const val OTHER = "Otro"
    /** D-8: the patient cancels with one tap and no typing. */
    val patientCancel = listOf("Ya no lo necesito", "No puedo a esa hora")
    /** D-8: the API code of each quick reason; [OTHER] sends `otro` with the typed text (3+ characters). */
    const val OTHER_MIN = 3
    fun patientCancelCode(reason: String, other: Boolean): String? = when {
        other -> "otro"
        reason == patientCancel[0] -> "ya_no_lo_necesito"
        reason == patientCancel[1] -> "no_puedo_a_esa_hora"
        else -> null
    }
    /** Reception cancels or rejects with a frequent reason. */
    fun reception(action: AppointmentAction): List<String> = when (action) {
        AppointmentAction.CANCEL -> listOf("Lo pidió el paciente", "El médico no estará disponible", "Cita registrada por error")
        AppointmentAction.REJECT, AppointmentAction.REJECT_RESCHEDULE -> requestReject
        else -> emptyList()
    }
    /** A2: templates to reject a request ("Sin cupo en la especialidad", "Necesita referencia"). */
    val requestReject = listOf("Sin cupo en la especialidad", "Necesita referencia")
}
