@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
package sv.edu.catolica.climesa.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
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
import sv.edu.catolica.climesa.data.ApiGateway
import sv.edu.catolica.climesa.data.realtime.LiveSubscription
import sv.edu.catolica.climesa.data.realtime.RealtimeRepository
import sv.edu.catolica.climesa.domain.AccessProfile
import sv.edu.catolica.climesa.domain.InventoryEvents
import sv.edu.catolica.climesa.domain.RealtimeSignal

data class InventoryStock(val lotId: String, val code: String, val name: String, val warehouseId: String, val warehouse: String, val quantity: Double, val unit: String, val minimum: Double, val expires: String)
data class InventoryState(val loading: Boolean = true, val busy: Boolean = false, val stock: List<InventoryStock> = emptyList(), val error: String? = null, val notice: String? = null)

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
    fun move(stock: InventoryStock, quantity: String, reason: String, patientId: String?) { val value = quantity.trim().toDoubleOrNull(); if (value == null || value <= 0) { mutable.value = mutable.value.copy(error = "La cantidad debe ser mayor que cero."); return }; mutable.value = mutable.value.copy(busy = true, error = null, notice = null); viewModelScope.launch { try { api.request("/inventario/movimientos", "POST", JSONObject().put("type", "consumo").put("lotId", stock.lotId).put("originWarehouseId", stock.warehouseId).put("quantity", value).put("reason", reason.trim()).apply { if (!patientId.isNullOrBlank()) put("patientId", patientId.trim()) }); mutable.value = mutable.value.copy(busy = false, notice = "Consumo registrado."); load() } catch (e: CancellationException) { throw e } catch (e: Exception) { mutable.value = mutable.value.copy(busy = false, error = e.message ?: "No se pudo registrar el consumo.") } } }
    fun clearMessages() { mutable.value = mutable.value.copy(error = null, notice = null) }
    private fun parse(value: Any): List<InventoryStock> { val array = value as? JSONArray ?: return emptyList(); return (0 until array.length()).map { i -> val row = array.getJSONObject(i); InventoryStock(row.optString("lotId"), row.optString("codigo"), row.optString("nombre"), row.optString("warehouseId"), row.optString("warehouseCode", "Bodega"), row.optDouble("quantity", row.optDouble("disponible")), row.optString("unidad"), row.optDouble("minimo"), row.optString("expiresAt")) } }
}

@Composable fun InventoryScreen(modifier: Modifier = Modifier, profile: AccessProfile? = null, model: InventoryViewModel = viewModel()) {
    val state by model.state.collectAsStateWithLifecycle(); var selectedLotId by rememberSaveable { mutableStateOf<String?>(null) }; LaunchedEffect(Unit) { model.load() }
    LaunchedEffect(profile?.channels) { profile?.let { model.startLive(it.channels) } }
    val selected = selectedLotId?.let { lotId -> state.stock.firstOrNull { it.lotId == lotId } }
    if (selected != null) ConsumptionDialog(selected, state.busy, model) { selectedLotId = null }
    LazyColumn(modifier, contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item { SectionIntro("Operaciones / Recursos", "Inventario", "Consulta existencias y registra consumo de insumos o reactivos.") }
        state.error?.let { item { ClimesaActionGroup { Text(it, color = MaterialTheme.colorScheme.error); ClimesaButton("Reintentar", Icons.Default.Refresh, { model.clearMessages(); model.load() }, outlined = true) } } }
        state.notice?.let { item { InlineStatus(it, Icons.Default.Check) } }
        if (state.loading) item { CircularProgressIndicator() } else if (state.stock.isEmpty()) item { ClimesaCard { Text("No hay existencias registradas.", Modifier.padding(18.dp)) } } else items(state.stock, key = { it.lotId + it.warehouseId }) { row -> ClimesaCard { Column(Modifier.fillMaxWidth().padding(18.dp), verticalArrangement = Arrangement.spacedBy(7.dp)) { Text("${row.code} · ${row.name}", style = MaterialTheme.typography.titleMedium); Text("${row.quantity} ${row.unit} · ${row.warehouse}", color = MaterialTheme.colorScheme.primary); Text("Lote ${row.lotId.take(8)}${if (row.expires.isBlank()) "" else " · vence ${row.expires}"}", style = MaterialTheme.typography.bodySmall); if (row.quantity <= row.minimum) Text("Bajo mínimo", color = MaterialTheme.colorScheme.error); Button(onClick = { selectedLotId = row.lotId }, enabled = !state.busy) { Icon(Icons.Default.Add, null); Text("Registrar consumo") } } } }
    }
}
@Composable private fun ConsumptionDialog(stock: InventoryStock, busy: Boolean, model: InventoryViewModel, onClose: () -> Unit) { var quantity by rememberSaveable(stock.lotId) { mutableStateOf("") }; var reason by rememberSaveable(stock.lotId) { mutableStateOf("") }; AlertDialog(onDismissRequest = { if (!busy) onClose() }, title = { Text("Registrar consumo") }, text = { Column(verticalArrangement = Arrangement.spacedBy(10.dp)) { Text("Disponible: ${stock.quantity} ${stock.unit}", style = MaterialTheme.typography.bodySmall); OutlinedTextField(quantity, { quantity = it }, label = { Text("Cantidad") }, modifier = Modifier.fillMaxWidth(), singleLine = true); OutlinedTextField(reason, { reason = it }, label = { Text("Motivo") }, modifier = Modifier.fillMaxWidth(), minLines = 2) } }, confirmButton = { Button(onClick = { model.move(stock, quantity, reason, null); onClose() }, enabled = !busy && quantity.isNotBlank() && reason.trim().length >= 5) { Text(if (busy) "Guardando…" else "Confirmar") } }, dismissButton = { TextButton(onClick = onClose, enabled = !busy) { Text("Cancelar") } }) }
