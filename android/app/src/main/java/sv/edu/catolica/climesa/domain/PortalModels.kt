package sv.edu.catolica.climesa.domain

import org.json.JSONArray
import org.json.JSONObject

/** Bed summary of `GET /inicio`. */
data class BedSummary(val free: Int, val total: Int)

/** One row of `GET /pacientes`. */
data class PatientHit(val fullName: String, val record: String)

/** Ambulance unit of `GET /ambulancia`, with the active service if there is one. */
data class UnitView(
    val plate: String,
    val state: String,
    val version: Int,
    val paramedicOnDuty: Boolean,
    val serviceOrigin: String?,
    val serviceDestination: String?,
    /** Missing in older API versions: then it counts as covered (no false alarm). */
    val driverOnDuty: Boolean = true,
) {
    val hasService get() = serviceOrigin != null || serviceDestination != null
}

/**
 * Parsing of the generic role portal (`RolePortal`), kept out of the composables (android/AGENTS.md: no logic in
 * `@Composable`). Every parser tolerates missing or malformed data and returns null or an empty list.
 */
object PortalParsers {
    fun bedSummary(data: Any?): BedSummary? =
        (data as? JSONObject)?.optJSONObject("beds")?.let { BedSummary(it.optInt("free"), it.optInt("total")) }

    fun patients(data: Any?): List<PatientHit> {
        val rows = data as? JSONArray ?: return emptyList()
        return (0 until rows.length()).mapNotNull { i ->
            rows.optJSONObject(i)?.let { PatientHit(it.optString("fullName"), it.optString("record")) }
        }
    }

    fun unit(data: Any?): UnitView? {
        val root = data as? JSONObject ?: return null
        val unit = root.optJSONObject("unit") ?: return null
        val service = root.optJSONObject("activeService")
        return UnitView(
            plate = unit.optString("plate"),
            state = unit.optString("state"),
            version = unit.optInt("version"),
            paramedicOnDuty = root.optBoolean("paramedicOnDuty"),
            serviceOrigin = service?.optString("origin"),
            serviceDestination = service?.optString("destination"),
            driverOnDuty = root.optBoolean("driverOnDuty", true),
        )
    }
}
