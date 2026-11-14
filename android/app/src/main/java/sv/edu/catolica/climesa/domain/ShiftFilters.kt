package sv.edu.catolica.climesa.domain

import org.json.JSONArray

const val FILTER_ALL = "todos"

/** What the planner screen shows: state, area and staff function. Each one is "Todos" until the user narrows it. */
data class ShiftFilter(val state: String = FILTER_ALL, val area: String = FILTER_ALL, val role: String = FILTER_ALL) {
    val active get() = state != FILTER_ALL || area != FILTER_ALL || role != FILTER_ALL
}

/**
 * Filters of the shifts of several people (state, area, staff function). The options come from the shifts themselves, so
 * a role without access to `/espacios` or `/personal` still gets working filters; the staff function is added when the
 * staff list could be read.
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

    fun roleOptions(shifts: List<PlannedShift>, types: Map<String, String>): List<Pair<String, String>> =
        listOf(FILTER_ALL to "Todos los roles") + shifts.mapNotNull { types[it.staffId]?.takeIf(String::isNotBlank) }.distinct().map { it to StaffLabels.function(it) }.sortedBy { it.second }

    fun apply(shifts: List<PlannedShift>, filter: ShiftFilter, types: Map<String, String>): List<PlannedShift> = shifts.filter {
        (filter.state == FILTER_ALL || it.state == filter.state) &&
            (filter.area == FILTER_ALL || it.areaId == filter.area) &&
            (filter.role == FILTER_ALL || types[it.staffId] == filter.role)
    }
}
