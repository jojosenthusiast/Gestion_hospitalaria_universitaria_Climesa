package sv.edu.catolica.climesa.ui

import androidx.compose.foundation.background
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.unit.dp
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
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.selection.selectable
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.MoreVert
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
import sv.edu.catolica.climesa.domain.PatientQueue
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Icon
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
    userId: String? = null,
    /** R7 U1 (G2): the patient record opens "Emitir número" with this patient already chosen. */
    subject: sv.edu.catolica.climesa.domain.QuickSubject? = null,
    /** G5: "Tomar signos" on a called card opens Signos vitales on that patient; null when the role cannot record signs. */
    onOpenVitals: ((sv.edu.catolica.climesa.domain.QuickSubject) -> Unit)? = null,
    model: QueueViewModel = viewModel(),
) {
    val state by model.state.collectAsStateWithLifecycle()
    // D-3: a stored "No se presentó" is sent on sign-in and every time the board comes back.
    LaunchedEffect(userId) { userId?.let(model::bindUser) }
    androidx.lifecycle.compose.LifecycleResumeEffect(Unit) { model.resume(); onPauseOrDispose { } }
    var issueOpen by rememberSaveable { mutableStateOf(false) }
    var callNextOpen by rememberSaveable { mutableStateOf(false) }
    val canIssue = "fila.emitir" in profile.permissions
    val canCall = "fila.llamar" in profile.permissions
    val canManage = "fila.gestionar" in profile.permissions
    val readOnly = !canIssue && !canCall && !canManage
    var service by rememberSaveable { mutableStateOf<String?>(null) }
    var query by rememberSaveable { mutableStateOf("") }
    var showClosed by rememberSaveable { mutableStateOf(false) }
    var showAllWaiting by rememberSaveable { mutableStateOf(false) }
    LaunchedEffect(Unit) { model.load() }
    // The chosen area also selects whose "who goes next" proposal is shown on top (RN-FILA-SIGUIENTE).
    LaunchedEffect(service) { model.chooseArea(service) }
    LaunchedEffect(profile.channels) { model.startLive(profile.channels) }
    // B5: whoever calls may send the patient to an active consulting room (`/espacios`, with `espacios.ver`), like the web.
    LaunchedEffect(canCall) { if (canCall && "espacios.ver" in profile.permissions) model.loadOffices() }
    var office by rememberSaveable { mutableStateOf("") }
    // Sweep #13 / B3: whoever calls opens on the service and room of their shift (`GET /fila/mi-puesto`), once; a later
    // choice of the person wins.
    LaunchedEffect(canCall) { if (canCall) model.loadMyPost() }
    var postApplied by rememberSaveable { mutableStateOf(false) }
    LaunchedEffect(state.myPost) {
        val post = state.myPost ?: return@LaunchedEffect
        if (postApplied) return@LaunchedEffect
        postApplied = true
        if (service == null) post.service?.let { service = it }
        if (office.isBlank()) post.officeId?.let { office = it }
    }
    // A dashboard asked to "issue a number" or "call next": open the matching dialog once the day's queue is loaded.
    LaunchedEffect(quickAction, state.loading, state.tickets) {
        if (quickAction == null || state.loading) return@LaunchedEffect
        if (quickAction == QuickAction.ISSUE_NUMBER && canIssue) { subject?.let { model.preselectIssuePatient(it.id, it.detail.orEmpty(), it.name) }; issueOpen = true }
        if (quickAction == QuickAction.CALL_NEXT && canCall) callNextOpen = true
        onQuickActionHandled()
    }
    // The API picks who goes next by its rule (RN-FILA-SIGUIENTE); the app never chooses the number locally.
    // B3: the dialog stays open with "Llamando…" and closes only when the API called the number; an error stays inside it.
    if (callNextOpen) QueueServiceDialog(
        title = stringResource(R.string.fila_llamar_siguiente), confirmLabel = "Llamar", initial = QueueRules.callNextService(state.tickets, service), busy = state.busy,
        message = { stringResource(R.string.fila_llamar_siguiente_mensaje, QueueLabels.service(it)) },
        onClose = { callNextOpen = false; model.clearMessages() }, onSubmit = { chosen, _ -> model.callNext(chosen, office) { callNextOpen = false } },
        error = state.error,
        // D99: a service with nobody waiting cannot be called; the dialog says so before the tap.
        waitingIn = { QueueRules.waitingCount(state.tickets, it) },
        extra = { OfficePicker(state.offices, office, state.busy) { office = it } },
    )
    // B1: the counter is its own screen (no dialog): find the patient, pick service and priority, "Emitir". The number shows
    // large in place and the search is cleared for the next patient; back returns to the board.
    if (issueOpen) { IssuePanel(state, model, modifier, onClose = { issueOpen = false; model.closeIssue() }); return }
    // R3 A-6: a patient follows only their own number, never the reception board.
    // An unlinked patient (read-only, may link) has no number to follow: never the reception board.
    if (readOnly && profile.patientId == null && "cuenta.vincular" in profile.permissions) {
        PageList(modifier) { item { EmptyState(stringResource(R.string.pac_fila_sin_vincular), detail = stringResource(R.string.pac_fila_sin_vincular_detalle)) } }
        return
    }
    if (readOnly && profile.patientId != null) {
        LaunchedEffect(Unit) { model.followOwnTicket(); model.load(silent = true) }
        PatientTicketView(state, modifier, onRetry = { model.clearMessages(); model.load() }); return
    }
    // The board scrolls; who is being seen, who is next, the wait and the two daily actions stay docked at the bottom,
    // within thumb reach, like the reception counter of the web.
    Column(modifier.fillMaxSize()) {
    PageList(Modifier.weight(1f)) {
        state.notice?.let { notice -> item { NoticeBanner(NoticeKind.SUCCESS, notice) } }
        if (canCall) state.myPostError?.let { item { NoticeBanner(NoticeKind.WARNING, it) } }
        // Sweep: the call's undo lives only on its card ("Deshacer"), not again at the top.
        if (service != null && !state.loading) item {
            NextCard(state, service!!, canCall, primary = !canIssue, state.tickets.any { it.service == service && it.state == "en_espera" }, office, { office = it }) { model.callNext(service!!, office) }
        }
        if (state.error != null && state.tickets.isNotEmpty()) item {
            Column(verticalArrangement = Arrangement.spacedBy(Spacing.xs)) {
                NoticeBanner(NoticeKind.ERROR, state.error!!)
                // B1: a "No se presentó" kept for a retry can be retried now or dropped, as on Citas.
                if (state.failedAbsence != null) Row(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                    RowAction(stringResource(R.string.camas_reintentar), { model.resume() })
                    RowAction(stringResource(R.string.rec7_descartar), { model.discardFailedAbsence() })
                }
            }
        }
        when {
            // R3 A-23: the skeleton only stands in for an empty board; a reload keeps the numbers on screen.
            state.loading && state.tickets.isEmpty() -> item { LoadingState() }
            state.error != null && state.tickets.isEmpty() -> item { ErrorState(state.error, onRetry = { model.clearMessages(); model.load() }) }
            state.tickets.isEmpty() -> item { EmptyState("No hay números emitidos hoy.") }
            else -> {
                if (readOnly) item { ReadOnlyBadge(who = stringResource(R.string.fila_solo_lectura_quien), what = stringResource(R.string.fila_solo_lectura_que)) }
                // The clock is read when the board is drawn; every realtime event redraws it, no timers.
                val now = System.currentTimeMillis()
                val visible = QueueBoard.visible(state.tickets, service, query)
                val summary = QueueBoard.summary(visible, now)
                if (state.loading) item { RefreshHint() }
                item { LiveSearchField(query, { query = it }, stringResource(R.string.fila_buscar)) }
                item { ChipRow(listOf(Triple<String?, String, Int?>(null, stringResource(R.string.fila_todos), state.tickets.size)) + QueueLabels.services.map { (value, label) -> Triple<String?, String, Int?>(value, label, state.tickets.count { it.service == value }) }, service) { service = it } }
                // R3 A-27: the column headings carry the counts; the wait times live in the bottom dock.
                if (visible.isEmpty()) item { EmptyState(stringResource(R.string.listas_sin_coincidencias), detail = stringResource(R.string.listas_sin_coincidencias_detalle)) }
                QueueColumn.entries.forEach { column ->
                    val inColumn = QueueBoard.sorted(visible.filter { QueueBoard.column(it) == column })
                    if (inColumn.isNotEmpty()) {
                        // "Terminados" grows all day: it starts folded. "En espera" shows the first numbers and "Ver N más".
                        val closed = column == QueueColumn.CLOSED
                        val open = if (closed) showClosed || query.isNotBlank() else showAllWaiting || query.isNotBlank() || column != QueueColumn.WAITING
                        val shown = when { closed && !open -> emptyList(); !open -> inColumn.take(QueueRules.WAITING_FOLD); else -> inColumn }
                        item(key = "h-${column.name}") {
                            if (closed) Row(Modifier.fillMaxWidth().padding(top = Spacing.sm), verticalAlignment = Alignment.CenterVertically) {
                                Text("${column.label} (${inColumn.size})", Modifier.weight(1f), style = MaterialTheme.typography.titleSmall)
                                if (query.isBlank()) RowAction(stringResource(if (showClosed) R.string.fila_ocultar_terminados else R.string.fila_ver_terminados), { showClosed = !showClosed })
                            } else Text("${column.label} (${inColumn.size})", style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(top = Spacing.sm))
                        }
                        items(shown, key = { it.id }) { ticket -> QueueTicketCard(ticket, canCall, canManage, state, model, now, canIssue, onOpenVitals) }
                        if (shown.size < inColumn.size && !closed) item(key = "m-${column.name}") { RowAction(stringResource(R.string.fila_ver_n_mas, inColumn.size - shown.size), { showAllWaiting = true }) }
                    }
                }
            }
        }
    }
    if (state.tickets.isNotEmpty() || canIssue || canCall) QueueDock(
        state, service, query,
        onCallNext = if (canCall && service == null) ({ model.clearMessages(); callNextOpen = true }) else null,
        onIssue = if (canIssue) ({ model.clearMessages(); issueOpen = true }) else null,
    )
    }
}

