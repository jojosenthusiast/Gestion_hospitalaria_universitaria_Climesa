package sv.edu.catolica.climesa.domain

import java.time.Instant
import org.json.JSONObject

/** What Recepción can do with one row of `GET /citas` (M-02). */
enum class AppointmentAction(val label: String, val needsReason: Boolean) {
    CONFIRM("Confirmar", false), REJECT("Rechazar", true), CANCEL("Cancelar cita", true),
}

/**
 * CITA-04: the screen only offers what the API accepts for the state and the time. A request (`solicitada`) whose start already
 * passed is shown as "Vencida" and read-only; a confirmed appointment can be cancelled only before it starts. The API repeats every
 * rule (`attention.service.ts` changeStatus/cancel).
 */
object AppointmentActions {
    const val REASON_MIN = 10
    const val REASON_MAX = 500
    const val EXPIRED = "vencida"

    private fun start(a: ReceptionAppointment): Instant? = runCatching { Instant.parse(a.start) }.getOrNull()

    /** True when the start is unknown or not in the future: nothing can be managed any more. */
    fun started(a: ReceptionAppointment, now: Instant): Boolean = start(a)?.let { !it.isAfter(now) } ?: true

    fun expired(a: ReceptionAppointment, now: Instant) = a.state == "solicitada" && started(a, now)

    /** State shown in the list: an unmanaged past request reads "vencida". */
    fun displayState(a: ReceptionAppointment, now: Instant) = if (expired(a, now)) EXPIRED else a.state

    fun available(a: ReceptionAppointment, permissions: Collection<String>, now: Instant): List<AppointmentAction> {
        if (started(a, now)) return emptyList()
        return when (a.state) {
            "solicitada" -> if ("citas.agendar" in permissions) listOf(AppointmentAction.CONFIRM, AppointmentAction.REJECT) else emptyList()
            "confirmada" -> if ("citas.cancelar" in permissions) listOf(AppointmentAction.CANCEL) else emptyList()
            else -> emptyList()
        }
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

    fun path(action: AppointmentAction, id: String) = when (action) {
        AppointmentAction.CONFIRM -> "/citas/solicitudes/$id/confirmar"
        AppointmentAction.REJECT -> "/citas/solicitudes/$id/rechazar"
        AppointmentAction.CANCEL -> "/citas/$id/cancelar"
    }

    /** API field of the typed text: `rejectionReason` for a rejection, `reason` for a cancellation. */
    fun reasonField(action: AppointmentAction) = if (action == AppointmentAction.CANCEL) "reason" else "rejectionReason"

    fun body(action: AppointmentAction, version: Int, reason: String): JSONObject = JSONObject().put("version", version).apply {
        if (action.needsReason) put(reasonField(action), reason.trim())
    }

    fun doneNotice(action: AppointmentAction, patient: String) = when (action) {
        AppointmentAction.CONFIRM -> "Solicitud de $patient confirmada."
        AppointmentAction.REJECT -> "Solicitud de $patient rechazada."
        AppointmentAction.CANCEL -> "Cita de $patient cancelada."
    }
}
