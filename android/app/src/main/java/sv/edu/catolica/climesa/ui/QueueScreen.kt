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
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
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
import sv.edu.catolica.climesa.domain.QueueLabels
import sv.edu.catolica.climesa.domain.QueueTicket

@Composable
fun QueueScreen(profile: AccessProfile, modifier: Modifier = Modifier, model: QueueViewModel = viewModel()) {
    val state by model.state.collectAsStateWithLifecycle()
    var issueOpen by rememberSaveable { mutableStateOf(false) }
    val canIssue = "fila.emitir" in profile.permissions
    val canCall = "fila.llamar" in profile.permissions
    val canManage = "fila.gestionar" in profile.permissions
    LaunchedEffect(Unit) { model.load() }
    if (issueOpen) QueueIssueDialog(busy = state.busy, onClose = { issueOpen = false }, onSubmit = { service -> issueOpen = false; model.issue(service) })
    LazyColumn(modifier, contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        item { SectionIntro("Atención / Llegada", "Fila del día", "El número se emite al llegar y avanza sin alterar la hora de la cita.") }
        if (canIssue) item { ClimesaButton("Emitir número", Icons.Default.Add, { issueOpen = true }) }
        state.error?.let { error -> item { ClimesaActionGroup { Text(error, color = MaterialTheme.colorScheme.error); ClimesaButton("Reintentar", Icons.Default.Refresh, { model.clearMessages(); model.load() }, outlined = true) } } }
        state.notice?.let { notice -> item { InlineStatus(notice, Icons.Default.Check) } }
        if (state.loading) item { CircularProgressIndicator() }
        else if (state.tickets.isEmpty()) item { ClimesaCard { Text("No hay números emitidos hoy.", Modifier.padding(18.dp)) } }
        else items(state.tickets, key = { it.id }) { ticket -> QueueTicketCard(ticket, canCall, canManage, state.busy, model) }
    }
}

@Composable
private fun QueueTicketCard(ticket: QueueTicket, canCall: Boolean, canManage: Boolean, busy: Boolean, model: QueueViewModel) {
    ClimesaCard { Column(Modifier.fillMaxWidth().padding(18.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) { Text("N.º ${ticket.number}", style = MaterialTheme.typography.headlineSmall); Text(QueueLabels.state(ticket.state), color = MaterialTheme.colorScheme.primary) }
        Text("${ticket.patientName} · ${QueueLabels.service(ticket.service)}", style = MaterialTheme.typography.bodyMedium)
        Text("Llamados: ${ticket.calls}", style = MaterialTheme.typography.bodySmall)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            if (canCall && ticket.state in listOf("en_espera", "llamado")) OutlinedButton(onClick = { model.call(ticket) }, enabled = !busy) { androidx.compose.material3.Icon(Icons.Default.Phone, null); Text(if (ticket.state == "llamado") "Llamar de nuevo" else "Llamar") }
            if (canManage && ticket.state == "llamado") Button(onClick = { model.attend(ticket) }, enabled = !busy) { Text("Atender") }
            if (canManage && ticket.state == "en_atencion") Button(onClick = { model.complete(ticket) }, enabled = !busy) { Text("Completar") }
            if (canManage && ticket.state in listOf("en_espera", "llamado")) TextButton(onClick = { model.absent(ticket) }, enabled = !busy) { Text("No se presentó") }
        }
    } }
}

@Composable
private fun QueueIssueDialog(busy: Boolean, onClose: () -> Unit, onSubmit: (String) -> Unit) {
    var service by rememberSaveable { mutableStateOf(QueueLabels.services.first().first) }
    AlertDialog(onDismissRequest = { if (!busy) onClose() }, title = { Text("Emitir número") }, text = { Column(verticalArrangement = Arrangement.spacedBy(8.dp)) { Text("Selecciona el servicio de llegada.") ; QueueLabels.services.forEach { (value, label) -> androidx.compose.material3.RadioButton(selected = service == value, onClick = { service = value }); Text(label, Modifier.padding(start = 8.dp)) } } }, confirmButton = { Button(onClick = { onSubmit(service) }, enabled = !busy) { Text(if (busy) "Guardando…" else "Emitir") } }, dismissButton = { TextButton(onClick = onClose, enabled = !busy) { Text("Cancelar") } })
}
