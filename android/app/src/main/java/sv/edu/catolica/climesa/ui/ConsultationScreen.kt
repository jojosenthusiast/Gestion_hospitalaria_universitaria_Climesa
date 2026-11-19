@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
package sv.edu.catolica.climesa.ui

import sv.edu.catolica.climesa.ui.icons.ClimesaIcons
import androidx.activity.compose.BackHandler
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.IconButton
import androidx.compose.material3.Icon
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
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
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import sv.edu.catolica.climesa.R
import sv.edu.catolica.climesa.domain.ConsultationPrimary
import sv.edu.catolica.climesa.domain.ConsultationRecord
import sv.edu.catolica.climesa.domain.ConsultationRecordRules
import sv.edu.catolica.climesa.domain.LabExam
import sv.edu.catolica.climesa.domain.MedicalAppointment
import sv.edu.catolica.climesa.domain.AccessProfile
import sv.edu.catolica.climesa.domain.DraftRules
import sv.edu.catolica.climesa.domain.DraftStatus
import sv.edu.catolica.climesa.domain.QueueConsultation
import sv.edu.catolica.climesa.domain.ConsultationAgenda
import sv.edu.catolica.climesa.domain.QueueCardActions
import sv.edu.catolica.climesa.domain.DoctorDaySections
import sv.edu.catolica.climesa.domain.QueueContext
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.size
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription

private val sanSalvador = ZoneId.of("America/El_Salvador")

