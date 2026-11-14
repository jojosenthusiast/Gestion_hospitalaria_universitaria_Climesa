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
import sv.edu.catolica.climesa.domain.LaboratoryOrder

@Composable
fun LaboratoryScreen(profile: AccessProfile, modifier: Modifier = Modifier, ownResults: Boolean = false, model: LaboratoryViewModel = viewModel()) {
    val state by model.state.collectAsStateWithLifecycle()
    var selected by rememberSaveable { mutableStateOf<Pair<String, String>?>(null) }
    var sampleOrderId by rememberSaveable { mutableStateOf<String?>(null) }
    LaunchedEffect(ownResults) { model.path = if (ownResults) "/me/laboratorio" else "/laboratorio/ordenes"; model.load() }
    LaunchedEffect(profile.channels) { model.startLive(profile.channels) }
    val selectedOrder = selected?.let { key -> state.orders.firstOrNull { it.id == key.first } }
    val selectedItem = selectedOrder?.items?.firstOrNull { it.id == selected?.second }
    val sampleOrder = sampleOrderId?.let { id -> state.orders.firstOrNull { it.id == id } }
    if (selectedOrder != null && selectedItem != null) LaboratoryResultDialog(selectedOrder, selectedItem, state.busy, state.error, model, { selected = null })
    if (sampleOrder != null) LaboratorySampleDialog(sampleOrder, state.busy, state.error, model, { sampleOrderId = null })
    val retry = { model.clearMessages(); model.load() }
    PageList(modifier) {
        item { SectionIntro("Atención / Diagnóstico", "Laboratorio", "Órdenes, muestras y resultados con estados trazables.") }
        item { LiveIndicator() }
        state.notice?.let { notice -> item { NoticeBanner(NoticeKind.SUCCESS, notice) } }
        when {
            state.loading && state.orders.isEmpty() -> item { LoadingState() }
            state.error != null && state.orders.isEmpty() -> item { ErrorState(state.error, retry) }
            state.orders.isEmpty() -> item { EmptyState(stringResource(R.string.clin_lab_sin_ordenes), detail = stringResource(R.string.clin_lab_sin_ordenes_detalle)) }
            else -> {
                if (state.loading) item { RefreshHint() }
                state.error?.let { error -> item { NoticeBanner(NoticeKind.ERROR, error) } }
                items(state.orders, key = { it.id }) { order -> LaboratoryOrderCard(order, profile, state.busy, model, { model.clearMessages(); selected = it }, { model.clearMessages(); sampleOrderId = order.id }) }
            }
        }
    }
}

@Composable
private fun LaboratoryOrderCard(order: LaboratoryOrder, profile: AccessProfile, busy: Boolean, model: LaboratoryViewModel, openResult: (Pair<String, String>) -> Unit, openSample: () -> Unit) {
    val canProcess = "laboratorio.procesar" in profile.permissions
    val canValidate = "laboratorio.validar" in profile.permissions
    val canReview = "laboratorio.revisar" in profile.permissions
    val inReview = order.state == "completado" && !order.reviewed
    SectionCard(
        title = order.patientName,
        eyebrow = stringResource(if (order.priority == "urgente") R.string.clin_prioridad_urgente else R.string.clin_prioridad_rutina),
        action = { if (inReview) ClinicalStatusTag(StatusCatalogClinico.UNDER_REVIEW) else StatusTag(order.state) },
    ) {
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
        message = "Confirma expediente y nombre completo antes de tomar la muestra.",
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
