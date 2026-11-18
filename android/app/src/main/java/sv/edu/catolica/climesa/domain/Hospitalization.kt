package sv.edu.catolica.climesa.domain

import org.json.JSONArray
import org.json.JSONObject

/**
 * Actions Android offers on an admission. The API computes `allowedActions` per row from the state, the actor's permissions
 * and the care relationship; every button comes from that list (never from a role or a local permission guess). Web-only
 * actions (`autorizar`, `anular`, `reasignar_tratante`) are not mapped and therefore never drawn.
 */
enum class AdmissionAction(val wire: String) {
    ASSIGN_BED("asignar_cama"),
    CANCEL("cancelar"),
    TRANSFER("trasladar"),
    SIGN_DISCHARGE("firmar_alta"),
    REQUEST_DISCHARGE("solicitar_alta"),
    REVOKE_DISCHARGE("revocar_alta"),
    REGISTER_EXIT("registrar_salida"),
    NURSING_NOTE("nota_enfermeria");

    companion object {
        fun fromWire(value: String): AdmissionAction? = entries.firstOrNull { it.wire == value }
    }
}

/** One pending item of a discharge: what is left to do and who is responsible for it. */
data class DischargePending(val description: String = "", val responsible: String = "")

/** Discharge types accepted by `POST /admisiones/{id}/alta`. */
enum class DischargeType(val value: String, val label: String) {
    MEDICAL("medica", "Médica"),
    VOLUNTARY("voluntaria", "Voluntaria"),
    TRANSFER("traslado", "Traslado"),
    DEATH("defuncion", "Defunción");

    companion object {
        fun fromWire(value: String): DischargeType? = entries.firstOrNull { it.value == value }
    }
}

/**
 * The current signed discharge of an admission (`discharge` of `GET /admisiones`), without the clinical summary.
 * D-031: [type] and [pending] are null for readers without a care relationship (Recepción); [pendingCount] and
 * [specialHandling] always come.
 */
data class AdmissionDischarge(
    val type: DischargeType?,
    val signedAt: String,
    val signedByName: String?,
    val pending: List<DischargePending>?,
    val pendingCount: Int = pending?.size ?: 0,
    val specialHandling: Boolean = false,
)

/** One row of `GET /admisiones`. */
data class HospitalAdmission(
    val id: String,
    val patientName: String,
    val state: String,
    val bed: String,
    val category: String,
    val isolation: Boolean,
    val version: Int,
    val occupationId: String? = null,
    val bedCategory: String? = null,
    val authorized: Boolean = false,
    val attendingDoctorName: String? = null,
    val attendingDoctorHasAccount: Boolean = false,
    val dischargeRequestedAt: String? = null,
    val discharge: AdmissionDischarge? = null,
    val allowedActions: Set<AdmissionAction> = emptySet(),
    /** G5: lets the ward open "Signos vitales" on this patient. */
    val patientId: String? = null,
    /** G3: where the admission came from (cita, consulta, emergencia, ambulancia, programada) and why. */
    val origin: String? = null,
    val motive: String? = null,
    val unstable: Boolean = false,
) {
    /** G3 "Ingresos indicados": a doctor indicated it from a consultation and it waits for a bed this reader can assign. */
    val indicated get() = state == "pendiente_cama" && origin == "consulta" && AdmissionAction.ASSIGN_BED in allowedActions
}

data class HospitalBedSuggestion(val id: String, val version: Int, val code: String, val room: String, val category: String, val reason: String)

/** A bed of `GET /camas` as the transfer picker needs it. */
data class TransferBed(val id: String, val code: String, val room: String, val category: String, val state: String)

/** One entry of `GET /admisiones/{id}/notas-enfermeria`, newest first. */
data class NursingNote(val id: String, val text: String, val createdAt: String, val authorName: String?)

object AdmissionParser {
    private fun JSONObject.textOrNull(name: String): String? = if (isNull(name)) null else optString(name).takeIf { it.isNotBlank() }
    private fun objects(array: JSONArray?): List<JSONObject> = (0 until (array?.length() ?: 0)).mapNotNull { array?.optJSONObject(it) }

