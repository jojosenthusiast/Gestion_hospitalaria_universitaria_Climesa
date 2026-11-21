@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
package sv.edu.catolica.climesa.ui

import androidx.activity.compose.BackHandler
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.IconButton
import androidx.compose.material3.Icon
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.ime
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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.EditNote
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Warning
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
import sv.edu.catolica.climesa.domain.VitalMeasure
import sv.edu.catolica.climesa.domain.VitalsRules

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
    var confirmAbsent by remember { mutableStateOf<QueueConsultation?>(null) }
    val permissions = profile?.permissions.orEmpty()
    LaunchedEffect(userId) { userId?.let { model.configure(it, "fila.ver" in permissions && "consulta.iniciar" in permissions, withUnsigned = "consulta.iniciar" in permissions, withReschedules = "citas.ver" in permissions && "consulta.iniciar" in permissions) }; model.load() }
    LaunchedEffect(profile?.channels) { profile?.let { model.startLive(it.channels) } }
    // A consultation opened by id (queue): reopen it after process death, and select it when it arrives.
    LaunchedEffect(selected) { selected?.takeIf { it.startsWith("consulta:") }?.split(':')?.let { parts -> model.open(parts[1], parts.getOrNull(2)?.toIntOrNull()) } }
    LaunchedEffect(state.resumed?.key) { state.resumed?.let { selected = it.key } }
    val selectedItem = state.appointments.firstOrNull { it.key == selected } ?: state.resumed?.takeIf { it.key == selected }
    // R3 A-3: the consultation is its own full screen (web `consultations.tsx`), not a dialog; system back leaves it.
    selectedItem?.let { item -> ConsultationPage(item, profile, state.saving, state.error, state.labCatalog, state.labCatalogLoading, model, modifier, record = state.record?.takeIf { it.consultationId == item.consultationId }, stepNotice = state.stepNotice, recordError = state.recordError, notice = state.notice, onClose = { selected = null; model.closeResumed() }); return }
    val retry = { model.clearMessages(); model.load() }
    // S13: one primary action for the whole screen (call next, resume own patient, resume unsigned, or start a called number).
    val canCall = "fila.llamar" in permissions
    val canManage = "fila.gestionar" in permissions
    confirmAbsent?.let { ticket ->
        ConfirmDialog(
            title = stringResource(R.string.med_fila_ausente_titulo, ticket.code), confirmLabel = stringResource(R.string.med_fila_ausente_confirmar),
            message = stringResource(R.string.med_fila_ausente_detalle), destructive = true,
            onConfirm = { confirmAbsent = null; model.markAbsent(ticket) }, onDismiss = { confirmAbsent = null },
        )
    }
    val handoff = ConsultationPrimary.shownHandoff(state.handoff, state.waitingGeneral)
    val primary = ConsultationPrimary.pick(state.queue, state.unsigned.map { it.id }, canCallNext = handoff?.proposal != null && canCall,
        canCallWaiting = handoff == null && canCall && state.waitingGeneral)
    PageList(modifier) {
        state.notice?.let { notice -> item { NoticeBanner(NoticeKind.SUCCESS, notice) } }
        handoff?.let { handoff -> item { NextPatientHandoff(handoff, canCall, state.saving, onCall = { model.callProposed() }, onDismiss = { model.dismissHandoff() }) } }
        // B4: with nobody in the office yet, calling who waits in general consultation is the day's first action.
        // QA final: with an unsigned consultation as primary, the call stays available as a secondary button (iOS parity).
        if (ConsultationPrimary.showsCallWaiting(handoff != null, canCall, state.waitingGeneral, officeBusy = state.queue.any { it.calledByMe && it.state in setOf("llamado", "en_atencion") })) item {
            SectionCard(stringResource(R.string.clin_llamar_primero_titulo)) {
                Text(stringResource(R.string.clin_llamar_primero_detalle), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                val call = { model.clearMessages(); model.callWaiting() }
                if (primary == ConsultationPrimary.CallWaiting) PrimaryButton(stringResource(R.string.fila_llamar_siguiente), call, enabled = !state.saving, loading = state.saving)
                else SecondaryButton(stringResource(R.string.fila_llamar_siguiente), call, enabled = !state.saving)
            }
        }
        actionState.done?.let { notice -> item { NoticeBanner(NoticeKind.SUCCESS, notice) } }
        if (state.unsigned.isNotEmpty()) {
            item { Text(stringResource(R.string.clin_sin_firmar_titulo), style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(top = Spacing.sm)) }
            // Row 14: two pending consultations, the rest folded (the primary one is always among the first).
            items(ConsultationAgenda.shown(state.unsigned, allUnsigned), key = { "sf-${it.id}" }) { c ->
                val subtitle = listOfNotNull(stringResource(R.string.clin_sin_firmar_item, formatDateTime(c.startedAt)), c.reason?.let { stringResource(R.string.clin_consulta_motivo, it) }).joinToString("\n")
                // Only the screen's primary unsigned consultation gets a button; the rest are compact rows that open on tap.
                if (primary == ConsultationPrimary.ResumeUnsigned(c.id)) SectionCard(c.patientName) {
                    Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    PrimaryButton(stringResource(R.string.clin_reanudar), { model.clearMessages(); model.resume(c) }, enabled = !state.saving)
                }
                else DataRow(title = c.patientName, subtitle = subtitle, leadingIcon = Icons.Default.EditNote, onClick = { if (!state.saving) { model.clearMessages(); model.resume(c) } })
            }
            item { FoldToggle(state.unsigned.size, allUnsigned) { allUnsigned = !allUnsigned } }
        }
        if (state.reschedules.isNotEmpty()) {
            item { Text(stringResource(R.string.clin_reprog_titulo), style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(top = Spacing.sm)) }
            items(ConsultationAgenda.shown(state.reschedules, allReschedules), key = { "rp-${it.id}" }) { a ->
                SectionCard(a.patientName.ifBlank { stringResource(R.string.clin_consulta_sin_nombre) }) {
                    Text(stringResource(R.string.clin_reprog_detalle, formatDateTime(a.start), a.pendingReschedule?.let { formatDateTime(it.start) }.orEmpty()), style = MaterialTheme.typography.bodySmall)
                    val decisions = listOf(sv.edu.catolica.climesa.domain.AppointmentAction.ACCEPT_RESCHEDULE, sv.edu.catolica.climesa.domain.AppointmentAction.REJECT_RESCHEDULE)
                    AppointmentActionButtons(decisions.filter { it in a.allowedActions }, decisions.filter { it !in a.allowedActions }.mapNotNull { d -> a.blockedActions[d]?.let { d to it } }) { actions.open(a, it) }
                }
            }
            item { FoldToggle(state.reschedules.size, allReschedules) { allReschedules = !allReschedules } }
        }
        when {
            state.loading && state.appointments.isEmpty() -> item { LoadingState() }
            state.error != null && state.appointments.isEmpty() -> item { ErrorState(state.error, retry) }
            state.appointments.isEmpty() -> item { EmptyState(stringResource(R.string.clin_consulta_sin_citas), detail = stringResource(R.string.clin_consulta_sin_citas_detalle)) }
            else -> {
                if (state.loading) item { RefreshHint() }
                state.error?.let { error -> item { NoticeBanner(NoticeKind.ERROR, error) } }
                // Row 15: "Mi día" opens on today, by day; earlier and later days stay folded behind one button each.
                val today = java.time.LocalDate.now(sanSalvador)
                val groups = ConsultationAgenda.group(ConsultationPrimary.withoutCalled(state.appointments, state.queue), today)
                if (groups.past.isNotEmpty() && !showPast) item { RowAction(stringResource(R.string.citas_ver_dias_anteriores, groups.past.size), { showPast = true }) }
                val days = (if (showPast) groups.past else emptyList()) + listOfNotNull(groups.today) + (if (showLater) groups.later else emptyList())
                if (groups.today == null) item { Text(stringResource(R.string.med_agenda_hoy_vacia), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(vertical = Spacing.sm)) }
                days.forEach { day ->
                    item(key = "dia-${day.date}") { Text(DayChipLabels.of(day.date, today), style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(top = Spacing.sm)) }
                    items(day.appointments, key = { it.appointmentId }) { item -> MedicalAppointmentCard(item, onOpen = { model.clearMessages(); selected = item.appointmentId }) }
                }
                if (groups.later.isNotEmpty() && !showLater) item { RowAction(stringResource(R.string.med_ver_proximos_dias, groups.later.size), { showLater = true }) }
            }
        }
        if (state.queue.isNotEmpty()) {
            item { Text(stringResource(R.string.clin_fila_titulo), style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(top = Spacing.sm)) }
            items(state.queue, key = { "fila-${it.ticketId}" }) { ticket ->
                QueueConsultationCard(ticket, opening = state.opening, primary = primary == ConsultationPrimary.ResumeTicket(ticket.ticketId) || primary == ConsultationPrimary.StartTicket(ticket.ticketId), onAttend = { model.attend(ticket) },
                    canCall = canCall, canManage = canManage, busy = state.queueBusy, model = model, onAbsent = { confirmAbsent = ticket })
            }
        }
    }
}

