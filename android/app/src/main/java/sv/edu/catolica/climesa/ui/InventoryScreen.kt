@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
package sv.edu.catolica.climesa.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import kotlinx.coroutines.Job
import sv.edu.catolica.climesa.R
import sv.edu.catolica.climesa.data.ApiGateway
import sv.edu.catolica.climesa.data.realtime.LiveSubscription
import sv.edu.catolica.climesa.data.realtime.RealtimeRepository
import sv.edu.catolica.climesa.domain.AccessProfile
import sv.edu.catolica.climesa.domain.InventoryEvents
import sv.edu.catolica.climesa.domain.RealtimeSignal

/** [belowMinimum] comes from the API (`bajo_minimo`, RN-37): available stock of the whole article, expired lots excluded. */
data class InventoryStock(val lotId: String, val code: String, val name: String, val warehouseId: String, val warehouse: String, val quantity: Double, val unit: String, val minimum: Double, val expires: String, val belowMinimum: Boolean = false)
/** [consumptionLotId] is the lot whose consumption form is open; it closes only after the API accepts the movement. */
data class InventoryState(val loading: Boolean = true, val busy: Boolean = false, val stock: List<InventoryStock> = emptyList(), val error: String? = null, val notice: String? = null, val consumptionLotId: String? = null) {
    /** One alert per article below its minimum (FR-111-06). */
    val lowStock: List<InventoryStock> get() = stock.filter { it.belowMinimum }.distinctBy { it.code }
}

@HiltViewModel
class InventoryViewModel @Inject constructor(private val api: ApiGateway, realtime: RealtimeRepository) : ViewModel() {
    private val mutable = MutableStateFlow(InventoryState()); val state = mutable.asStateFlow()
    private val live = LiveSubscription(realtime)
    private var loadJob: Job? = null
    /** A [silent] reload (realtime invalidation) keeps the shown stock and messages, even if it fails. */
    fun load(silent: Boolean = false) {
        if (!silent) mutable.value = mutable.value.copy(loading = true, error = null)
        loadJob?.cancel()
        loadJob = viewModelScope.launch {
            try { val stock = parse(api.request("/inventario/existencias")); mutable.value = mutable.value.copy(loading = false, stock = stock) }
            catch (e: CancellationException) { throw e }
            catch (e: Exception) { if (!silent) mutable.value = mutable.value.copy(loading = false, error = e.message ?: "No se pudo cargar el inventario.") }
        }
    }
    /** Idempotent per channel list: reloads when an inventory event arrives or after a reconnection gap. */
    fun startLive(channels: List<String>) {
        live.start(viewModelScope, channels) { signal ->
            if (signal is RealtimeSignal.Event && InventoryEvents.matches(signal.event) || signal is RealtimeSignal.Resync) load(silent = true)
        }
    }
    fun openConsumption(lotId: String) { if (!mutable.value.busy) mutable.value = mutable.value.copy(consumptionLotId = lotId, error = null, notice = null) }
    fun closeConsumption() { if (!mutable.value.busy) mutable.value = mutable.value.copy(consumptionLotId = null, error = null) }
    /** The form stays open (with what was typed) until the API answers; it closes only on success. */
    fun move(stock: InventoryStock, quantity: String, reason: String, patientId: String?) { if (mutable.value.busy) return; val value = quantity.trim().replace(',', '.').toDoubleOrNull(); if (value == null || value <= 0) { mutable.value = mutable.value.copy(error = "La cantidad debe ser mayor que cero."); return }; mutable.value = mutable.value.copy(busy = true, error = null, notice = null); viewModelScope.launch { try { api.request("/inventario/movimientos", "POST", JSONObject().put("type", "consumo").put("lotId", stock.lotId).put("originWarehouseId", stock.warehouseId).put("quantity", value).put("reason", reason.trim()).apply { if (!patientId.isNullOrBlank()) put("patientId", patientId.trim()) }); mutable.value = mutable.value.copy(busy = false, notice = "Consumo registrado.", consumptionLotId = null); load() } catch (e: CancellationException) { mutable.value = mutable.value.copy(busy = false); throw e } catch (e: Exception) { mutable.value = mutable.value.copy(busy = false, error = e.message ?: "No se pudo registrar el consumo.") } } }
    fun clearMessages() { mutable.value = mutable.value.copy(error = null, notice = null) }
    private fun parse(value: Any): List<InventoryStock> { val array = value as? JSONArray ?: return emptyList(); return (0 until array.length()).map { i -> val row = array.getJSONObject(i); InventoryStock(row.optString("lotId"), row.optString("codigo"), row.optString("nombre"), row.optString("warehouseId"), row.optString("warehouseCode", "Bodega"), row.optDouble("quantity", row.optDouble("disponible")), row.optString("unidad"), row.optDouble("minimo"), row.optString("expiresAt"), row.optBoolean("bajo_minimo", false)) } }
}

