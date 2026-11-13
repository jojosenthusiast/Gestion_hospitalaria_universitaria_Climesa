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
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import sv.edu.catolica.climesa.domain.AccessProfile
import sv.edu.catolica.climesa.domain.LaboratoryItem
import sv.edu.catolica.climesa.domain.LaboratoryLabels
import sv.edu.catolica.climesa.domain.LaboratoryOrder

@Composable
fun LaboratoryScreen(profile: AccessProfile, modifier: Modifier = Modifier, model: LaboratoryViewModel = viewModel()) {
    val state by model.state.collectAsStateWithLifecycle()
    var selected by rememberSaveable { mutableStateOf<Pair<String, String>?>(null) }
    var sampleOrderId by rememberSaveable { mutableStateOf<String?>(null) }
    LaunchedEffect(Unit) { model.load() }
    val selectedOrder = selected?.let { key -> state.orders.firstOrNull { it.id == key.first } }
    val selectedItem = selectedOrder?.items?.firstOrNull { it.id == selected?.second }
    val sampleOrder = sampleOrderId?.let { id -> state.orders.firstOrNull { it.id == id } }
    if (selectedOrder != null && selectedItem != null) LaboratoryResultDialog(selectedOrder, selectedItem, state.busy, model, { selected = null })
    if (sampleOrder != null) LaboratorySampleDialog(sampleOrder, state.busy, model, { sampleOrderId = null })
    LazyColumn(modifier, contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        item { SectionIntro("Atención / Diagnóstico", "Laboratorio", "Órdenes, muestras y resultados con estados trazables.") }
        state.error?.let { error -> item { ClimesaActionGroup { Text(error, color = MaterialTheme.colorScheme.error); ClimesaButton("Reintentar", Icons.Default.Refresh, { model.clearMessages(); model.load() }, outlined = true) } } }
        state.notice?.let { notice -> item { InlineStatus(notice, Icons.Default.Check) } }
        if (state.loading) item { CircularProgressIndicator() }
        else if (state.orders.isEmpty()) item { ClimesaCard { Text("No hay órdenes de laboratorio disponibles.", Modifier.padding(18.dp)) } }
        else items(state.orders, key = { it.id }) { order -> LaboratoryOrderCard(order, profile, state.busy, model, { selected = it }, { sampleOrderId = order.id }) }
    }
}

@Composable
private fun LaboratoryOrderCard(order: LaboratoryOrder, profile: AccessProfile, busy: Boolean, model: LaboratoryViewModel, openResult: (Pair<String, String>) -> Unit, openSample: () -> Unit) {
    val canProcess = "laboratorio.procesar" in profile.permissions
    val canValidate = "laboratorio.validar" in profile.permissions
    val canReview = "laboratorio.revisar" in profile.permissions
    ClimesaCard { Column(Modifier.fillMaxWidth().padding(18.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(order.patientName, style = MaterialTheme.typography.titleMedium)
        Text("${if (order.priority == "urgente") "Urgente" else "Rutina"} · ${LaboratoryLabels.state(order.state)}", color = MaterialTheme.colorScheme.primary)
        order.items.forEach { item -> Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) { Text("${item.code} · ${item.name}", Modifier.weight(1f)); item.result?.let { result -> Text(LaboratoryLabels.mark(result.mark), style = MaterialTheme.typography.bodySmall) } ?: Text("Pendiente", style = MaterialTheme.typography.bodySmall) } }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            if (canProcess && order.state == "pendiente") OutlinedButton(onClick = openSample, enabled = !busy) { Text("Tomar muestra") }
            if (canProcess && order.state == "en_proceso") order.items.filter { it.result == null }.forEach { item -> OutlinedButton(onClick = { openResult(order.id to item.id) }, enabled = !busy) { Text("Resultado ${item.code}") } }
            if (canValidate && order.state == "en_proceso") Button(onClick = { model.complete(order) }, enabled = !busy && order.items.all { it.result != null }) { Text("Completar") }
            if (canReview && order.state == "completado" && !order.reviewed) Button(onClick = { model.review(order) }, enabled = !busy) { Text("Revisar") }
        }
    } }
}

@Composable
private fun LaboratorySampleDialog(order: LaboratoryOrder, busy: Boolean, model: LaboratoryViewModel, onClose: () -> Unit) {
    var expediente by rememberSaveable(order.id) { mutableStateOf("") }
    var nombreCompleto by rememberSaveable(order.id) { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = { if (!busy) onClose() },
        title = { Text("Confirmar identidad") },
        text = { Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text("Confirma expediente y nombre completo antes de tomar la muestra.", style = MaterialTheme.typography.bodySmall)
            OutlinedTextField(expediente, { expediente = it }, label = { Text("Número de expediente") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
            OutlinedTextField(nombreCompleto, { nombreCompleto = it }, label = { Text("Nombre completo") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
        } },
        confirmButton = { Button(onClick = { model.sample(order, expediente, nombreCompleto); onClose() }, enabled = !busy && expediente.isNotBlank() && nombreCompleto.isNotBlank()) { Text(if (busy) "Guardando…" else "Confirmar") } },
        dismissButton = { TextButton(onClick = onClose, enabled = !busy) { Text("Cancelar") } }
    )
}

@Composable
private fun LaboratoryResultDialog(order: LaboratoryOrder, item: LaboratoryItem, busy: Boolean, model: LaboratoryViewModel, onClose: () -> Unit) {
    var value by rememberSaveable(item.id) { mutableStateOf(item.result?.value?.toString().orEmpty()) }
    var text by rememberSaveable(item.id) { mutableStateOf(item.result?.text.orEmpty()) }
    AlertDialog(onDismissRequest = { if (!busy) onClose() }, title = { Text("Resultado ${item.code}") }, text = { Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(item.name, style = MaterialTheme.typography.titleSmall)
        OutlinedTextField(value, { value = it }, label = { Text("Valor numérico") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
        OutlinedTextField(text, { text = it.take(5000) }, label = { Text("Resultado textual") }, modifier = Modifier.fillMaxWidth(), minLines = 2)
        Text("La marca se calculará automáticamente según el rango vigente.", style = MaterialTheme.typography.bodySmall)
    } }, confirmButton = { Button(onClick = { model.saveResult(order, item, value, text); onClose() }, enabled = !busy && (value.isNotBlank() || text.isNotBlank())) { Text(if (busy) "Guardando…" else "Guardar") } }, dismissButton = { TextButton(onClick = onClose, enabled = !busy) { Text("Cancelar") } })
}