@Composable
fun ConsultationScreen(profile: AccessProfile? = null, modifier: Modifier = Modifier, userId: String? = null, model: ConsultationViewModel = viewModel(), actions: AppointmentActionViewModel = viewModel()) {
    val state by model.state.collectAsStateWithLifecycle()
    val actionState by actions.state.collectAsStateWithLifecycle()
    LaunchedEffect(actionState.done) { if (actionState.done != null) model.load(silent = true) }
    AppointmentActionDialog(actionState, actions)
    // The open consultation survives rotation and process death (saved instance state); its fields survive leaving
    // the screen or closing the app as a local draft (DraftStore).
    var selected by rememberSaveable { mutableStateOf<String?>(null) }
    var showPast by rememberSaveable { mutableStateOf(false) }
    var showLater by rememberSaveable { mutableStateOf(false) }
    var allUnsigned by rememberSaveable { mutableStateOf(false) }
    var allReschedules by rememberSaveable { mutableStateOf(false) }
    var showMoreToday by rememberSaveable { mutableStateOf(false) }
    var showDone by rememberSaveable { mutableStateOf(false) }
    // S15: the record opens over the module that needs it (Mi día, the consultation) and back returns there.
    var recordPatient by rememberSaveable { mutableStateOf<String?>(null) }
    var confirmAbsent by remember { mutableStateOf<QueueConsultation?>(null) }
    val permissions = profile?.permissions.orEmpty()
    LaunchedEffect(userId) { userId?.let { model.configure(it, "fila.ver" in permissions && "consulta.iniciar" in permissions, withUnsigned = "consulta.iniciar" in permissions, withReschedules = "citas.ver" in permissions && "consulta.iniciar" in permissions) }; model.load() }
    LaunchedEffect(profile?.channels) { profile?.let { model.startLive(it.channels) } }
    // A consultation opened by id (queue): reopen it after process death, and select it when it arrives.
    LaunchedEffect(selected) { selected?.takeIf { it.startsWith("consulta:") }?.split(':')?.let { parts -> model.open(parts[1], parts.getOrNull(2)?.toIntOrNull()) } }
    LaunchedEffect(state.resumed?.key) { state.resumed?.let { selected = it.key } }
    if (profile != null) recordPatient?.let { id -> BackHandler { recordPatient = null }; PatientRecordPage(profile, id, modifier) { recordPatient = null }; return }
    val selectedItem = state.appointments.firstOrNull { it.key == selected } ?: state.resumed?.takeIf { it.key == selected }
    // R3 A-3: the consultation is its own full screen (web `consultations.tsx`), not a dialog; system back leaves it.
    selectedItem?.let { item -> ConsultationPage(item, profile, state.saving, state.error, state.labCatalog, state.labCatalogLoading, model, modifier, record = state.record?.takeIf { it.consultationId == item.consultationId }, stepNotice = state.stepNotice, recordError = state.recordError, onClose = { selected = null; model.closeResumed() }); return }
    val retry = { model.clearMessages(); model.load() }
    val canCall = "fila.llamar" in permissions
    val canManage = "fila.gestionar" in permissions
    confirmAbsent?.let { ticket ->
        ConfirmDialog(
            title = stringResource(R.string.med_fila_ausente_titulo, ticket.code), confirmLabel = stringResource(R.string.med_fila_ausente_confirmar),
            message = stringResource(R.string.med_fila_ausente_detalle), destructive = true,
            onConfirm = { confirmAbsent = null; model.markAbsent(ticket) }, onDismiss = { confirmAbsent = null },
        )
    }
    val primary = ConsultationPrimary.pick(state.queue, state.unsigned.map { it.id }, canCallNext = state.handoff?.proposal != null && canCall,
        canCallWaiting = state.handoff == null && canCall && state.waitingGeneral)
    val canRecord = "expediente.ver" in permissions
    val openRecord: (String?) -> Unit = { id -> id?.takeIf { it.isNotBlank() }?.let { recordPatient = it } }
    // Lote 5 S11: today by what comes next (Ahora, Próximas, Pendientes de firmar); other days are separate, labelled entries.
    val plan = DoctorDaySections.plan(state.appointments, Instant.now())
    val officeBusy = state.queue.any { it.calledByMe && it.state in setOf("llamado", "en_atencion") }
    PageList(modifier) {
        state.notice?.let { notice -> item { NoticeBanner(NoticeKind.SUCCESS, notice) } }
        actionState.done?.let { notice -> item { NoticeBanner(NoticeKind.SUCCESS, notice) } }
        if (state.loading && state.appointments.isEmpty() && state.queue.isEmpty()) { item { LoadingState() }; return@PageList }
        if (state.error != null && state.appointments.isEmpty() && state.queue.isEmpty()) { item { ErrorState(state.error, retry) }; return@PageList }
        if (state.loading) item { RefreshHint() }
        state.error?.let { error -> item { NoticeBanner(NoticeKind.ERROR, error) } }

        // 1. Ahora: who goes next, who is in the office and the appointments whose slot is running.
        val nowCount = state.queue.size + plan.today.now.size
        item(key = "s-ahora") { DaySectionHeader(stringResource(R.string.med5_ahora), nowCount, ClimesaIcons.Pulse) }
        state.handoff?.let { handoff -> item { NextPatientHandoff(handoff, canCall, state.saving, onCall = { model.callProposed() }, onDismiss = { model.dismissHandoff() }) } }
        // B4: with nobody in the office yet, calling who waits in general consultation is the day's first action.
        if (ConsultationPrimary.showsCallWaiting(state.handoff != null, canCall, state.waitingGeneral, officeBusy)) item {
            SectionCard(stringResource(R.string.clin_llamar_primero_titulo)) {
                Text(stringResource(R.string.clin_llamar_primero_detalle), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                val call = { model.clearMessages(); model.callWaiting() }
                CardActionButton(CardAction(stringResource(R.string.fila_llamar_siguiente), if (primary == ConsultationPrimary.CallWaiting) ActionRole.Primary else ActionRole.Edit, call, icon = ClimesaIcons.Megaphone, enabled = !state.saving, loading = state.saving), Modifier.fillMaxWidth())
            }
        }
        items(state.queue, key = { "fila-${it.ticketId}" }) { ticket ->
            QueueConsultationCard(ticket, opening = state.opening, onAttend = { model.clearMessages(); model.attend(ticket) },
                canCall = canCall, canManage = canManage, busy = state.queueBusy, model = model, onAbsent = { confirmAbsent = ticket },
                onRecord = if (canRecord && ticket.patientId != null) ({ openRecord(ticket.patientId) }) else null)
        }
        items(plan.today.now, key = { "ya-${it.appointmentId}" }) { item ->
            AgendaCard(item, onOpen = { model.clearMessages(); selected = item.appointmentId }, onRecord = if (canRecord) ({ openRecord(item.patientId) }) else null)
        }
        if (nowCount == 0 && state.handoff == null) item { MutedLine(stringResource(R.string.med5_ahora_vacio)) }

        // 2. Próximas: the rest of today, the first three open and a labelled expander; the next days apart.
        item(key = "s-proximas") { DaySectionHeader(stringResource(R.string.med5_proximas), plan.today.upcoming.size, ClimesaIcons.Clock) }
        if (plan.today.upcoming.isEmpty()) item { MutedLine(stringResource(if (state.appointments.isEmpty() && plan.today.now.isEmpty()) R.string.med_agenda_hoy_vacia else R.string.med5_proximas_vacio)) }
        val upcoming = if (showMoreToday) plan.today.upcoming else plan.today.upcoming.take(DoctorDaySections.UPCOMING_VISIBLE)
        items(upcoming, key = { "px-${it.appointmentId}" }) { item ->
            AgendaCard(item, onOpen = { model.clearMessages(); selected = item.appointmentId }, onRecord = if (canRecord) ({ openRecord(item.patientId) }) else null)
        }
        DoctorDaySections.moreTodayLabel(plan.today.upcoming.size, showMoreToday)?.let { label -> item(key = "px-mas") { RowAction(label, { showMoreToday = !showMoreToday }) } }
        DoctorDaySections.laterDetail(plan.later)?.let { detail ->
            item(key = "e-later") { FoldEntry(stringResource(R.string.med5_proximos_dias), detail, showLater, ClimesaIcons.Calendar) { showLater = !showLater } }
            if (showLater) plan.later.forEach { day ->
                item(key = "dl-${day.date}") { DayLabel(DayChipLabels.of(day.date, java.time.LocalDate.now(sanSalvador)) + " · " + DoctorDaySections.dayLabel(day.date)) }
                items(day.appointments, key = { "dl-${it.appointmentId}" }) { item -> AgendaCard(item, onOpen = { model.clearMessages(); selected = item.appointmentId }, onRecord = if (canRecord) ({ openRecord(item.patientId) }) else null) }
            }
        }

        // 3. Pendientes de firmar: own open consultations of any day, and the reschedule requests to decide.
        if (state.unsigned.isNotEmpty() || state.reschedules.isNotEmpty()) {
            item(key = "s-pend") { DaySectionHeader(stringResource(R.string.med5_pendientes), state.unsigned.size, ClimesaIcons.Pencil, detail = stringResource(R.string.med5_pendientes_ayuda).takeIf { state.unsigned.isNotEmpty() }) }
            // Row 14: two pending consultations, the rest folded (the primary one is always among the first).
            items(ConsultationAgenda.shown(state.unsigned, allUnsigned), key = { "sf-${it.id}" }) { c ->
                UnsignedCard(c, primary = primary == ConsultationPrimary.ResumeUnsigned(c.id), enabled = !state.saving,
                    onResume = { model.clearMessages(); model.resume(c) }, onRecord = if (canRecord) ({ openRecord(c.patientId) }) else null)
            }
            item { FoldToggle(state.unsigned.size, allUnsigned) { allUnsigned = !allUnsigned } }
            if (state.reschedules.isNotEmpty()) {
                item { DayLabel(stringResource(R.string.med5_reprogramaciones) + " (${state.reschedules.size})") }
                items(ConsultationAgenda.shown(state.reschedules, allReschedules), key = { "rp-${it.id}" }) { a ->
                    SectionCard(a.patientName.ifBlank { stringResource(R.string.clin_consulta_sin_nombre) }) {
                        Text(stringResource(R.string.clin_reprog_detalle, formatDateTime(a.start), a.pendingReschedule?.let { formatDateTime(it.start) }.orEmpty()), style = MaterialTheme.typography.bodySmall)
                        val decisions = listOf(sv.edu.catolica.climesa.domain.AppointmentAction.ACCEPT_RESCHEDULE, sv.edu.catolica.climesa.domain.AppointmentAction.REJECT_RESCHEDULE)
                        AppointmentActionButtons(decisions.filter { it in a.allowedActions }, decisions.filter { it !in a.allowedActions }.mapNotNull { d -> a.blockedActions[d]?.let { d to it } }) { actions.open(a, it) }
                    }
                }
                item { FoldToggle(state.reschedules.size, allReschedules) { allReschedules = !allReschedules } }
            }
        }

        // Done today, then the history of earlier days: both folded behind entries that say what they hold.
        if (plan.today.done.isNotEmpty()) {
            item(key = "e-done") { FoldEntry(stringResource(R.string.med5_atendidas), androidx.compose.ui.res.pluralStringResource(R.plurals.med5_citas_n, plan.today.done.size, plan.today.done.size), showDone, ClimesaIcons.Check) { showDone = !showDone } }
            if (showDone) items(plan.today.done, key = { "dn-${it.appointmentId}" }) { item -> AgendaCard(item, onOpen = { model.clearMessages(); selected = item.appointmentId }, onRecord = if (canRecord) ({ openRecord(item.patientId) }) else null) }
        }
        DoctorDaySections.historyDetail(plan.past)?.let { detail ->
            item(key = "e-past") { FoldEntry(stringResource(R.string.med5_historial), detail, showPast, ClimesaIcons.Audit) { showPast = !showPast } }
            if (showPast) plan.past.forEach { day ->
                item(key = "dp-${day.date}") { DayLabel(DoctorDaySections.dayLabel(day.date)) }
                items(day.appointments, key = { "dp-${it.appointmentId}" }) { item -> AgendaCard(item, onOpen = { model.clearMessages(); selected = item.appointmentId }, onRecord = if (canRecord) ({ openRecord(item.patientId) }) else null) }
            }
        }
    }
}

/** Lote 5 S11: heading of a "Mi día" section with its icon and count, and an optional line saying what it holds. */
@Composable
private fun DaySectionHeader(title: String, count: Int, icon: androidx.compose.ui.graphics.vector.ImageVector, detail: String? = null) {
    Column(Modifier.fillMaxWidth().padding(top = Spacing.sm), verticalArrangement = Arrangement.spacedBy(Spacing.xs)) {
        Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
            Icon(icon, null, Modifier.size(20.dp), tint = MaterialTheme.climesa.primaryText)
            Text(title, Modifier.semantics { heading() }, style = MaterialTheme.typography.titleLarge)
            Text(count.toString(), Modifier.background(MaterialTheme.climesa.soft, androidx.compose.foundation.shape.RoundedCornerShape(Radius.chip)).padding(horizontal = Spacing.sm, vertical = 2.dp),
                style = MaterialTheme.typography.labelLarge.copy(fontFeatureSettings = "tnum"), color = MaterialTheme.climesa.primaryText)
        }
        detail?.let { MutedLine(it) }
    }
}

