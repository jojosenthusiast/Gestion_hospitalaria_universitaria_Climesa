@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
package sv.edu.catolica.climesa.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import sv.edu.catolica.climesa.R
import sv.edu.catolica.climesa.domain.AppointmentAction
import sv.edu.catolica.climesa.domain.AppointmentActions
import sv.edu.catolica.climesa.domain.PickerPatient
import sv.edu.catolica.climesa.domain.QuickAction
import sv.edu.catolica.climesa.domain.ReceptionAppointment
import sv.edu.catolica.climesa.domain.SchedulingDoctor
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

private val dayFormat = DateTimeFormatter.ofPattern("dd/MM/yyyy")
private val dateTimeFormat = DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm")
private val zone = ZoneId.of("America/El_Salvador")

/** A32 Citas de Recepción: lista de citas y flujo para agendar con búsqueda de paciente, médicos con/sin turno y franjas del día. */
@Composable
fun ReceptionAppointmentsScreen(channels: List<String>, canSchedule: Boolean, modifier: Modifier = Modifier, quickAction: QuickAction? = null, onQuickActionHandled: () -> Unit = {}, permissions: Collection<String> = emptyList(), model: ReceptionAppointmentsViewModel = viewModel(), actions: AppointmentActionViewModel = viewModel(), requests: CategoryRequestsViewModel = viewModel(), followUps: LabProposalsViewModel = viewModel()) {
    val state by model.state.collectAsStateWithLifecycle()
    val requestState by requests.state.collectAsStateWithLifecycle()
    val followUpState by followUps.state.collectAsStateWithLifecycle()
    // C1: a confirmed follow-up is a new appointment, so the list reloads with it.
    LaunchedEffect(followUpState.notice) { if (followUpState.notice != null) model.load() }
    // Fase 2, flow A: an assigned category request becomes a confirmed appointment, so the list reloads with it.
    LaunchedEffect(requestState.notice) { if (requestState.notice != null) model.load() }
    val actionState by actions.state.collectAsStateWithLifecycle()
    LaunchedEffect(actionState.done) { if (actionState.done != null) model.load() }
    AppointmentActionDialog(actionState, actions)
    var query by rememberSaveable { mutableStateOf("") }
    LaunchedEffect(Unit) { model.load(); model.startLive(channels); if (canSchedule) { requests.load(); requests.startLive(channels); followUps.load(); followUps.startLive(channels) } }
    LaunchedEffect(quickAction) {
        if (quickAction == null) return@LaunchedEffect
        if (quickAction == QuickAction.SCHEDULE_APPOINTMENT && canSchedule) model.openScheduling()
        if (quickAction == QuickAction.REVIEW_REQUESTS) model.showRequests(true)
        onQuickActionHandled()
    }
    if (state.scheduling) { SchedulingForm(state, model, modifier); return }
    PageList(modifier) {
        item { SectionIntro(stringResource(R.string.rec_citas_eyebrow), stringResource(R.string.rec_citas_titulo), stringResource(R.string.rec_citas_detalle)) }
        state.error?.let { error -> item { ClimesaActionGroup { NoticeBanner(NoticeKind.ERROR, error); SecondaryButton("Reintentar", { model.clearMessages(); model.load() }, icon = Icons.Default.Refresh) } } }
        (actionState.done ?: state.notice)?.let { notice -> item { NoticeBanner(NoticeKind.SUCCESS, notice) } }
        if (canSchedule) item { PrimaryButton(stringResource(R.string.rec_citas_agendar), { model.clearMessages(); model.openScheduling() }, icon = Icons.Default.Add) }
        if (canSchedule) {
            requestState.error?.let { error -> item { NoticeBanner(NoticeKind.ERROR, error) } }
            requestState.notice?.let { notice -> item { NoticeBanner(NoticeKind.SUCCESS, notice) } }
            item { CategoryRequestInbox(requestState, requests) }
            item { LabProposalInbox(followUpState, followUps) }
        }
        when {
            state.loading && state.appointments.isEmpty() -> item { LoadingState() }
            state.appointments.isEmpty() -> item { EmptyState(stringResource(R.string.rec_citas_vacio), detail = stringResource(R.string.rec_citas_vacio_detalle), icon = Icons.Default.CalendarMonth) }
            else -> {
                val visible = state.shown.filter { sv.edu.catolica.climesa.domain.matchesQuery(query, it.patientName, it.doctorName) }
                item { LiveSearchField(query, { query = it }, stringResource(R.string.rec_citas_buscar)) }
                item { ChipRow(listOf(Triple(false, stringResource(R.string.cita_todas), state.appointments.size), Triple(true, stringResource(R.string.cita_solo_solicitudes), state.appointments.count { it.isRequest })), state.requestsOnly, model::showRequests) }
                if (visible.isEmpty()) item { EmptyState(stringResource(R.string.listas_sin_coincidencias), detail = stringResource(R.string.listas_sin_coincidencias_detalle)) }
                // Por día y, dentro del día, por hora: cada cita en una sola línea con su rango "08:00 – 08:20".
                sv.edu.catolica.climesa.domain.AppointmentAgenda.groupByDay(visible) { it.start }.forEach { (day, rows) ->
                    item(key = "d-$day") { Text(sv.edu.catolica.climesa.domain.AppointmentAgenda.dayLabel(day), style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(top = Spacing.sm)) }
                    items(rows, key = { it.id }) { row -> AppointmentRow(row) { action -> actions.open(row, action) } }
                }
            }
        }
    }
}

