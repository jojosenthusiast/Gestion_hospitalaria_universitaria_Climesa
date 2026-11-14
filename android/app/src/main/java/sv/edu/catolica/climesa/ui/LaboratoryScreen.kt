@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
package sv.edu.catolica.climesa.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.ui.Alignment
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
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
import androidx.compose.ui.res.stringResource
import sv.edu.catolica.climesa.R
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import sv.edu.catolica.climesa.domain.AccessProfile
import sv.edu.catolica.climesa.domain.LaboratoryItem
import sv.edu.catolica.climesa.domain.LaboratoryLabels
import sv.edu.catolica.climesa.domain.AndroidSection
import sv.edu.catolica.climesa.domain.LabFilter
import sv.edu.catolica.climesa.domain.LabFlow
import sv.edu.catolica.climesa.domain.LabStepStatus
import sv.edu.catolica.climesa.domain.LaboratoryOrder
import sv.edu.catolica.climesa.domain.QuickAction
import sv.edu.catolica.climesa.domain.QuickActions

/**
 * Lab orders for the lab, the reviewing doctor and the patient. [section] picks the stage filter that opens first (sample,
 * capture, review); [quickAction] is a dashboard request ("take a sample", "capture a result") that opens the matching dialog once.
 */
@Composable
fun LaboratoryScreen(
    profile: AccessProfile,
    modifier: Modifier = Modifier,
    ownResults: Boolean = false,
    section: AndroidSection? = null,
    quickAction: QuickAction? = null,
    onQuickActionHandled: () -> Unit = {},
    model: LaboratoryViewModel = viewModel(),
) {
    val state by model.state.collectAsStateWithLifecycle()
    var selected by rememberSaveable { mutableStateOf<Pair<String, String>?>(null) }
    var sampleOrderId by rememberSaveable { mutableStateOf<String?>(null) }
    var filterName by rememberSaveable(section) { mutableStateOf(LabFlow.defaultFilter(section).name) }
    val filter = LabFilter.entries.firstOrNull { it.name == filterName } ?: LabFilter.ALL
    LaunchedEffect(ownResults) { model.path = if (ownResults) "/me/laboratorio" else "/laboratorio/ordenes"; model.load() }
    LaunchedEffect(profile.channels) { model.startLive(profile.channels) }
    LaunchedEffect(quickAction, state.loading, state.orders) {
        if (quickAction == null || state.loading) return@LaunchedEffect
        val canProcess = QuickActions.allowed(QuickAction.TAKE_SAMPLE, profile.permissions)
        if (quickAction == QuickAction.TAKE_SAMPLE && canProcess) LabFlow.nextToSample(state.orders)?.let { filterName = LabFilter.REQUESTED.name; sampleOrderId = it.id }
        if (quickAction == QuickAction.CAPTURE_RESULT && canProcess) LabFlow.nextToCapture(state.orders)?.let { (order, item) -> filterName = LabFilter.IN_PROCESS.name; selected = order.id to item.id }
        onQuickActionHandled()
    }
    val selectedOrder = selected?.let { key -> state.orders.firstOrNull { it.id == key.first } }
    val selectedItem = selectedOrder?.items?.firstOrNull { it.id == selected?.second }
    val sampleOrder = sampleOrderId?.let { id -> state.orders.firstOrNull { it.id == id } }
    if (selectedOrder != null && selectedItem != null) LaboratoryResultDialog(selectedOrder, selectedItem, state.busy, state.error, model, { selected = null })
    if (sampleOrder != null) LaboratorySampleDialog(sampleOrder, state.busy, state.error, model, { sampleOrderId = null })
    val retry = { model.clearMessages(); model.load() }
    PageList(modifier) {
        item { SectionIntro("Atención / Diagnóstico", "Laboratorio", stringResource(if (ownResults) R.string.lab_ayuda_paciente else R.string.lab_ayuda)) }
        state.notice?.let { notice -> item { NoticeBanner(NoticeKind.SUCCESS, notice) } }
        when {
            state.loading && state.orders.isEmpty() -> item { LoadingState() }
            state.error != null && state.orders.isEmpty() -> item { ErrorState(state.error, retry) }
            state.orders.isEmpty() -> item { EmptyState(stringResource(R.string.clin_lab_sin_ordenes), detail = stringResource(R.string.clin_lab_sin_ordenes_detalle)) }
            else -> {
                if (state.loading) item { RefreshHint() }
                state.error?.let { error -> item { NoticeBanner(NoticeKind.ERROR, error) } }
                if (!ownResults) item {
                    LazyRow(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                        items(LabFilter.entries) { option -> FilterChip(filter == option, { filterName = option.name }, { Text("${option.label} (${state.orders.count(option::matches)})") }) }
                    }
                }
                val visible = state.orders.filter(filter::matches)
                if (visible.isEmpty()) item { EmptyState(stringResource(R.string.lab_filtro_vacio), detail = stringResource(R.string.lab_filtro_vacio_detalle)) }
                items(visible, key = { it.id }) { order -> LaboratoryOrderCard(order, profile, ownResults, state.busy, model, { model.clearMessages(); selected = it }, { model.clearMessages(); sampleOrderId = order.id }) }
            }
        }
    }
}