@Composable
private fun DayLabel(text: String) = Text(text, Modifier.padding(top = Spacing.xs).semantics { heading() }, style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)

@Composable
private fun MutedLine(text: String) = Text(text, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)

/** A folded group (next days, done today, history): what it holds is said before opening it, never "Ver más (3)". */
@Composable
private fun FoldEntry(title: String, detail: String, open: Boolean, icon: androidx.compose.ui.graphics.vector.ImageVector, onToggle: () -> Unit) {
    ClimesaClickableCard(onToggle, Modifier.semantics { stateDescription = if (open) "Abierto" else "Cerrado" }) {
        Row(Modifier.fillMaxWidth().heightIn(min = Spacing.touch + Spacing.sm).padding(horizontal = Spacing.md, vertical = Spacing.sm + Spacing.xs), verticalAlignment = androidx.compose.ui.Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Spacing.md)) {
            Icon(icon, null, Modifier.size(22.dp), tint = MaterialTheme.climesa.primaryText)
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(title, style = MaterialTheme.typography.titleSmall)
                Text(detail, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Text(stringResource(if (open) R.string.med5_ocultar else R.string.med5_mostrar), style = MaterialTheme.typography.labelLarge, color = MaterialTheme.climesa.primaryText)
            Icon(ClimesaIcons.Chevron, null, Modifier.size(18.dp).rotate(if (open) 270f else 90f), tint = MaterialTheme.climesa.primaryText)
        }
    }
}

/**
 * One appointment of "Mi día" (S2/S11): time first, then the patient, what they asked for and the reason; the consultation state
 * as a full-width strip; the actions on one line with their weight (start or continue solid, view outlined).
 */
