package sv.edu.catolica.climesa.domain

import org.json.JSONObject

/**
 * MOV-02: what the consultation already knows when a physician indicates hospitalization. It is filled by the screen and
 * locked: the patient and the consultation of the open dialog. The attending is the signed-in physician: the API resolves it
 * (`AdmissionIndicationDto` has no `attendingDoctorId`), so [doctorStaffId] is informative only.
 */
data class IndicationContext(val patientId: String?, val patientName: String, val consultationId: String?, val doctorStaffId: String?, val doctorName: String)

/** The only things the physician types: motive, room category, isolation and the two optional clinical flags. */
data class IndicationDraft(
    val motive: String = "",
    val category: String? = null,
    val isolation: Boolean = false,
    val isolationType: IsolationType? = null,
    val unstable: Boolean = false,
    val postSurgical: Boolean = false,
)

/** Row 11: the patient's active admission on the server, and whether it was indicated from this consultation. */
data class ExistingAdmission(val id: String, val state: String, val fromThisConsultation: Boolean)

/** `POST /admisiones/indicaciones` (AdmissionDto with `origin = consulta`). The API repeats every rule. */
object AdmissionIndication {
    const val PATH = "/admisiones/indicaciones"
    val CATEGORIES = listOf("semiprivada", "vip")

    /** The states the API counts as active when it refuses another admission (same as iOS `AdmissionIndicationRules`). */
    val ACTIVE_STATES = setOf("pendiente_cama", "hospitalizado", "alta_firmada")

    /**
     * Row 11 (mirror of iOS `loadExisting`): the patient's active admission from `GET /admisiones`, preferring the one indicated
     * from this consultation; null when there is none. After leaving and coming back, an indication already made shows as done.
     */
    fun existing(rows: Any?, patientId: String?, consultationId: String?): ExistingAdmission? {
        val array = rows as? org.json.JSONArray ?: return null
        if (patientId.isNullOrBlank()) return null
        val active = (0 until array.length()).mapNotNull(array::optJSONObject)
            .filter { it.optString("patientId") == patientId && it.optString("state") in ACTIVE_STATES }
            .map { ExistingAdmission(it.optString("id"), it.optString("state"), it.optString("origin") == "consulta" && consultationId != null && it.optString("originId") == consultationId) }
        return active.firstOrNull { it.fromThisConsultation } ?: active.firstOrNull()
    }

    /** Live counter under the motive: "12/500"; it only warns while the minimum is not reached. */
    fun motiveCounter(motive: String): String = "${motive.trim().length}/${AdmissionIntake.MOTIVE_MAX}"

    /** Problems of the locked context: the form cannot be sent and explains why (never a "uuid" error from the API). */
    fun contextError(c: IndicationContext): String? = when {
        c.patientId.isNullOrBlank() -> "No se identificó al paciente de la consulta. Cierra y vuelve a abrir la consulta."
        c.consultationId.isNullOrBlank() -> "Inicia la consulta antes de indicar la hospitalización."
        else -> null
    }

    /** Field errors keyed by the API field name, so the API's own per-field errors land on the same fields. */
    fun fieldErrors(d: IndicationDraft): Map<String, String> = buildMap {
        val motive = d.motive.trim().length
        if (motive < AdmissionIntake.MOTIVE_MIN) put("motive", "Escribe el motivo, de al menos ${AdmissionIntake.MOTIVE_MIN} caracteres.")
        else if (motive > AdmissionIntake.MOTIVE_MAX) put("motive", "El motivo admite hasta ${AdmissionIntake.MOTIVE_MAX} caracteres.")
        if (d.category !in CATEGORIES) put("requestedCategory", "Elige la categoría de habitación.")
        if (d.isolationType != null && !d.isolation) put("isolationType", "Marca el aislamiento para elegir su tipo.")
    }

    /** The request body, or null while [contextError] or [fieldErrors] report something. */
    fun body(c: IndicationContext, d: IndicationDraft): JSONObject? {
        if (contextError(c) != null || fieldErrors(d).isNotEmpty()) return null
        val patientId = c.patientId ?: return null
        val consultationId = c.consultationId ?: return null
        val category = d.category ?: return null
        return JSONObject()
            .put("patientId", patientId).put("origin", OriginKind.CONSULTATION.wire).put("originId", consultationId)
            .put("motive", d.motive.trim()).put("requestedCategory", category)
            .put("isolation", d.isolation).put("unstable", d.unstable).put("postSurgical", d.postSurgical)
            .apply { if (d.isolation && d.isolationType != null) put("isolationType", d.isolationType.wire) }
    }
}
