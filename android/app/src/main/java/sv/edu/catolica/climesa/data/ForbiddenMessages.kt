package sv.edu.catolica.climesa.data

import java.util.concurrent.ConcurrentHashMap

/**
 * Preconditions sweep S8: texts that came from a 403. Screens keep their error as a plain Spanish string, so the shared
 * `ErrorState` asks here whether the string it draws is a refusal; a refusal is shown as information without «Reintentar»,
 * because retrying the same request can never pass. [AuthRequestException] remembers its own message, and the UI helpers
 * that translate a 403 into another text remember that text too.
 */
object ForbiddenMessages {
    private const val MAX = 200
    private val texts: MutableSet<String> = ConcurrentHashMap.newKeySet()

    fun remember(text: String?) {
        if (text.isNullOrBlank()) return
        if (texts.size >= MAX) texts.clear()
        texts += text
    }

    fun isForbidden(text: String?): Boolean = text != null && text in texts

    /** Test hook: forget every remembered text. */
    fun clear() = texts.clear()
}