@Composable
private fun AgendaCard(item: MedicalAppointment, onOpen: () -> Unit, onRecord: (() -> Unit)?) {
    val signed = item.consultationState == "firmada"
    val running = item.consultationId != null && !signed
    val actions = buildList {
        when {
            signed -> add(CardAction(stringResource(R.string.med5_ver_consulta), ActionRole.Neutral, onOpen, icon = ClimesaIcons.Eye))
            running -> add(CardAction(stringResource(R.string.med5_continuar), ActionRole.Primary, onOpen, icon = ClimesaIcons.Pencil))
            item.canStart -> add(CardAction(stringResource(R.string.med5_iniciar), ActionRole.Primary, onOpen, icon = ClimesaIcons.Steth))
        }
        onRecord?.let { add(CardAction(stringResource(R.string.med5_ver_expediente), ActionRole.Neutral, it, icon = ClimesaIcons.Clipboard)) }
    }
    val (strip, tone) = when {
        signed -> stringResource(R.string.med5_estado_firmada) to StripTone.Success
        running -> stringResource(R.string.med5_estado_en_curso) to StripTone.Info
        else -> stringResource(R.string.med5_estado_por_iniciar) to StripTone.Neutral
    }
    ActionCard(actions, onClick = onOpen, status = { CardStatusStrip(strip, tone, detail = item.startBlockedReason.takeIf { !signed && !running && !item.canStart }) }) {
        Text(stringResource(R.string.med5_horario, formatTime(item.start), formatTime(item.end)), style = MaterialTheme.typography.labelLarge.copy(fontFeatureSettings = "tnum"), color = MaterialTheme.climesa.primaryText)
        Text(item.patientName.ifBlank { stringResource(R.string.clin_consulta_sin_nombre) }, style = MaterialTheme.typography.titleMedium, maxLines = 2, overflow = TextOverflow.Ellipsis)
        if (item.categories.isNotEmpty()) CategoryMarks(item.categories, showNames = true)
        item.reason?.let { Text(stringResource(R.string.med5_motivo_cita, it), style = MaterialTheme.typography.bodyMedium, maxLines = 3, overflow = TextOverflow.Ellipsis) }
    }
}

/** An own consultation left unsigned: who, since when, its reason; "Reanudar" is solid on the screen's primary one. */
@Composable
private fun UnsignedCard(c: sv.edu.catolica.climesa.domain.UnsignedConsultation, primary: Boolean, enabled: Boolean, onResume: () -> Unit, onRecord: (() -> Unit)?) {
    val actions = buildList {
        add(CardAction(stringResource(R.string.med5_reanudar), if (primary) ActionRole.Primary else ActionRole.Edit, onResume, icon = ClimesaIcons.Pencil, enabled = enabled))
        onRecord?.let { add(CardAction(stringResource(R.string.med5_ver_expediente), ActionRole.Neutral, it, icon = ClimesaIcons.Clipboard)) }
    }
    ActionCard(actions, status = { CardStatusStrip(stringResource(R.string.med5_estado_sin_firmar), StripTone.Warning, icon = ClimesaIcons.Alert, detail = stringResource(R.string.med5_iniciada, formatDateTime(c.startedAt))) }) {
        Text(c.patientName, style = MaterialTheme.typography.titleMedium, maxLines = 2, overflow = TextOverflow.Ellipsis)
        c.reason?.let { Text(stringResource(R.string.med5_motivo_cita, it), style = MaterialTheme.typography.bodyMedium, maxLines = 3, overflow = TextOverflow.Ellipsis) }
    }
}

/**
 * A called or in-attention number (S11 queue rows): the code and priority first, the patient, the service and whether the
 * patient came from an appointment (with what they asked for), the state as a strip and the queue actions by weight.
 */
@Composable
private fun QueueConsultationCard(ticket: QueueConsultation, opening: String?, onAttend: () -> Unit, canCall: Boolean, canManage: Boolean, busy: String?, model: ConsultationViewModel, onAbsent: () -> Unit, onRecord: (() -> Unit)?) {
    val undo = QueueCardActions.canUndo(ticket, canCall)
    val again = QueueCardActions.canCallAgain(ticket, canCall)
    val absent = QueueCardActions.canMarkAbsent(ticket)
    val priorities = QueueCardActions.priorities(ticket, canManage)
    val sending = busy == ticket.ticketId
    val free = busy == null
    val actions = buildList {
        // B2: another clinician called this number (web `calledElsewhere`): informative only, no "Iniciar consulta".
        if (!ticket.calledElsewhere) {
            val label = when {
                ticket.consultationState == "firmada" -> stringResource(R.string.clin_fila_ver)
                ticket.consultationId != null -> stringResource(R.string.med5_continuar)
                else -> stringResource(R.string.med5_iniciar)
            }
            add(CardAction(label, if (ticket.consultationState == "firmada") ActionRole.Neutral else ActionRole.Primary, onAttend, icon = ClimesaIcons.Steth, enabled = opening == null, loading = opening == ticket.ticketId))
        }
        if (again) add(CardAction(stringResource(R.string.med_fila_volver_llamar), ActionRole.Edit, { model.callAgain(ticket) }, icon = ClimesaIcons.Megaphone, enabled = free))
        if (undo) add(CardAction(stringResource(R.string.med_fila_deshacer), ActionRole.Edit, { model.undoCall(ticket) }, enabled = free, loading = sending))
        onRecord?.let { add(CardAction(stringResource(R.string.med5_ver_expediente), ActionRole.Neutral, it, icon = ClimesaIcons.Clipboard)) }
        if (absent) add(CardAction(stringResource(R.string.med_fila_no_se_presento), ActionRole.Danger, onAbsent, enabled = free))
    }
    val inAttention = ticket.state == "en_atencion"
    ActionCard(actions, status = {
        CardStatusStrip(OperacionStatusLabel(ticket.state), if (inAttention) StripTone.Info else StripTone.Warning,
            detail = if (ticket.calledElsewhere) stringResource(R.string.clin_fila_otro_consultorio) else null)
    }) {
        Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
            Text(ticket.code, style = MaterialTheme.typography.headlineSmall.copy(fontFeatureSettings = "tnum"), color = MaterialTheme.climesa.primaryText)
            if (ticket.priority != "rutina") PriorityBadge(Priority.of(ticket.priority))
            Spacer(Modifier.weight(1f))
            if (priorities.isNotEmpty()) PriorityMenu(priorities, enabled = free) { model.changePriority(ticket, it) }
        }
        Text(ticket.patientName, style = MaterialTheme.typography.titleMedium, maxLines = 2, overflow = TextOverflow.Ellipsis)
        Text(QueueContext.line(ticket), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        if (ticket.categories.isNotEmpty()) CategoryMarks(ticket.categories, showNames = true)
    }
}

