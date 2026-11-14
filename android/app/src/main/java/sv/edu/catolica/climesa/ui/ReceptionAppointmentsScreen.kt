@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
package sv.edu.catolica.climesa.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
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
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import sv.edu.catolica.climesa.R
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
fun ReceptionAppointmentsScreen(channels: List<String>, canSchedule: Boolean, modifier: Modifier = Modifier, quickAction: QuickAction? = null, onQuickActionHandled: () -> Unit = {}, model: ReceptionAppointmentsViewModel = viewModel()) {
    val state by model.state.collectAsStateWithLifecycle()
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
        state.notice?.let { notice -> item { NoticeBanner(NoticeKind.SUCCESS, notice) } }
        if (canSchedule) item { PrimaryButton(stringResource(R.string.rec_citas_agendar), { model.clearMessages(); model.openScheduling() }, icon = Icons.Default.Add) }
        when {
            state.loading && state.appointments.isEmpty() -> item { LoadingState() }
            state.appointments.isEmpty() -> item { EmptyState(stringResource(R.string.rec_citas_vacio), detail = stringResource(R.string.rec_citas_vacio_detalle), icon = Icons.Default.CalendarMonth) }
            else -> items(state.appointments, key = { it.id }) { AppointmentRow(it) }
        }
    }
}

@Composable private fun AppointmentRow(a: ReceptionAppointment) {
    DataRow(a.patientName.ifBlank { "Paciente" }, subtitle = "${a.doctorName} · ${formatInstant(a.start)}", status = { StatusTag(a.state) })
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
