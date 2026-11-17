@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
package sv.edu.catolica.climesa.ui

import androidx.compose.foundation.layout.Arrangement
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
import sv.edu.catolica.climesa.domain.LabExam
import sv.edu.catolica.climesa.domain.MedicalAppointment
import sv.edu.catolica.climesa.domain.AccessProfile
import sv.edu.catolica.climesa.domain.DraftRules
import sv.edu.catolica.climesa.domain.DraftStatus
import sv.edu.catolica.climesa.domain.QueueConsultation

private val sanSalvador = ZoneId.of("America/El_Salvador")
private val appointmentFormatter = DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm")

@Composable
fun ConsultationScreen(profile: AccessProfile? = null, modifier: Modifier = Modifier, userId: String? = null, model: ConsultationViewModel = viewModel(), actions: AppointmentActionViewModel = viewModel()) {
    val state by model.state.collectAsStateWithLifecycle()
    val actionState by actions.state.collectAsStateWithLifecycle()
    LaunchedEffect(actionState.done) { if (actionState.done != null) model.load(silent = true) }
    AppointmentActionDialog(actionState, actions)
    // The open consultation survives rotation and process death (saved instance state); its fields survive leaving
    // the screen or closing the app as a local draft (DraftStore).
    var selected by rememberSaveable { mutableStateOf<String?>(null) }
    val permissions = profile?.permissions.orEmpty()
    LaunchedEffect(userId) { userId?.let { model.configure(it, "fila.ver" in permissions && "consulta.iniciar" in permissions, withUnsigned = "consulta.iniciar" in permissions, withReschedules = "citas.ver" in permissions && "consulta.iniciar" in permissions) }; model.load() }
    LaunchedEffect(profile?.channels) { profile?.let { model.startLive(it.channels) } }
    // A consultation opened by id (queue): reopen it after process death, and select it when it arrives.
    LaunchedEffect(selected) { selected?.takeIf { it.startsWith("consulta:") }?.split(':')?.let { parts -> model.open(parts[1], parts.getOrNull(2)?.toIntOrNull()) } }
    LaunchedEffect(state.resumed?.key) { state.resumed?.let { selected = it.key } }
    val selectedItem = state.appointments.firstOrNull { it.key == selected } ?: state.resumed?.takeIf { it.key == selected }
    selectedItem?.let { item -> ConsultationDialog(item, profile, state.saving, state.error, state.labCatalog, state.labCatalogLoading, model, onClose = { selected = null; model.closeResumed() }) }
    val retry = { model.clearMessages(); model.load() }
    // S13: one primary action for the whole screen (call next, resume own patient, resume unsigned, or start a called number).
    val canCall = "fila.llamar" in permissions
    val primary = ConsultationPrimary.pick(state.queue, state.unsigned.map { it.id }, canCallNext = state.handoff?.proposal != null && canCall,
        canCallWaiting = state.handoff == null && canCall && state.waitingGeneral)
    PageList(modifier) {
        item { SectionIntro("", stringResource(R.string.consulta_mi_consultorio)) }
        state.notice?.let { notice -> item { NoticeBanner(NoticeKind.SUCCESS, notice) } }
        state.handoff?.let { handoff -> item { NextPatientHandoff(handoff, canCall, state.saving, onCall = { model.callProposed() }, onDismiss = { model.dismissHandoff() }) } }
        // B4: with nobody in the office yet, calling who waits in general consultation is the day's first action.
        if (primary == ConsultationPrimary.CallWaiting) item {
            SectionCard(stringResource(R.string.clin_llamar_primero_titulo)) {
                Text(stringResource(R.string.clin_llamar_primero_detalle), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                PrimaryButton(stringResource(R.string.fila_llamar_siguiente), { model.clearMessages(); model.callWaiting() }, enabled = !state.saving, loading = state.saving)
            }
        }
        actionState.done?.let { notice -> item { NoticeBanner(NoticeKind.SUCCESS, notice) } }
        if (state.unsigned.isNotEmpty()) {
            item { Text(stringResource(R.string.clin_sin_firmar_titulo), style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(top = Spacing.sm)) }
            items(state.unsigned, key = { "sf-${it.id}" }) { c ->
                SectionCard(c.patientName) {
                    Text(stringResource(R.string.clin_sin_firmar_item, formatDateTime(c.startedAt)), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    c.reason?.let { Text(stringResource(R.string.clin_consulta_motivo, it), style = MaterialTheme.typography.bodySmall) }
                    if (primary == ConsultationPrimary.ResumeUnsigned(c.id)) PrimaryButton(stringResource(R.string.clin_reanudar), { model.clearMessages(); model.resume(c) }, enabled = !state.saving)
                    else SecondaryButton(stringResource(R.string.clin_reanudar), { model.clearMessages(); model.resume(c) }, enabled = !state.saving)
                }
            }
        }
        if (state.reschedules.isNotEmpty()) {
            item { Text(stringResource(R.string.clin_reprog_titulo), style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(top = Spacing.sm)) }
            items(state.reschedules, key = { "rp-${it.id}" }) { a ->
                SectionCard(a.patientName.ifBlank { stringResource(R.string.clin_consulta_sin_nombre) }) {
                    Text(stringResource(R.string.clin_reprog_detalle, formatDateTime(a.start), a.pendingReschedule?.let { formatDateTime(it.start) }.orEmpty()), style = MaterialTheme.typography.bodySmall)
                    val decisions = listOf(sv.edu.catolica.climesa.domain.AppointmentAction.ACCEPT_RESCHEDULE, sv.edu.catolica.climesa.domain.AppointmentAction.REJECT_RESCHEDULE)
                    AppointmentActionButtons(decisions.filter { it in a.allowedActions }, decisions.filter { it !in a.allowedActions }.mapNotNull { d -> a.blockedActions[d]?.let { d to it } }) { actions.open(a, it) }
                }
            }
        }
        when {
            state.loading && state.appointments.isEmpty() -> item { LoadingState() }
            state.error != null && state.appointments.isEmpty() -> item { ErrorState(state.error, retry) }
            state.appointments.isEmpty() -> item { EmptyState(stringResource(R.string.clin_consulta_sin_citas), detail = stringResource(R.string.clin_consulta_sin_citas_detalle)) }
            else -> {
                if (state.loading) item { RefreshHint() }
                state.error?.let { error -> item { NoticeBanner(NoticeKind.ERROR, error) } }
                items(state.appointments, key = { it.appointmentId }) { item -> MedicalAppointmentCard(item, onOpen = { model.clearMessages(); selected = item.appointmentId }) }
            }
        }
        if (state.queue.isNotEmpty()) {
            item { Text(stringResource(R.string.clin_fila_titulo), style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(top = Spacing.sm)) }
            items(state.queue, key = { "fila-${it.ticketId}" }) { ticket -> QueueConsultationCard(ticket, opening = state.opening, primary = primary == ConsultationPrimary.ResumeTicket(ticket.ticketId) || primary == ConsultationPrimary.StartTicket(ticket.ticketId), onAttend = { model.attend(ticket) }) }
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
    )
}

@Composable
private fun QueueConsultationCard(ticket: QueueConsultation, opening: String?, primary: Boolean, onAttend: () -> Unit) {
    SectionCard(stringResource(R.string.clin_fila_numero, ticket.number), action = { OperacionStatusTag(ticket.state) }) {
        Text(ticket.patientName, style = MaterialTheme.typography.bodyLarge)
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
private fun ConsultationDialog(item: MedicalAppointment, profile: AccessProfile?, busy: Boolean, error: String?, labCatalog: List<LabExam>, labCatalogLoading: Boolean, model: ConsultationViewModel, onClose: () -> Unit) {
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
    var diagnosisNote by rememberSaveable(item.key) { mutableStateOf(text("diagnosisNote", "")) }
    var diagnosisPrincipal by rememberSaveable(item.key) { mutableStateOf(DraftRules.flag(stored, "diagnosisPrincipal", false)) }
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
    val values = mapOf<String, Any>("reason" to reason, "physicalExam" to physicalExam, "plan" to plan, "systolic" to systolic, "diastolic" to diastolic, "heartRate" to heartRate, "temperature" to temperature, "oxygenSaturation" to oxygenSaturation, "diagnosisCode" to diagnosisCode, "diagnosisNote" to diagnosisNote, "diagnosisPrincipal" to diagnosisPrincipal, "medication" to medication, "dose" to dose, "route" to route, "frequency" to frequency, "duration" to duration, "instructions" to instructions, "labExams" to labExams, "labUrgent" to labUrgent)
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
    CloseWhenDone(busy, signSent) { confirmSign = false }
    // Signing is clinical and irreversible: confirm with what happens. The notes are saved first, then signed; `busy`
    // spans both writes so the button cannot send twice.
    if (confirmSign) ConfirmDialog(
        title = stringResource(R.string.consulta_firmar_titulo), confirmLabel = stringResource(R.string.consulta_firmar), busy = busy,
        message = stringResource(R.string.consulta_firmar_detalle), dismissLabel = stringResource(R.string.borrador_seguir),
        onConfirm = { signSent.value = true; model.sign(item, reason, physicalExam, plan, onClose) }, onDismiss = { confirmSign = false },
    )
    if (confirmLeave) ConfirmDialog(title = stringResource(R.string.borrador_salir_titulo), confirmLabel = stringResource(R.string.borrador_salir), onConfirm = { confirmLeave = false; onClose() }, onDismiss = { confirmLeave = false }, message = stringResource(R.string.borrador_salir_mensaje), dismissLabel = stringResource(R.string.borrador_seguir), destructive = true)
    AlertDialog(onDismissRequest = { if (!busy) leave() }, shape = MaterialTheme.shapes.large, title = { Text(stringResource(if (signed) R.string.consulta_t_firmada else if (item.consultationId == null) R.string.consulta_t_iniciar else R.string.consulta_t_continuar), style = MaterialTheme.typography.titleLarge) }, text = { Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(Spacing.sm + Spacing.xs)) {
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
        // S9: consultation → procedures → prescription and/or exams → close, in that order.
        Text(stringResource(R.string.consulta_pasos), style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(stringResource(R.string.consulta_paso1), style = MaterialTheme.typography.titleSmall)
        FormField(stringResource(R.string.consulta_motivo), reason, { reason = it.take(2000) }, enabled = !signed, singleLine = false)
        FormField(stringResource(R.string.consulta_examen), physicalExam, { physicalExam = it.take(10000) }, enabled = !signed, singleLine = false)
        if (item.consultationId != null && "signos.registrar" in permissions) {
            Text(stringResource(R.string.clin_consulta_signos), style = MaterialTheme.typography.titleSmall)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) { FormField(stringResource(R.string.consulta_pa_sis), systolic, { systolic = it }, Modifier.weight(1f)); FormField(stringResource(R.string.consulta_pa_dia), diastolic, { diastolic = it }, Modifier.weight(1f)) }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) { FormField(stringResource(R.string.consulta_fc), heartRate, { heartRate = it }, Modifier.weight(1f)); FormField(stringResource(R.string.consulta_temp), temperature, { temperature = it }, Modifier.weight(1f)); FormField(stringResource(R.string.consulta_sat), oxygenSaturation, { oxygenSaturation = it }, Modifier.weight(1f)) }
            SecondaryButton(stringResource(R.string.consulta_registrar_signos), { model.signs(item, systolic, diastolic, heartRate, temperature, oxygenSaturation) }, enabled = !busy && listOf(systolic, diastolic, heartRate, temperature, oxygenSaturation).any { it.isNotBlank() })
        }
        if (item.consultationId != null && !signed && "consulta.registrar" in permissions) {
            Text(stringResource(R.string.clin_consulta_diagnostico), style = MaterialTheme.typography.titleSmall)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) { FormField(stringResource(R.string.consulta_codigo), diagnosisCode, { diagnosisCode = it.take(20) }, Modifier.weight(1f)); FormField(stringResource(R.string.consulta_nota), diagnosisNote, { diagnosisNote = it.take(2000) }, Modifier.weight(2f)) }
            Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) { androidx.compose.material3.Checkbox(diagnosisPrincipal, { diagnosisPrincipal = it }); Text(stringResource(R.string.consulta_principal)) }
            SecondaryButton(stringResource(R.string.consulta_registrar_diagnostico), { model.diagnosis(item, diagnosisCode, diagnosisNote, diagnosisPrincipal) { diagnosisCode = ""; diagnosisNote = ""; diagnosisPrincipal = false } }, enabled = !busy && diagnosisCode.trim().isNotBlank())
        }
        Text(stringResource(R.string.consulta_paso2), style = MaterialTheme.typography.titleSmall)
        FormField(stringResource(R.string.consulta_plan), plan, { plan = it.take(5000) }, enabled = !signed, singleLine = false)
        if (item.consultationId != null) Text(stringResource(R.string.consulta_paso3), style = MaterialTheme.typography.titleSmall)
        if (item.consultationId != null && !signed && "recetas.emitir" in permissions) {
            Text(stringResource(R.string.clin_consulta_receta), style = MaterialTheme.typography.titleSmall)
            FormField(stringResource(R.string.consulta_medicamento), medication, { medication = it.take(200) })
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) { FormField(stringResource(R.string.consulta_dosis), dose, { dose = it.take(200) }, Modifier.weight(1f)); FormField(stringResource(R.string.consulta_via), route, { route = it.take(100) }, Modifier.weight(1f)) }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) { FormField(stringResource(R.string.consulta_frecuencia), frequency, { frequency = it.take(200) }, Modifier.weight(1f)); FormField(stringResource(R.string.consulta_duracion), duration, { duration = it.take(100) }, Modifier.weight(1f)) }
            FormField(stringResource(R.string.consulta_indicaciones), instructions, { instructions = it.take(1000) }, singleLine = false)
            SecondaryButton(stringResource(R.string.consulta_emitir_receta), { model.prescription(item, medication, dose, route, frequency, duration, instructions) { medication = ""; dose = ""; route = ""; frequency = ""; duration = ""; instructions = "" } }, enabled = !busy && listOf(medication, dose, route, frequency, duration).all { it.trim().isNotBlank() })
        }
        AdmissionIndicationEntry(item, profile, enabled = !busy)
        if (item.consultationId != null && "laboratorio.ordenar" in permissions) {
            LaunchedEffect(item.consultationId) { model.loadLabCatalog() }
            val chosen = labExams.split(',').filter { it.isNotBlank() }.toSet()
            Text(stringResource(R.string.lab_orden_titulo), style = MaterialTheme.typography.titleSmall)
            if (labCatalog.isEmpty()) Text(stringResource(if (labCatalogLoading) R.string.lab_orden_cargando else R.string.lab_orden_sin_catalogo), style = MaterialTheme.typography.bodySmall)
            val panelLabel = stringResource(R.string.lab_orden_panel)
            labCatalog.forEach { exam -> Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) { androidx.compose.material3.Checkbox(exam.id in chosen, { checked -> labExams = (if (checked) chosen + exam.id else chosen - exam.id).joinToString(",") }, enabled = !busy); Text(if (exam.isPanel) "${exam.code} · ${exam.name} · $panelLabel" else "${exam.code} · ${exam.name}", style = MaterialTheme.typography.bodySmall) } }
            Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) { androidx.compose.material3.Checkbox(labUrgent, { labUrgent = it }, enabled = !busy); Text(stringResource(R.string.lab_orden_urgente)) }
            SecondaryButton(stringResource(R.string.lab_orden_emitir), { model.orderLab(item, chosen, labUrgent) { labExams = ""; labUrgent = false } }, enabled = !busy && chosen.isNotEmpty())
        }
        if (item.consultationId != null && !signed) {
            Text(stringResource(R.string.consulta_paso4), style = MaterialTheme.typography.titleSmall)
            Text(stringResource(R.string.consulta_paso4_detalle), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    } }, confirmButton = {
        // One primary: "Iniciar consulta" before it exists, then "Firmar". Saving the draft is secondary.
        if (!signed && item.consultationId == null && item.canStart) androidx.compose.material3.Button(onClick = { model.start(item, reason) }, enabled = !busy && reason.trim().isNotBlank()) {
            Text(stringResource(if (busy) R.string.ui_un_momento else R.string.consulta_t_iniciar), style = MaterialTheme.typography.labelLarge)
        } else if (!signed && item.consultationId != null) androidx.compose.material3.Button(onClick = { confirmSign = true }, enabled = !busy && reason.trim().isNotBlank() && plan.trim().isNotBlank()) {
            Text(stringResource(if (busy) R.string.ui_un_momento else R.string.consulta_firmar), style = MaterialTheme.typography.labelLarge)
        }
    }, dismissButton = { Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        if (!signed && item.consultationId != null) TextButton(onClick = { model.save(item, reason, physicalExam, plan) }, enabled = !busy && reason.trim().isNotBlank()) { Text(stringResource(R.string.consulta_guardar_borrador), style = MaterialTheme.typography.labelLarge) }
        TextButton(onClick = leave, enabled = !busy) { Text(stringResource(R.string.consulta_cerrar), style = MaterialTheme.typography.labelLarge) }
    } })
}

private fun appointmentState(value: String) = StatusCatalog.label(value)
private fun formatDateTime(value: String) = runCatching { appointmentFormatter.format(Instant.parse(value).atZone(sanSalvador)) }.getOrDefault(value)
private fun formatTime(value: String) = runCatching { DateTimeFormatter.ofPattern("HH:mm").format(Instant.parse(value).atZone(sanSalvador)) }.getOrDefault(value)

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
        if (handoff.rule.isNotBlank()) Text(stringResource(R.string.fila_regla, handoff.rule), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        if (proposal != null && canCall) PrimaryButton(stringResource(R.string.consulta_llamar_a, proposal.code), onCall, enabled = !busy)
        SecondaryButton(stringResource(R.string.consulta_ahora_no), onDismiss, enabled = !busy)
    }
}
