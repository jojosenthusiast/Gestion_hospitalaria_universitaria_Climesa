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
fun ReceptionAppointmentsScreen(channels: List<String>, canSchedule: Boolean, modifier: Modifier = Modifier, quickAction: QuickAction? = null, onQuickActionHandled: () -> Unit = {}, permissions: Collection<String> = emptyList(), model: ReceptionAppointmentsViewModel = viewModel(), actions: AppointmentActionViewModel = viewModel()) {
    val state by model.state.collectAsStateWithLifecycle()
    val actionState by actions.state.collectAsStateWithLifecycle()
    LaunchedEffect(actionState.done) { if (actionState.done != null) model.load() }
    AppointmentActionDialog(actionState, actions)
    val now = remember(state.appointments) { Instant.now() }
    var query by rememberSaveable { mutableStateOf("") }
    LaunchedEffect(Unit) { model.load(); model.startLive(channels) }
    LaunchedEffect(quickAction) {
        if (quickAction == null) return@LaunchedEffect
        if (quickAction == QuickAction.SCHEDULE_APPOINTMENT && canSchedule) model.openScheduling()
        onQuickActionHandled()
    }
    if (state.scheduling) { SchedulingForm(state, model, modifier); return }
    PageList(modifier) {
        item { SectionIntro(stringResource(R.string.rec_citas_eyebrow), stringResource(R.string.rec_citas_titulo), stringResource(R.string.rec_citas_detalle)) }
        state.error?.let { error -> item { ClimesaActionGroup { NoticeBanner(NoticeKind.ERROR, error); SecondaryButton("Reintentar", { model.clearMessages(); model.load() }, icon = Icons.Default.Refresh) } } }
        (actionState.done ?: state.notice)?.let { notice -> item { NoticeBanner(NoticeKind.SUCCESS, notice) } }
        if (canSchedule) item { PrimaryButton(stringResource(R.string.rec_citas_agendar), { model.clearMessages(); model.openScheduling() }, icon = Icons.Default.Add) }
        when {
            state.loading && state.appointments.isEmpty() -> item { LoadingState() }
            state.appointments.isEmpty() -> item { EmptyState(stringResource(R.string.rec_citas_vacio), detail = stringResource(R.string.rec_citas_vacio_detalle), icon = Icons.Default.CalendarMonth) }
            else -> {
                val visible = state.appointments.filter { sv.edu.catolica.climesa.domain.matchesQuery(query, it.patientName, it.doctorName) }
                item { LiveSearchField(query, { query = it }, stringResource(R.string.rec_citas_buscar)) }
                if (visible.isEmpty()) item { EmptyState(stringResource(R.string.listas_sin_coincidencias), detail = stringResource(R.string.listas_sin_coincidencias_detalle)) }
                // Por día y, dentro del día, por hora: cada cita en una sola línea con su rango "08:00 – 08:20".
                sv.edu.catolica.climesa.domain.AppointmentAgenda.groupByDay(visible) { it.start }.forEach { (day, rows) ->
                    item(key = "d-$day") { Text(sv.edu.catolica.climesa.domain.AppointmentAgenda.dayLabel(day), style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(top = Spacing.sm)) }
                    items(rows, key = { it.id }) { row -> AppointmentRow(row, now, permissions) { action -> actions.open(row, action) } }
                }
            }
        }
    }
}

/** One appointment: its state (an unmanaged past request reads "Vencida") and only the actions the API accepts now (CITA-04). */
@Composable private fun AppointmentRow(a: ReceptionAppointment, now: Instant, permissions: Collection<String>, onAction: (AppointmentAction) -> Unit) {
    val shown = AppointmentActions.displayState(a, now)
    Column {
        DataRow(a.patientName.ifBlank { "Paciente" }, subtitle = "${sv.edu.catolica.climesa.domain.AppointmentAgenda.timeRange(a.start, a.end)} · ${a.doctorName}",
            status = { if (shown == AppointmentActions.EXPIRED) StatusPill(stringResource(R.string.rec_cita_vencida), StatusTone.NEUTRAL) else StatusTag(a.state) })
        val available = AppointmentActions.available(a, permissions, now)
        if (available.isNotEmpty()) Row(Modifier.fillMaxWidth().padding(bottom = Spacing.sm), horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
            available.forEach { action ->
                if (action == AppointmentAction.CONFIRM) androidx.compose.material3.Button(onClick = { onAction(action) }, modifier = Modifier.weight(1f).heightIn(min = 48.dp)) { Text(action.label) }
                else OutlinedButton(onClick = { onAction(action) }, modifier = Modifier.weight(1f).heightIn(min = 48.dp), colors = androidx.compose.material3.ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.error)) { Text(action.label) }
            }
        }
    }
}

