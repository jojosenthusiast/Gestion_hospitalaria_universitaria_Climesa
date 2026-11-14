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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Bed
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import sv.edu.catolica.climesa.R
import sv.edu.catolica.climesa.data.ApiGateway
import sv.edu.catolica.climesa.data.realtime.LiveSubscription
import sv.edu.catolica.climesa.data.realtime.RealtimeRepository
import sv.edu.catolica.climesa.domain.AccessProfile
import sv.edu.catolica.climesa.domain.AdmissionAction
import sv.edu.catolica.climesa.domain.AdmissionEvents
import sv.edu.catolica.climesa.domain.ChangeReason
import sv.edu.catolica.climesa.domain.DischargePending
import sv.edu.catolica.climesa.domain.DischargeType
import sv.edu.catolica.climesa.domain.HospitalizationRules
import sv.edu.catolica.climesa.domain.QuickAction
import sv.edu.catolica.climesa.domain.QuickActions
import sv.edu.catolica.climesa.domain.RealtimeSignal

data class HospitalAdmission(val id: String, val patientName: String, val state: String, val bed: String, val category: String, val isolation: Boolean, val version: Int)
data class HospitalBedSuggestion(val id: String, val version: Int, val code: String, val room: String, val category: String, val reason: String)

/** Discharge form typed by the physician; it lives in the ViewModel so rotating the phone keeps it. */
data class DischargeForm(
    val admissionId: String,
    val type: DischargeType = DischargeType.MEDICAL,
    val summary: String = "",
    val pending: List<DischargePending> = emptyList(),
    val voluntaryConsent: Boolean = false,
)