@Composable
private fun MedicalAppointmentCard(item: MedicalAppointment, onOpen: () -> Unit) {
    val details = listOfNotNull(
        "${formatDateTime(item.start)} — ${formatTime(item.end)}",
        item.reason?.let { stringResource(R.string.clin_consulta_motivo, it) },
    ).joinToString("\n")
    DataRow(
        title = item.patientName.ifBlank { stringResource(R.string.clin_consulta_sin_nombre) },
        subtitle = details,
        meta = stringResource(R.string.clin_consulta_cita_estado, appointmentState(item.appointmentState)),
        leadingIcon = if (item.consultationState == "firmada") Icons.Default.CheckCircle else Icons.Default.EditNote,
        status = { ClinicalStatusTag(item.consultationState ?: StatusCatalogClinico.NOT_STARTED) },
        onClick = onOpen,
        titleTrailing = if (item.categories.isEmpty()) null else ({ CategoryMarks(item.categories) }),
    )
}

@Composable
private fun QueueConsultationCard(ticket: QueueConsultation, opening: String?, primary: Boolean, onAttend: () -> Unit, canCall: Boolean = false, canManage: Boolean = false, busy: String? = null, model: ConsultationViewModel? = null, onAbsent: () -> Unit = {}) {
    SectionCard(stringResource(R.string.clin_fila_numero, ticket.number), action = { OperacionStatusTag(ticket.state) }) {
        Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
            Text(ticket.patientName, Modifier.weight(1f), style = MaterialTheme.typography.bodyLarge)
            if (ticket.priority != "rutina") PriorityBadge(Priority.of(ticket.priority))
        }
        // Row 1: the queue actions the server offers on this number (iOS `rowActions`), next to the consultation button.
        if (model != null) QueueRowActions(ticket, canCall, canManage, busy, model, onAbsent)
        // B2: another clinician called this number (web `calledElsewhere`): informative only, no "Iniciar consulta".
        if (ticket.calledElsewhere) {
            Text(stringResource(R.string.clin_fila_otro_consultorio), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        } else {
            val label = when {
                opening == ticket.ticketId -> stringResource(R.string.clin_fila_abriendo)
                ticket.consultationState == "firmada" -> stringResource(R.string.clin_fila_ver)
                ticket.consultationId != null -> stringResource(R.string.clin_fila_retomar)
                else -> stringResource(R.string.clin_fila_iniciar)
            }
            if (primary) PrimaryButton(label, onAttend, enabled = opening == null) else SecondaryButton(label, onAttend, enabled = opening == null)
        }
    }
}

