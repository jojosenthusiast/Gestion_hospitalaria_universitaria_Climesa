package sv.edu.catolica.climesa.data

import java.time.Instant
import org.json.JSONObject

/**
 * When the patient last opened "Mis exámenes", per account, so "Resultados nuevos" reaches 0 once seen. A device-local
 * marker until the API keeps one (G-7); it is a pending write so a sign-out does not make old results new again.
 */
object ResultsSeen {
    const val KEY = "resultados:vistos"
    fun mark(drafts: DraftStore, userId: String, at: Instant = Instant.now()) { drafts.save(userId, KEY, JSONObject().put("at", at.toString())) }
    fun load(drafts: DraftStore, userId: String): Instant? = drafts.load(userId, KEY)?.optString("at")?.let { runCatching { Instant.parse(it) }.getOrNull() }
}