@Composable fun InventoryScreen(modifier: Modifier = Modifier, profile: AccessProfile? = null, model: InventoryViewModel = viewModel()) {
    val state by model.state.collectAsStateWithLifecycle(); LaunchedEffect(Unit) { model.load() }
    LaunchedEffect(profile?.channels) { profile?.let { model.startLive(it.channels) } }
    val selected = state.consumptionLotId?.let { lotId -> state.stock.firstOrNull { it.lotId == lotId } }
    if (selected != null) ConsumptionDialog(selected, state.busy, state.error, model)
    PageList(modifier) {
        item { SectionIntro("Operaciones / Recursos", "Inventario", "Consulta existencias y registra consumo de insumos o reactivos.") }
        if (state.error != null && state.stock.isNotEmpty()) item { NoticeBanner(NoticeKind.ERROR, state.error!!) }
        state.notice?.let { item { NoticeBanner(NoticeKind.SUCCESS, it) } }
        if (state.lowStock.isNotEmpty()) item {
            SectionCard(stringResource(R.string.inventario_alertas_titulo), eyebrow = stringResource(R.string.op_inventario_alertas)) {
                state.lowStock.forEach { Text(stringResource(R.string.inventario_alerta_articulo, it.code, it.name, it.minimum.toString(), it.unit), style = MaterialTheme.typography.bodyMedium) }
            }
        }
        when {
            state.loading -> item { LoadingState() }
            state.error != null && state.stock.isEmpty() -> item { ErrorState(state.error, onRetry = { model.clearMessages(); model.load() }) }
            state.stock.isEmpty() -> item { EmptyState("No hay existencias registradas.") }
            else -> items(state.stock, key = { it.lotId + it.warehouseId }) { row ->
                SectionCard("${row.code} · ${row.name}", eyebrow = row.warehouse, action = { if (row.belowMinimum) OperacionStatusTag("bajo_minimo", label = stringResource(R.string.inventario_bajo_minimo)) }) {
                    StatTile(row.quantity.toString(), "Disponible", Modifier.fillMaxWidth(), suffix = row.unit)
                    Text(stringResource(R.string.op_inventario_lote, row.lotId.take(8)) + if (row.expires.isBlank()) "" else " · " + stringResource(R.string.op_inventario_vence, row.expires), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    PrimaryButton("Registrar consumo", { model.openConsumption(row.lotId) }, icon = Icons.Default.Add, enabled = !state.busy)
                }
            }
        }
    }
}
@Composable private fun ConsumptionDialog(stock: InventoryStock, busy: Boolean, error: String?, model: InventoryViewModel) {
    var quantity by rememberSaveable(stock.lotId) { mutableStateOf("") }; var reason by rememberSaveable(stock.lotId) { mutableStateOf("") }
    ConfirmDialog(
        title = "Registrar consumo", confirmLabel = "Confirmar", onConfirm = { model.move(stock, quantity, reason, null) }, onDismiss = { model.closeConsumption() }, busy = busy,
        confirmEnabled = quantity.isNotBlank() && reason.trim().length >= 5,
        message = stringResource(R.string.op_inventario_disponible, stock.quantity.toString(), stock.unit),
        body = {
            Column(verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                FormField("Cantidad", quantity, { quantity = it }, enabled = !busy, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal))
                FormField("Motivo", reason, { reason = it }, enabled = !busy, singleLine = false)
                error?.let { NoticeBanner(NoticeKind.ERROR, it) }
            }
        },
    )
}
