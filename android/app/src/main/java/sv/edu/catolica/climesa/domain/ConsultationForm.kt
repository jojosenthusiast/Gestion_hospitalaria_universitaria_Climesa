package sv.edu.catolica.climesa.domain

import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import org.json.JSONObject

/**
 * Lote 5 S12: what signing needs. The API (`ConsultationService.sign`) refuses a consultation without motive or plan
 * ("Completa el motivo y el plan antes de firmar la consulta."); everything else of the consultation is optional.
 */
object ConsultationForm {
    const val REASON = "reason"
    const val PLAN = "plan"

    /** The names the sticky bar lists after "Falta:", in screen order. */
    val NAMES = mapOf(REASON to "motivo de consulta", PLAN to "plan")

    /** Keys of the required fields still empty, in screen order (motive first). */
    fun missing(reason: String, plan: String): List<String> = buildList {
        if (reason.isBlank()) add(REASON)
        if (plan.isBlank()) add(PLAN)
    }

    /** "motivo de consulta", "plan": what [missing] lacks, worded for [sv.edu.catolica.climesa.ui.FormCopy.missingSummary]. */
    fun missingNames(reason: String, plan: String): List<String> = missing(reason, plan).mapNotNull(NAMES::get)

    /** The error under each empty required field once the doctor tried to sign. */
    fun errors(reason: String, plan: String): Map<String, String> = missing(reason, plan).associateWith {
        when (it) {
            REASON -> "Escribe el motivo de consulta: es obligatorio para firmar."
            else -> "Escribe el plan (procedimientos, indicaciones y seguimiento): es obligatorio para firmar."
        }
    }
}

/** Lote 5 S12: the draft saves itself on the server while typing (debounced) and when the doctor leaves the screen or the app. */
object ConsultationAutosave {
    /** Quiet time after the last keystroke before the draft is sent. */
    const val DEBOUNCE_MS = 2500L
    private val clock = DateTimeFormatter.ofPattern("HH:mm").withZone(ZoneId.of("America/El_Salvador"))

    /** True when the typed notes differ from what the server already has for [item]. */
    fun changed(item: MedicalAppointment, reason: String, physicalExam: String, plan: String): Boolean =
        reason.trim() != (item.consultationReason ?: item.reason).orEmpty().trim() ||
            physicalExam.trim() != item.physicalExam.orEmpty().trim() ||
            plan.trim() != item.plan.orEmpty().trim()

    /** `PATCH /consultas/{id}` body: the same draft endpoint as "Guardar borrador". */
    fun body(version: Int, reason: String, physicalExam: String, plan: String): JSONObject =
        JSONObject().put("version", version).put("reason", reason.trim()).put("physicalExam", physicalExam.trim()).put("plan", plan.trim())

    /** "Borrador guardado automáticamente a las 10:42". */
    fun savedText(at: Instant): String = "Borrador guardado automáticamente a las ${clock.format(at)}"
}

/**
 * Lote 5 S12: vital signs with their full names (never "FC", "Temp" or "PA sis.") and the ranges the web form accepts, so
 * a value out of range is said under its field while typing.
 */
enum class ConsultationVital(val key: String, val label: String, val unit: String, val min: Double, val max: Double, val decimals: Boolean = false) {
    SYSTOLIC("systolic", "Presión arterial sistólica", "mmHg", 40.0, 300.0),
    DIASTOLIC("diastolic", "Presión arterial diastólica", "mmHg", 20.0, 200.0),
    HEART_RATE("heartRate", "Frecuencia cardiaca", "latidos por minuto", 20.0, 250.0),
    TEMPERATURE("temperature", "Temperatura", "°C", 30.0, 45.0, decimals = true),
    OXYGEN("oxygenSaturation", "Saturación de oxígeno", "%", 40.0, 100.0);

    /** "Frecuencia cardiaca (latidos por minuto)". */
    val fullLabel get() = "$label ($unit)"

    /** Null for an empty or valid value; otherwise what is wrong, in words. */
    fun error(text: String): String? {
        val t = text.trim().replace(',', '.')
        if (t.isEmpty()) return null
        val value = t.toDoubleOrNull() ?: return "Escribe solo números."
        if (!decimals && value % 1.0 != 0.0) return "Escribe un número entero."
        return if (value < min || value > max) "Debe estar entre ${fmt(min)} y ${fmt(max)} $unit." else null
    }

    private fun fmt(v: Double) = if (v % 1.0 == 0.0) v.toInt().toString() else v.toString()
}

/** Lote 5 S12: what the patient asked for, shown when the consultation opens (request categories, reason, queue summary). */
data class VisitContext(
    val origin: String,
    val categories: List<CategoryRef>,
    val reason: String?,
    val priority: String?,
)

object ConsultationContext {
    private val clock = DateTimeFormatter.ofPattern("HH:mm").withZone(ZoneId.of("America/El_Salvador"))

    /**
     * From the appointment row (agenda) or, for a consultation opened from the queue, the number it came from. [agenda] is
     * searched by consultation id so a resumed consultation still shows its appointment's request.
     */
    fun of(item: MedicalAppointment, agenda: List<MedicalAppointment>, ticket: QueueConsultation?): VisitContext? {
        val appointment = item.takeIf { it.appointmentId.isNotBlank() } ?: item.consultationId?.let { id -> agenda.firstOrNull { it.consultationId == id } }
        val queue = ticket?.takeIf { t -> (item.consultationId != null && t.consultationId == item.consultationId) || (item.ticketNumber != null && t.number == item.ticketNumber) }
        if (appointment == null && queue == null) return null
        val origin = when {
            appointment != null -> "Cita de las ${time(appointment.start)}" + (queue?.let { " · ${QueueLabels.service(it.service ?: "consulta_general")} ${it.code}" } ?: "")
            else -> "Número ${queue!!.code} · " + QueueContext.line(queue)
        }
        val categories = appointment?.categories?.takeIf { it.isNotEmpty() } ?: queue?.categories.orEmpty()
        return VisitContext(origin, categories, appointment?.reason?.takeIf { it.isNotBlank() }, queue?.priority?.takeIf { it != "rutina" })
    }

    private fun time(iso: String) = runCatching { clock.format(Instant.parse(iso)) }.getOrDefault("—")
}

/** Lote 5 S12: one open consultation at a time is the norm; another one may still be started (the API allows it). */
object ConsultationGuard {
    /** The doctor's unsigned consultation that is not [current], to warn about before starting another; null when none. */
    fun unsignedOther(unsigned: List<UnsignedConsultation>, current: String?): UnsignedConsultation? = unsigned.firstOrNull { it.id != current }
}
