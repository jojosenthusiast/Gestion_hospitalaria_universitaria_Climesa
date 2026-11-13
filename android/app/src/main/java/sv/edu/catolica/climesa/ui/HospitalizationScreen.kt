@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
package sv.edu.catolica.climesa.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Bed
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
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
import sv.edu.catolica.climesa.domain.AdmissionEvents
import sv.edu.catolica.climesa.domain.RealtimeSignal

data class HospitalAdmission(val id: String, val patientName: String, val state: String, val bed: String, val category: String, val isolation: Boolean, val version: Int)
data class HospitalBedSuggestion(val id: String, val version: Int, val code: String, val room: String, val category: String, val reason: String)
data class HospitalizationState(val loading: Boolean = true, val busy: Boolean = false, val admissions: List<HospitalAdmission> = emptyList(), val suggestions: List<HospitalBedSuggestion> = emptyList(), val selectedId: String? = null, val error: String? = null, val notice: String? = null)

@HiltViewModel
class HospitalizationViewModel @Inject constructor(private val api: ApiGateway, realtime: RealtimeRepository) : ViewModel() {
    private val mutable = MutableStateFlow(HospitalizationState())
    val state = mutable.asStateFlow()
    private val live = LiveSubscription(realtime)
    private var loadJob: Job? = null
    /** A [silent] reload (realtime invalidation) keeps the open dialog, messages and shown admissions, even if it fails. */
    fun load(silent: Boolean = false) {
        if (!silent) mutable.value = mutable.value.copy(loading = true, error = null)
        loadJob?.cancel()
        loadJob = viewModelScope.launch {
            try { val admissions = parseAdmissions(api.request("/admisiones")); mutable.value = mutable.value.copy(loading = false, admissions = admissions) }
            catch (e: CancellationException) { throw e }
            catch (e: Exception) { if (!silent) mutable.value = mutable.value.copy(loading = false, error = e.message ?: "No se pudieron cargar las admisiones.") }
        }
    }
    /** Idempotent per channel list: reloads when an admission event arrives or after a reconnection gap. */
    fun startLive(channels: List<String>) {
        live.start(viewModelScope, channels) { signal ->
            if (signal is RealtimeSignal.Event && AdmissionEvents.matches(signal.event) || signal is RealtimeSignal.Resync) load(silent = true)
        }
    }
    fun open(admission: HospitalAdmission) { mutable.value = mutable.value.copy(selectedId = admission.id, suggestions = emptyList(), error = null); viewModelScope.launch { try { mutable.value = mutable.value.copy(suggestions = parseSuggestions(api.request("/admisiones/${admission.id}/sugerencias-cama"))) } catch (e: Exception) { mutable.value = mutable.value.copy(error = e.message ?: "No se pudieron consultar las camas.") } } }
    fun close() { mutable.value = mutable.value.copy(selectedId = null, suggestions = emptyList(), error = null) }
    fun assign(admission: HospitalAdmission, suggestion: HospitalBedSuggestion) = mutate("/admisiones/${admission.id}/cama", JSONObject().put("bedId", suggestion.id).put("version", suggestion.version).put("reason", "Asignación confirmada desde Android."), "Cama asignada.")
    fun signDischarge(admission: HospitalAdmission) = mutate("/admisiones/${admission.id}/alta", JSONObject().put("type", "medica").put("summary", "Alta médica registrada desde Android.").put("pending", JSONArray()), "Alta firmada.")
    fun registerExit(admission: HospitalAdmission) = mutate("/admisiones/${admission.id}/salida", JSONObject().put("version", admission.version).put("reason", "Salida física registrada desde Android."), "Salida registrada; cama enviada a limpieza.")
    fun clearMessages() { mutable.value = mutable.value.copy(error = null, notice = null) }
    private fun mutate(path: String, body: JSONObject, notice: String) { mutable.value = mutable.value.copy(busy = true, error = null, notice = null); viewModelScope.launch { try { api.request(path, "POST", body); mutable.value = mutable.value.copy(busy = false, notice = notice, selectedId = null); load() } catch (e: CancellationException) { throw e } catch (e: Exception) { mutable.value = mutable.value.copy(busy = false, error = e.message ?: "No se pudo completar la operación.") } } }
    private fun parseAdmissions(value: Any): List<HospitalAdmission> { val array = value as? JSONArray ?: return emptyList(); return (0 until array.length()).map { i -> val row = array.getJSONObject(i); HospitalAdmission(row.optString("id"), row.optString("patientName", "Paciente"), row.optString("state"), row.optString("bed"), row.optString("requestedCategory"), row.optBoolean("isolation"), row.optInt("version", 1)) } }
    private fun parseSuggestions(value: Any): List<HospitalBedSuggestion> { val array = value as? JSONArray ?: return emptyList(); return (0 until array.length()).map { i -> val row = array.getJSONObject(i); HospitalBedSuggestion(row.optString("id"), row.optInt("version", 1), row.optString("code"), row.optString("room"), row.optString("category"), row.optString("reason")) } }
}

