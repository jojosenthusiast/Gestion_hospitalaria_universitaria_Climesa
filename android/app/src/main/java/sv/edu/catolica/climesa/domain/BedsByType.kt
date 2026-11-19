package sv.edu.catolica.climesa.domain

import org.json.JSONObject

/** Free and total beds of one room type (`category` of the bed board). */
data class BedTypeCount(val category: String, val label: String, val free: Int, val total: Int)

/** Isolation filter of the bed board (Lote 5 S7): occupant in isolation, or a room that has one. */
enum class IsolationFilter(val label: String) { PATIENT("Paciente en aislamiento"), ROOM("Habitación con aislamiento") }

/**
 * Owner batch 5 (S4): free beds by room type, the same rule as the web `bedTypeCounts`. Every known type (VIP, Semiprivada)
 * is always listed, so a type without free beds reads «VIP 0» instead of disappearing; a type the data brings that is not
 * known is added after them with its own name.
 */
object BedsByType {
    private val known = listOf("vip" to "VIP", "semiprivada" to "Semiprivada")

    fun label(category: String): String = known.firstOrNull { it.first == category }?.second
        ?: category.takeIf { it.isNotBlank() }?.replaceFirstChar { it.titlecase() } ?: "Sin tipo"

    /** From `(category, free)` pairs, so the board and Inicio count with one rule. */
    fun counts(beds: List<Pair<String, Boolean>>): List<BedTypeCount> {
        val out = LinkedHashMap<String, BedTypeCount>()
        known.forEach { (key, label) -> out[key] = BedTypeCount(key, label, 0, 0) }
        beds.forEach { (category, free) ->
            val row = out[category] ?: BedTypeCount(category, label(category), 0, 0)
            out[category] = row.copy(free = row.free + if (free) 1 else 0, total = row.total + 1)
        }
        return out.values.toList()
    }

    fun ofBeds(beds: List<Bed>): List<BedTypeCount> = counts(beds.map { it.category to (it.state == "libre") })

    /** The same counts from raw `/camas` rows (Inicio reads the JSON). */
    fun ofRows(rows: List<JSONObject>): List<BedTypeCount> = counts(rows.map { it.optString("category") to (it.optString("state") == "libre") })

    /** «VIP 0 · Semiprivada 4», for content descriptions and tests. */
    fun text(counts: List<BedTypeCount>): String = counts.joinToString(" · ") { "${it.label} ${it.free}" }

    /**
     * Marks the beds whose occupant is in isolation ([isolatedCodes], from the admissions) and every bed of a room that has
     * one, so the board can filter both without the API inventing a flag.
     */
    fun withIsolation(beds: List<Bed>, isolatedCodes: Set<String>): List<Bed> {
        if (isolatedCodes.isEmpty()) return beds.map { it.copy(isolated = false, roomIsolated = false) }
        val rooms = beds.filter { it.code in isolatedCodes }.map { it.roomId.ifBlank { it.room } }.toSet()
        return beds.map { it.copy(isolated = it.code in isolatedCodes, roomIsolated = it.roomId.ifBlank { it.room } in rooms) }
    }

    fun matches(bed: Bed, filter: IsolationFilter?): Boolean = when (filter) {
        null -> true
        IsolationFilter.PATIENT -> bed.isolated
        IsolationFilter.ROOM -> bed.roomIsolated
    }

    fun count(beds: List<Bed>, filter: IsolationFilter): Int = beds.count { matches(it, filter) }
}
