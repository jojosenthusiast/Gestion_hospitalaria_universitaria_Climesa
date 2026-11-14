package sv.edu.catolica.climesa.domain

import org.json.JSONArray
import org.json.JSONObject

const val FILTER_ALL = "todos"

/** What the planner screen shows: state, area, staff function and one person. Each one is "Todos" until the user narrows it. */
data class ShiftFilter(val state: String = FILTER_ALL, val area: String = FILTER_ALL, val role: String = FILTER_ALL, val person: String = FILTER_ALL) {
    val active get() = state != FILTER_ALL || area != FILTER_ALL || role != FILTER_ALL || person != FILTER_ALL
}

data class CatalogRole(val code: String, val name: String)
data class CatalogArea(val id: String, val parentId: String?, val type: String, val code: String, val name: String)
data class CatalogStaff(
    val id: String, val name: String, val type: String, val specialty: String?, val areaId: String?, val area: String?,
    /** Vigencias `yyyy-MM-dd` de la inscripción profesional (solo medicina y enfermería). */
    val registrations: List<Pair<String, String>>,
)

/** `GET /turnos/catalogo`: every real area, function and active person, not only those of the shifts currently loaded. */
data class ShiftCatalog(val roles: List<CatalogRole> = emptyList(), val areas: List<CatalogArea> = emptyList(), val staff: List<CatalogStaff> = emptyList()) {
    val staffTypes: Map<String, String> get() = staff.associate { it.id to it.type }
}

object ShiftCatalogs {
    private fun JSONObject.text(key: String) = if (isNull(key)) null else optString(key).takeIf { it.isNotBlank() }

    fun parse(json: JSONObject): ShiftCatalog {
        val roles = json.optJSONArray("roles") ?: JSONArray()
        val areas = json.optJSONArray("areas") ?: JSONArray()
        val staff = json.optJSONArray("staff") ?: JSONArray()
        return ShiftCatalog(
            roles = (0 until roles.length()).map { roles.getJSONObject(it) }.map { CatalogRole(it.optString("code"), it.optString("name")) },
            areas = (0 until areas.length()).map { areas.getJSONObject(it) }.map { CatalogArea(it.getString("id"), it.text("parentId"), it.optString("type"), it.optString("code"), it.optString("name")) },
            staff = (0 until staff.length()).map { staff.getJSONObject(it) }.map { person ->
                val registrations = person.optJSONArray("registrations") ?: JSONArray()
                CatalogStaff(
                    person.getString("id"), person.optString("name"), person.optString("type"), person.text("specialty"), person.text("areaId"), person.text("area"),
                    (0 until registrations.length()).map { registrations.getJSONObject(it) }.map { it.optString("validFrom") to it.optString("validTo") },
                )
            },
        )
    }

    /** When the catalog cannot be read, the screen keeps working with the options found in the loaded shifts. */
    fun fallback(shifts: List<PlannedShift>, types: Map<String, String> = emptyMap()) = ShiftCatalog(
        roles = types.values.filter { it.isNotBlank() }.distinct().map { CatalogRole(it, StaffLabels.function(it)) },
        areas = shifts.filter { it.areaId.isNotBlank() }.distinctBy { it.areaId }.map { CatalogArea(it.areaId, null, "area", "", it.area.ifBlank { "Área" }) },
        staff = shifts.distinctBy { it.staffId }.map { CatalogStaff(it.staffId, it.person, types[it.staffId].orEmpty(), null, null, null, emptyList()) },
    )
}

/**
 * Filters of the shifts of several people (state, area, staff function, person). The options come from the catalog
 * endpoint, so a role that only sees a few shifts still gets every area, function and person of the system.
 */
object ShiftFilters {
    /** `staffId` to function code (`medico`, `enfermero`...) from `GET /personal`. */
    fun staffTypes(rows: JSONArray): Map<String, String> = (0 until rows.length()).mapNotNull { rows.optJSONObject(it) }
        .filter { it.optString("id").isNotBlank() }
        .associate { it.optString("id") to it.optString("type") }

    fun stateOptions(): List<Pair<String, String>> = listOf(
        FILTER_ALL to "Todos", "borrador" to "Borradores", "publicado" to "Publicados", "en_curso" to "En curso", "completado" to "Completados", "cancelado" to "Cancelados",
    )

    fun areaOptions(shifts: List<PlannedShift>): List<Pair<String, String>> =
        listOf(FILTER_ALL to "Todas las áreas") + shifts.filter { it.areaId.isNotBlank() }.distinctBy { it.areaId }.map { it.areaId to it.area.ifBlank { "Área" } }.sortedBy { it.second }

    fun areaOptions(catalog: ShiftCatalog): List<Pair<String, String>> =
        listOf(FILTER_ALL to "Todas las áreas") + catalog.areas.map { it.id to it.name }.sortedBy { it.second }

    fun roleOptions(shifts: List<PlannedShift>, types: Map<String, String>): List<Pair<String, String>> =
        listOf(FILTER_ALL to "Todos los roles") + shifts.mapNotNull { types[it.staffId]?.takeIf(String::isNotBlank) }.distinct().map { it to StaffLabels.function(it) }.sortedBy { it.second }

    fun roleOptions(catalog: ShiftCatalog): List<Pair<String, String>> =
        listOf(FILTER_ALL to "Todos los roles") + catalog.roles.map { it.code to it.name }.sortedBy { it.second }

    fun apply(shifts: List<PlannedShift>, filter: ShiftFilter, types: Map<String, String>): List<PlannedShift> = shifts.filter {
        (filter.state == FILTER_ALL || it.state == filter.state) &&
            (filter.area == FILTER_ALL || it.areaId == filter.area) &&
            (filter.role == FILTER_ALL || types[it.staffId] == filter.role) &&
            (filter.person == FILTER_ALL || it.staffId == filter.person)
    }
}