/**
 * Bottom dock of the day's line: who is being seen, who goes next (with the area colour), the wait times in large
 * numbers, and "Llamar siguiente" / "Emitir número" splitting the full width. It stays put while the board scrolls.
 */
@Composable
private fun QueueDock(state: QueueState, service: String?, query: String, onCallNext: (() -> Unit)?, onIssue: (() -> Unit)?) {
    val now = System.currentTimeMillis()
    val visible = QueueBoard.visible(state.tickets, service, query)
    val summary = QueueBoard.summary(visible, now)
    val serving = visible.filter { it.state == "en_atencion" || it.state == "llamado" }.maxByOrNull { it.issuedAtMillis ?: 0L }
    val waiting = QueueBoard.sorted(visible.filter { it.state == "en_espera" })
    // The server rule picks who goes next; when it already answered for this area, show its pick, else the head of the line.
    val proposal = state.next?.proposal?.takeIf { service != null }
    val nextArea = proposal?.area ?: waiting.firstOrNull()?.area
    val nextCode = (proposal?.number ?: waiting.firstOrNull()?.number)?.toString()
    Column(
        Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.surface)
            .drawBehind { drawLine(Color.Black.copy(alpha = 0.08f), Offset(0f, 0f), Offset(size.width, 0f), 1.dp.toPx()) }
            .padding(horizontal = Spacing.page, vertical = Spacing.md),
        verticalArrangement = Arrangement.spacedBy(Spacing.md),
    ) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Spacing.md)) {
            DockStat(stringResource(R.string.fila_dock_atendiendo), serving?.number?.toString() ?: stringResource(R.string.fila_dock_nadie), serving?.area, Modifier.weight(1f))
            DockStat(stringResource(R.string.fila_dock_sigue), nextCode ?: stringResource(R.string.fila_dock_nadie), nextArea, Modifier.weight(1f),
                detail = if (waiting.isNotEmpty()) stringResource(R.string.fila_dock_en_espera, waiting.size) else null)
            DockStat(stringResource(R.string.fila_dock_espera), elapsedText(summary.averageWait), null, Modifier.weight(1.2f), detail = stringResource(R.string.fila_dock_espera_max, elapsedText(summary.longestWait)))
        }
        if (onCallNext != null || onIssue != null) Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
            if (onCallNext != null) {
                if (onIssue != null) SecondaryButton(stringResource(R.string.fila_llamar_siguiente), onCallNext, Modifier.weight(1f), icon = Icons.Default.Phone, enabled = !state.busy && waiting.isNotEmpty())
                else PrimaryButton(stringResource(R.string.fila_llamar_siguiente), onCallNext, Modifier.weight(1f), icon = Icons.Default.Phone, enabled = !state.busy && waiting.isNotEmpty())
            }
            if (onIssue != null) PrimaryButton(stringResource(R.string.rec7_emitir_numero), onIssue, Modifier.weight(1f), icon = Icons.Default.Add, enabled = !state.busy)
        }
    }
}

