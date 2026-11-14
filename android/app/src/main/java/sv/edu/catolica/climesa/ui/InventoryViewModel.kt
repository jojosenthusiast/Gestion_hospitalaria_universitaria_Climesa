package sv.edu.catolica.climesa.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import org.json.JSONObject
import sv.edu.catolica.climesa.data.ApiGateway
import sv.edu.catolica.climesa.data.realtime.LiveSubscription
import sv.edu.catolica.climesa.data.realtime.RealtimeRepository
import sv.edu.catolica.climesa.domain.ArticleCategory
import sv.edu.catolica.climesa.domain.ArticleDetail
import sv.edu.catolica.climesa.domain.ArticleSummary
import sv.edu.catolica.climesa.domain.InventoryEvents
import sv.edu.catolica.climesa.domain.InventoryFilter
import sv.edu.catolica.climesa.domain.MovementDraft
import sv.edu.catolica.climesa.domain.MovementKind
import sv.edu.catolica.climesa.domain.RealtimeSignal
import sv.edu.catolica.climesa.domain.StockLot
import sv.edu.catolica.climesa.domain.StockStatus
import sv.edu.catolica.climesa.domain.Warehouse
import sv.edu.catolica.climesa.domain.filterArticles
import sv.edu.catolica.climesa.domain.fefoLot
import sv.edu.catolica.climesa.domain.lotsFor
import sv.edu.catolica.climesa.domain.movementBody
import sv.edu.catolica.climesa.domain.parseArticles
import sv.edu.catolica.climesa.domain.parseDetail
import sv.edu.catolica.climesa.domain.parseWarehouses
import sv.edu.catolica.climesa.domain.validateMovement

data class ArticleDraft(val id: String? = null, val version: Int = 1, val code: String = "", val name: String = "", val category: ArticleCategory = ArticleCategory.SUPPLY, val unit: String = "", val minimum: String = "0", val active: Boolean = true, val reason: String = "") {
    val valid: Boolean get() = code.isNotBlank() && name.isNotBlank() && unit.isNotBlank() && minimum.replace(',', '.').toDoubleOrNull()?.let { it >= 0 } == true && (id == null || reason.trim().length >= 10)
}
data class LotDraft(val id: String? = null, val version: Int = 1, val number: String = "", val expiresAt: String = "", val active: Boolean = true, val reason: String = "") {
    val valid: Boolean get() = number.isNotBlank() && (expiresAt.isBlank() || Regex("\\d{4}-\\d{2}-\\d{2}").matches(expiresAt.trim())) && (id == null || reason.trim().length >= 10)
}

data class InventoryState(
    val loading: Boolean = true, val busy: Boolean = false, val articles: List<ArticleSummary> = emptyList(), val filter: InventoryFilter = InventoryFilter(),
    val error: String? = null, val notice: String? = null, val selectedId: String? = null, val detail: ArticleDetail? = null, val detailLoading: Boolean = false,
    val warehouses: List<Warehouse> = emptyList(), val movement: MovementDraft? = null, val movementSubmitted: Boolean = false, val article: ArticleDraft? = null, val lot: LotDraft? = null, val dialogError: String? = null,
) {
    val shown: List<ArticleSummary> get() = filterArticles(articles, filter)
    /** One alert per article that is out of stock or below its minimum (FR-111-06). */
    val lowStock: List<ArticleSummary> get() = articles.filter { it.status == StockStatus.LOW || it.status == StockStatus.OUT }
    fun count(status: StockStatus) = articles.count { it.status == status }
    /** Lots the movement flow offers for the chosen origin, FEFO first (merma and ajuste also see expired ones). */
    val lotChoices: List<Pair<StockLot, Double>> get() {
        val draft = movement ?: return emptyList(); val lots = detail?.lots ?: return emptyList()
        if (draft.originId.isBlank()) return emptyList()
        return lotsFor(lots, draft.originId, includeExpired = draft.kind == MovementKind.WASTE || draft.kind == MovementKind.ADJUSTMENT)
    }
    val chosenLotQuantity: Double? get() = lotChoices.firstOrNull { it.first.id == movement?.lotId }?.second
    val movementErrors: Map<String, String> get() = movement?.let { validateMovement(it, chosenLotQuantity) } ?: emptyMap()
}

