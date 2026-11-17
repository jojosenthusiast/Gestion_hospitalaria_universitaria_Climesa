package sv.edu.catolica.climesa.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.TextButton
import androidx.compose.runtime.remember
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import sv.edu.catolica.climesa.domain.NextStatus
import sv.edu.catolica.climesa.domain.QueueOffice
import sv.edu.catolica.climesa.domain.QueueMove
import sv.edu.catolica.climesa.domain.QueueMoves
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
    // The chosen area also selects whose "who goes next" proposal is shown on top (RN-FILA-SIGUIENTE).
    LaunchedEffect(service) { model.chooseArea(service) }
    LaunchedEffect(profile.channels) { model.startLive(profile.channels) }
    // B5: whoever calls may send the patient to an active consulting room (`/espacios`, with `espacios.ver`), like the web.
    LaunchedEffect(canCall) { if (canCall && "espacios.ver" in profile.permissions) model.loadOffices() }
    var office by rememberSaveable { mutableStateOf("") }
    // A dashboard asked to "issue a number" or "call next": open the matching dialog once the day's queue is loaded.
    LaunchedEffect(quickAction, state.loading, state.tickets) {
        if (quickAction == null || state.loading) return@LaunchedEffect
        if (quickAction == QuickAction.ISSUE_NUMBER && canIssue) issueOpen = true
        if (quickAction == QuickAction.CALL_NEXT && canCall) callNextOpen = true
        onQuickActionHandled()
    }
    // The API picks who goes next by its rule (RN-FILA-SIGUIENTE); the app never chooses the number locally.
    if (callNextOpen) QueueServiceDialog(
        title = stringResource(R.string.fila_llamar_siguiente), confirmLabel = "Llamar", initial = QueueRules.callNextService(state.tickets, service), busy = state.busy,
        message = { stringResource(R.string.fila_llamar_siguiente_mensaje, QueueLabels.service(it)) },
        onClose = { callNextOpen = false }, onSubmit = { chosen, _ -> callNextOpen = false; model.callNext(chosen, office) },
        extra = { OfficePicker(state.offices, office, state.busy) { office = it } },
    )
    // B1: reception issues the number for a patient it finds with the same search as booking an appointment.
    val closeIssue = { issueOpen = false; model.resetIssue() }
    if (issueOpen) QueueServiceDialog(title = "Emitir número", confirmLabel = "Emitir", initial = QueueLabels.services.first().first, busy = state.busy, message = { stringResource(R.string.fila_emitir_mensaje) }, withPriority = true,
        onClose = closeIssue, onSubmit = { service, priority -> issueOpen = false; model.issue(service, priority) },
        confirmEnabled = state.issueSearch.patient != null,
        extra = {
            val search = state.issueSearch
            Text(stringResource(R.string.rec_agendar_paciente), style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(top = Spacing.sm))
            PatientSearchPicker(search.query, search.results, search.searching, search.hasMore, search.patient, model::issueQuery, model::pickIssuePatient, model::moreIssuePatients, enabled = !state.busy)
            search.error?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error) }
        })
    PageList(modifier) {
        item { SectionIntro("Atención / Llegada", "Fila del día", "El número se emite al llegar y avanza sin alterar la hora de la cita.") }
        if (canIssue) item { PrimaryButton("Emitir número", { issueOpen = true }, icon = Icons.Default.Add, enabled = !state.busy) }
        if (canCall && service == null) item { SecondaryButton(stringResource(R.string.fila_llamar_siguiente), { model.clearMessages(); callNextOpen = true }, icon = Icons.Default.Phone, enabled = !state.busy) }
        state.notice?.let { notice -> item { NoticeBanner(NoticeKind.SUCCESS, notice) } }
        state.undo?.let { undo -> item { UndoRow(undo.label, state.busy) { model.undoLastCall() } } }
        if (service != null && !state.loading) item {
            NextCard(state, service!!, canCall, state.tickets.any { it.service == service && it.state == "en_espera" }, office, { office = it }) { model.callNext(service!!, office) }
        }
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
                        items(inColumn, key = { it.id }) { ticket -> QueueTicketCard(ticket, canCall, canManage, state.busy, model, now) }
                    }
                }
            }
        }
    }
}

