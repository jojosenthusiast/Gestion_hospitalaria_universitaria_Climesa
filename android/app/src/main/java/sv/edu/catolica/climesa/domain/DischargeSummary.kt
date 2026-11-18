package sv.edu.catolica.climesa.domain

import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

/** D7: one diagnosis of the stay (signed consultations), as `discharge.diagnoses` of `GET /admisiones` returns it. */
data class DischargeDiagnosis(val code: String, val description: String, val principal: Boolean = false)

/** D7: follow-up after the discharge, the patient's next requested or confirmed appointment. */
data class DischargeFollowUp(val at: String, val state: String, val doctorName: String? = null, val specialty: String? = null)

/**
 * D7 «Resumen de tu alta» in «Mi habitación» (iOS `DischargeSummaryRules`): the signed discharge of the patient's own stay,
 * still in bed (`alta_firmada`) or closed in the last 30 days (`egresado`, the API only returns the most recent one).
 */
object DischargeSummaryRules {
    private val zone = ZoneId.of("America/El_Salvador")
    private val formatter = DateTimeFormatter.ofPattern("d MMM yyyy, HH:mm", Locale("es", "SV")).withZone(zone)

    /** The stay whose summary the patient sees; null without a signed discharge or when its clinical part did not come. */
    fun summary(admissions: List<HospitalAdmission>, patientId: String? = null): HospitalAdmission? =
        admissions.firstOrNull { row ->
            row.state in setOf("alta_firmada", "egresado") && row.discharge?.type != null &&
                (patientId == null || row.patientId == null || row.patientId == patientId)
        }

    /** "Alta médica", "Alta voluntaria"... */
    fun typeLabel(type: DischargeType): String = "Alta " + type.label.lowercase(Locale("es", "SV"))

    /** Principal diagnosis first, then by code. */
    fun diagnoses(discharge: AdmissionDischarge): List<DischargeDiagnosis> =
        discharge.diagnoses.orEmpty().sortedWith(compareByDescending<DischargeDiagnosis> { it.principal }.thenBy { it.code })

    /** "J18.9 · Neumonía (principal)". */
    fun diagnosisLine(diagnosis: DischargeDiagnosis): String =
        "${diagnosis.code} · ${diagnosis.description}" + if (diagnosis.principal) " (principal)" else ""

    /** "Retirar puntos — Responsable: Consulta externa". */
    fun pendingLine(item: DischargePending): String = "${item.description} — Responsable: ${item.responsible}"

    /** "21 nov 2026, 10:00 · Dra. Ficticia · Medicina general", with "(por confirmar)" for a requested appointment. */
    fun followUpLine(followUp: DischargeFollowUp): String {
        val time = runCatching { formatter.format(Instant.parse(followUp.at)) }.getOrDefault(followUp.at)
        val parts = listOfNotNull(time, followUp.doctorName?.takeIf { it.isNotBlank() }, followUp.specialty?.takeIf { it.isNotBlank() })
        return parts.joinToString(" · ") + if (followUp.state == "solicitada") " (por confirmar)" else ""
    }

    /** Signature line: "Firmada el 18 nov 2026, 10:32 por Dra. Ficticia". */
    fun signedLine(discharge: AdmissionDischarge): String {
        val time = runCatching { formatter.format(Instant.parse(discharge.signedAt)) }.getOrDefault(discharge.signedAt)
        return "Firmada el $time" + (discharge.signedByName?.takeIf { it.isNotBlank() }?.let { " por $it" } ?: "")
    }
}