@Composable
private fun AppointmentActionDialog(state: AppointmentActionState, model: AppointmentActionViewModel) {
    val target = state.target ?: return
    val action = state.action ?: return
    val title = when (action) {
        AppointmentAction.CONFIRM -> stringResource(R.string.rec_cita_confirmar_titulo)
        AppointmentAction.REJECT -> stringResource(R.string.rec_cita_rechazar_titulo)
        AppointmentAction.CANCEL -> stringResource(R.string.rec_cita_cancelar_titulo)
    }
    ConfirmDialog(
        title = title,
        confirmLabel = action.label,
        onConfirm = model::submit,
        onDismiss = model::close,
        message = "${target.patientName.ifBlank { "Paciente" }} · ${formatInstant(target.start)} · ${target.doctorName}",
        dismissLabel = stringResource(R.string.rec_cita_volver),
        destructive = action != AppointmentAction.CONFIRM,
        busy = state.busy,
    ) {
        state.error?.let { NoticeBanner(NoticeKind.ERROR, it) }
        if (action.needsReason) {
            val length = state.reason.trim().length
            FormField(stringResource(R.string.rec_cita_motivo), state.reason, model::reason, singleLine = false, enabled = !state.busy, error = state.reasonError,
                hint = "$length/${AppointmentActions.REASON_MAX}" + if (length < AppointmentActions.REASON_MIN) " · " + stringResource(R.string.rec_cita_motivo_minimo, AppointmentActions.REASON_MIN) else " ✓")
        }
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
        val chosen = state.patient
        if (chosen != null) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Column(Modifier.weight(1f)) { Text(chosen.name, style = MaterialTheme.typography.titleMedium); Text(chosen.detail, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                TextButton(onClick = { model.pickPatient(null) }) { Text(stringResource(R.string.rec_agendar_cambiar)) }
            }
        } else {
            FormField(stringResource(R.string.rec_agendar_buscar), state.query, model::query, hint = stringResource(R.string.rec_agendar_buscar_ayuda))
            if (state.searching && state.results.isEmpty()) LoadingState()
            state.results.forEach { p -> PatientResult(p) { model.pickPatient(p) } }
            if (state.hasMore) TextButton(onClick = model::moreResults, enabled = !state.searching) { Text(stringResource(R.string.rec_agendar_mas)) }
            if (!state.searching && state.results.isEmpty() && sv.edu.catolica.climesa.domain.ReceptionScheduling.canSearch(state.query)) Text(stringResource(R.string.rec_agendar_sin_resultados), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}
@Composable private fun PatientResult(p: PickerPatient, pick: () -> Unit) {
    TextButton(onClick = pick, modifier = Modifier.fillMaxWidth()) { Column(Modifier.fillMaxWidth()) { Text(p.name, style = MaterialTheme.typography.titleSmall); Text(p.detail, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) } }
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
            if (!d.hasShift) StatusPill(d.reason ?: stringResource(R.string.rec_agendar_sin_turno), StatusTone.BLOCKED)
            else if (selected) StatusPill(stringResource(R.string.rec_leyenda_libre), StatusTone.SUCCESS)
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
                    StatusPill(stringResource(R.string.rec_leyenda_libre), StatusTone.SUCCESS); StatusPill(stringResource(R.string.rec_leyenda_ocupado), StatusTone.NEUTRAL)
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    StatusPill(stringResource(R.string.rec_leyenda_sin_turno), StatusTone.BLOCKED); StatusPill(stringResource(R.string.rec_leyenda_pasado), StatusTone.NEUTRAL)
                }
                if (state.slots.none { it.selectable }) NoticeBanner(NoticeKind.INFO, stringResource(R.string.rec_agendar_sin_libres))
            }
        }
    }
}

private fun formatInstant(value: String) = runCatching { dateTimeFormat.format(Instant.parse(value).atZone(zone)) }.getOrDefault(value)
