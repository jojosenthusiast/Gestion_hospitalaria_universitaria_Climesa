package sv.edu.catolica.climesa.ui

import sv.edu.catolica.climesa.data.ApiProblems
import sv.edu.catolica.climesa.data.AuthRequestException
import sv.edu.catolica.climesa.domain.BusinessErrors

/** Spanish message of a failed write: the mapped business code first, then the API helper message (MOV-03), then [fallback]. */
internal fun businessMessage(error: Throwable, fallback: String): String =
    (error as? AuthRequestException)?.code?.let(BusinessErrors::message) ?: error.message ?: fallback

/** Parser, runtime or English text that must never be shown to the person. */
private val technical = Regex(
    """(JSON|BEGIN_|Exception|java\.|kotlin\.|[\[\]{}<>]|\b(expected|unexpected|cannot|failed|index|null|value|timeout|refused|unable|resolve|host|hostname|socket|connection|associated|the|of|was|with|but)\b)""",
    RegexOption.IGNORE_CASE,
)

private fun shown(text: String?) = text != null && ApiProblems.readable(text) && !technical.containsMatchIn(text)

/**
 * Spanish text for any failure on a screen (S13: "every server error mapped to a meaningful Spanish message"). An API error
 * keeps its business-code message or its already-translated text ([ApiProblems]); a domain rule keeps its own Spanish
 * sentence; a parser or runtime error (English, a stack fragment) becomes [fallback].
 */
internal fun userMessage(error: Throwable, fallback: String): String {
    val text = if (error is AuthRequestException) businessMessage(error, fallback) else error.message
    return text.takeIf(::shown) ?: fallback
}
