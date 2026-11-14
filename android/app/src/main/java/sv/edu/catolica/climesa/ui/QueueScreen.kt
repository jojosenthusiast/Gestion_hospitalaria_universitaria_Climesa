package sv.edu.catolica.climesa.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.selection.selectable
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import sv.edu.catolica.climesa.domain.AccessProfile
import sv.edu.catolica.climesa.domain.QueueFlow
import sv.edu.catolica.climesa.domain.QueueLabels
import sv.edu.catolica.climesa.domain.QuickAction
import sv.edu.catolica.climesa.domain.QueueTicket

@Composable
fun QueueScreen(
    profile: AccessProfile,
    modifier: Modifier = Modifier,
    quickAction: QuickAction? = null,
    onQuickActionHandled: () -> Unit = {},
    model: QueueViewModel = viewModel(),
) {
    val state by model.state.collectAsStateWithLifecycle()
    var issueOpen by rememberSaveable { mutableStateOf(false) }
    var callNextId by rememberSaveable { mutableStateOf<String?>(null) }
    val canIssue = "fila.emitir" in profile.permissions
    val canCall = "fila.llamar" in profile.permissions
    val canManage = "fila.gestionar" in profile.permissions
    LaunchedEffect(Unit) { model.load() }
    LaunchedEffect(profile.channels) { model.startLive(profile.channels) }
    // A dashboard asked to "issue a number" or "call next": open the matching dialog once the day's queue is loaded.
    LaunchedEffect(quickAction, state.loading, state.tickets) {
        if (quickAction == null || state.loading) return@LaunchedEffect
        if (quickAction == QuickAction.ISSUE_NUMBER && canIssue) issueOpen = true
        if (quickAction == QuickAction.CALL_NEXT && canCall) QueueFlow.nextToCall(state.tickets)?.let { callNextId = it.id }
        onQuickActionHandled()
    }
    val callNext = callNextId?.let { id -> state.tickets.firstOrNull { it.id == id } }
    if (callNext != null) ConfirmDialog(
        title = "Llamar siguiente",
        confirmLabel = "Llamar",
        onConfirm = { callNextId = null; model.call(callNext) },
        onDismiss = { callNextId = null },
        message = "Se llamará al N.º ${callNext.number} (${QueueLabels.service(callNext.service)}): ${callNext.patientName}.",
        busy = state.busy,
    )
    if (issueOpen) QueueIssueDialog(busy = state.busy, onClose = { issueOpen = false }, onSubmit = { service -> issueOpen = false; model.issue(service) })
    PageList(modifier) {
        item { SectionIntro("Atención / Llegada", "Fila del día", "El número se emite al llegar y avanza sin alterar la hora de la cita.") }
        if (canIssue) item { PrimaryButton("Emitir número", { issueOpen = true }, icon = Icons.Default.Add, enabled = !state.busy) }
        state.notice?.let { notice -> item { NoticeBanner(NoticeKind.SUCCESS, notice) } }
        if (state.error != null && state.tickets.isNotEmpty()) item { NoticeBanner(NoticeKind.ERROR, state.error!!) }
        when {
            state.loading -> item { LoadingState() }
            state.error != null && state.tickets.isEmpty() -> item { ErrorState(state.error, onRetry = { model.clearMessages(); model.load() }) }
            state.tickets.isEmpty() -> item { EmptyState("No hay números emitidos hoy.") }
            else -> {
                item {
                    Row(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                        StatTile(state.tickets.count { it.state == "en_espera" }.toString(), QueueLabels.state("en_espera"), Modifier.weight(1f))
                        StatTile(state.tickets.count { it.state == "llamado" || it.state == "en_atencion" }.toString(), "En proceso", Modifier.weight(1f))
                        StatTile(state.tickets.size.toString(), "Emitidos", Modifier.weight(1f))
                    }
                }
                items(state.tickets, key = { it.id }) { ticket -> QueueTicketCard(ticket, canCall, canManage, state.busy, model) }
            }
        }
    }
}

@Composable
private fun QueueTicketCard(ticket: QueueTicket, canCall: Boolean, canManage: Boolean, busy: Boolean, model: QueueViewModel) {
    SectionCard("N.º ${ticket.number}", eyebrow = QueueLabels.service(ticket.service), action = { OperacionStatusTag(ticket.state, label = QueueLabels.state(ticket.state)) }) {
        Text(ticket.patientName, style = MaterialTheme.typography.bodyLarge)
        Text("Llamados: ${ticket.calls}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        if (canCall && ticket.state in listOf("en_espera", "llamado")) SecondaryButton(if (ticket.state == "llamado") "Llamar de nuevo" else "Llamar", { model.call(ticket) }, icon = Icons.Default.Phone, enabled = !busy)
        if (canManage && ticket.state == "llamado") PrimaryButton("Atender", { model.attend(ticket) }, enabled = !busy)
        if (canManage && ticket.state == "en_atencion") PrimaryButton("Completar", { model.complete(ticket) }, enabled = !busy)
        if (canManage && ticket.state in listOf("en_espera", "llamado")) SecondaryButton("No se presentó", { model.absent(ticket) }, enabled = !busy)
    }
}

@Composable
private fun QueueIssueDialog(busy: Boolean, onClose: () -> Unit, onSubmit: (String) -> Unit) {
    var service by rememberSaveable { mutableStateOf(QueueLabels.services.first().first) }
    ConfirmDialog(
        title = "Emitir número",
        confirmLabel = "Emitir",
        onConfirm = { onSubmit(service) },
        onDismiss = onClose,
        busy = busy,
        message = "Selecciona el servicio de llegada.",
        body = {
            Column {
                QueueLabels.services.forEach { (value, label) ->
                    Row(Modifier.fillMaxWidth().heightIn(min = Spacing.touch).selectable(selected = service == value, role = Role.RadioButton, onClick = { service = value }), verticalAlignment = Alignment.CenterVertically) {
                        RadioButton(selected = service == value, onClick = null)
                        Text(label, Modifier.padding(start = Spacing.sm))
                    }
                }
            }
        },
    )
}