@Composable
private fun ConsultationPage(item: MedicalAppointment, profile: AccessProfile?, busy: Boolean, error: String?, labCatalog: List<LabExam>, labCatalogLoading: Boolean, model: ConsultationViewModel, modifier: Modifier, record: ConsultationRecord?, stepNotice: Pair<RecordSection, String>?, recordError: String? = null, cie10: Cie10SearchViewModel = viewModel(), notice: String? = null, onClose: () -> Unit) {
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
        message = stringResource(if (item.appointmentId.isNotBlank()) R.string.consulta_firmar_detalle else R.string.consulta_firmar_detalle_sin_cita), dismissLabel = stringResource(R.string.borrador_seguir),
        onConfirm = { signSent.value = true; model.sign(item, reason, physicalExam, plan, onClose) }, onDismiss = { confirmSign = false }, error = error,
        // D35/S5 (owner): never blocks, but each zero count (diagnoses, medications, exams) stands out in amber.
        body = { SignCounts(ConsultationRecordRules.signCounts(record)) },
    )
    if (confirmLeave) ConfirmDialog(title = stringResource(R.string.borrador_salir_titulo), confirmLabel = stringResource(R.string.borrador_salir), onConfirm = { confirmLeave = false; onClose() }, onDismiss = { confirmLeave = false }, message = stringResource(R.string.borrador_salir_mensaje), dismissLabel = stringResource(R.string.borrador_seguir), destructive = true)
    BackHandler(enabled = !busy) { leave() }
    val imeOpen = WindowInsets.ime.getBottom(androidx.compose.ui.platform.LocalDensity.current) > 0
    val actionBar: @Composable () -> Unit = {
        Column(Modifier.fillMaxWidth()) {
            // D82: "Guardar borrador" and the other page writes confirm right next to the buttons that made them.
            notice?.let { Text(it, Modifier.fillMaxWidth().padding(horizontal = Spacing.md, vertical = Spacing.xs), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.climesa.success) }
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
    Column(modifier.fillMaxSize()) {
    Row(Modifier.fillMaxWidth().padding(end = Spacing.md), verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
        IconButton(onClick = leave, enabled = !busy) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(R.string.consulta_cerrar)) }
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
            // D78/D89: digits only, the API range checked under each field, and the normal range as its hint (as in Internados).
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) { VitalField(VitalMeasure.SYSTOLIC, stringResource(R.string.consulta_pa_sis), systolic, { systolic = it }, Modifier.weight(1f)); VitalField(VitalMeasure.DIASTOLIC, stringResource(R.string.consulta_pa_dia), diastolic, { diastolic = it }, Modifier.weight(1f)) }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) { VitalField(VitalMeasure.HEART_RATE, stringResource(R.string.consulta_fc), heartRate, { heartRate = it }, Modifier.weight(1f)); VitalField(VitalMeasure.TEMPERATURE, stringResource(R.string.consulta_temp), temperature, { temperature = it }, Modifier.weight(1f)) }
            VitalField(VitalMeasure.OXYGEN, stringResource(R.string.consulta_sat), oxygenSaturation, { oxygenSaturation = it })
            val vitalsInvalid = listOf(VitalMeasure.SYSTOLIC to systolic, VitalMeasure.DIASTOLIC to diastolic, VitalMeasure.HEART_RATE to heartRate, VitalMeasure.TEMPERATURE to temperature, VitalMeasure.OXYGEN to oxygenSaturation).any { (m, v) -> VitalsRules.fieldError(m, v) != null }
            SecondaryButton(stringResource(R.string.consulta_registrar_signos), { model.signs(item, systolic, diastolic, heartRate, temperature, oxygenSaturation) { systolic = ""; diastolic = ""; heartRate = ""; temperature = ""; oxygenSaturation = "" } }, enabled = !busy && !vitalsInvalid && listOf(systolic, diastolic, heartRate, temperature, oxygenSaturation).any { it.isNotBlank() })
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
            // D14: on a narrow phone or with large text each field takes its own row, so its label is never cut.
            val config = androidx.compose.ui.platform.LocalConfiguration.current
            if (config.screenWidthDp < 400 || config.fontScale > 1.3f) {
                FormField(stringResource(R.string.consulta_dosis), dose, { dose = it.take(200) })
                FormField(stringResource(R.string.consulta_via), route, { route = it.take(100) })
                FormField(stringResource(R.string.consulta_frecuencia), frequency, { frequency = it.take(200) })
                FormField(stringResource(R.string.consulta_duracion), duration, { duration = it.take(100) })
            } else {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) { FormField(stringResource(R.string.consulta_dosis), dose, { dose = it.take(200) }, Modifier.weight(1f)); FormField(stringResource(R.string.consulta_via), route, { route = it.take(100) }, Modifier.weight(1f)) }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) { FormField(stringResource(R.string.consulta_frecuencia), frequency, { frequency = it.take(200) }, Modifier.weight(1f)); FormField(stringResource(R.string.consulta_duracion), duration, { duration = it.take(100) }, Modifier.weight(1f)) }
            }
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
            // D81: the confirmation of the order sits right under its button (the selection is cleared on success).
            StepNotice(stepNotice, RecordSection.LAB)
        }
        if (item.consultationId != null && !signed) Text(stringResource(R.string.consulta_paso4), style = MaterialTheme.typography.titleSmall)
        // D79 (owner): while the keyboard is open the actions are the last thing of the form, never a bar floating over the
        // keyboard with a gap under it or covering the field being typed.
        if (imeOpen) actionBar()
    }
    // Fixed action bar: always reachable at the bottom of a long consultation. One primary: "Iniciar consulta" before it
    // exists, then "Firmar". Saving the draft is secondary.
    if (!imeOpen) {
        HorizontalDivider(color = MaterialTheme.climesa.line)
        actionBar()
    }
    }
}
/** D35: the counts the signature closes; a zero is an amber chip with a warning icon, the rest plain text. */
@OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
private fun SignCounts(counts: List<ConsultationRecordRules.SignCount>) {
    androidx.compose.foundation.layout.FlowRow(horizontalArrangement = Arrangement.spacedBy(Spacing.xs), verticalArrangement = Arrangement.spacedBy(Spacing.xs)) {
        counts.forEach { count ->
            val c = MaterialTheme.climesa
            androidx.compose.material3.Surface(
                color = if (count.empty) c.warningSoft else MaterialTheme.colorScheme.surfaceVariant,
                contentColor = if (count.empty) c.warning else MaterialTheme.colorScheme.onSurface,
                shape = MaterialTheme.shapes.small,
            ) {
                Row(Modifier.padding(horizontal = Spacing.sm, vertical = Spacing.xs), verticalAlignment = androidx.compose.ui.Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Spacing.xs)) {
                    if (count.empty) Icon(Icons.Default.Warning, contentDescription = stringResource(R.string.consulta_conteo_cero))
                    Text(count.text, style = MaterialTheme.typography.labelLarge)
                }
            }
        }
    }
}

