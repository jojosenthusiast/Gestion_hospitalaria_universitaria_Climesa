package sv.edu.catolica.climesa.domain

import org.json.JSONArray
import org.json.JSONObject

/** What Inicio adds under two tiles (Lote 5 S4): the waiting split and the free beds by room type. */
data class DashboardExtras(val waiting: WaitingSplit? = null, val bedTypes: List<BedTypeCount> = emptyList())

/**
 * Owner batch 5 (S4): «En espera: 5 de fila · 3 con cita» and «Camas libres» by room type on Inicio, the same rules as the
 * web dashboards. Built from the rows the dashboard already read; nothing new is requested.
 */
object DashboardSplits {
    const val WAITING = "En espera"
    const val FREE_BEDS = "Camas libres"

    private fun rows(value: Any?): List<JSONObject> = (value as? JSONArray)?.let { a -> (0 until a.length()).mapNotNull { a.optJSONObject(it) } }.orEmpty()

    fun extras(data: Map<DashboardSource, Any>): DashboardExtras {
        // Like the tiles: with a shift post the queue counts only that service.
        val myService = data[DashboardSource.MY_POST]?.let { QueueRules.myPost(it)?.service }
        val queue = data[DashboardSource.QUEUE]?.let { value -> rows(value).filter { myService == null || it.optString("service") == myService } }
        val beds = data[DashboardSource.BEDS]?.let(::rows)
        return DashboardExtras(queue?.let(QueueReception::waitingSplitRows), beds?.let(BedsByType::ofRows).orEmpty())
    }

    /**
     * The owner wants «En espera» in Resumen with its split even when a pending row already counts the waiting numbers (R3
     * A-28 dropped the tile then). The tile comes back with the section of that pending row; nothing else changes.
     */
    fun withWaitingTile(model: DashboardModel, extras: DashboardExtras): DashboardModel {
        val split = extras.waiting ?: return model
        if (model.kpis.any { it.label == WAITING }) return model
        val row = model.attention.firstOrNull { it.covers == WAITING } ?: return model
        val tile = DashboardKpi(WAITING, split.total.toString(), if (split.total > 0) DashboardTone.WARNING else DashboardTone.SUCCESS, target = row.request.section)
        return model.copy(kpis = listOf(tile) + model.kpis)
    }
}