data class HospitalizationState(
    val loading: Boolean = true,
    val busy: Boolean = false,
    val admissions: List<HospitalAdmission> = emptyList(),
    val suggestions: List<HospitalBedSuggestion> = emptyList(),
    val selectedId: String? = null,
    val assignReason: String = "",
    val discharge: DischargeForm? = null,
    val exitId: String? = null,
    val exitReason: String = "",
    /** Validation or API error of the open dialog; the dialog stays open and keeps what was typed. */
    val formError: String? = null,
    val error: String? = null,
    val notice: String? = null,
)

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

    fun open(admission: HospitalAdmission) {
        mutable.update { it.copy(selectedId = admission.id, suggestions = emptyList(), assignReason = "", formError = null, error = null) }
        viewModelScope.launch {
            try { val suggestions = parseSuggestions(api.request("/admisiones/${admission.id}/sugerencias-cama")); mutable.update { it.copy(suggestions = suggestions) } }
            catch (e: CancellationException) { throw e }
            catch (e: Exception) { mutable.update { it.copy(formError = e.message ?: "No se pudieron consultar las camas.") } }
        }
    }
    fun close() = mutable.update { it.copy(selectedId = null, suggestions = emptyList(), assignReason = "", formError = null) }
    fun onAssignReason(text: String) = mutable.update { it.copy(assignReason = text.take(ChangeReason.MAX), formError = null) }
    fun assign(admission: HospitalAdmission, suggestion: HospitalBedSuggestion) {
        val reason = mutable.value.assignReason
        HospitalizationRules.assignReasonError(reason)?.let { error -> mutable.update { it.copy(formError = error) }; return }
        mutate("/admisiones/${admission.id}/cama", HospitalizationRules.assignBody(suggestion.id, suggestion.version, reason), "Cama asignada.")
    }

    fun openDischarge(admission: HospitalAdmission) = mutable.update { it.copy(discharge = DischargeForm(admission.id), formError = null, error = null) }
    fun closeDischarge() = mutable.update { it.copy(discharge = null, formError = null) }
    fun onDischargeType(type: DischargeType) = updateDischarge { it.copy(type = type) }
    fun onSummary(text: String) = updateDischarge { it.copy(summary = text.take(HospitalizationRules.SUMMARY_MAX)) }
    fun onVoluntaryConsent(value: Boolean) = updateDischarge { it.copy(voluntaryConsent = value) }
    fun addPending() = updateDischarge { it.copy(pending = it.pending + DischargePending()) }
    fun removePending(index: Int) = updateDischarge { form -> form.copy(pending = form.pending.filterIndexed { i, _ -> i != index }) }
    fun onPending(index: Int, item: DischargePending) = updateDischarge { form -> form.copy(pending = form.pending.mapIndexed { i, current -> if (i == index) item.copy(description = item.description.take(500), responsible = item.responsible.take(200)) else current }) }
    fun signDischarge(admission: HospitalAdmission) {
        val form = mutable.value.discharge?.takeIf { it.admissionId == admission.id } ?: return
        HospitalizationRules.dischargeError(form.type, form.summary, form.pending, form.voluntaryConsent)?.let { error -> mutable.update { it.copy(formError = error) }; return }
        mutate("/admisiones/${admission.id}/alta", HospitalizationRules.dischargeBody(admission.version, form.type, form.summary, form.pending, form.voluntaryConsent), "Alta firmada.")
    }

    fun openExit(admission: HospitalAdmission) = mutable.update { it.copy(exitId = admission.id, exitReason = "", formError = null, error = null) }
    fun closeExit() = mutable.update { it.copy(exitId = null, exitReason = "", formError = null) }
    fun onExitReason(text: String) = mutable.update { it.copy(exitReason = text.take(ChangeReason.MAX), formError = null) }
    fun registerExit(admission: HospitalAdmission) {
        val reason = mutable.value.exitReason
        HospitalizationRules.exitReasonError(reason)?.let { error -> mutable.update { it.copy(formError = error) }; return }
        mutate("/admisiones/${admission.id}/salida", HospitalizationRules.exitBody(admission.version, reason), "Salida registrada; cama enviada a limpieza.")
    }

    fun clearMessages() { mutable.value = mutable.value.copy(error = null, notice = null) }

    private fun updateDischarge(change: (DischargeForm) -> DischargeForm) = mutable.update { state -> state.copy(discharge = state.discharge?.let(change), formError = null) }

    /** On success every dialog closes; on failure the open dialog keeps what was typed and shows the error. */
    private fun mutate(path: String, body: JSONObject, notice: String) {
        if (mutable.value.busy) return
        mutable.update { it.copy(busy = true, formError = null, error = null, notice = null) }
        viewModelScope.launch {
            try {
                api.request(path, "POST", body)
                mutable.update { it.copy(busy = false, notice = notice, selectedId = null, suggestions = emptyList(), assignReason = "", discharge = null, exitId = null, exitReason = "") }
                load(silent = true)
            } catch (e: CancellationException) { throw e
            } catch (e: Exception) { mutable.update { it.copy(busy = false, formError = e.message ?: "No se pudo completar la operación.") } }
        }
    }
    private fun parseAdmissions(value: Any): List<HospitalAdmission> { val array = value as? JSONArray ?: return emptyList(); return (0 until array.length()).map { i -> val row = array.getJSONObject(i); HospitalAdmission(row.optString("id"), row.optString("patientName", "Paciente"), row.optString("state"), row.optString("bed"), row.optString("requestedCategory"), row.optBoolean("isolation"), row.optInt("version", 1)) } }
    private fun parseSuggestions(value: Any): List<HospitalBedSuggestion> { val array = value as? JSONArray ?: return emptyList(); return (0 until array.length()).map { i -> val row = array.getJSONObject(i); HospitalBedSuggestion(row.optString("id"), row.optInt("version", 1), row.optString("code"), row.optString("room"), row.optString("category"), row.optString("reason")) } }
}