    fun admissions(value: Any?): List<HospitalAdmission> = objects(value as? JSONArray).map { row ->
        val actions = row.optJSONArray("allowedActions")
        HospitalAdmission(
            id = row.optString("id"),
            patientName = row.textOrNull("patientName") ?: "Paciente",
            state = row.optString("state"),
            bed = row.textOrNull("bed").orEmpty(),
            category = row.textOrNull("requestedCategory").orEmpty(),
            isolation = row.optBoolean("isolation"),
            version = row.optInt("version", 1),
            occupationId = row.textOrNull("occupationId"),
            patientId = row.textOrNull("patientId"),
            bedCategory = row.textOrNull("bedCategory"),
            authorized = row.optBoolean("authorized"),
            attendingDoctorName = row.textOrNull("attendingDoctorName"),
            attendingDoctorHasAccount = row.optBoolean("attendingDoctorHasAccount"),
            dischargeRequestedAt = row.textOrNull("dischargeRequestedAt"),
            discharge = if (row.isNull("discharge")) null else row.optJSONObject("discharge")?.let { d ->
                AdmissionDischarge(
                    DischargeType.fromWire(d.optString("type")),
                    d.textOrNull("signedAt").orEmpty(),
                    d.textOrNull("signedByName"),
                    if (d.isNull("pending")) null else objects(d.optJSONArray("pending")).map { DischargePending(it.optString("description"), it.optString("responsible")) },
                    d.optInt("pendingCount", d.optJSONArray("pending")?.length() ?: 0),
                    d.optBoolean("specialHandling"),
                )
            },
            allowedActions = (0 until (actions?.length() ?: 0)).mapNotNull { i -> actions?.optString(i)?.let(AdmissionAction::fromWire) }.toSet(),
            origin = row.textOrNull("origin"),
            motive = row.textOrNull("motive"),
            unstable = row.optBoolean("unstable"),
        )
    }

    fun suggestions(value: Any?): List<HospitalBedSuggestion> = objects(value as? JSONArray).map { row ->
        HospitalBedSuggestion(row.optString("id"), row.optInt("version", 1), row.optString("code"), row.optString("room"), row.optString("category"), row.optString("reason"))
    }

    fun beds(value: Any?): List<TransferBed> = objects(value as? JSONArray).map { row ->
        TransferBed(row.optString("id"), row.optString("code"), row.optString("room"), row.optString("category"), row.optString("state"))
    }

    fun notes(value: Any?): List<NursingNote> = objects(value as? JSONArray).map { row ->
        NursingNote(row.optString("id"), row.optString("text"), row.optString("createdAt"), row.textOrNull("authorName"))
    }
}

/**
 * Client-side checks and request bodies for hospitalization. The API stays the guarantee (rule 5); these rules
 * only keep the user from sending clinical text nobody wrote.
 */
/** «Mi habitación» of the patient (iOS `RoomRules`): the API only returns the patient's own admissions. */
object MyRoomRules {
    /** Current stay with an assigned bed. */
    fun current(admissions: List<HospitalAdmission>, patientId: String? = null): HospitalAdmission? =
        admissions.firstOrNull { it.state == "hospitalizado" && it.bed.isNotBlank() && (patientId == null || it.patientId == null || it.patientId == patientId) }

    /** Requested stay still waiting for a bed. */
    fun waiting(admissions: List<HospitalAdmission>, patientId: String? = null): HospitalAdmission? =
        admissions.firstOrNull { it.state == "pendiente_cama" && (patientId == null || it.patientId == null || it.patientId == patientId) }
}

object HospitalizationRules {
    /** G5: a hospitalized patient (or waiting for a bed) can have signs taken straight from the ward card. */
    fun vitalsSubject(row: HospitalAdmission): QuickSubject? {
        val id = row.patientId ?: return null
        if (row.state !in setOf("hospitalizado", "pendiente_cama")) return null
        return QuickSubject(id, row.patientName, if (row.bed.isBlank()) "Sin cama asignada" else "Cama ${row.bed}")
    }

    /** S13: the main action of an admission's state, the only one drawn as primary; the rest stay secondary. */
    private val mainActions = listOf(AdmissionAction.ASSIGN_BED, AdmissionAction.SIGN_DISCHARGE, AdmissionAction.REGISTER_EXIT)

    fun primaryAction(actions: Set<AdmissionAction>): AdmissionAction? = mainActions.firstOrNull { it in actions }

    /** One primary per screen: the first admission (list order) that has a main action, or null. */
    fun primaryAdmission(rows: List<HospitalAdmission>): String? = rows.firstOrNull { primaryAction(it.allowedActions) != null }?.id

    const val SUMMARY_MIN = 10
    const val SUMMARY_MAX = 2000
    const val NOTE_MAX = 4000
    const val REQUEST_NOTE_MAX = 500

