package sv.edu.catolica.climesa.domain

/** Fields of the admission guide that the guide can choose on its own. */
enum class IntakeField { ORIGIN, DOCTOR, CATEGORY }

/**
 * S13: the admission guide preselects what has a single possible answer (the only source record, the only doctor on duty,
 * the only category with a free bed). It never replaces a choice already made, and it returns which fields it filled so the
 * notice names only those.
 */
object IntakePrefill {
    fun origin(draft: AdmissionDraft, records: List<OriginRecord>): Pair<AdmissionDraft, List<IntakeField>> {
        val only = records.singleOrNull()
        if (draft.originRecord != null || draft.origin != null || only == null) return draft to emptyList()
        return draft.copy(origin = only.origin, originRecord = only) to listOf(IntakeField.ORIGIN)
    }

    fun doctor(draft: AdmissionDraft, doctors: List<IntakeDoctor>): Pair<AdmissionDraft, List<IntakeField>> {
        val only = doctors.filter { it.available }.singleOrNull()
        if (draft.doctor != null || only == null) return draft to emptyList()
        return draft.copy(doctor = only) to listOf(IntakeField.DOCTOR)
    }

    fun category(draft: AdmissionDraft, map: BedMap?): Pair<AdmissionDraft, List<IntakeField>> {
        val only = map?.categories?.filter { it.selectable }?.singleOrNull()
        if (draft.category != null || only == null) return draft to emptyList()
        return draft.copy(category = only.category) to listOf(IntakeField.CATEGORY)
    }
}