@Composable
fun HospitalizationScreen(
    modifier: Modifier = Modifier,
    profile: AccessProfile? = null,
    quickAction: QuickAction? = null,
    onQuickActionHandled: () -> Unit = {},
    model: HospitalizationViewModel = viewModel(),
) {
    val state by model.state.collectAsStateWithLifecycle(); LaunchedEffect(Unit) { model.load() }
    // A dashboard asked to "assign a bed": open the bed suggestions of the first admission still waiting for one.
    LaunchedEffect(quickAction, state.loading, state.admissions) {
        if (quickAction == null || state.loading) return@LaunchedEffect
        if (quickAction == QuickAction.ASSIGN_BED && QuickActions.allowed(QuickAction.ASSIGN_BED, profile?.permissions.orEmpty())) state.admissions.firstOrNull { it.state == "pendiente_cama" }?.let(model::open)
        onQuickActionHandled()
    }
    LaunchedEffect(profile?.channels) { profile?.let { model.startLive(it.channels) } }
    val permissions = profile?.permissions.orEmpty()
    state.selectedId?.let { id -> state.admissions.firstOrNull { it.id == id } }?.let { BedSuggestionDialog(it, state, model) }
    state.discharge?.let { form -> state.admissions.firstOrNull { it.id == form.admissionId }?.let { DischargeDialog(it, form, state, model) } }
    state.exitId?.let { id -> state.admissions.firstOrNull { it.id == id } }?.let { ExitDialog(it, state, model) }
    val retry = { model.clearMessages(); model.load() }
    PageList(modifier) {
        item { SectionIntro("Hospital / Admisiones", "Hospitalización", "Asigna cama, gestiona el alta y registra la salida física.") }
        state.notice?.let { item { NoticeBanner(NoticeKind.SUCCESS, it) } }
        when {
            state.loading && state.admissions.isEmpty() -> item { LoadingState() }
            state.error != null && state.admissions.isEmpty() -> item { ErrorState(state.error, retry) }
            state.admissions.isEmpty() -> item { EmptyState(stringResource(R.string.clin_hosp_sin_admisiones), detail = stringResource(R.string.clin_hosp_sin_admisiones_detalle), icon = Icons.Default.Bed) }
            else -> {
                if (state.loading) item { RefreshHint() }
                state.error?.let { error -> item { NoticeBanner(NoticeKind.ERROR, error) } }
                items(state.admissions, key = { it.id }) { row -> AdmissionCard(row, HospitalizationRules.actions(row.state, permissions), state.busy, model) }
            }
        }
    }
}

@Composable
private fun AdmissionCard(row: HospitalAdmission, actions: Set<AdmissionAction>, busy: Boolean, model: HospitalizationViewModel) {
    SectionCard(title = row.patientName, eyebrow = row.category, action = { StatusTag(row.state) }) {
        Row(horizontalArrangement = Arrangement.spacedBy(Spacing.lg)) {
            LabeledValue("Cama", if (row.bed.isBlank()) stringResource(R.string.clin_hosp_sin_cama) else row.bed, Modifier.weight(1f))
            if (row.isolation) StatusPill(stringResource(R.string.clin_hosp_aislamiento), StatusTone.DANGER)
        }
        if (AdmissionAction.ASSIGN_BED in actions) SecondaryButton(stringResource(R.string.hosp_asignar_cama), { model.open(row) }, icon = Icons.Default.Bed, enabled = !busy)
        if (AdmissionAction.SIGN_DISCHARGE in actions) PrimaryButton(stringResource(R.string.hosp_firmar_alta), { model.openDischarge(row) }, enabled = !busy)
        if (AdmissionAction.REGISTER_EXIT in actions) PrimaryButton(stringResource(R.string.hosp_registrar_salida), { model.openExit(row) }, enabled = !busy)
    }
}

@Composable private fun BedSuggestionDialog(admission: HospitalAdmission, state: HospitalizationState, model: HospitalizationViewModel) {
    var selected by rememberSaveable(admission.id) { mutableStateOf("") }; val suggestion = state.suggestions.firstOrNull { it.id == selected }
    ConfirmDialog(
        title = stringResource(R.string.clin_hosp_seleccionar_cama),
        confirmLabel = stringResource(R.string.clin_hosp_confirmar_cama),
        onConfirm = { if (suggestion != null) model.assign(admission, suggestion) },
        onDismiss = model::close,
        busy = state.busy,
        confirmEnabled = suggestion != null,
    ) {
        Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            state.formError?.let { NoticeBanner(NoticeKind.ERROR, it) }
            if (state.suggestions.isEmpty()) Text(stringResource(R.string.clin_hosp_buscando_camas), style = MaterialTheme.typography.bodySmall) else state.suggestions.forEach { row ->
                DataRow(
                    title = "${row.code} · ${row.room}",
                    subtitle = "${row.category} · ${row.reason}",
                    leadingIcon = if (row.id == selected) Icons.Default.Check else Icons.Default.Bed,
                    onClick = { selected = row.id },
                )
            }
            FormField(stringResource(R.string.hosp_motivo_asignacion), state.assignReason, model::onAssignReason, hint = stringResource(R.string.hosp_motivo_opcional_ayuda), enabled = !state.busy, singleLine = false)
        }
    }
}