/** Who goes next in the chosen area by the server rule, and "Llamar siguiente" right under it. */
@Composable
private fun NextCard(state: QueueState, service: String, canCall: Boolean, waiting: Boolean, office: String, onOffice: (String) -> Unit, onCallNext: () -> Unit) {
    val next = state.next
    val busy = state.busy
    val proposal = next?.proposal
    Column(Modifier.fillMaxWidth().areaSurface(next?.area ?: QueueLabels.areaOf(service)).padding(Spacing.md), verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
        Text(stringResource(R.string.fila_quien_sigue), style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
        val status = QueueRules.nextStatus(next, state.nextLoading, state.nextError)
        if (status == NextStatus.ERROR) NoticeBanner(NoticeKind.ERROR, state.nextError.orEmpty())
        if (status == NextStatus.LOADING) Text(stringResource(R.string.fila_calculando), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        if (proposal != null) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                AreaTag(proposal.area)
                Text(proposal.number.toString(), style = MaterialTheme.typography.displaySmall, modifier = Modifier.semantics { contentDescription = proposal.code })
                if (proposal.priority != "rutina") PriorityBadge(Priority.of(proposal.priority))
            }
            Text(proposal.patientName, style = MaterialTheme.typography.bodyLarge)
            Text(proposal.reasonText, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        } else if (status == NextStatus.NONE) Text(stringResource(R.string.fila_nadie_espera), style = MaterialTheme.typography.bodyMedium)
        next?.rule?.takeIf { it.isNotBlank() }?.let { Text(stringResource(R.string.fila_regla, it), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        if (canCall) {
            OfficePicker(state.offices, office, busy, onOffice)
            PrimaryButton(stringResource(R.string.fila_llamar_siguiente), onCallNext, icon = Icons.Default.Phone, enabled = !busy && waiting)
        }
    }
}

/** Optional consulting room for the call ("Sin asignar" by default); hidden when there is none to choose. */
@Composable
private fun OfficePicker(offices: List<QueueOffice>, selected: String, busy: Boolean, onSelect: (String) -> Unit) {
    if (offices.isEmpty()) return
    var open by remember { mutableStateOf(false) }
    val label = offices.firstOrNull { it.id == selected }?.label ?: stringResource(R.string.fila_consultorio_sin_asignar)
    Box {
        TextButton(onClick = { open = true }, enabled = !busy, modifier = Modifier.heightIn(min = Spacing.touch)) { Text(stringResource(R.string.fila_consultorio, label)) }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            DropdownMenuItem(text = { Text(stringResource(R.string.fila_consultorio_sin_asignar)) }, onClick = { open = false; onSelect("") })
            offices.forEach { room -> DropdownMenuItem(text = { Text(room.label) }, onClick = { open = false; onSelect(room.id) }) }
        }
    }
}

/** "Llamaste CON 7." with its undo, where the call happened (S4: undo for what is reversible). */
@Composable
private fun UndoRow(label: String, busy: Boolean, onUndo: () -> Unit) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
        Text(label, Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
        TextButton(onClick = onUndo, enabled = !busy, modifier = Modifier.heightIn(min = Spacing.touch)) { Text(stringResource(R.string.fila_deshacer)) }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun QueueTicketCard(ticket: QueueTicket, canCall: Boolean, canManage: Boolean, busy: Boolean, model: QueueViewModel, now: Long) {
    Column(Modifier.fillMaxWidth().areaSurface(ticket.area).padding(Spacing.md), verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
            AreaTag(ticket.area)
            // The number is large next to the area code, as the patient hears it called ("CON 7").
            Text(ticket.number.toString(), style = MaterialTheme.typography.headlineMedium.copy(fontWeight = FontWeight.Bold), modifier = Modifier.weight(1f).semantics { contentDescription = QueueLabels.code(ticket) })
            OperacionStatusTag(ticket.state, label = QueueLabels.state(ticket.state))
        }
        Text(ticket.patientName, style = MaterialTheme.typography.bodyLarge)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(Spacing.sm), verticalArrangement = Arrangement.spacedBy(Spacing.xs)) {
            if (ticket.priority != "rutina") PriorityBadge(Priority.of(ticket.priority))
            Text(QueueLabels.arrival(ticket), style = MaterialTheme.typography.labelLarge, color = if (ticket.appointmentAt != null) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Text("${QueueLabels.service(ticket.service)} · ${QueueLabels.progress(ticket, canCall)}${ticket.officeCode?.let { " · $it" } ?: ""}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        QueueBoard.waitMinutes(ticket, now)?.takeIf { QueueBoard.waitLevel(ticket, now) != SlaLevel.NONE }?.let { minutes ->
            Text(stringResource(R.string.fila_espera, elapsedText(minutes)), style = MaterialTheme.typography.labelLarge, color = slaColor(QueueBoard.waitLevel(ticket, now)))
        }
        // Buttons come from the API (`allowedActions`); a blocked one stays visible, disabled, with its reason.
        QueueActionButton(ticket, QueueAction.CALL, if (ticket.state == "llamado") "Llamar de nuevo" else "Llamar", busy, primary = false) { model.call(ticket) }
        // B8: card actions are secondary; the screen keeps one primary action (issue a number or call next).
        QueueActionButton(ticket, QueueAction.ATTEND, "Iniciar atención", busy, primary = false) { model.attend(ticket) }
        QueueActionButton(ticket, QueueAction.COMPLETE, "Completar", busy, primary = false) { model.complete(ticket) }
        QueueActionButton(ticket, QueueAction.ABSENT, "No se presentó", busy, primary = false) { model.absent(ticket) }
        CardMenu(ticket, canCall, canManage, busy, model)
    }
}

/** Board moves without dragging (touch and keyboard): only the moves the server accepts now, plus the priority. */
@Composable
private fun CardMenu(ticket: QueueTicket, canCall: Boolean, canManage: Boolean, busy: Boolean, model: QueueViewModel) {
    val moves = remember(ticket) { QueueMoves.destinations(ticket) }
    val removeCall = canCall && QueueMoves.canRemoveCall(ticket)
    val priorities = if (canManage && ticket.state in listOf("en_espera", "llamado")) listOf("emergencia", "urgente", "rutina").filter { it != ticket.priority } else emptyList()
    if (moves.isEmpty() && priorities.isEmpty() && !removeCall) return
    var open by remember { mutableStateOf(false) }
    Box {
        TextButton(onClick = { open = true }, enabled = !busy, modifier = Modifier.heightIn(min = Spacing.touch)) { Text(stringResource(R.string.fila_mover)) }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            if (removeCall) DropdownMenuItem(text = { Text(stringResource(R.string.fila_quitar_llamado, ticket.calls)) }, onClick = { open = false; model.move(ticket, QueueMove.REMOVE_CALL) })
            moves.forEach { (column, move) ->
                DropdownMenuItem(text = { Text(stringResource(R.string.fila_mover_a, column.label, move.label.lowercase())) }, onClick = { open = false; model.move(ticket, move) })
            }
            if (moves.isNotEmpty() && priorities.isNotEmpty()) HorizontalDivider()
            priorities.forEach { p ->
                DropdownMenuItem(text = { Text(stringResource(R.string.fila_prioridad_a, QueueLabels.priority(p))) }, onClick = { open = false; model.changePriority(ticket, p) })
            }
        }
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
private fun QueueServiceDialog(
    title: String, confirmLabel: String, initial: String, busy: Boolean, message: @Composable (String) -> String, onClose: () -> Unit, withPriority: Boolean = false,
    confirmEnabled: Boolean = true, extra: @Composable () -> Unit = {}, onSubmit: (String, String) -> Unit,
) {
    var service by rememberSaveable { mutableStateOf(initial) }
    var priority by rememberSaveable { mutableStateOf("rutina") }
    ConfirmDialog(
        title = title,
        confirmLabel = confirmLabel,
        onConfirm = { onSubmit(service, priority) },
        onDismiss = onClose,
        busy = busy,
        message = message(service),
        confirmEnabled = confirmEnabled,
        body = {
            Column(Modifier.verticalScroll(rememberScrollState())) {
                extra()
                QueueLabels.services.forEach { (value, label) ->
                    Row(Modifier.fillMaxWidth().heightIn(min = Spacing.touch).selectable(selected = service == value, role = Role.RadioButton, onClick = { service = value }), verticalAlignment = Alignment.CenterVertically) {
                        RadioButton(selected = service == value, onClick = null)
                        Text(label, Modifier.padding(start = Spacing.sm))
                    }
                }
                if (withPriority) {
                    Text(stringResource(R.string.fila_prioridad), style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(top = Spacing.sm))
                    listOf("rutina", "urgente", "emergencia").forEach { value ->
                        Row(Modifier.fillMaxWidth().heightIn(min = Spacing.touch).selectable(selected = priority == value, role = Role.RadioButton, onClick = { priority = value }), verticalAlignment = Alignment.CenterVertically) {
                            RadioButton(selected = priority == value, onClick = null)
                            Text(QueueLabels.priority(value), Modifier.padding(start = Spacing.sm))
                        }
                    }
                    Text(stringResource(R.string.fila_prioridad_ayuda), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        },
    )
}
