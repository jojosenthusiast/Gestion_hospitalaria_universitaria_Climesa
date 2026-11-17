package sv.edu.catolica.climesa.domain

import org.json.JSONArray

/** One CIE-10 entry of `GET /consultas/cie10?q=` (`Cie10Response`). */
data class Cie10Code(val code: String, val description: String)

/** Diagnosis step: the API searches the CIE-10 catalog by code or words (at least 2 characters, up to 20 results). */
object Cie10Rules {
    const val MIN_QUERY = 2
    const val MAX_QUERY = 60

    fun canSearch(query: String) = query.trim().length >= MIN_QUERY

    fun parse(json: Any?): List<Cie10Code> {
        val rows = json as? JSONArray ?: return emptyList()
        return (0 until rows.length()).mapNotNull { i ->
            rows.optJSONObject(i)?.let { r -> r.optString("code").trim().takeIf { it.isNotEmpty() }?.let { Cie10Code(it, r.optString("description").trim()) } }
        }
    }
}