@Composable
fun HospitalizationScreen(modifier: Modifier = Modifier, profile: AccessProfile? = null, model: HospitalizationViewModel = viewModel()) {
    val state by model.state.collectAsStateWithLifecycle(); LaunchedEffect(Unit) { model.load() }
    LaunchedEffect(profile?.channels) { profile?.let { model.startLive(it.channels) } }
    val admission = state.selectedId?.let { id -> state.admissions.firstOrNull { it.id == id } }
    if (admission != null) BedSuggestionDialog(admission, state, model)
    LazyColumn(modifier, contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item { SectionIntro("Hospital / Admisiones", "Hospitalización", "Asigna cama, gestiona el alta y registra la salida física.") }
        state.error?.let { item { ClimesaActionGroup { Text(it, color = MaterialTheme.colorScheme.error); ClimesaButton("Reintentar", Icons.Default.Refresh, { model.clearMessages(); model.load() }, outlined = true) } } }
        state.notice?.let { item { InlineStatus(it, Icons.Default.Check) } }
        if (state.loading) item { CircularProgressIndicator() } else if (state.admissions.isEmpty()) item { ClimesaCard { Text("No hay admisiones activas.", Modifier.padding(18.dp)) } } else items(state.admissions, key = { it.id }) { row ->
            ClimesaCard { Column(Modifier.fillMaxWidth().padding(18.dp), verticalArrangement = Arrangement.spacedBy(7.dp)) {
                Text(row.patientName, style = MaterialTheme.typography.titleMedium); Text("${row.category} · ${row.state}", color = MaterialTheme.colorScheme.primary); Text(if (row.bed.isBlank()) "Sin cama asignada" else "Cama: ${row.bed}", style = MaterialTheme.typography.bodySmall); if (row.isolation) Text("Aislamiento activo", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) { if (row.state == "pendiente_cama") OutlinedButton(onClick = { model.open(row) }, enabled = !state.busy) { Icon(Icons.Default.Bed, null); Text("Asignar cama") }; if (row.state == "hospitalizado") Button(onClick = { model.signDischarge(row) }, enabled = !state.busy) { Text("Firmar alta") }; if (row.state == "alta_firmada") Button(onClick = { model.registerExit(row) }, enabled = !state.busy) { Text("Registrar salida") } }
            } }
        }
    }
}

@Composable private fun BedSuggestionDialog(admission: HospitalAdmission, state: HospitalizationState, model: HospitalizationViewModel) {
    var selected by rememberSaveable(admission.id) { mutableStateOf("") }; val suggestion = state.suggestions.firstOrNull { it.id == selected }
    AlertDialog(onDismissRequest = { if (!state.busy) model.close() }, title = { Text("Seleccionar cama") }, text = { Column(verticalArrangement = Arrangement.spacedBy(8.dp)) { if (state.suggestions.isEmpty()) Text("Buscando camas compatibles…") else state.suggestions.forEach { row -> OutlinedButton(onClick = { selected = row.id }, modifier = Modifier.fillMaxWidth()) { Column(Modifier.fillMaxWidth()) { Text("${row.code} · ${row.room}"); Text("${row.category} · ${row.reason}", style = MaterialTheme.typography.bodySmall) } } } } }, confirmButton = { Button(onClick = { if (suggestion != null) model.assign(admission, suggestion) }, enabled = suggestion != null && !state.busy) { Text(if (state.busy) "Guardando…" else "Confirmar cama") } }, dismissButton = { TextButton(onClick = model::close, enabled = !state.busy) { Text("Cancelar") } })
}