/** One appointment: its state, a pending reschedule request, and one button per action the API accepts now (CITA-04). */
@Composable private fun AppointmentRow(a: ReceptionAppointment, onAction: (AppointmentAction) -> Unit) {
    Column {
        DataRow(a.patientName.ifBlank { "Paciente" }, subtitle = "${sv.edu.catolica.climesa.domain.AppointmentAgenda.timeRange(a.start, a.end)} · ${a.doctorName}",
            status = { AppointmentStateTag(a.state) })
        a.pendingReschedule?.let { Text(stringResource(R.string.cita_pide_cambiar, formatShort(it.start)), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary) }
        if (a.state == AppointmentActions.EXPIRED) Text(stringResource(R.string.cita_vencida_detalle), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        if (a.state == AppointmentActions.RESCHEDULED) Text(stringResource(R.string.cita_reprogramada_a), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        AppointmentActionButtons(AppointmentActions.available(a), AppointmentActions.blocked(a), onAction)
    }
}

/** Every appointment state, `vencida` (closed) and `reprogramada` (called) included, uses the shared table like the web. */
@Composable internal fun AppointmentStateTag(state: String) = StatusTag(state)

/** Allowed actions as buttons, two per line; blocked ones disabled with the server's reason under them. */
@Composable internal fun AppointmentActionButtons(allowed: List<AppointmentAction>, blocked: List<Pair<AppointmentAction, String>>, onAction: (AppointmentAction) -> Unit) {
    val buttons = allowed.map { it to null as String? } + blocked.map { (a, r) -> a to r }
    buttons.chunked(2).forEach { pair ->
        Row(Modifier.fillMaxWidth().padding(bottom = Spacing.sm), horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
            pair.forEach { (action, reason) ->
                Column(Modifier.weight(1f)) {
                    val positive = action == AppointmentAction.CONFIRM || action == AppointmentAction.ACCEPT_RESCHEDULE
                    if (positive) androidx.compose.material3.Button(onClick = { onAction(action) }, enabled = reason == null, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text(action.label) }
                    else OutlinedButton(onClick = { onAction(action) }, enabled = reason == null, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
                        colors = if (action.needsReason || action == AppointmentAction.CANCEL) androidx.compose.material3.ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.error) else androidx.compose.material3.ButtonDefaults.outlinedButtonColors()) { Text(action.label) }
                    reason?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                }
            }
            if (pair.size == 1) Spacer(Modifier.weight(1f))
        }
    }
}

/** Dialog of one appointment command: reason with live counter, or the slot grid of the same doctor for a reschedule. */
@Composable
internal fun AppointmentActionDialog(state: AppointmentActionState, model: AppointmentActionViewModel) {
    val target = state.target ?: return
    val action = state.action ?: return
    var datePicker by rememberSaveable { mutableStateOf(false) }
    val title = when (action) {
        AppointmentAction.CONFIRM -> stringResource(R.string.rec_cita_confirmar_titulo)
        AppointmentAction.REJECT -> stringResource(R.string.rec_cita_rechazar_titulo)
        AppointmentAction.CANCEL -> stringResource(R.string.rec_cita_cancelar_titulo)
        AppointmentAction.RESCHEDULE -> stringResource(R.string.cita_reprogramar_titulo)
        AppointmentAction.NO_SHOW -> stringResource(R.string.cita_no_asistio_titulo)
        AppointmentAction.ACCEPT_RESCHEDULE -> stringResource(R.string.cita_aceptar_reprog_titulo)
        AppointmentAction.REJECT_RESCHEDULE -> stringResource(R.string.cita_rechazar_reprog_titulo)
        AppointmentAction.START_CONSULTATION -> action.label
    }
    val requested = target.reschedule?.takeIf { action == AppointmentAction.ACCEPT_RESCHEDULE || action == AppointmentAction.REJECT_RESCHEDULE }
    ConfirmDialog(
        title = title,
        confirmLabel = action.label,
        onConfirm = model::submit,
        onDismiss = model::close,
        message = "${target.patientName.ifBlank { "Paciente" }} · ${formatInstant(target.start)} · ${target.doctorName}" + (requested?.let { " → " + formatInstant(it.start) } ?: ""),
        dismissLabel = stringResource(R.string.rec_cita_volver),
        destructive = action.needsReason || action == AppointmentAction.CANCEL || action == AppointmentAction.NO_SHOW,
        busy = state.busy,
        confirmEnabled = state.canSubmit,
    ) {
        state.error?.let { NoticeBanner(NoticeKind.ERROR, it) }
        if (action == AppointmentAction.RESCHEDULE) {
            OutlinedButton(onClick = { datePicker = true }, enabled = !state.busy, modifier = Modifier.fillMaxWidth()) { androidx.compose.material3.Icon(Icons.Default.CalendarMonth, null); Spacer(Modifier.padding(4.dp)); Text(stringResource(R.string.cita_fecha, state.date.format(dayFormat))) }
            when {
                state.loadingSlots -> LoadingState()
                state.slots.isEmpty() -> Text(stringResource(R.string.cita_sin_franjas), style = MaterialTheme.typography.bodySmall)
                else -> { Text(stringResource(R.string.cita_elige_franja), style = MaterialTheme.typography.bodySmall); DaySlotGrid(state.slots, state.slot, model::pickSlot) }
            }
        }
        if (action.needsReason) {
            FormField(stringResource(R.string.rec_cita_motivo), state.reason, model::reason, singleLine = false, enabled = !state.busy, error = state.reasonError, hint = AppointmentActions.counter(state.reason))
        } else if (action == AppointmentAction.NO_SHOW) {
            FormField(stringResource(R.string.cita_comentario), state.reason, model::reason, singleLine = false, enabled = !state.busy, error = state.reasonError, hint = AppointmentActions.counter(state.reason, required = false))
        }
    }
    if (datePicker) {
        val picker = rememberDatePickerState(initialSelectedDateMillis = state.date.atStartOfDay(zone).toInstant().toEpochMilli())
        DatePickerDialog(onDismissRequest = { datePicker = false },
            confirmButton = { TextButton(onClick = { picker.selectedDateMillis?.let { model.selectDate(Instant.ofEpochMilli(it).atZone(java.time.ZoneOffset.UTC).toLocalDate()) }; datePicker = false }) { Text("Aceptar") } },
            dismissButton = { TextButton(onClick = { datePicker = false }) { Text(stringResource(R.string.ui_cancelar)) } }) { DatePicker(state = picker) }
    }
}

@Composable
private fun SchedulingForm(state: ReceptionAppointmentsState, model: ReceptionAppointmentsViewModel, modifier: Modifier) {
    var datePicker by rememberSaveable { mutableStateOf(false) }
    PageList(modifier) {
        item { SectionIntro(stringResource(R.string.rec_citas_eyebrow), stringResource(R.string.rec_citas_agendar), stringResource(R.string.rec_citas_detalle)) }
        state.error?.let { item { NoticeBanner(NoticeKind.ERROR, it) } }
        item { PatientPicker(state, model) }
        item { OutlinedButton(onClick = { datePicker = true }, modifier = Modifier.fillMaxWidth()) { androidx.compose.material3.Icon(Icons.Default.CalendarMonth, null); Spacer(Modifier.padding(4.dp)); Text(stringResource(R.string.rec_agendar_fecha, state.date.format(dayFormat))) } }
        item { DoctorPicker(state, model) }
        item { SlotSection(state, model) }
        item { FormField(stringResource(R.string.rec_agendar_motivo), state.reason, model::reason, singleLine = false) }
        item { PrimaryButton(stringResource(R.string.rec_agendar_confirmar), model::confirm, icon = Icons.Default.Check, enabled = state.canConfirm, loading = state.saving) }
        item { SecondaryButton(stringResource(R.string.ui_cancelar), model::closeScheduling, icon = Icons.Default.Close, enabled = !state.saving) }
    }
    if (datePicker) {
        val picker = rememberDatePickerState(initialSelectedDateMillis = state.date.atStartOfDay(zone).toInstant().toEpochMilli())
        DatePickerDialog(onDismissRequest = { datePicker = false },
            confirmButton = { TextButton(onClick = { picker.selectedDateMillis?.let { model.selectDate(Instant.ofEpochMilli(it).atZone(zone).toLocalDate()) }; datePicker = false }) { Text("Aceptar") } },
            dismissButton = { TextButton(onClick = { datePicker = false }) { Text(stringResource(R.string.ui_cancelar)) } }) { DatePicker(state = picker) }
    }
}

/** Búsqueda con espera entre teclas; muestra todas las coincidencias (paginadas) y deja elegir una. */
@Composable
private fun PatientPicker(state: ReceptionAppointmentsState, model: ReceptionAppointmentsViewModel) {
    SectionCard(stringResource(R.string.rec_agendar_paciente)) {
        PatientSearchPicker(state.query, state.results, state.searching, state.hasMore, state.patient, model::query, model::pickPatient, model::moreResults)
    }
}

/** Médicos del día: los que no tienen turno salen apagados y con su motivo, y no se pueden elegir. */
@Composable
private fun DoctorPicker(state: ReceptionAppointmentsState, model: ReceptionAppointmentsViewModel) {
    SectionCard(stringResource(R.string.rec_agendar_medico)) {
        Text(stringResource(R.string.rec_agendar_medico_ayuda), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        state.doctors.forEach { d -> DoctorRow(d, selected = state.doctor?.id == d.id) { model.pickDoctor(d) } }
    }
}
@Composable private fun DoctorRow(d: SchedulingDoctor, selected: Boolean, pick: () -> Unit) {
    val colors = MaterialTheme.climesa
    TextButton(onClick = pick, enabled = d.hasShift, modifier = Modifier.fillMaxWidth()) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Column(Modifier.weight(1f)) {
                Text(d.name, style = MaterialTheme.typography.titleSmall)
                Text(d.detail, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            if (!d.hasShift) FamilyBadge(d.reason ?: stringResource(R.string.rec_agendar_sin_turno), StatusFamily.CERRADO)
            else if (selected) FamilyBadge(stringResource(R.string.rec_leyenda_libre), StatusFamily.LISTO)
        }
    }
    HorizontalDivider(color = colors.line)
}

@Composable
private fun SlotSection(state: ReceptionAppointmentsState, model: ReceptionAppointmentsViewModel) {
    SectionCard(stringResource(R.string.rec_agendar_horario)) {
        when {
            state.doctor == null -> Text(stringResource(R.string.rec_agendar_elige_medico), style = MaterialTheme.typography.bodySmall)
            state.loadingSlots -> LoadingState()
            state.slots.isEmpty() -> Text(stringResource(R.string.rec_agendar_sin_franjas), style = MaterialTheme.typography.bodySmall)
            else -> {
                DaySlotGrid(state.slots, state.slot, model::pickSlot)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    FamilyBadge(stringResource(R.string.rec_leyenda_libre), StatusFamily.LISTO); FamilyBadge(stringResource(R.string.rec_leyenda_ocupado), null)
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    FamilyBadge(stringResource(R.string.rec_leyenda_sin_turno), StatusFamily.CERRADO); FamilyBadge(stringResource(R.string.rec_leyenda_pasado), null)
                }
                if (state.slots.none { it.selectable }) NoticeBanner(NoticeKind.INFO, stringResource(R.string.rec_agendar_sin_libres))
            }
        }
    }
}

private val shortFormat = DateTimeFormatter.ofPattern("dd/MM HH:mm")
internal fun formatShort(value: String) = runCatching { shortFormat.format(Instant.parse(value).atZone(zone)) }.getOrDefault(value)
private fun formatInstant(value: String) = runCatching { dateTimeFormat.format(Instant.parse(value).atZone(zone)) }.getOrDefault(value)