    /** "12/500": live counter under a reason field (trimmed length, as the API counts it). */
    fun counter(text: String, max: Int): String = "${text.trim().length}/$max"

    /** The bed assignment reason is optional in the API, but when written it must have 10 to 500 characters. */
    fun assignReasonError(reason: String): String? = if (reason.isBlank()) null else ChangeReason.error(reason)

    fun assignBody(bedId: String, bedVersion: Int, reason: String): JSONObject =
        JSONObject().put("bedId", bedId).put("version", bedVersion).apply { if (reason.isNotBlank()) put("reason", reason.trim()) }

    /** The summary is optional (`@Text(10, 2000, true)`); when written it must have 10 to 2000 characters. */
    fun dischargeError(type: DischargeType, summary: String, pending: List<DischargePending>, voluntaryConsent: Boolean): String? = when {
        summary.isNotBlank() && summary.trim().length < SUMMARY_MIN -> "Si escribes el resumen del alta, que tenga al menos $SUMMARY_MIN caracteres."
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
        return JSONObject().put("type", type.value).put("version", admissionVersion).put("pending", items)
            .apply { if (summary.isNotBlank()) put("summary", summary.trim()) }
            .apply { if (type == DischargeType.VOLUNTARY) put("voluntaryConsent", voluntaryConsent) }
    }

    fun exitReasonError(reason: String): String? = ChangeReason.error(reason)

    fun exitBody(admissionVersion: Int, reason: String): JSONObject = reasonBody(admissionVersion, reason)

    /** Cancel, revoke discharge and transfer: a 10 to 500 character reason. */
    fun reasonError(reason: String): String? = ChangeReason.error(reason)

    fun reasonBody(admissionVersion: Int, reason: String): JSONObject = JSONObject().put("version", admissionVersion).put("reason", reason.trim())

    /** `POST /admisiones/{id}/solicitar-alta`: the note is optional (0 to 500). */
    fun dischargeRequestError(note: String): String? = if (note.trim().length > REQUEST_NOTE_MAX) "La nota no puede pasar de $REQUEST_NOTE_MAX caracteres." else null

    fun dischargeRequestBody(admissionVersion: Int, note: String): JSONObject =
        JSONObject().put("version", admissionVersion).apply { if (note.isNotBlank()) put("note", note.trim()) }

    /**
     * For a hospitalized patient whose discharge this person cannot sign: who signs it, or why nobody can yet. Null for the
     * signer (they see "Firmar alta") and outside `hospitalizado`.
     */
    fun waitingDischargeHint(admission: HospitalAdmission): String? = when {
        admission.state != "hospitalizado" || AdmissionAction.SIGN_DISCHARGE in admission.allowedActions -> null
        !admission.attendingDoctorHasAccount -> "El médico tratante no tiene cuenta en la app; pide a Jefatura que reasigne el tratante."
        else -> "Esperando alta médica: la firma ${admission.attendingDoctorName ?: "el médico tratante"} desde la app."
    }

    /** Free beds of the current bed's category, except the bed the patient is in (`POST /ocupaciones/{id}/traslado`). */
    fun transferCandidates(beds: List<TransferBed>, admission: HospitalAdmission): List<TransferBed> {
        val category = admission.bedCategory ?: admission.category
        return beds.filter { it.state == "libre" && it.category == category && it.code != admission.bed }
    }

    fun transferBody(bedId: String, admissionVersion: Int, reason: String): JSONObject =
        JSONObject().put("bedId", bedId).put("version", admissionVersion).put("reason", reason.trim())

    fun noteError(text: String): String? = when {
        text.isBlank() -> "Escribe la nota antes de guardarla."
        text.trim().length > NOTE_MAX -> "La nota no puede pasar de $NOTE_MAX caracteres."
        else -> null
    }

    fun noteBody(text: String): JSONObject = JSONObject().put("text", text.trim())

    /** Spanish text of a failed hospitalization write: stable codes first, then the API `detail` (already Spanish). */
    fun problemMessage(code: String?, message: String?): String = when (code) {
        "transicion_invalida" -> "La admisión cambió de estado; vuelve a cargar."
        "version_conflicto" -> "La admisión cambió mientras la mirabas. Actualizamos la lista; revisa e intenta de nuevo."
        else -> message?.takeIf { it.isNotBlank() } ?: "No se pudo completar la operación."
    }

    /** Codes after which the shown list is stale and must be fetched again. */
    fun staleCode(code: String?): Boolean = code == "transicion_invalida" || code == "version_conflicto"
}
