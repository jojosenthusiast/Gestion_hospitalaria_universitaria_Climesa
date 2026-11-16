package sv.edu.catolica.climesa.domain

import org.json.JSONObject

/** Fields of the patient's ambulance request form (A09). */
enum class RequestField { ADDRESS, PHONE }

data class RequestDraft(val address: String = "", val phone: String = "")

/**
 * S13: what the request form already knows from the patient's own record (`GET /me/paciente`). It fills only empty fields,
 * never something the person typed, and reports exactly which fields it filled so the notice names only those.
 */
data class AmbulancePrefill(val address: String, val phone: String) {
    fun applyTo(draft: RequestDraft): Pair<RequestDraft, List<RequestField>> {
        val filled = mutableListOf<RequestField>()
        val address = if (draft.address.isBlank() && this.address.isNotBlank()) this.address.trim().also { filled += RequestField.ADDRESS } else draft.address
        val phone = if (draft.phone.isBlank() && this.phone.isNotBlank()) this.phone.trim().also { filled += RequestField.PHONE } else draft.phone
        return RequestDraft(address, phone) to filled
    }

    companion object {
        fun from(json: JSONObject): AmbulancePrefill = AmbulancePrefill(
            address = json.optString("address").takeUnless { json.isNull("address") }.orEmpty(),
            phone = json.optString("phone").takeUnless { json.isNull("phone") }.orEmpty(),
        )
    }
}