/** One dock figure: a small label over a large number; the area tag tints it softly so the colour guides, not shouts. */
@Composable
private fun DockStat(label: String, value: String, area: String?, modifier: Modifier = Modifier, detail: String? = null) {
    Column(modifier, verticalArrangement = Arrangement.spacedBy(Spacing.xs)) {
        Text(label, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Spacing.xs)) {
            if (area != null) AreaTag(area)
            Text(value, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        if (detail != null) Text(detail, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
    }
}

/** Who goes next in the chosen area by the server rule, and "Llamar siguiente" right under it. */
@Composable
private fun NextCard(state: QueueState, service: String, canCall: Boolean, primary: Boolean, waiting: Boolean, office: String, onOffice: (String) -> Unit, onCallNext: () -> Unit) {
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
            Text(proposal.patientName, style = MaterialTheme.typography.bodyLarge, maxLines = 2, overflow = TextOverflow.Ellipsis)
            Text(proposal.reasonText, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        } else if (status == NextStatus.NONE) Text(noProposalText(next), style = MaterialTheme.typography.bodyMedium)
        if (canCall) {
            OfficePicker(state.offices, office, busy, onOffice)
            val calling = state.busyKey == QueueViewModel.NEXT
            if (primary) PrimaryButton(stringResource(R.string.fila_llamar_siguiente), onCallNext, icon = Icons.Default.Phone, enabled = !busy && waiting, loading = calling)
            else SecondaryButton(stringResource(R.string.fila_llamar_siguiente), onCallNext, icon = Icons.Default.Phone, enabled = !busy && waiting, loading = calling)
        }
    }
}

/** D74: why nobody is proposed: nobody waits, or those waiting have an appointment with another doctor. */
@Composable
internal fun noProposalText(next: sv.edu.catolica.climesa.domain.NextProposal?): String =
    next?.waitingForOtherDoctor?.let { androidx.compose.ui.res.pluralStringResource(R.plurals.fila_citas_otro_medico, it, it) } ?: stringResource(R.string.fila_nadie_espera)

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
private fun QueueTicketCard(ticket: QueueTicket, canCall: Boolean, canManage: Boolean, state: QueueState, model: QueueViewModel, now: Long, canIssue: Boolean = false, onOpenVitals: ((sv.edu.catolica.climesa.domain.QuickSubject) -> Unit)? = null) {
    val busy = state.busy
    // B3: only the card being sent shows "Un momento…"; the rest only stop taking taps.
    val sending = state.busyKey == ticket.id
    Column(Modifier.fillMaxWidth().areaSurface(ticket.area).padding(Spacing.md), verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
            AreaTag(ticket.area)
            // The number is large next to the area code, as the patient hears it called ("CON 7").
            Text(ticket.number.toString(), style = MaterialTheme.typography.headlineMedium.copy(fontWeight = FontWeight.Bold), modifier = Modifier.weight(1f).semantics { contentDescription = QueueLabels.code(ticket) })
            OperacionStatusTag(ticket.state, label = QueueLabels.state(ticket.state))
        }
        Text(ticket.patientName, style = MaterialTheme.typography.bodyLarge, maxLines = 2, overflow = TextOverflow.Ellipsis)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(Spacing.sm), verticalArrangement = Arrangement.spacedBy(Spacing.xs)) {
            if (ticket.priority != "rutina") PriorityBadge(Priority.of(ticket.priority))
            Text(QueueLabels.arrival(ticket), style = MaterialTheme.typography.labelLarge, color = if (ticket.appointmentAt != null) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Text("${QueueLabels.service(ticket.service)} · ${QueueLabels.progress(ticket, canCall)}${ticket.officeCode?.let { " · $it" } ?: ""}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        QueueBoard.waitMinutes(ticket, now)?.takeIf { QueueBoard.waitLevel(ticket, now) != SlaLevel.NONE }?.let { minutes ->
            Text(stringResource(R.string.fila_espera, elapsedText(minutes)), style = MaterialTheme.typography.labelLarge, color = slaColor(QueueBoard.waitLevel(ticket, now)))
        }
        // G5: a called or attended number opens Signos vitales on its patient, like the ward card.
        if (onOpenVitals != null) QueueRules.vitalsSubject(ticket)?.let { subject -> RowAction(stringResource(R.string.rec7_hosp_signos), { onOpenVitals(subject) }, enabled = !busy) }
        // D-3: "No se presentó" waits on its own card with "Deshacer" before it is sent.
        val absence = state.pendingAbsences.firstOrNull { it.key == ticket.id }
        if (absence != null) {
            UndoRow(absence.label, busy = false) { model.undoAbsence(ticket.id) }
            return@Column
        }
        // Buttons come from the API (`allowedActions`). R3 A-14/A-31: only allowed actions, as compact row actions in one line
        // (never four full-width buttons); a blocked action is hidden instead of printing the server's reason.
        FlowRow(horizontalArrangement = Arrangement.spacedBy(Spacing.xs)) {
            // B3: every number this person called keeps its own undo while it is still called.
            if (ticket.id in state.calledByMe && ticket.state == "llamado" && "deshacer_llamado" in ticket.undoActions) RowAction(stringResource(R.string.fila_deshacer), { model.undoCall(ticket) }, enabled = !busy, loading = sending)
            QueueActionButton(ticket, QueueAction.CALL, if (ticket.state == "llamado") "Llamar de nuevo" else "Llamar", busy, sending) { model.call(ticket) }
            QueueActionButton(ticket, QueueAction.ATTEND, "Iniciar atención", busy, sending) { model.attend(ticket) }
            QueueActionButton(ticket, QueueAction.COMPLETE, "Completar", busy, sending) { model.complete(ticket) }
            QueueActionButton(ticket, QueueAction.ABSENT, "No se presentó", busy, false) { model.absent(ticket) }
            // B-3: the issuer may void a number issued by mistake while the server window is open (like the web card menu).
            if (canIssue && QueueRules.voidable(ticket.voidableUntilMillis, ticket.state, now)) RowAction(stringResource(R.string.fila_anular), { model.voidTicket(ticket) }, enabled = !busy, loading = sending)
            CardMenu(ticket, canCall, canManage, busy, model, undoShown = ticket.id in state.calledByMe && ticket.state == "llamado" && "deshacer_llamado" in ticket.undoActions)
        }
    }
}

/**
 * Board moves without dragging (touch and keyboard). The main next step is already a direct button on the card; this "Más"
 * menu holds only the other moves the server accepts now and the priority change, with plain labels and no "Mover a…".
 */
@Composable
private fun CardMenu(ticket: QueueTicket, canCall: Boolean, canManage: Boolean, busy: Boolean, model: QueueViewModel, undoShown: Boolean = false) {
    val moves = remember(ticket, undoShown) { QueueMoves.menuMoves(ticket, undoShown).filter { it != QueueMove.REMOVE_CALL || canCall } }
    val priorities = if (canManage && ticket.state in listOf("en_espera", "llamado")) listOf("emergencia", "urgente", "rutina").filter { it != ticket.priority } else emptyList()
    if (moves.isEmpty() && priorities.isEmpty()) return
    var open by remember { mutableStateOf(false) }
    Box {
        TextButton(onClick = { open = true }, enabled = !busy, modifier = Modifier.heightIn(min = Spacing.touch).semantics { contentDescription = "Más acciones de ${QueueLabels.code(ticket)}" }) {
            Icon(Icons.Default.MoreVert, null, Modifier.size(20.dp)); Spacer(Modifier.width(Spacing.xs)); Text(stringResource(R.string.fila_mas))
        }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            moves.forEach { move ->
                val label = if (move == QueueMove.REMOVE_CALL) stringResource(R.string.fila_quitar_llamado, ticket.calls) else move.label
                DropdownMenuItem(text = { Text(label) }, onClick = { open = false; model.move(ticket, move) })
            }
            if (moves.isNotEmpty() && priorities.isNotEmpty()) HorizontalDivider()
            priorities.forEach { p ->
                DropdownMenuItem(text = { Text(stringResource(R.string.fila_prioridad_cambiar, QueueLabels.priority(p))) }, onClick = { open = false; model.changePriority(ticket, p) })
            }
        }
    }
}

