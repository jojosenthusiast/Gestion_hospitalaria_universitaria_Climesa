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
import sv.edu.catolica.climesa.domain.QueueAction
import sv.edu.catolica.climesa.domain.QueueRules
import sv.edu.catolica.climesa.domain.QueueLabels
import sv.edu.catolica.climesa.domain.QuickAction
import sv.edu.catolica.climesa.domain.QueueTicket
import sv.edu.catolica.climesa.domain.QueueBoard
import sv.edu.catolica.climesa.domain.QueueColumn
import sv.edu.catolica.climesa.domain.SlaLevel
import sv.edu.catolica.climesa.domain.elapsedText
import androidx.compose.ui.res.stringResource
import sv.edu.catolica.climesa.R

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
    var callNextOpen by rememberSaveable { mutableStateOf(false) }
    val canIssue = "fila.emitir" in profile.permissions
    val canCall = "fila.llamar" in profile.permissions
    val canManage = "fila.gestionar" in profile.permissions
    val readOnly = !canIssue && !canCall && !canManage
    var service by rememberSaveable { mutableStateOf<String?>(null) }
    var query by rememberSaveable { mutableStateOf("") }
    LaunchedEffect(Unit) { model.load() }
    LaunchedEffect(profile.channels) { model.startLive(profile.channels) }
    // A dashboard asked to "issue a number" or "call next": open the matching dialog once the day's queue is loaded.
    LaunchedEffect(quickAction, state.loading, state.tickets) {
        if (quickAction == null || state.loading) return@LaunchedEffect
        if (quickAction == QuickAction.ISSUE_NUMBER && canIssue) issueOpen = true
        if (quickAction == QuickAction.CALL_NEXT && canCall) callNextOpen = true
        onQuickActionHandled()
    }
    // The API picks the first waiting number of the service; the app never chooses it locally.
    if (callNextOpen) QueueServiceDialog(
        title = stringResource(R.string.fila_llamar_siguiente), confirmLabel = "Llamar", initial = QueueRules.callNextService(state.tickets, service), busy = state.busy,
        message = { stringResource(R.string.fila_llamar_siguiente_mensaje, QueueLabels.service(it)) },
        onClose = { callNextOpen = false }, onSubmit = { chosen -> callNextOpen = false; model.callNext(chosen) },
    )
    if (issueOpen) QueueServiceDialog(title = "Emitir número", confirmLabel = "Emitir", initial = QueueLabels.services.first().first, busy = state.busy, message = { "Selecciona el servicio de llegada." }, onClose = { issueOpen = false }, onSubmit = { service -> issueOpen = false; model.issue(service) })
    PageList(modifier) {
        item { SectionIntro("Atención / Llegada", "Fila del día", "El número se emite al llegar y avanza sin alterar la hora de la cita.") }
        if (canIssue) item { PrimaryButton("Emitir número", { issueOpen = true }, icon = Icons.Default.Add, enabled = !state.busy) }
        if (canCall) item { SecondaryButton(stringResource(R.string.fila_llamar_siguiente), { model.clearMessages(); callNextOpen = true }, icon = Icons.Default.Phone, enabled = !state.busy) }
        state.notice?.let { notice -> item { NoticeBanner(NoticeKind.SUCCESS, notice) } }
        if (state.error != null && state.tickets.isNotEmpty()) item { NoticeBanner(NoticeKind.ERROR, state.error!!) }
        when {
            state.loading -> item { LoadingState() }
            state.error != null && state.tickets.isEmpty() -> item { ErrorState(state.error, onRetry = { model.clearMessages(); model.load() }) }
            state.tickets.isEmpty() -> item { EmptyState("No hay números emitidos hoy.") }
            else -> {
                if (readOnly) item { NoticeBanner(NoticeKind.INFO, stringResource(R.string.fila_solo_lectura)) }
                // The clock is read when the board is drawn; every realtime event redraws it, no timers.
                val now = System.currentTimeMillis()
                val visible = QueueBoard.visible(state.tickets, service, query)
                val summary = QueueBoard.summary(visible, now)
                item { LiveSearchField(query, { query = it }, stringResource(R.string.fila_buscar)) }
                item { ChipRow(listOf(Triple<String?, String, Int?>(null, stringResource(R.string.fila_todos), state.tickets.size)) + QueueLabels.services.map { (value, label) -> Triple<String?, String, Int?>(value, label, state.tickets.count { it.service == value }) }, service) { service = it } }
                item {
                    Row(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                        StatTile((summary.counts[QueueColumn.WAITING] ?: 0).toString(), QueueColumn.WAITING.label, Modifier.weight(1f))
                        StatTile((summary.counts[QueueColumn.CALLED] ?: 0).toString(), QueueColumn.CALLED.label, Modifier.weight(1f))
                    }
                }
                item {
                    Row(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                        StatTile((summary.counts[QueueColumn.IN_ATTENTION] ?: 0).toString(), QueueColumn.IN_ATTENTION.label, Modifier.weight(1f))
                        StatTile((summary.counts[QueueColumn.CLOSED] ?: 0).toString(), QueueColumn.CLOSED.label, Modifier.weight(1f))
                    }
                }
                item { Text(stringResource(R.string.fila_espera_promedio, elapsedText(summary.averageWait), elapsedText(summary.longestWait)), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                if (visible.isEmpty()) item { EmptyState(stringResource(R.string.listas_sin_coincidencias), detail = stringResource(R.string.listas_sin_coincidencias_detalle)) }
                QueueColumn.entries.forEach { column ->
                    val inColumn = QueueBoard.sorted(visible.filter { QueueBoard.column(it) == column })
                    if (inColumn.isNotEmpty()) {
                        item(key = "h-${column.name}") { Text("${column.label} (${inColumn.size})", style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(top = Spacing.sm)) }
                        items(inColumn, key = { it.id }) { ticket -> QueueTicketCard(ticket, canCall, state.busy, model, now) }
                    }
                }
            }
        }
    }
}

@Composable
private fun QueueTicketCard(ticket: QueueTicket, canCall: Boolean, busy: Boolean, model: QueueViewModel, now: Long) {
    SectionCard("N.º ${ticket.number}", eyebrow = QueueLabels.service(ticket.service), action = { OperacionStatusTag(ticket.state, label = QueueLabels.state(ticket.state)) }) {
        Text(ticket.patientName, style = MaterialTheme.typography.bodyLarge)
        Text(QueueLabels.progress(ticket, canCall), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        QueueBoard.waitMinutes(ticket, now)?.takeIf { QueueBoard.waitLevel(ticket, now) != SlaLevel.NONE }?.let { minutes ->
            Text(stringResource(R.string.fila_espera, elapsedText(minutes)), style = MaterialTheme.typography.labelLarge, color = slaColor(QueueBoard.waitLevel(ticket, now)))
        }
        // Buttons come from the API (`allowedActions`); a blocked one stays visible, disabled, with its reason.
        QueueActionButton(ticket, QueueAction.CALL, if (ticket.state == "llamado") "Llamar de nuevo" else "Llamar", busy, primary = false) { model.call(ticket) }
        QueueActionButton(ticket, QueueAction.ATTEND, "Atender", busy, primary = true) { model.attend(ticket) }
        QueueActionButton(ticket, QueueAction.COMPLETE, "Completar", busy, primary = true) { model.complete(ticket) }
        QueueActionButton(ticket, QueueAction.ABSENT, "No se presentó", busy, primary = false) { model.absent(ticket) }
    }
}

@Composable
private fun QueueActionButton(ticket: QueueTicket, action: QueueAction, label: String, busy: Boolean, primary: Boolean, onClick: () -> Unit) {
    if (!ticket.shows(action)) return
    val enabled = ticket.allows(action) && !busy
    if (primary) PrimaryButton(label, onClick, enabled = enabled)
    else SecondaryButton(label, onClick, icon = if (action == QueueAction.CALL) Icons.Default.Phone else null, enabled = enabled)
    if (!ticket.allows(action)) ticket.blockedActions[action]?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
}

/** Service picker dialog shared by "Emitir número" and "Llamar siguiente". */
@Composable
private fun QueueServiceDialog(title: String, confirmLabel: String, initial: String, busy: Boolean, message: @Composable (String) -> String, onClose: () -> Unit, onSubmit: (String) -> Unit) {
    var service by rememberSaveable { mutableStateOf(initial) }
    ConfirmDialog(
        title = title,
        confirmLabel = confirmLabel,
        onConfirm = { onSubmit(service) },
        onDismiss = onClose,
        busy = busy,
        message = message(service),
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
