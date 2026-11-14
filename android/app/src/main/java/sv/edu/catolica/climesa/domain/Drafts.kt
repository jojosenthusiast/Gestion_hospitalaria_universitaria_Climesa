package sv.edu.catolica.climesa.domain

import org.json.JSONObject

/** Whether the latest changes of a form are kept as a local draft. */
enum class DraftStatus { NONE, SAVED, NOT_SAVED }

/** Pure rules shared by every form that keeps a local draft (see `data/DraftStore`). */
object DraftRules {
    /** A field counts as changed when it differs from the baseline (what the API has); a missing baseline is empty/false. */
    fun isDirty(values: Map<String, Any>, baseline: Map<String, Any> = emptyMap()) = values.any { (field, value) ->
        value != (baseline[field] ?: if (value is Boolean) false else "")
    }

    fun toJson(values: Map<String, Any>) = JSONObject().apply { values.forEach { (field, value) -> put(field, value) } }

    fun text(draft: JSONObject?, field: String, fallback: String) = if (draft != null && draft.has(field) && !draft.isNull(field)) draft.optString(field) else fallback
    fun flag(draft: JSONObject?, field: String, fallback: Boolean) = if (draft != null && draft.has(field)) draft.optBoolean(field, fallback) else fallback

    /** Leaving asks for confirmation only when there are changes and they could not be kept locally. */
    fun mustConfirmLeave(dirty: Boolean, status: DraftStatus) = dirty && status != DraftStatus.SAVED
}