@Composable
private fun QueueActionButton(ticket: QueueTicket, action: QueueAction, label: String, busy: Boolean, sending: Boolean, onClick: () -> Unit) {
    if (!ticket.allows(action)) return
    RowAction(label, onClick, enabled = !busy, loading = sending)
}

/** R3 A-6: the patient's "Mi turno": their number large, the area, the state and the room once called. Nothing of the board. */
@Composable
private fun PatientTicketView(state: QueueState, modifier: Modifier, onRetry: () -> Unit) {
    val mine = PatientQueue.current(state.tickets)
    // B5: vibrate once when the number passes to "Llamado" (realtime reload, no timers).
    val haptics = androidx.compose.ui.platform.LocalHapticFeedback.current
    var lastState by rememberSaveable { mutableStateOf<String?>(null) }
    LaunchedEffect(mine?.id, mine?.state) {
        if (mine?.state == "llamado" && lastState != null && lastState != "llamado") haptics.performHapticFeedback(androidx.compose.ui.hapticfeedback.HapticFeedbackType.LongPress)
        lastState = mine?.state
    }
    // B5: once called, the whole screen says where to go.
    if (mine?.state == "llamado") { CalledFullScreen(mine, PatientQueue.office(mine, state.publicCalls), modifier); return }
    PageList(modifier) {
        when {
            state.loading && state.tickets.isEmpty() -> item { LoadingState() }
            state.error != null && state.tickets.isEmpty() -> item { ErrorState(state.error, onRetry = onRetry) }
            mine == null -> item { EmptyState(stringResource(R.string.fila_paciente_sin_numero), detail = stringResource(R.string.fila_paciente_sin_numero_detalle)) }
            else -> {
                item {
                    Column(Modifier.fillMaxWidth().areaSurface(mine.area).padding(Spacing.lg), verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                            AreaTag(mine.area, showName = true)
                            Spacer(Modifier.weight(1f))
                            OperacionStatusTag(mine.state, label = QueueLabels.state(mine.state))
                        }
                        Text(mine.number.toString(), style = MaterialTheme.typography.displayLarge.copy(fontWeight = FontWeight.Bold), modifier = Modifier.semantics { contentDescription = QueueLabels.code(mine) })
                        Text(QueueLabels.progress(mine, canCall = false), style = MaterialTheme.typography.titleMedium)
                        if (mine.state == "en_espera") {
                            val ahead = PatientQueue.ahead(mine, state.publicCalls)
                            Text(
                                when (ahead) { null -> stringResource(R.string.rec7_turno_sin_llamados); 0 -> stringResource(R.string.rec7_turno_eres_siguiente); else -> androidx.compose.ui.res.pluralStringResource(R.plurals.rec7_turno_antes, ahead, ahead) },
                                style = MaterialTheme.typography.titleLarge,
                            )
                            Text(stringResource(R.string.rec7_turno_te_llamaran), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        Text(QueueLabels.arrival(mine), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
                if (state.loading) item { RefreshHint() }
                val others = PatientQueue.others(state.tickets)
                if (others.isNotEmpty()) item {
                    Text(stringResource(R.string.fila_paciente_otros), style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(top = Spacing.sm))
                }
                items(others, key = { it.id }) { t ->
                    Row(Modifier.fillMaxWidth().heightIn(min = Spacing.touch), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                        AreaTag(t.area)
                        Text(t.number.toString(), Modifier.weight(1f), style = MaterialTheme.typography.titleMedium)
                        OperacionStatusTag(t.state, label = QueueLabels.state(t.state))
                    }
                }
            }
        }
    }
}

/** B5: the called patient's whole screen: their number and the room, large, with a vibration when it appears. */
@Composable
private fun CalledFullScreen(ticket: QueueTicket, office: String?, modifier: Modifier) {
    Column(
        modifier.fillMaxSize().areaSurface(ticket.area).padding(Spacing.lg),
        verticalArrangement = Arrangement.spacedBy(Spacing.md, Alignment.CenterVertically),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        OperacionStatusTag(ticket.state, label = QueueLabels.state(ticket.state))
        Text(QueueLabels.code(ticket), style = MaterialTheme.typography.displayLarge.copy(fontWeight = FontWeight.Bold), modifier = Modifier.semantics { contentDescription = QueueLabels.code(ticket) })
        Text(office?.let { stringResource(R.string.rec7_turno_pasa_a, it) } ?: stringResource(R.string.rec7_turno_pasa), style = MaterialTheme.typography.headlineSmall, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
        Text(stringResource(R.string.rec7_turno_llamado_detalle), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
    }
}

/**
 * B1 "mostrador": one search for the patient, service chips (the last one used preselected) and priority (rutina
 * preselected), and one primary "Emitir número". The issued number stays on top, large, and the search is ready for the next.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun IssuePanel(state: QueueState, model: QueueViewModel, modifier: Modifier = Modifier, onClose: () -> Unit) {
    var service by rememberSaveable { mutableStateOf(state.lastService) }
    var priority by rememberSaveable { mutableStateOf("rutina") }
    val sending = state.busyKey == QueueViewModel.ISSUE
    val chosen = state.issueSearch.patient
    var withoutAppointment by rememberSaveable(chosen?.id) { mutableStateOf(false) }
    val arrival = chosen?.canRegisterArrival == true && !withoutAppointment
    androidx.activity.compose.BackHandler(enabled = !sending) { onClose() }
    Column(modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth().padding(end = Spacing.md), verticalAlignment = Alignment.CenterVertically) {
            BackButton(onClose, enabled = !sending)
            Text(stringResource(R.string.rec7_emitir_numero), Modifier.weight(1f), style = MaterialTheme.typography.titleMedium)
        }
        HorizontalDivider(color = MaterialTheme.climesa.line)
        Column(Modifier.weight(1f).fillMaxWidth().verticalScroll(rememberScrollState()).padding(Spacing.md), verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
            state.issued?.let { issued ->
                Column(Modifier.fillMaxWidth().areaSurface(issued.code.substringBefore(' ')).padding(Spacing.md), verticalArrangement = Arrangement.spacedBy(Spacing.xs)) {
                    Text(stringResource(R.string.rec7_numero_emitido), style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text(issued.code, style = MaterialTheme.typography.displaySmall.copy(fontWeight = FontWeight.Bold))
                    Text(listOfNotNull(issued.patientName, issued.ahead?.let { androidx.compose.ui.res.pluralStringResource(R.plurals.rec7_antes, it, it) }).joinToString(" · "), style = MaterialTheme.typography.bodyLarge)
                    // B-3: "Anular" only while the server window is open (10 min); the clock is read when the panel is drawn.
                    if (QueueRules.voidable(issued.voidableUntilMillis, "en_espera", System.currentTimeMillis())) RowAction(stringResource(R.string.fila_anular_este), { model.voidIssued() }, enabled = !state.busy, loading = sending)
                }
            }
            state.voided?.let { NoticeBanner(NoticeKind.SUCCESS, stringResource(R.string.fila_anulado, it)) }
            state.error?.let { NoticeBanner(NoticeKind.ERROR, it) }
            val search = state.issueSearch
            Text(stringResource(R.string.rec_agendar_paciente), style = MaterialTheme.typography.titleSmall)
            PatientSearchPicker(search.query, search.results, search.searching, search.hasMore, search.patient, model::issueQuery, model::pickIssuePatient, model::moreIssuePatients, enabled = !sending)
            search.error?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error) }
            // S1: an inactive patient handed in from the record is a calm reason, not a search error.
            search.blocked?.let { BlockedReason(it) }
            // B1 / D-1: with an appointment today the primary action registers the arrival (Consulta general, linked to it);
            // "Emitir sin la cita" falls back to the walk-in chips.
            if (arrival) {
                NoticeBanner(NoticeKind.INFO, stringResource(R.string.u5_llegada_explica))
                TextButton(onClick = { withoutAppointment = true }, enabled = !sending, modifier = Modifier.heightIn(min = Spacing.touch)) { Text(stringResource(R.string.u5_emitir_sin_cita)) }
            } else {
                Text(stringResource(R.string.rec7_servicio), style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(top = Spacing.sm))
                FlowRow(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                    QueueLabels.services.forEach { (value, label) -> androidx.compose.material3.FilterChip(selected = service == value, onClick = { service = value }, enabled = !sending, label = { Text(label) }) }
                }
            }
            Text(stringResource(R.string.fila_prioridad), style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(top = Spacing.sm))
            FlowRow(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                // R2: each priority chip wears its priority badge (routine stays neutral, like the web).
                listOf("rutina", "urgente", "emergencia").forEach { value -> StatusFilterChip(priority == value, { priority = value }, QueueLabels.priority(value), Priority.of(value).takeIf { it != Priority.RUTINA }?.let { ChipTone.Level(it) }, enabled = !sending) }
            }
            Text(stringResource(R.string.fila_prioridad_ayuda), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        HorizontalDivider(color = MaterialTheme.climesa.line)
        Row(Modifier.fillMaxWidth().padding(horizontal = Spacing.md, vertical = Spacing.sm)) {
            if (arrival) PrimaryButton(stringResource(R.string.u5_registrar_llegada), { model.registerArrival(priority) }, enabled = !state.busy, loading = sending)
            else PrimaryButton(
                state.issueSearch.patient?.let { stringResource(R.string.rec7_emitir_para, it.name) } ?: stringResource(R.string.rec7_emitir_numero),
                { model.issue(service, priority) },
                enabled = state.issueSearch.patient != null && !state.busy, loading = sending,
            )
        }
    }
}

/** Service picker dialog of "Llamar siguiente"; with [error] it stays open until the API answers without one. */
@Composable
private fun QueueServiceDialog(
    title: String, confirmLabel: String, initial: String, busy: Boolean, message: @Composable (String) -> String, onClose: () -> Unit, withPriority: Boolean = false,
    confirmEnabled: Boolean = true, error: String? = null, waitingIn: ((String) -> Int)? = null, extra: @Composable () -> Unit = {}, onSubmit: (String, String) -> Unit,
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
        confirmEnabled = confirmEnabled && (waitingIn == null || waitingIn(service) > 0),
        body = {
            error?.let { NoticeBanner(NoticeKind.ERROR, it) }
            Column() {
                extra()
                QueueLabels.services.forEach { (value, label) ->
                    Row(Modifier.fillMaxWidth().heightIn(min = Spacing.touch).selectable(selected = service == value, role = Role.RadioButton, onClick = { service = value }), verticalAlignment = Alignment.CenterVertically) {
                        RadioButton(selected = service == value, onClick = null)
                        Text(waitingIn?.let { stringResource(R.string.fila_servicio_en_espera, label, it(value)) } ?: label, Modifier.padding(start = Spacing.sm))
                    }
                }
                if (waitingIn != null && waitingIn(service) == 0) BlockedReason(stringResource(R.string.fila_servicio_sin_espera, QueueLabels.service(service)))
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
