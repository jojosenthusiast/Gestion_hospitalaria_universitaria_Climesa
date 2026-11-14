package sv.edu.catolica.climesa.domain

import java.text.Normalizer
import org.json.JSONArray
import org.json.JSONObject

/** Same status codes as the API (`EstadoStock`) and the web inventory module. */
enum class StockStatus(val code: String, val label: String) {
    OUT("agotado", "Agotado"), LOW("bajo_minimo", "Bajo mínimo"), EXPIRING("por_vencer", "Por vencer"), OK("ok", "En orden"), INACTIVE("inactivo", "Inactivo");

    companion object { fun fromCode(code: String): StockStatus = entries.firstOrNull { it.code == code } ?: OK }
}

enum class ArticleCategory(val code: String, val label: String) {
    SUPPLY("insumo", "Insumo"), REAGENT("reactivo", "Reactivo"), MINOR_EQUIPMENT("equipo_menor", "Equipo menor");

    companion object { fun fromCode(code: String): ArticleCategory = entries.firstOrNull { it.code == code } ?: SUPPLY }
}

/** Movement types of the guided flow; each one asks only for the fields it needs ([fields]). */
enum class MovementKind(val code: String, val label: String, val help: String) {
    ENTRY("entrada", "Entrada", "Llega mercadería a una bodega, con lote y vencimiento."),
    CONSUMPTION("consumo", "Consumo", "Se usa en la atención."),
    TRANSFER("traslado", "Traslado", "Se mueve de una bodega a otra."),
    ADJUSTMENT("ajuste", "Ajuste", "Corrige un conteo físico."),
    WASTE("merma", "Merma", "Pérdida, daño o vencimiento.");

    val needsOrigin: Boolean get() = this != ENTRY
    val needsDestination: Boolean get() = this == ENTRY || this == TRANSFER
    val needsNewLot: Boolean get() = this == ENTRY
    val needsExistingLot: Boolean get() = this != ENTRY
}

data class ArticleSummary(
    val id: String, val code: String, val name: String, val category: ArticleCategory, val unit: String, val minimum: Double,
    val active: Boolean, val version: Int, val available: Double, val expired: Double, val expiringSoon: Double, val nextExpiry: String?, val status: StockStatus,
)
data class WarehouseStock(val id: String, val code: String, val name: String, val quantity: Double)
data class StockLot(val id: String, val number: String, val expiresAt: String?, val active: Boolean, val version: Int, val expired: Boolean, val total: Double, val warehouses: List<WarehouseStock>)
data class ArticleMovement(val type: String, val lotNumber: String, val quantity: Double, val reason: String, val origin: String?, val destination: String?, val author: String, val at: String)
/** [allowedMovements] come from the API, already narrowed to the role's context of `inventario.mover`. */
data class ArticleDetail(val summary: ArticleSummary, val lots: List<StockLot>, val warehouses: List<WarehouseStock>, val movements: List<ArticleMovement>, val allowedMovements: List<MovementKind> = emptyList())
data class Warehouse(val id: String, val code: String, val name: String)

/** The role may configure articles and lots when its permission codes include `inventario.configurar`. */
fun canConfigureInventory(permissions: List<String>): Boolean = "inventario.configurar" in permissions
/** Movement kinds named by the API (`allowedMovements`); unknown codes such as the legacy `salida` are skipped. */
fun parseAllowedMovements(codes: List<String>): List<MovementKind> = MovementKind.entries.filter { it.code in codes }

/** Without accents or capitals: "creatinina" finds "Reactivo de Creatinína". */
fun foldText(value: String): String = Normalizer.normalize(value, Normalizer.Form.NFD).replace(Regex("\\p{Mn}+"), "").lowercase()