/** Clinical priority of a number (`fila.gestionar`): a small menu next to the code, outside the card's action line. */
@Composable
private fun PriorityMenu(options: List<String>, enabled: Boolean, onPick: (String) -> Unit) {
    var menu by remember { mutableStateOf(false) }
    androidx.compose.foundation.layout.Box {
        RowAction(stringResource(R.string.med_fila_prioridad), { menu = true }, enabled = enabled)
        androidx.compose.material3.DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
            options.forEach { p ->
                androidx.compose.material3.DropdownMenuItem(text = { Text(stringResource(R.string.fila_prioridad_a, sv.edu.catolica.climesa.domain.QueueLabels.priority(p))) }, onClick = { menu = false; onPick(p) })
            }
        }
    }
}

@Composable
private fun OperacionStatusLabel(state: String): String = StatusCatalog.label(state)

@Composable
private fun ConsultationPage(item: MedicalAppointment, profile: AccessProfile?, busy: Boolean, error: String?, labCatalog: List<LabExam>, labCatalogLoading: Boolean, model: ConsultationViewModel, modifier: Modifier, record: ConsultationRecord?, stepNotice: Pair<RecordSection, String>?, recordError: String? = null, cie10: Cie10SearchViewModel = viewModel(), onClose: () -> Unit) {
    // B4: what this consultation already has is listed under each step, so nothing is registered twice.
    LaunchedEffect(item.consultationId) { item.consultationId?.let { model.loadRecord(it, withLabOrders = "resultados.ver" in profile?.permissions.orEmpty()) } }
    val draftId = item.consultationId?.takeIf { item.consultationState != "firmada" }
    val stored = remember(draftId) { draftId?.let(model::draft) }
    fun text(field: String, fallback: String) = DraftRules.text(stored, field, fallback)
    var reason by rememberSaveable(item.key) { mutableStateOf(text("reason", item.consultationReason ?: item.reason.orEmpty())) }
    var physicalExam by rememberSaveable(item.key) { mutableStateOf(text("physicalExam", item.physicalExam.orEmpty())) }
    var plan by rememberSaveable(item.key) { mutableStateOf(text("plan", item.plan.orEmpty())) }
    var systolic by rememberSaveable(item.key) { mutableStateOf(text("systolic", "")) }
    var diastolic by rememberSaveable(item.key) { mutableStateOf(text("diastolic", "")) }
    var heartRate by rememberSaveable(item.key) { mutableStateOf(text("heartRate", "")) }
    var temperature by rememberSaveable(item.key) { mutableStateOf(text("temperature", "")) }
    var oxygenSaturation by rememberSaveable(item.key) { mutableStateOf(text("oxygenSaturation", "")) }
    var diagnosisCode by rememberSaveable(item.key) { mutableStateOf(text("diagnosisCode", "")) }
    var diagnosisDescription by rememberSaveable(item.key) { mutableStateOf(text("diagnosisDescription", "")) }
    var diagnosisNote by rememberSaveable(item.key) { mutableStateOf(text("diagnosisNote", "")) }
    // Row 5: unset means "principal when the consultation has none yet"; a tap or the draft fixes the choice.
    var principalChoice by rememberSaveable(item.key) { mutableStateOf(stored?.takeIf { it.has("diagnosisPrincipal") }?.optBoolean("diagnosisPrincipal")) }
    val diagnosisPrincipal = principalChoice ?: ConsultationRecordRules.defaultPrincipal(record)
    var medication by rememberSaveable(item.key) { mutableStateOf(text("medication", "")) }
    var dose by rememberSaveable(item.key) { mutableStateOf(text("dose", "")) }
    var route by rememberSaveable(item.key) { mutableStateOf(text("route", "")) }
    var frequency by rememberSaveable(item.key) { mutableStateOf(text("frequency", "")) }
    var duration by rememberSaveable(item.key) { mutableStateOf(text("duration", "")) }
    var instructions by rememberSaveable(item.key) { mutableStateOf(text("instructions", "")) }
    // Selected exam ids joined by commas, so the selection survives rotation without a custom saver.
    var labExams by rememberSaveable(item.key) { mutableStateOf(text("labExams", "")) }
    var labUrgent by rememberSaveable(item.key) { mutableStateOf(DraftRules.flag(stored, "labUrgent", false)) }
    val signed = item.consultationState == "firmada"
    val permissions = profile?.permissions.orEmpty()
    val values = mapOf<String, Any>("reason" to reason, "physicalExam" to physicalExam, "plan" to plan, "systolic" to systolic, "diastolic" to diastolic, "heartRate" to heartRate, "temperature" to temperature, "oxygenSaturation" to oxygenSaturation, "diagnosisCode" to diagnosisCode, "diagnosisDescription" to diagnosisDescription, "diagnosisNote" to diagnosisNote, "medication" to medication, "dose" to dose, "route" to route, "frequency" to frequency, "duration" to duration, "instructions" to instructions, "labExams" to labExams, "labUrgent" to labUrgent) + listOfNotNull(principalChoice?.let { "diagnosisPrincipal" to it })
    // What the API already has: after "Guardar borrador" the ViewModel updates the item, so only pending fields stay local.
    val baseline = mapOf<String, Any>("reason" to (item.consultationReason ?: item.reason.orEmpty()), "physicalExam" to item.physicalExam.orEmpty(), "plan" to item.plan.orEmpty())
    val dirty = DraftRules.isDirty(values, baseline)
    var draftStatus by remember(item.key) { mutableStateOf(DraftStatus.NONE) }
    var confirmLeave by remember(item.key) { mutableStateOf(false) }
    LaunchedEffect(draftId, values, baseline) {
        val id = draftId ?: return@LaunchedEffect
        draftStatus = if (!dirty) { model.clearDraft(id); DraftStatus.NONE } else if (model.saveDraft(id, DraftRules.toJson(values))) DraftStatus.SAVED else DraftStatus.NOT_SAVED
    }
    val leave: () -> Unit = { if (draftId != null && DraftRules.mustConfirmLeave(dirty, draftStatus)) { confirmLeave = true } else { onClose() } }
    var confirmSign by remember(item.key) { mutableStateOf(false) }
    val signSent = remember(item.key) { mutableStateOf(false) }
    CloseWhenDone(busy, signSent, error) { confirmSign = false }
    // Signing is clinical and irreversible: confirm with what happens. The notes are saved first, then signed; `busy`
    // spans both writes so the button cannot send twice.
    if (confirmSign) ConfirmDialog(
        title = stringResource(R.string.consulta_firmar_titulo), confirmLabel = stringResource(R.string.consulta_firmar), busy = busy,
        message = ConsultationRecordRules.signSummary(record) + "\n" + stringResource(R.string.consulta_firmar_detalle), dismissLabel = stringResource(R.string.borrador_seguir),
        onConfirm = { signSent.value = true; model.sign(item, reason, physicalExam, plan, onClose) }, onDismiss = { confirmSign = false },
        body = if (error != null) ({ NoticeBanner(NoticeKind.ERROR, error) }) else null,
    )
    if (confirmLeave) ConfirmDialog(title = stringResource(R.string.borrador_salir_titulo), confirmLabel = stringResource(R.string.borrador_salir), onConfirm = { confirmLeave = false; onClose() }, onDismiss = { confirmLeave = false }, message = stringResource(R.string.borrador_salir_mensaje), dismissLabel = stringResource(R.string.borrador_seguir), destructive = true)
    BackHandler(enabled = !busy) { leave() }
    Column(modifier.fillMaxSize()) {
    Row(Modifier.fillMaxWidth().padding(end = Spacing.md), verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
        IconButton(onClick = leave, enabled = !busy) { Icon(ClimesaIcons.Back, contentDescription = stringResource(R.string.consulta_cerrar)) }
        Text(stringResource(if (signed) R.string.consulta_t_firmada else if (item.consultationId == null) R.string.consulta_t_iniciar else R.string.consulta_t_continuar), Modifier.weight(1f), style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
    HorizontalDivider(color = MaterialTheme.climesa.line)
    Column(Modifier.weight(1f).fillMaxWidth().verticalScroll(rememberScrollState()).padding(Spacing.md), verticalArrangement = Arrangement.spacedBy(Spacing.sm + Spacing.xs)) {
        Row(horizontalArrangement = Arrangement.spacedBy(Spacing.lg)) { LabeledValue(stringResource(R.string.consulta_paciente), item.patientName, Modifier.weight(1f)); if (item.ticketNumber != null) LabeledValue(stringResource(R.string.consulta_numero), stringResource(R.string.clin_fila_numero, item.ticketNumber), Modifier.weight(1f)) else if (item.appointmentId.isNotBlank()) LabeledValue(stringResource(R.string.consulta_cita), formatDateTime(item.start), Modifier.weight(1f)) }
        error?.let { NoticeBanner(NoticeKind.ERROR, it) }
        if (item.consultationId == null && !item.canStart) NoticeBanner(NoticeKind.INFO, item.startBlockedReason ?: stringResource(R.string.consulta_no_iniciable))
        if (stored != null && !signed) NoticeBanner(NoticeKind.INFO, stringResource(R.string.borrador_recuperado))
        when (draftStatus) {
            DraftStatus.SAVED -> Text(stringResource(R.string.borrador_guardado), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            DraftStatus.NOT_SAVED -> NoticeBanner(NoticeKind.ERROR, stringResource(R.string.borrador_sin_guardar))
            DraftStatus.NONE -> Unit
        }
        if (signed) NoticeBanner(NoticeKind.INFO, stringResource(R.string.clin_consulta_firmada_aviso))
        // S9: consultation → procedures → prescription and/or exams → close, in that order (numbered step headings, no prose).
        Text(stringResource(R.string.consulta_paso1), style = MaterialTheme.typography.titleSmall)
        // Row 3: the vitals already taken (often by the assistant), read from the detail, first thing of step 1.
        if (item.consultationId != null && record != null) {
            Text(stringResource(R.string.med_signos_tomados, record.vitals.size), style = MaterialTheme.typography.titleSmall)
            if (record.vitals.isEmpty()) Text(stringResource(R.string.med_signos_ninguno), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            record.vitals.forEach { v -> RecordLine(v.text, formatDateTime(v.takenAt)) }
        }
        FormField(stringResource(R.string.consulta_motivo), reason, { reason = it.take(2000) }, enabled = !signed, singleLine = false)
        FormField(stringResource(R.string.consulta_examen), physicalExam, { physicalExam = it.take(10000) }, enabled = !signed, singleLine = false)
        if (item.consultationId != null && "signos.registrar" in permissions) {
            Text(stringResource(R.string.clin_consulta_signos), style = MaterialTheme.typography.titleSmall)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) { FormField(stringResource(R.string.consulta_pa_sis), systolic, { systolic = it }, Modifier.weight(1f)); FormField(stringResource(R.string.consulta_pa_dia), diastolic, { diastolic = it }, Modifier.weight(1f)) }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) { FormField(stringResource(R.string.consulta_fc), heartRate, { heartRate = it }, Modifier.weight(1f)); FormField(stringResource(R.string.consulta_temp), temperature, { temperature = it }, Modifier.weight(1f)); FormField(stringResource(R.string.consulta_sat), oxygenSaturation, { oxygenSaturation = it }, Modifier.weight(1f)) }
            SecondaryButton(stringResource(R.string.consulta_registrar_signos), { model.signs(item, systolic, diastolic, heartRate, temperature, oxygenSaturation) { systolic = ""; diastolic = ""; heartRate = ""; temperature = ""; oxygenSaturation = "" } }, enabled = !busy && listOf(systolic, diastolic, heartRate, temperature, oxygenSaturation).any { it.isNotBlank() })
            StepNotice(stepNotice, RecordSection.SIGNS)
        }
        // #6: the record could not be read: said at the top of what it lists, with the retry, never as empty lists.
        if (item.consultationId != null && record == null && recordError != null) RecordLoadError(recordError) { model.loadRecord(item.consultationId) }
        if (item.consultationId != null && (record?.diagnoses?.isNotEmpty() == true || (!signed && "consulta.registrar" in permissions))) {
            Text(stringResource(R.string.rec7_consulta_diagnosticos, record?.diagnoses?.size ?: 0), style = MaterialTheme.typography.titleSmall)
            record?.diagnoses?.forEach { d -> RecordLine(listOfNotNull(d.code, d.note).joinToString(" · "), if (d.principal) stringResource(R.string.consulta_principal) else null) }
        }
        if (item.consultationId != null && !signed && "consulta.registrar" in permissions) {
            // Sweep U6 #5: the code comes from the API CIE-10 search; typed by hand only when the search fails.
            Cie10Picker(diagnosisCode, diagnosisDescription, enabled = !busy, resetKey = item.key, model = cie10) { code, description -> diagnosisCode = code; diagnosisDescription = description }
            FormField(stringResource(R.string.consulta_nota), diagnosisNote, { diagnosisNote = it.take(2000) })
            Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) { androidx.compose.material3.Checkbox(diagnosisPrincipal, { principalChoice = it }); Text(stringResource(R.string.consulta_principal)) }
            SecondaryButton(stringResource(R.string.consulta_registrar_diagnostico), { model.diagnosis(item, diagnosisCode, diagnosisNote, diagnosisPrincipal) { diagnosisCode = ""; diagnosisDescription = ""; diagnosisNote = ""; principalChoice = null } }, enabled = !busy && diagnosisCode.trim().isNotBlank())
            StepNotice(stepNotice, RecordSection.DIAGNOSIS)
        }
        Text(stringResource(R.string.consulta_paso2), style = MaterialTheme.typography.titleSmall)
        FormField(stringResource(R.string.consulta_plan), plan, { plan = it.take(5000) }, enabled = !signed, singleLine = false)
        if (item.consultationId != null) Text(stringResource(R.string.consulta_paso3), style = MaterialTheme.typography.titleSmall)
        if (item.consultationId != null && (record?.medications?.isNotEmpty() == true || (!signed && "recetas.emitir" in permissions))) {
            Text(stringResource(R.string.rec7_consulta_receta, record?.medications?.size ?: 0), style = MaterialTheme.typography.titleSmall)
            record?.medications?.forEach { m -> RecordLine(m.medication, listOf(m.dose, m.frequency, m.duration).filter { it.isNotBlank() }.joinToString(" · ")) }
        }
        if (item.consultationId != null && !signed && "recetas.emitir" in permissions) {
            FormField(stringResource(R.string.consulta_medicamento), medication, { medication = it.take(200) })
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) { FormField(stringResource(R.string.consulta_dosis), dose, { dose = it.take(200) }, Modifier.weight(1f)); FormField(stringResource(R.string.consulta_via), route, { route = it.take(100) }, Modifier.weight(1f)) }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) { FormField(stringResource(R.string.consulta_frecuencia), frequency, { frequency = it.take(200) }, Modifier.weight(1f)); FormField(stringResource(R.string.consulta_duracion), duration, { duration = it.take(100) }, Modifier.weight(1f)) }
            FormField(stringResource(R.string.consulta_indicaciones), instructions, { instructions = it.take(1000) }, singleLine = false)
            SecondaryButton(stringResource(R.string.consulta_emitir_receta), { model.prescription(item, medication, dose, route, frequency, duration, instructions) { medication = ""; dose = ""; route = ""; frequency = ""; duration = ""; instructions = "" } }, enabled = !busy && listOf(medication, dose, route, frequency, duration).all { it.trim().isNotBlank() })
            StepNotice(stepNotice, RecordSection.PRESCRIPTION)
        }
        AdmissionIndicationEntry(item, profile, enabled = !busy)
        if (item.consultationId != null && "laboratorio.ordenar" in permissions) {
            LaunchedEffect(item.consultationId) { model.loadLabCatalog() }
            val chosen = labExams.split(',').filter { it.isNotBlank() }.toSet()
            val orders = record?.labOrders.orEmpty().filter { it.state != "cancelado" }
            Text(stringResource(R.string.rec7_consulta_examenes, orders.sumOf { it.exams.size }), style = MaterialTheme.typography.titleSmall)
            if (record != null && !record.labOrdersKnown && recordError != null) RecordLoadError(recordError) { model.loadRecord(item.consultationId) }
            orders.forEach { o -> RecordLine(o.exams.joinToString(), null, status = o.state) }
            StepNotice(stepNotice, RecordSection.LAB)
            if (signed) return@Column
            if (labCatalog.isEmpty()) Text(stringResource(if (labCatalogLoading) R.string.lab_orden_cargando else R.string.lab_orden_sin_catalogo), style = MaterialTheme.typography.bodySmall)
            val panelLabel = stringResource(R.string.lab_orden_panel)
            val orderedLabel = stringResource(R.string.rec7_consulta_ya_ordenado)
            labCatalog.forEach { exam ->
                val ordered = record?.alreadyOrdered(exam) == true
                Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                    androidx.compose.material3.Checkbox(exam.id in chosen && !ordered, { checked -> labExams = (if (checked) chosen + exam.id else chosen - exam.id).joinToString(",") }, enabled = !busy && !ordered)
                    Text(listOfNotNull(exam.code, exam.name, panelLabel.takeIf { exam.isPanel }, orderedLabel.takeIf { ordered }).joinToString(" · "), style = MaterialTheme.typography.bodySmall, color = if (ordered) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.onSurface)
                }
            }
            Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) { androidx.compose.material3.Checkbox(labUrgent, { labUrgent = it }, enabled = !busy); Text(stringResource(R.string.lab_orden_urgente)) }
            val blocked = model.labOrderBlocker(item.consultationId)
            blocked?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error) }
            SecondaryButton(stringResource(R.string.lab_orden_emitir), { model.orderLab(item, chosen, labUrgent) { labExams = ""; labUrgent = false } }, enabled = !busy && chosen.isNotEmpty() && blocked == null)
        }
        if (item.consultationId != null && !signed) Text(stringResource(R.string.consulta_paso4), style = MaterialTheme.typography.titleSmall)
    }
    // Fixed action bar: always reachable at the bottom of a long consultation. One primary: "Iniciar consulta" before it
    // exists, then "Firmar". Saving the draft is secondary.
    HorizontalDivider(color = MaterialTheme.climesa.line)
    Row(
        Modifier.fillMaxWidth().padding(horizontal = Spacing.md, vertical = Spacing.sm),
        horizontalArrangement = Arrangement.spacedBy(Spacing.sm, androidx.compose.ui.Alignment.End),
        verticalAlignment = androidx.compose.ui.Alignment.CenterVertically,
    ) {
        if (!signed && item.consultationId != null) RowAction(stringResource(R.string.consulta_guardar_borrador), { model.save(item, reason, physicalExam, plan) }, enabled = !busy && reason.trim().isNotBlank())
        if (!signed && item.consultationId == null && item.canStart) PrimaryButton(stringResource(R.string.consulta_t_iniciar), { model.start(item, reason) }, enabled = reason.trim().isNotBlank(), loading = busy, fill = false)
        else if (!signed && item.consultationId != null) {
            // B4 / S7: a disabled "Firmar" says why under it, with the shared blocked line.
            PrimaryButton(stringResource(R.string.consulta_firmar), { confirmSign = true }, enabled = !busy, fill = false, blockedReason = ConsultationRecordRules.signBlocker(reason.trim(), plan.trim()))
        }
        else RowAction(stringResource(R.string.consulta_cerrar), leave, enabled = !busy)
    }
    }
}

