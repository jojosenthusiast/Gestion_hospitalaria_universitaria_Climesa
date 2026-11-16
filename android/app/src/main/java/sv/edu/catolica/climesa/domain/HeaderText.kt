package sv.edu.catolica.climesa.domain

/**
 * Module titles and one-line subtitles carry no closing period (same rule as the web `headerText`).
 * Text with several sentences keeps its punctuation, and an ellipsis is left alone.
 */
fun headerText(text: String): String {
    val trimmed = text.trim()
    if (!trimmed.endsWith(".") || trimmed.endsWith("..")) return trimmed
    val body = trimmed.dropLast(1)
    return if (Regex("[.!?…]\\s").containsMatchIn(body)) trimmed else body
}