data class InventoryFilter(val query: String = "", val statuses: Set<StockStatus> = emptySet(), val categories: Set<ArticleCategory> = emptySet()) {
    val active: Boolean get() = query.isNotBlank() || statuses.isNotEmpty() || categories.isNotEmpty()
}
private val urgency = listOf(StockStatus.OUT, StockStatus.LOW, StockStatus.EXPIRING, StockStatus.OK, StockStatus.INACTIVE)
fun filterArticles(rows: List<ArticleSummary>, filter: InventoryFilter): List<ArticleSummary> {
    val q = foldText(filter.query.trim())
    return rows.filter {
        (q.isEmpty() || foldText("${it.code} ${it.name} ${it.category.label}").contains(q)) &&
            (filter.statuses.isEmpty() || it.status in filter.statuses) && (filter.categories.isEmpty() || it.category in filter.categories)
    }.sortedWith(compareBy({ urgency.indexOf(it.status) }, { foldText(it.name) }))
}
/** Share of the gauge (0..1): full at twice the minimum, so the bar shows the margin over the minimum. */
fun gaugeFraction(available: Double, minimum: Double): Float = if (minimum > 0) (available / (minimum * 2)).coerceIn(0.0, 1.0).toFloat() else if (available > 0) 1f else 0f

/** Lots of the article that hold stock in [warehouseId], soonest expiry first (FEFO); expired ones only when [includeExpired]. */
fun lotsFor(lots: List<StockLot>, warehouseId: String, includeExpired: Boolean): List<Pair<StockLot, Double>> =
    lots.filter { it.active && (includeExpired || !it.expired) }
        .mapNotNull { lot -> lot.warehouses.firstOrNull { it.id == warehouseId && it.quantity > 0 }?.let { lot to it.quantity } }
        .sortedWith(compareBy({ it.first.expiresAt ?: "9999-12-31" }, { it.first.number }))
/** The lot to use first: the one that expires soonest and is not expired. */
fun fefoLot(candidates: List<Pair<StockLot, Double>>): StockLot? = candidates.firstOrNull { !it.first.expired }?.first ?: candidates.firstOrNull()?.first

data class MovementDraft(
    val kind: MovementKind, val originId: String = "", val destinationId: String = "", val lotId: String = "", val lotNumber: String = "",
    val expiresAt: String = "", val quantity: String = "", val reason: String = "",
)
/** Inline validation: one message per field, only for what the kind needs. [available] is the quantity of the chosen lot in the origin. */
fun validateMovement(draft: MovementDraft, available: Double?): Map<String, String> {
    val errors = linkedMapOf<String, String>()
    val quantity = draft.quantity.trim().replace(',', '.').toDoubleOrNull()
    if (draft.kind.needsOrigin && draft.originId.isBlank()) errors["origin"] = "Elige la bodega."
    if (draft.kind.needsDestination && draft.destinationId.isBlank()) errors["destination"] = "Elige la bodega de destino."
    if (draft.kind == MovementKind.TRANSFER && draft.originId.isNotBlank() && draft.originId == draft.destinationId) errors["destination"] = "El destino debe ser otra bodega."
    if (draft.kind.needsExistingLot && draft.originId.isNotBlank() && draft.lotId.isBlank()) errors["lot"] = "Elige el lote."
    if (draft.kind.needsNewLot && draft.lotNumber.isBlank()) errors["lotNumber"] = "Escribe el número de lote."
    if (draft.expiresAt.isNotBlank() && !Regex("\\d{4}-\\d{2}-\\d{2}").matches(draft.expiresAt.trim())) errors["expiresAt"] = "Usa el formato año-mes-día, por ejemplo 2027-08-31."
    when {
        quantity == null || quantity == 0.0 -> errors["quantity"] = "Indica la cantidad."
        draft.kind != MovementKind.ADJUSTMENT && quantity < 0 -> errors["quantity"] = "La cantidad debe ser mayor que cero."
        available != null && draft.kind != MovementKind.ENTRY && quantity > available -> errors["quantity"] = "Solo hay ${trimNumber(available)} en ese lote."
        available != null && draft.kind == MovementKind.ADJUSTMENT && quantity < 0 && -quantity > available -> errors["quantity"] = "Solo hay ${trimNumber(available)} en ese lote."
    }
    if (draft.reason.trim().length < 5) errors["reason"] = "Escribe un motivo de al menos 5 letras."
    return errors
}
fun movementBody(articleId: String, draft: MovementDraft): JSONObject {
    val body = JSONObject().put("type", draft.kind.code).put("quantity", draft.quantity.trim().replace(',', '.').toDouble()).put("reason", draft.reason.trim())
    if (draft.kind.needsNewLot) {
        body.put("articleId", articleId).put("lotNumber", draft.lotNumber.trim())
        if (draft.expiresAt.isNotBlank()) body.put("expiresAt", draft.expiresAt.trim())
    } else body.put("lotId", draft.lotId)
    if (draft.kind.needsOrigin) body.put("originWarehouseId", draft.originId)
    if (draft.kind.needsDestination) body.put("destinationWarehouseId", draft.destinationId)
    return body
}
fun trimNumber(value: Double): String = if (value == Math.floor(value) && !value.isInfinite()) value.toLong().toString() else value.toString()