/** Rows 14-15: "Ver 3 más" / "Ver menos" under a list that shows its first two rows; nothing when nothing folds. */
@Composable
private fun FoldToggle(count: Int, expanded: Boolean, onToggle: () -> Unit) {
    if (count <= ConsultationAgenda.VISIBLE) return
    RowAction(if (expanded) stringResource(R.string.med_ver_menos) else stringResource(R.string.med5_mostrar_mas_lista, count - ConsultationAgenda.VISIBLE), onToggle)
}

/** One thing the consultation already has: what it is and a short detail. */
@Composable
private fun RecordLine(title: String, detail: String?, status: String? = null) {
    Row(Modifier.fillMaxWidth().padding(vertical = Spacing.xs), horizontalArrangement = Arrangement.spacedBy(Spacing.sm), verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
        androidx.compose.material3.Icon(ClimesaIcons.Check, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.bodyMedium)
            detail?.takeIf { it.isNotBlank() }?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        }
        // R1: a state is its badge, never plain text under the title.
        status?.let { StatusBadge(it) }
    }
}

/** B4: the success of a step, right under it. */
/** #6: a read that failed, in place, with "Volver a cargar". */
@Composable
private fun RecordLoadError(message: String, onRetry: () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(Spacing.xs)) {
        NoticeBanner(NoticeKind.ERROR, message)
        RowAction(stringResource(R.string.rec7_volver_a_cargar), onRetry)
    }
}

