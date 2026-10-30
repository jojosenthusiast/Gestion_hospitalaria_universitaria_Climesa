package sv.edu.catolica.climesa.data

import org.json.JSONArray
import org.json.JSONObject
import sv.edu.catolica.climesa.domain.Bed
import sv.edu.catolica.climesa.domain.BedAction
import sv.edu.catolica.climesa.domain.BedRules

interface BedRepository {
    suspend fun beds(): List<Bed>
    suspend fun act(bedId: String, action: BedAction, version: Int, reason: String)
}

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
        )
    }
}

/** Camas por el API; la versión viaja en el cuerpo y `ApiClient` agrega la Idempotency-Key. */
class RemoteBedRepository(private val api: ApiClient) : BedRepository {
    override suspend fun beds(): List<Bed> = parseBeds(api.request("/camas") as? JSONArray ?: JSONArray())

    override suspend fun act(bedId: String, action: BedAction, version: Int, reason: String) {
        val body = JSONObject().put("version", version).put(BedRules.reasonField(action), reason.trim())
        api.request("/camas/$bedId/${action.path}", "POST", body)
    }
}
