package sv.edu.catolica.climesa.domain

import org.json.JSONArray
import org.json.JSONObject

/** Actions on an admission; each one needs its own permission from `/auth/me` (rule 8), not a role. */
enum class AdmissionAction(val permission: String, val state: String) {
    ASSIGN_BED("camas.asignar", "pendiente_cama"),
    SIGN_DISCHARGE("alta.firmar", "hospitalizado"),
    REGISTER_EXIT("admision.registrar_salida", "alta_firmada"),
}

/** One pending item of a discharge: what is left to do and who is responsible for it. */
data class DischargePending(val description: String = "", val responsible: String = "")

/** Discharge types accepted by `POST /admisiones/{id}/alta`. */
enum class DischargeType(val value: String, val label: String) {
    MEDICAL("medica", "Médica"),
    VOLUNTARY("voluntaria", "Voluntaria"),
    TRANSFER("traslado", "Traslado"),
    DEATH("defuncion", "Defunción"),
}

/**
 * Client-side checks and request bodies for hospitalization. The API stays the guarantee (rule 5); these rules
 * only keep the user from sending clinical text nobody wrote.
 */
object HospitalizationRules {
    const val SUMMARY_MIN = 10
    const val SUMMARY_MAX = 2000

    fun actions(state: String, permissions: Collection<String>): Set<AdmissionAction> =
        AdmissionAction.entries.filter { it.state == state && it.permission in permissions }.toSet()

    /** The bed assignment reason is optional in the API, but when written it must have 10 to 500 characters. */
    fun assignReasonError(reason: String): String? = if (reason.isBlank()) null else ChangeReason.error(reason)

    fun assignBody(bedId: String, bedVersion: Int, reason: String): JSONObject =
        JSONObject().put("bedId", bedId).put("version", bedVersion).apply { if (reason.isNotBlank()) put("reason", reason.trim()) }

    fun dischargeError(type: DischargeType, summary: String, pending: List<DischargePending>, voluntaryConsent: Boolean): String? = when {
        summary.trim().length < SUMMARY_MIN -> "Escribe el resumen del alta, de al menos $SUMMARY_MIN caracteres."
        summary.trim().length > SUMMARY_MAX -> "El resumen no puede pasar de $SUMMARY_MAX caracteres."
        pending.any { it.description.isNotBlank() != it.responsible.isNotBlank() } -> "Cada pendiente necesita descripción y responsable."
        type == DischargeType.VOLUNTARY && !voluntaryConsent -> "El alta voluntaria necesita la constancia del paciente."
        else -> null
    }

    /** `DischargeDto` requires the admission `version` (409 with `versionActual` on mismatch) and pending items as `{description, responsible}`. */
    fun dischargeBody(admissionVersion: Int, type: DischargeType, summary: String, pending: List<DischargePending>, voluntaryConsent: Boolean): JSONObject {
        val items = JSONArray()
        pending.filter { it.description.isNotBlank() && it.responsible.isNotBlank() }
            .forEach { items.put(JSONObject().put("description", it.description.trim()).put("responsible", it.responsible.trim())) }
        return JSONObject().put("type", type.value).put("version", admissionVersion).put("summary", summary.trim()).put("pending", items)
            .apply { if (type == DischargeType.VOLUNTARY) put("voluntaryConsent", voluntaryConsent) }
    }

    fun exitReasonError(reason: String): String? = ChangeReason.error(reason)

    fun exitBody(admissionVersion: Int, reason: String): JSONObject =
        JSONObject().put("version", admissionVersion).put("reason", reason.trim())
}