@Composable
private fun LaboratoryOrderCard(order: LaboratoryOrder, profile: AccessProfile, ownView: Boolean, busy: Boolean, model: LaboratoryViewModel, openResult: (Pair<String, String>) -> Unit, openSample: () -> Unit) {
    val canProcess = "laboratorio.procesar" in profile.permissions
    val canValidate = "laboratorio.validar" in profile.permissions
    val canReview = "laboratorio.revisar" in profile.permissions
    val inReview = order.state == "completado" && !order.reviewed
    SectionCard(
        title = order.patientName,
        eyebrow = stringResource(if (order.priority == "urgente") R.string.clin_prioridad_urgente else R.string.clin_prioridad_rutina),
        action = { if (inReview) ClinicalStatusTag(StatusCatalogClinico.UNDER_REVIEW) else StatusTag(order.state) },
    ) {
        LabStepper(order, ownView)
        order.items.forEach { item ->
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Spacing.sm), verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                Text("${item.code} · ${item.name}", Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
                val result = item.result
                if (result != null) LabMarkTag(result.mark, LaboratoryLabels.valueAndMark(result))
                else Text(if (inReview) stringResource(R.string.lab_valor_en_revision) else stringResource(R.string.clin_lab_pendiente), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        if (canProcess && order.state == "pendiente") PrimaryButton("Tomar muestra", openSample, enabled = !busy)
        if (canProcess && order.state == "en_proceso") order.items.filter { it.result == null }.forEach { item -> SecondaryButton(stringResource(R.string.clin_lab_resultado_de, item.code), { openResult(order.id to item.id) }, enabled = !busy) }
        if (canValidate) LabFlow.completionBlocker(order)?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        if (canValidate && order.state == "en_proceso") PrimaryButton("Completar", { model.complete(order) }, enabled = !busy && order.items.all { it.result != null }, loading = busy)
        if (canReview && inReview) PrimaryButton("Revisar", { model.review(order) }, enabled = !busy, loading = busy)
    }
}

@Composable
private fun LaboratorySampleDialog(order: LaboratoryOrder, busy: Boolean, error: String?, model: LaboratoryViewModel, onClose: () -> Unit) {
    var expediente by rememberSaveable(order.id) { mutableStateOf("") }
    var nombreCompleto by rememberSaveable(order.id) { mutableStateOf("") }
    ConfirmDialog(
        title = "Confirmar identidad",
        confirmLabel = "Confirmar",
        onConfirm = { model.sample(order, expediente, nombreCompleto, onClose) },
        onDismiss = onClose,
        message = "Confirma expediente y nombre completo antes de tomar la muestra. Al confirmar, la orden pasa a En proceso.",
        busy = busy,
        confirmEnabled = expediente.isNotBlank() && nombreCompleto.isNotBlank(),
    ) {
        error?.let { NoticeBanner(NoticeKind.ERROR, it) }
        FormField("Número de expediente", expediente, { expediente = it })
        FormField("Nombre completo", nombreCompleto, { nombreCompleto = it })
    }
}

@Composable
private fun LaboratoryResultDialog(order: LaboratoryOrder, item: LaboratoryItem, busy: Boolean, error: String?, model: LaboratoryViewModel, onClose: () -> Unit) {
    var value by rememberSaveable(item.id) { mutableStateOf(item.result?.value?.toString().orEmpty()) }
    var text by rememberSaveable(item.id) { mutableStateOf(item.result?.text.orEmpty()) }
    ConfirmDialog(
        title = stringResource(R.string.clin_lab_resultado_de, item.code),
        confirmLabel = "Guardar",
        onConfirm = { model.saveResult(order, item, value, text, onClose) },
        onDismiss = onClose,
        message = item.name,
        busy = busy,
        confirmEnabled = value.isNotBlank() || text.isNotBlank(),
    ) {
        error?.let { NoticeBanner(NoticeKind.ERROR, it) }
        FormField("Valor numérico", value, { value = it })
        FormField("Resultado textual", text, { text = it.take(5000) }, singleLine = false)
        Text("La marca se calculará automáticamente según el rango vigente.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

/**
 * Journey of the order: Solicitada, Muestra, En proceso, Completada, Revisada, Visible al paciente. Done steps are green with a
 * check, the current one is blue with a ring, pending ones are empty; the caption and the next hand-off say it in words too.
 */
@Composable
private fun LabStepper(order: LaboratoryOrder, ownView: Boolean) {
    val steps = LabFlow.steps(order)
    if (steps.isEmpty()) {
        Text(LabFlow.nextStep(order, ownView), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        return
    }
    val colors = MaterialTheme.climesa
    val current = steps.indexOfFirst { it.status == LabStepStatus.CURRENT }
    val summary = steps.joinToString(", ") { "${it.label}: " + when (it.status) { LabStepStatus.DONE -> "hecho"; LabStepStatus.CURRENT -> "ahora"; LabStepStatus.PENDING -> "pendiente" } }
    Column(Modifier.fillMaxWidth().semantics { contentDescription = summary }, verticalArrangement = Arrangement.spacedBy(Spacing.xs + 2.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            steps.forEachIndexed { index, step ->
                if (index > 0) Box(Modifier.weight(1f).height(2.dp).background(if (steps[index - 1].status == LabStepStatus.DONE) colors.success else colors.line))
                val fill = when (step.status) { LabStepStatus.DONE -> colors.success; LabStepStatus.CURRENT -> colors.processSoft; LabStepStatus.PENDING -> MaterialTheme.colorScheme.surface }
                val ring = when (step.status) { LabStepStatus.DONE -> colors.success; LabStepStatus.CURRENT -> colors.process; LabStepStatus.PENDING -> colors.line }
                Box(Modifier.size(22.dp).background(fill, CircleShape).border(2.dp, ring, CircleShape), contentAlignment = Alignment.Center) {
                    if (step.status == LabStepStatus.DONE) Icon(Icons.Default.Check, null, Modifier.size(14.dp), tint = MaterialTheme.colorScheme.surface)
                    if (step.status == LabStepStatus.CURRENT) Box(Modifier.size(8.dp).background(colors.process, CircleShape))
                }
            }
        }
        Text(
            if (current >= 0) stringResource(R.string.lab_paso_actual, current + 1, steps.size, steps[current].label) else stringResource(R.string.lab_paso_completo),
            style = MaterialTheme.typography.labelLarge,
        )
        Text(LabFlow.nextStep(order, ownView), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}