@HiltViewModel
class InventoryViewModel @Inject constructor(private val api: ApiGateway, realtime: RealtimeRepository) : ViewModel() {
    private val mutable = MutableStateFlow(InventoryState()); val state = mutable.asStateFlow()
    private val live = LiveSubscription(realtime)
    private var loadJob: Job? = null
    private fun update(change: (InventoryState) -> InventoryState) { mutable.value = change(mutable.value) }

    /** A [silent] reload (realtime invalidation) keeps the shown data and messages, even if it fails. */
    fun load(silent: Boolean = false) {
        if (!silent) update { it.copy(loading = true, error = null) }
        loadJob?.cancel()
        loadJob = viewModelScope.launch {
            try {
                val articles = parseArticles(api.request("/inventario/articulos"))
                update { it.copy(loading = false, articles = articles) }
                mutable.value.selectedId?.let { loadDetail(it) }
            } catch (e: CancellationException) { throw e }
            catch (e: Exception) { if (!silent) update { it.copy(loading = false, error = e.message ?: "No se pudo cargar el inventario.") } }
        }
    }
    /** Idempotent per channel list: reloads when an inventory event arrives or after a reconnection gap. */
    fun startLive(channels: List<String>) {
        live.start(viewModelScope, channels) { signal -> if (signal is RealtimeSignal.Event && InventoryEvents.matches(signal.event) || signal is RealtimeSignal.Resync) load(silent = true) }
    }

    fun setQuery(query: String) = update { it.copy(filter = it.filter.copy(query = query)) }
    fun toggleStatus(status: StockStatus) = update { it.copy(filter = it.filter.copy(statuses = it.filter.statuses.let { s -> if (status in s) s - status else s + status })) }
    fun toggleCategory(category: ArticleCategory) = update { it.copy(filter = it.filter.copy(categories = it.filter.categories.let { s -> if (category in s) s - category else s + category })) }
    fun clearFilters() = update { it.copy(filter = InventoryFilter()) }

    fun select(id: String) { update { it.copy(selectedId = id, detail = null, detailLoading = true, notice = null, error = null) }; viewModelScope.launch { loadDetail(id) } }
    fun back() = update { it.copy(selectedId = null, detail = null, notice = null) }
    private suspend fun loadDetail(id: String) {
        try { val detail = parseDetail(api.request("/inventario/articulos/$id")); if (mutable.value.selectedId == id) update { it.copy(detail = detail, detailLoading = false) } }
        catch (e: CancellationException) { throw e }
        catch (e: Exception) { if (mutable.value.selectedId == id) update { it.copy(detailLoading = false, error = e.message ?: "No se pudo cargar el artículo.") } }
    }

    // --- Guided movement flow ---------------------------------------------------------------------------------------------------
    fun openMovement(kind: MovementKind) {
        if (mutable.value.busy) return
        update { it.copy(movement = MovementDraft(kind), movementSubmitted = false, dialogError = null, notice = null) }
        if (mutable.value.warehouses.isEmpty()) viewModelScope.launch { try { val list = parseWarehouses(api.request("/inventario/bodegas")); update { it.copy(warehouses = list) } } catch (e: CancellationException) { throw e } catch (_: Exception) { } }
    }
    fun closeMovement() { if (!mutable.value.busy) update { it.copy(movement = null, dialogError = null) } }
    fun changeKind(kind: MovementKind) = update { it.copy(movement = MovementDraft(kind), movementSubmitted = false, dialogError = null) }
    fun editMovement(change: (MovementDraft) -> MovementDraft) {
        update { state ->
            val draft = state.movement ?: return@update state
            var next = change(draft)
            // Changing the origin re-picks the lot: the one that expires first (FEFO) is chosen by default.
            if (next.originId != draft.originId && next.kind.needsExistingLot) {
                val choices = state.copy(movement = next.copy(lotId = "")).lotChoices
                next = next.copy(lotId = fefoLot(choices)?.id ?: "")
            }
            state.copy(movement = next)
        }
    }
    fun submitMovement() {
        val state = mutable.value; val draft = state.movement ?: return; val article = state.detail?.summary ?: return
        if (state.busy) return
        update { it.copy(movementSubmitted = true) }
        if (state.movementErrors.isNotEmpty()) return
        update { it.copy(busy = true, dialogError = null) }
        viewModelScope.launch {
            try { api.request("/inventario/movimientos", "POST", movementBody(article.id, draft)); update { it.copy(busy = false, movement = null, notice = "Movimiento registrado.") }; load(silent = true) }
            catch (e: CancellationException) { update { it.copy(busy = false) }; throw e }
            catch (e: Exception) { update { it.copy(busy = false, dialogError = e.message ?: "No se pudo registrar el movimiento.") } }
        }
    }

