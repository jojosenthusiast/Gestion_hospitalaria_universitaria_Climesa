package sv.edu.catolica.climesa.domain

import java.time.Instant

/** A stretch of time with no shift of [role] (`paramedico` or `motorista`) published or in progress. */
data class CrewGap(val role: String, val start: Instant, val end: Instant)

/**
 * Ambulance crew coverage (RN-30): the unit can only be dispatched with a paramedic AND a driver on a shift in progress.
 * Over the range spanned by the loaded shifts (cancelled ones excluded), this finds the stretches without each role.
 * Only published and in-progress shifts cover; drafts and cancelled ones do not. Without staff types (the catalog
 * failed) nothing is reported, so the planner never sees a false alarm.
 */
object CrewCoverage {
    val ROLES = listOf("paramedico", "motorista")
    private val covering = setOf("publicado", "en_curso")

    private fun window(shift: PlannedShift): Pair<Instant, Instant>? {
        val start = runCatching { Instant.parse(shift.start) }.getOrNull() ?: return null
        val end = runCatching { Instant.parse(shift.end) }.getOrNull() ?: return null
        return if (end.isAfter(start)) start to end else null
    }

    fun gaps(shifts: List<PlannedShift>, staffTypes: Map<String, String>): List<CrewGap> {
        if (staffTypes.isEmpty()) return emptyList()
        val spans = shifts.filter { it.state != "cancelado" }.mapNotNull(::window)
        if (spans.isEmpty()) return emptyList()
        val from = spans.minOf { it.first }
        val to = spans.maxOf { it.second }
        return ROLES.flatMap { role ->
            val covered = shifts.filter { it.state in covering && staffTypes[it.staffId] == role }.mapNotNull(::window).sortedBy { it.first }
            val gaps = mutableListOf<CrewGap>()
            var cursor = from
            for ((start, end) in covered) {
                if (start.isAfter(cursor)) gaps += CrewGap(role, cursor, minOf(start, to))
                if (end.isAfter(cursor)) cursor = end
                if (!cursor.isBefore(to)) break
            }
            if (cursor.isBefore(to)) gaps += CrewGap(role, cursor, to)
            gaps.filter { it.end.isAfter(it.start) }
        }
    }
}