/** One vital sign of the consultation: sanitized while typing, its API range as the error and its normal range as the hint. */
@Composable
private fun VitalField(measure: VitalMeasure, label: String, value: String, onChange: (String) -> Unit, modifier: Modifier = Modifier) {
    FormField(
        label, value, { onChange(VitalsRules.sanitize(measure, it)) }, modifier,
        error = VitalsRules.fieldError(measure, value), hint = measure.referenceText(),
        keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = if (measure.decimals) androidx.compose.ui.text.input.KeyboardType.Decimal else androidx.compose.ui.text.input.KeyboardType.Number),
    )
}

/** Row 1: undo own call, call again, no-show and priority; each only when the server and the permission allow it. */
@OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
private fun QueueRowActions(ticket: QueueConsultation, canCall: Boolean, canManage: Boolean, busy: String?, model: ConsultationViewModel, onAbsent: () -> Unit) {
    val undo = QueueCardActions.canUndo(ticket, canCall)
    val again = QueueCardActions.canCallAgain(ticket, canCall)
    val absent = QueueCardActions.canMarkAbsent(ticket)
    val priorities = QueueCardActions.priorities(ticket, canManage)
    if (!undo && !again && !absent && priorities.isEmpty()) return
    val sending = busy == ticket.ticketId
    var menu by remember { mutableStateOf(false) }
    androidx.compose.foundation.layout.FlowRow(horizontalArrangement = Arrangement.spacedBy(Spacing.xs)) {
        if (undo) RowAction(stringResource(R.string.med_fila_deshacer), { model.undoCall(ticket) }, enabled = busy == null, loading = sending)
        if (again) RowAction(stringResource(R.string.med_fila_volver_llamar), { model.callAgain(ticket) }, enabled = busy == null)
        if (absent) RowAction(stringResource(R.string.med_fila_no_se_presento), onAbsent, enabled = busy == null)
        if (priorities.isNotEmpty()) androidx.compose.foundation.layout.Box {
            RowAction(stringResource(R.string.med_fila_prioridad), { menu = true }, enabled = busy == null)
            androidx.compose.material3.DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                priorities.forEach { p ->
                    androidx.compose.material3.DropdownMenuItem(text = { Text(stringResource(R.string.fila_prioridad_a, sv.edu.catolica.climesa.domain.QueueLabels.priority(p))) }, onClick = { menu = false; model.changePriority(ticket, p) })
                }
            }
        }
    }
}

/** Rows 14-15: "Ver 3 más" / "Ver menos" under a list that shows its first two rows; nothing when nothing folds. */
@Composable
private fun FoldToggle(count: Int, expanded: Boolean, onToggle: () -> Unit) {
    if (count <= ConsultationAgenda.VISIBLE) return
    RowAction(if (expanded) stringResource(R.string.med_ver_menos) else stringResource(R.string.med_ver_mas, count - ConsultationAgenda.VISIBLE), onToggle)
}

/** One thing the consultation already has: what it is and a short detail. */
@Composable
private fun RecordLine(title: String, detail: String?, status: String? = null) {
    Row(Modifier.fillMaxWidth().padding(vertical = Spacing.xs), horizontalArrangement = Arrangement.spacedBy(Spacing.sm), verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
        androidx.compose.material3.Icon(Icons.Default.CheckCircle, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
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
        } else Text(noProposalText(handoff), style = MaterialTheme.typography.bodyMedium)
        if (proposal != null && canCall) PrimaryButton(stringResource(R.string.consulta_llamar_a, proposal.code), onCall, enabled = !busy)
        SecondaryButton(stringResource(R.string.consulta_ahora_no), onDismiss, enabled = !busy)
    }
}
