@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
package sv.edu.catolica.climesa.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import sv.edu.catolica.climesa.R
import sv.edu.catolica.climesa.domain.DaySlot
import sv.edu.catolica.climesa.domain.LabProposal
import sv.edu.catolica.climesa.domain.LabProposalRules
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter


/**
 * C1: «Citas de seguimiento por confirmar» for reception (web `LabFollowUpPanel`): patient, doctor and when the results
 * arrived, never exams or values. Each row schedules with the doctor who asked for the exams or is discarded with a reason.
 */
@Composable
internal fun LabProposalInbox(state: LabProposalsState, model: LabProposalsViewModel) {
    SectionCard(stringResource(R.string.seg_titulo), eyebrow = state.proposals.size.toString()) {
        Text(stringResource(R.string.seg_detalle), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        state.notice?.let { NoticeBanner(NoticeKind.SUCCESS, it) }
        if (state.activeId == null) state.error?.let { NoticeBanner(NoticeKind.ERROR, it) }
        when {
            state.loading && state.proposals.isEmpty() -> LoadingState()
            state.proposals.isEmpty() -> Text(stringResource(R.string.seg_vacio), style = MaterialTheme.typography.bodyMedium)
            else -> state.proposals.forEach { p -> ProposalRow(p, state, model) }
        }
    }
}

@Composable
private fun ProposalRow(p: LabProposal, state: LabProposalsState, model: LabProposalsViewModel) {
    Column {
        DataRow(p.patientName, subtitle = p.detail, status = if (p.urgent) ({ PriorityBadge(Priority.URGENTE) }) else null)
        val active = state.activeId == p.id
        when {
            active && state.mode == ProposalMode.SCHEDULE -> ScheduleForm(p, state, model)
            active && state.mode == ProposalMode.DISCARD -> DiscardForm(p, state, model)
            else -> ClimesaActionGroup {
                // One primary per row group: schedule; discarding is the secondary way out.
                PrimaryButton(stringResource(R.string.seg_agendar), { model.openSchedule(p) }, icon = Icons.Default.CalendarMonth, enabled = !state.busy)
                SecondaryButton(stringResource(R.string.seg_descartar), { model.openDiscard(p) }, icon = Icons.Default.Close, enabled = !state.busy)
            }
        }
    }
}

@Composable
private fun ScheduleForm(p: LabProposal, state: LabProposalsState, model: LabProposalsViewModel) {
    var slot by rememberSaveable(p.id) { mutableStateOf<String?>(null) }
    var picker by rememberSaveable { mutableStateOf(false) }
    val linkPending = state.scheduled[p.id] != null
    val chosen: DaySlot? = state.slots.firstOrNull { it.start == slot && it.selectable }
    state.error?.let { NoticeBanner(NoticeKind.ERROR, it) }
    if (linkPending) NoticeBanner(NoticeKind.INFO, stringResource(R.string.seg_enlace_pendiente))
    else {
        TextButton(onClick = { picker = true }, enabled = !state.busy, modifier = Modifier.fillMaxWidth()) { Text(stringResource(R.string.seg_dia, sv.edu.catolica.climesa.domain.ShortDay.of(state.date, sv.edu.catolica.climesa.domain.ReceptionScheduling.today()))) }
        when {
            state.loadingSlots -> LoadingState()
            state.slots.none { it.selectable } -> Text(stringResource(R.string.seg_sin_horas), style = MaterialTheme.typography.bodySmall)
            else -> DaySlotGrid(state.slots, chosen, { slot = it.start })
        }
    }
    ClimesaActionGroup {
        PrimaryButton(stringResource(if (linkPending) R.string.seg_enlazar else R.string.seg_confirmar), { model.confirm(p, chosen) }, icon = Icons.Default.Check,
            enabled = !state.busy && (linkPending || chosen != null), loading = state.busy)
        SecondaryButton(stringResource(R.string.seg_volver), { model.close() }, enabled = !state.busy)
    }
    if (picker) {
        val pickerState = rememberDatePickerState(initialSelectedDateMillis = state.date.atStartOfDay(ZoneId.of("UTC")).toInstant().toEpochMilli())
        DatePickerDialog(onDismissRequest = { picker = false },
            confirmButton = { TextButton(onClick = { pickerState.selectedDateMillis?.let { model.selectDate(Instant.ofEpochMilli(it).atZone(ZoneId.of("UTC")).toLocalDate()) }; slot = null; picker = false }) { Text("Aceptar") } },
            dismissButton = { TextButton(onClick = { picker = false }) { Text(stringResource(R.string.ui_cancelar)) } }) { DatePicker(state = pickerState) }
    }
}

@Composable
private fun DiscardForm(p: LabProposal, state: LabProposalsState, model: LabProposalsViewModel) {
    var reason by rememberSaveable(p.id) { mutableStateOf("") }
    state.error?.let { NoticeBanner(NoticeKind.ERROR, it) }
    FormField(stringResource(R.string.seg_motivo), reason, { reason = it.take(LabProposalRules.DISCARD_MAX) }, hint = stringResource(R.string.seg_motivo_ayuda), singleLine = false)
    ClimesaActionGroup {
        PrimaryButton(stringResource(R.string.seg_descartar_confirmar), { model.discard(p, reason) }, enabled = !state.busy && LabProposalRules.discardError(reason) == null, loading = state.busy)
        SecondaryButton(stringResource(R.string.seg_volver), { model.close() }, enabled = !state.busy)
    }
}