fun parseArticles(value: Any?): List<ArticleSummary> = (value as? JSONArray)?.let { array -> (0 until array.length()).map { parseSummary(array.getJSONObject(it)) } } ?: emptyList()
fun parseSummary(row: JSONObject) = ArticleSummary(
    row.optString("id"), row.optString("code"), row.optString("name"), ArticleCategory.fromCode(row.optString("type")), row.optString("unit"), row.optDouble("minimum"),
    row.optBoolean("active", true), row.optInt("version", 1), row.optDouble("available"), row.optDouble("expired"), row.optDouble("expiringSoon"),
    row.optString("nextExpiry").takeIf { it.isNotBlank() && it != "null" }, StockStatus.fromCode(row.optString("status")),
)
private fun parseWarehouseStock(row: JSONObject) = WarehouseStock(row.optString("warehouseId"), row.optString("warehouseCode"), row.optString("warehouseName"), row.optDouble("quantity"))
fun parseDetail(value: Any?): ArticleDetail? {
    val row = value as? JSONObject ?: return null
    fun <T> list(name: String, map: (JSONObject) -> T): List<T> = row.optJSONArray(name)?.let { a -> (0 until a.length()).map { map(a.getJSONObject(it)) } } ?: emptyList()
    return ArticleDetail(
        parseSummary(row),
        list("lotList") { l -> StockLot(l.optString("id"), l.optString("number"), l.optString("expiresAt").takeIf { it.isNotBlank() && it != "null" }, l.optBoolean("active", true), l.optInt("version", 1), l.optBoolean("expired"), l.optDouble("total"),
            l.optJSONArray("warehouses")?.let { w -> (0 until w.length()).map { parseWarehouseStock(w.getJSONObject(it)) } } ?: emptyList()) },
        list("warehouses", ::parseWarehouseStock),
        list("movements") { m -> ArticleMovement(m.optString("type"), m.optString("lotNumber"), m.optDouble("quantity"), m.optString("reason"), m.optString("originWarehouseCode").takeIf { it.isNotBlank() && it != "null" }, m.optString("destinationWarehouseCode").takeIf { it.isNotBlank() && it != "null" }, m.optString("authorName"), m.optString("registeredAt")) },
        row.optJSONArray("allowedMovements")?.let { a -> parseAllowedMovements((0 until a.length()).map { a.getString(it) }) } ?: emptyList(),
    )
}
fun parseWarehouses(value: Any?): List<Warehouse> = (value as? JSONArray)?.let { a -> (0 until a.length()).map { a.getJSONObject(it).let { w -> Warehouse(w.optString("id"), w.optString("code"), w.optString("name")) } } } ?: emptyList()