    // --- Articles and lots (inventario.configurar) -------------------------------------------------------------------------------
    fun openArticle(article: ArticleSummary?) = update { it.copy(article = article?.let { a -> ArticleDraft(a.id, a.version, a.code, a.name, a.category, a.unit, a.minimum.let(::fmt), a.active) } ?: ArticleDraft(), dialogError = null) }
    fun editArticle(change: (ArticleDraft) -> ArticleDraft) = update { s -> s.copy(article = s.article?.let(change)) }
    fun closeArticle() { if (!mutable.value.busy) update { it.copy(article = null, dialogError = null) } }
    fun saveArticle() {
        val draft = mutable.value.article ?: return; if (mutable.value.busy || !draft.valid) return
        update { it.copy(busy = true, dialogError = null) }
        viewModelScope.launch {
            try {
                val body = JSONObject().put("code", draft.code.trim()).put("name", draft.name.trim()).put("type", draft.category.code).put("unit", draft.unit.trim()).put("minimum", draft.minimum.replace(',', '.').toDouble())
                if (draft.id != null) body.put("active", draft.active).put("version", draft.version).put("reason", draft.reason.trim())
                api.request(if (draft.id == null) "/inventario/articulos" else "/inventario/articulos/${draft.id}", if (draft.id == null) "POST" else "PUT", body)
                update { it.copy(busy = false, article = null, notice = "Artículo guardado.") }; load(silent = true)
            } catch (e: CancellationException) { update { it.copy(busy = false) }; throw e }
            catch (e: Exception) { update { it.copy(busy = false, dialogError = e.message ?: "No se pudo guardar el artículo.") } }
        }
    }
    fun deleteArticle(id: String) {
        if (mutable.value.busy) return
        update { it.copy(busy = true, error = null) }
        viewModelScope.launch {
            try { api.request("/inventario/articulos/$id", "DELETE", JSONObject()); update { it.copy(busy = false, selectedId = null, detail = null, notice = "Artículo eliminado.") }; load(silent = true) }
            catch (e: CancellationException) { update { it.copy(busy = false) }; throw e }
            catch (e: Exception) { update { it.copy(busy = false, error = e.message ?: "No se pudo eliminar el artículo.") } }
        }
    }
    fun openLot(lot: StockLot?) = update { it.copy(lot = lot?.let { l -> LotDraft(l.id, l.version, l.number, l.expiresAt ?: "", l.active) } ?: LotDraft(), dialogError = null) }
    fun editLot(change: (LotDraft) -> LotDraft) = update { s -> s.copy(lot = s.lot?.let(change)) }
    fun closeLot() { if (!mutable.value.busy) update { it.copy(lot = null, dialogError = null) } }
    fun saveLot() {
        val draft = mutable.value.lot ?: return; val article = mutable.value.detail?.summary ?: return; if (mutable.value.busy || !draft.valid) return
        update { it.copy(busy = true, dialogError = null) }
        viewModelScope.launch {
            try {
                val body = JSONObject().put("number", draft.number.trim()); if (draft.expiresAt.isNotBlank()) body.put("expiresAt", draft.expiresAt.trim())
                if (draft.id != null) body.put("active", draft.active).put("version", draft.version).put("reason", draft.reason.trim())
                api.request(if (draft.id == null) "/inventario/articulos/${article.id}/lotes" else "/inventario/lotes/${draft.id}", if (draft.id == null) "POST" else "PUT", body)
                update { it.copy(busy = false, lot = null, notice = "Lote guardado.") }; load(silent = true)
            } catch (e: CancellationException) { update { it.copy(busy = false) }; throw e }
            catch (e: Exception) { update { it.copy(busy = false, dialogError = e.message ?: "No se pudo guardar el lote.") } }
        }
    }
    fun clearMessages() = update { it.copy(error = null, notice = null) }
    private fun fmt(value: Double) = if (value == Math.floor(value)) value.toLong().toString() else value.toString()
}
