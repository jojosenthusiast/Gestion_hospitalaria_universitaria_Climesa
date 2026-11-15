package sv.edu.catolica.climesa.data

import org.json.JSONObject

/**
 * MOV-03: what an API error (application/problem+json) means for the person. [fields] are the per-field Spanish messages
 * (`errors[].field`/`errors[].message`, or the older single `campo` + `detail`); [message] is the text for the banner,
 * already in Spanish and with the support code (`requestId`) when there is one. Raw English validation text (class-validator)
 * and technical words such as "uuid" never reach the screen.
 */
data class ApiProblem(
    val status: Int?,
    val code: String?,
    val detail: String?,
    val requestId: String?,
    val fields: Map<String, String>,
) {
    val message: String get() = ApiProblems.message(this)
}

object ApiProblems {
    private val untranslated = Regex(
        "\\b(must|should|property|longer than|shorter than|is not|each value|uuid|internal server error|bad request|not found|forbidden|unauthorized)\\b",
        RegexOption.IGNORE_CASE,
    )

    /** True when [text] is safe to show: not blank, not class-validator English, no "uuid". */
    fun readable(text: String?): Boolean = !text.isNullOrBlank() && !untranslated.containsMatchIn(text)

    fun parse(body: String?, status: Int?): ApiProblem {
        val json = runCatching { JSONObject(body.orEmpty()) }.getOrNull()
            ?: return ApiProblem(status, null, null, null, emptyMap())
        fun text(key: String) = if (json.isNull(key)) null else json.optString(key).takeIf { it.isNotBlank() }
        val detail = text("detail") ?: json.optJSONObject("error")?.optString("message")?.takeIf { it.isNotBlank() }
        val fields = linkedMapOf<String, String>()
        json.optJSONArray("errors")?.let { array ->
            for (i in 0 until array.length()) {
                val item = array.optJSONObject(i) ?: continue
                val field = item.optString("field").takeIf { it.isNotBlank() } ?: continue
                val message = item.optString("message").takeIf(::readable) ?: continue
                fields.putIfAbsent(field, message)
            }
        }
        // Older shape: one `campo` with the whole message in `detail`.
        if (fields.isEmpty()) text("campo")?.let { field -> detail?.takeIf(::readable)?.let { fields[field] = it } }
        return ApiProblem(status, text("codigo"), detail, text("requestId"), fields)
    }

    /** The Spanish banner text: the API `detail` when readable, else the field messages, else a message for the status. */
    fun message(problem: ApiProblem): String {
        val base = problem.detail?.takeIf(::readable)
            ?: problem.fields.values.distinct().takeIf { it.isNotEmpty() }?.joinToString(" ")
            ?: fallback(problem.status)
        return problem.requestId?.let { "$base\nCódigo de soporte: $it" } ?: base
    }

    fun fallback(status: Int?): String = when (status) {
        400, 422 -> "Revisa los datos del formulario e intenta de nuevo."
        401 -> "Tu sesión terminó. Vuelve a ingresar."
        403 -> "No tienes permiso para esta acción."
        404 -> "No se encontró el registro. Actualiza la lista e intenta de nuevo."
        409 -> "Los datos cambiaron mientras trabajabas. Actualiza e intenta de nuevo."
        429 -> "Demasiadas solicitudes. Espera un momento y vuelve a intentar."
        null -> "No se pudo completar la operación."
        else -> if (status >= 500) "El servidor no pudo completar la operación. Intenta de nuevo en un momento." else "No se pudo completar la operación."
    }

    /**
     * Field messages of a failed write, keyed by the API field name (`motive`, `items.0.dose`...). A screen shows each one under
     * its own field; anything without a field stays in the banner ([Throwable.message]).
     */
    fun fieldErrors(error: Throwable?): Map<String, String> =
        (error as? AuthRequestException)?.let { e -> e.body?.let { parse(it, e.statusCode).fields } }.orEmpty()
}
