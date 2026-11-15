package sv.edu.catolica.climesa.domain

import org.json.JSONObject

/**
 * MOV-02: what the consultation already knows when a physician indicates hospitalization. It is filled by the screen and
 * locked: the patient and the consultation of the open dialog, and the physician's own staff record (`staffId` of `/auth/me`).
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

/** `POST /admisiones/indicaciones` (AdmissionDto with `origin = consulta`). The API repeats every rule. */
object AdmissionIndication {
    const val PATH = "/admisiones/indicaciones"
    val CATEGORIES = listOf("semiprivada", "vip")

    /** Live counter under the motive: "12/500"; it only warns while the minimum is not reached. */
    fun motiveCounter(motive: String): String = "${motive.trim().length}/${AdmissionIntake.MOTIVE_MAX}"

    /** Problems of the locked context: the form cannot be sent and explains why (never a "uuid" error from the API). */
    fun contextError(c: IndicationContext): String? = when {
        c.patientId.isNullOrBlank() -> "No se identificó al paciente de la consulta. Cierra y vuelve a abrir la consulta."
        c.consultationId.isNullOrBlank() -> "Inicia la consulta antes de indicar la hospitalización."
        c.doctorStaffId.isNullOrBlank() -> "Tu cuenta no está vinculada a un médico del personal; pide a Administración que la vincule."
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
        val doctor = c.doctorStaffId ?: return null
        val category = d.category ?: return null
        return JSONObject()
            .put("patientId", patientId).put("origin", OriginKind.CONSULTATION.wire).put("originId", consultationId)
            .put("attendingDoctorId", doctor).put("motive", d.motive.trim()).put("requestedCategory", category)
            .put("isolation", d.isolation).put("unstable", d.unstable).put("postSurgical", d.postSurgical)
            .apply { if (d.isolation && d.isolationType != null) put("isolationType", d.isolationType.wire) }
    }
}