@Composable private fun DischargeDialog(admission: HospitalAdmission, form: DischargeForm, state: HospitalizationState, model: HospitalizationViewModel) {
    ConfirmDialog(
        title = stringResource(R.string.hosp_firmar_alta),
        confirmLabel = stringResource(R.string.hosp_firmar_alta),
        onConfirm = { model.signDischarge(admission) },
        onDismiss = model::closeDischarge,
        busy = state.busy,
        confirmEnabled = form.summary.trim().length >= HospitalizationRules.SUMMARY_MIN,
    ) {
        Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text(admission.patientName, style = MaterialTheme.typography.titleSmall)
            state.formError?.let { NoticeBanner(NoticeKind.ERROR, it) }
            Text(stringResource(R.string.hosp_alta_tipo), style = MaterialTheme.typography.labelLarge)
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) { DischargeType.entries.take(2).forEach { type -> FilterChip(selected = form.type == type, onClick = { model.onDischargeType(type) }, label = { Text(type.label) }, enabled = !state.busy) } }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) { DischargeType.entries.drop(2).forEach { type -> FilterChip(selected = form.type == type, onClick = { model.onDischargeType(type) }, label = { Text(type.label) }, enabled = !state.busy) } }
            FormField(stringResource(R.string.hosp_alta_resumen), form.summary, model::onSummary, hint = stringResource(R.string.hosp_alta_resumen_ayuda), enabled = !state.busy, singleLine = false)
            if (form.type == DischargeType.VOLUNTARY) Row(verticalAlignment = Alignment.CenterVertically) { Checkbox(form.voluntaryConsent, model::onVoluntaryConsent, enabled = !state.busy); Text(stringResource(R.string.hosp_alta_constancia), style = MaterialTheme.typography.bodySmall) }
            Text(stringResource(R.string.hosp_alta_pendientes), style = MaterialTheme.typography.labelLarge)
            form.pending.forEachIndexed { index, item ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        FormField(stringResource(R.string.hosp_alta_pendiente), item.description, { model.onPending(index, item.copy(description = it)) }, enabled = !state.busy)
                        FormField(stringResource(R.string.hosp_alta_responsable), item.responsible, { model.onPending(index, item.copy(responsible = it)) }, enabled = !state.busy)
                    }
                    IconButton(onClick = { model.removePending(index) }, enabled = !state.busy) { Icon(Icons.Default.Close, stringResource(R.string.hosp_alta_quitar)) }
                }
            }
            TextButton(onClick = model::addPending, enabled = !state.busy) { Text(stringResource(R.string.hosp_alta_agregar)) }
        }
    }
}

@Composable private fun ExitDialog(admission: HospitalAdmission, state: HospitalizationState, model: HospitalizationViewModel) {
    ConfirmDialog(
        title = stringResource(R.string.hosp_registrar_salida),
        confirmLabel = stringResource(R.string.hosp_registrar_salida),
        onConfirm = { model.registerExit(admission) },
        onDismiss = model::closeExit,
        message = stringResource(R.string.hosp_salida_detalle),
        busy = state.busy,
        confirmEnabled = ChangeReason.error(state.exitReason) == null,
    ) {
        Text(admission.patientName, style = MaterialTheme.typography.titleSmall)
        state.formError?.let { NoticeBanner(NoticeKind.ERROR, it) }
        FormField(stringResource(R.string.hosp_salida_motivo), state.exitReason, model::onExitReason, hint = stringResource(R.string.hosp_motivo_ayuda), enabled = !state.busy, singleLine = false)
    }
}
