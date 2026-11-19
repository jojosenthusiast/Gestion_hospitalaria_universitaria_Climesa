package sv.edu.catolica.climesa.data

import org.json.JSONArray
import org.json.JSONObject
import sv.edu.catolica.climesa.domain.Bed
import sv.edu.catolica.climesa.domain.BedAction
import sv.edu.catolica.climesa.domain.BedRules

interface BedRepository {
    suspend fun beds(): List<Bed>
    suspend fun act(bedId: String, action: BedAction, version: Int, reason: String)
    /**
     * Lote 5 S7: codes of the beds whose occupant is in isolation, read from the active admissions (needs `admision.ver`).
     * The bed board itself carries no isolation flag; a repository without that source returns none.
     */
    suspend fun isolatedBedCodes(): Set<String> = emptySet()
}

/** Admission states that still hold their bed (signed discharge keeps it until the patient leaves). */
private val OCCUPYING = setOf("hospitalizado", "alta_firmada")

/** Bed codes of active admissions marked `isolation` (`GET /admisiones`): still in the bed. */
internal fun parseIsolatedBedCodes(rows: JSONArray): Set<String> = (0 until rows.length()).mapNotNull { i ->
    rows.optJSONObject(i)?.takeIf { it.optBoolean("isolation") && it.optString("state") in OCCUPYING }?.optString("bed")?.takeIf { it.isNotBlank() }
}.toSet()

internal fun parseBeds(rows: JSONArray): List<Bed> = (0 until rows.length()).mapNotNull { i ->
    rows.optJSONObject(i)?.let { r ->
        Bed(
            id = r.getString("id"),
            code = r.optString("code"),
            room = r.optString("room"),
            state = r.optString("state"),
            version = r.optInt("version", 1),
            cleaningPending = r.optBoolean("cleaningPending"),
            cleaningCompleted = r.optBoolean("cleaningCompleted"),
            cleanedByCurrentUser = r.optBoolean("cleanedByCurrentUser"),
            occupant = r.optString("occupant").takeIf { it.isNotBlank() },
            level = if (r.isNull("level")) null else r.optInt("level"),
            roomId = r.optString("roomId"),
            category = r.optString("category"),
        )
    }
}

/** Camas por el API; la versión viaja en el cuerpo y `ApiClient` agrega la Idempotency-Key. */
class RemoteBedRepository(private val api: ApiClient) : BedRepository {
    override suspend fun beds(): List<Bed> = parseBeds(api.request("/camas") as? JSONArray ?: JSONArray())

    override suspend fun isolatedBedCodes(): Set<String> = parseIsolatedBedCodes(api.request("/admisiones") as? JSONArray ?: JSONArray())

    override suspend fun act(bedId: String, action: BedAction, version: Int, reason: String) {
        val body = JSONObject().put("version", version).put(BedRules.reasonField(action), reason.trim())
        api.request("/camas/$bedId/${action.path}", "POST", body)
    }
}