@Composable
private fun StepNotice(notice: Pair<RecordSection, String>?, section: RecordSection) {
    notice?.takeIf { it.first == section }?.let { NoticeBanner(NoticeKind.SUCCESS, it.second) }
}

private fun appointmentState(value: String) = StatusCatalog.label(value)
/** R4: "Hoy 09:00", "Jue 26 nov, 09:00"; never the year. */
private fun formatDateTime(value: String) = runCatching { sv.edu.catolica.climesa.domain.MyShifts.relative(Instant.parse(value), Instant.now()) }.getOrDefault("—")
private fun formatTime(value: String) = runCatching { DateTimeFormatter.ofPattern("HH:mm").format(Instant.parse(value).atZone(sanSalvador)) }.getOrDefault("—")

/** After closing a consultation: who goes next in its area by the server rule, with the call one tap away (S9). */
@Composable
private fun NextPatientHandoff(handoff: sv.edu.catolica.climesa.domain.NextProposal, canCall: Boolean, busy: Boolean, onCall: () -> Unit, onDismiss: () -> Unit) {
    val proposal = handoff.proposal
    Column(Modifier.fillMaxWidth().areaSurface(handoff.area).padding(Spacing.md), verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
        Text(stringResource(R.string.consulta_quien_sigue), style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
        if (proposal != null) {
            Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                AreaTag(proposal.area)
                Text(proposal.number.toString(), style = MaterialTheme.typography.displaySmall)
                if (proposal.priority != "rutina") PriorityBadge(Priority.of(proposal.priority))
            }
            Text(proposal.patientName, style = MaterialTheme.typography.bodyLarge)
            Text(proposal.reasonText, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        } else Text(stringResource(R.string.fila_nadie_espera), style = MaterialTheme.typography.bodyMedium)
        if (proposal != null && canCall) PrimaryButton(stringResource(R.string.consulta_llamar_a, proposal.code), onCall, enabled = !busy)
        SecondaryButton(stringResource(R.string.consulta_ahora_no), onDismiss, enabled = !busy)
    }
}
