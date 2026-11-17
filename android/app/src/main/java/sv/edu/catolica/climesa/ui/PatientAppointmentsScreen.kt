@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
package sv.edu.catolica.climesa.ui

import androidx.activity.compose.BackHandler

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Cancel
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Send
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import androidx.compose.ui.res.stringResource
import sv.edu.catolica.climesa.R
import sv.edu.catolica.climesa.domain.AppointmentAction
import sv.edu.catolica.climesa.domain.AppointmentActions
import sv.edu.catolica.climesa.domain.PatientAppointment
import sv.edu.catolica.climesa.domain.QuickAction

private val appointmentDateFormatter = DateTimeFormatter.ofPattern("dd/MM/yyyy")
private val appointmentTimeFormatter = DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm")
private val sanSalvador = ZoneId.of("America/El_Salvador")

@Composable
fun PatientAppointmentsScreen(
    permissions: List<String>,
    channels: List<String>,
    modifier: Modifier = Modifier,
    quickAction: QuickAction? = null,
    onQuickActionHandled: () -> Unit = {},
    model: PatientAppointmentsViewModel = viewModel(),
    requests: CategoryRequestsViewModel = viewModel(),
) {
    val state by model.state.collectAsStateWithLifecycle()
    val requestState by requests.state.collectAsStateWithLifecycle()
    var cancelTarget by rememberSaveable { mutableStateOf<String?>(null) }
    val canRequest = "citas.solicitar" in permissions
    LaunchedEffect(Unit) { model.load(); model.startLive(channels); requests.load(withCategories = canRequest); requests.startLive(channels) }
    LaunchedEffect(quickAction) {
        if (quickAction == null) return@LaunchedEffect
        if (quickAction == QuickAction.REQUEST_APPOINTMENT && canRequest) requests.openForm()
        onQuickActionHandled()
    }
    // Fase 2, flow A: the patient asks by reason instead of picking one of every doctor; reception assigns doctor and time.
    BackHandler(enabled = requestState.formOpen) { requests.leaveForm() }
    if (requestState.formOpen) { CategoryRequestForm(requestState, requests, state.doctors, modifier); return }
    val cancelAppointment = state.appointments.firstOrNull { it.id == cancelTarget }

    if (cancelAppointment != null) {
        CancelAppointmentDialog(cancelAppointment, state.saving, state.error, model, onClose = { cancelTarget = null })
    }
    state.rescheduleTarget?.let { RescheduleRequestDialog(it, state, model) }

    PageList(modifier) {
        item { SectionIntro("Paciente / Atención", "Mis citas", "Consulta tus citas y pide una nueva por motivo; recepción te asigna médico y hora.") }
        state.error?.let { error ->
            item {
                ClimesaActionGroup {
                    NoticeBanner(NoticeKind.ERROR, error)
                    SecondaryButton("Reintentar", { model.clearMessages(); model.load() }, icon = Icons.Default.Refresh)
                }
            }
        }
        state.notice?.let { notice -> item { InlineStatus(notice, Icons.Default.Send) } }
        requestState.error?.let { error -> item { NoticeBanner(NoticeKind.ERROR, error) } }
        requestState.notice?.let { notice -> item { InlineStatus(notice, Icons.Default.Send) } }
        if (canRequest) {
            item { PrimaryButton(stringResource(R.string.cat_pedir_cita), { model.clearMessages(); requests.openForm() }, icon = Icons.Default.CalendarMonth) }
        }
        if (requestState.requests.isNotEmpty()) item { MyCategoryRequests(requestState.requests, requestState.saving, requests::withdraw, requestState.error) }
        if (state.loading) {
            item { LoadingState() }
        } else if (state.appointments.isEmpty()) {
            item { EmptyState("Todavía no tienes citas registradas.") }
        } else {
            items(state.appointments, key = { it.id }) { appointment ->
                AppointmentCard(appointment, onCancel = { cancelTarget = appointment.id }, onReschedule = { model.clearMessages(); model.openReschedule(appointment) })
            }
        }
    }
}

@Composable
private fun AppointmentCard(appointment: PatientAppointment, onCancel: () -> Unit, onReschedule: () -> Unit) {
    SectionCard(appointment.doctorName.ifBlank { "Médico asignado" }) {
        PatientAppointmentTag(appointment.state)
        LabeledValue("Horario", "${sv.edu.catolica.climesa.domain.AppointmentAgenda.dayLabel(sv.edu.catolica.climesa.domain.AppointmentAgenda.dayKey(appointment.start))} · ${sv.edu.catolica.climesa.domain.AppointmentAgenda.timeRange(appointment.start, appointment.end)}")
        appointment.reason?.let { LabeledValue("Motivo", it) }
        // CITA-01: the deadline the API gives for cancelling or rescheduling.
        if (appointment.allows(AppointmentAction.CANCEL) || appointment.allows(AppointmentAction.RESCHEDULE)) appointment.cancelableUntil?.let {
            Text(stringResource(R.string.cita_plazo, sv.edu.catolica.climesa.domain.AppointmentAgenda.deadline(it, appointment.start)), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        appointment.reschedule?.let { r ->
            when (r.state) {
                "pendiente" -> NoticeBanner(NoticeKind.INFO, stringResource(R.string.cita_reprog_pendiente, formatAppointmentDateTime(r.start)))
                "rechazada" -> NoticeBanner(NoticeKind.WARNING, r.rejectionReason?.let { stringResource(R.string.cita_reprog_rechazada, it) } ?: stringResource(R.string.cita_reprog_rechazada_sin_motivo))
                else -> Unit
            }
        }
        if (appointment.state == AppointmentActions.RESCHEDULED) Text(stringResource(R.string.cita_reprogramada_a), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        PatientActionButton(appointment, AppointmentAction.RESCHEDULE, stringResource(R.string.cita_paciente_reprogramar), onReschedule)
        PatientActionButton(appointment, AppointmentAction.CANCEL, "Cancelar", onCancel)
    }
}

/** An allowed action is a button; a blocked one is a disabled button with the server's reason; otherwise nothing. */
@Composable
private fun PatientActionButton(appointment: PatientAppointment, action: AppointmentAction, label: String, onClick: () -> Unit) {
    val blocked = appointment.blockedReason(action)
    if (!appointment.allows(action) && blocked == null) return
    SecondaryButton(label, onClick, icon = if (action == AppointmentAction.CANCEL) Icons.Default.Cancel else Icons.Default.CalendarMonth, enabled = appointment.allows(action))
    if (!appointment.allows(action)) blocked?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
}

/** CITA-01: the patient asks for another free slot of the same doctor; Recepción or the doctor decides. */
@Composable
private fun RescheduleRequestDialog(appointment: PatientAppointment, state: PatientAppointmentsState, model: PatientAppointmentsViewModel) {
    var datePickerOpen by rememberSaveable { mutableStateOf(false) }
    ConfirmDialog(
        title = "Solicitar reprogramación",
        confirmLabel = "Enviar solicitud",
        onConfirm = model::reschedule,
        onDismiss = model::closeReschedule,
        message = "${appointment.doctorName} · ${formatAppointmentDateTime(appointment.start)}",
        busy = state.saving,
        confirmEnabled = state.rescheduleSlot?.selectable == true,
        body = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                state.error?.let { NoticeBanner(NoticeKind.ERROR, it) }
                OutlinedButton(onClick = { datePickerOpen = true }, enabled = !state.saving, modifier = Modifier.fillMaxWidth()) { androidx.compose.material3.Icon(Icons.Default.CalendarMonth, contentDescription = null); Spacer(Modifier.padding(4.dp)); Text(stringResource(R.string.cita_fecha, state.rescheduleDate.format(appointmentDateFormatter))) }
                when {
                    state.loadingRescheduleSlots -> LoadingState()
                    state.rescheduleSlots.isEmpty() -> Text(stringResource(R.string.cita_sin_franjas), style = MaterialTheme.typography.bodySmall)
                    else -> { Text(stringResource(R.string.cita_elige_franja), style = MaterialTheme.typography.bodySmall); DaySlotGrid(state.rescheduleSlots, state.rescheduleSlot, model::pickRescheduleSlot) }
                }
            }
        },
    )
    if (datePickerOpen) {
        val picker = rememberDatePickerState(initialSelectedDateMillis = state.rescheduleDate.atStartOfDay(sanSalvador).toInstant().toEpochMilli())
        DatePickerDialog(onDismissRequest = { datePickerOpen = false }, confirmButton = { TextButton(onClick = { picker.selectedDateMillis?.let { model.selectRescheduleDate(Instant.ofEpochMilli(it).atZone(java.time.ZoneOffset.UTC).toLocalDate()) }; datePickerOpen = false }) { Text("Aceptar") } }, dismissButton = { TextButton(onClick = { datePickerOpen = false }) { Text("Cancelar") } }) { DatePicker(state = picker) }
    }
}

@Composable
private fun CancelAppointmentDialog(appointment: PatientAppointment, busy: Boolean, error: String?, model: PatientAppointmentsViewModel, onClose: () -> Unit) {
    var reason by rememberSaveable(appointment.id) { mutableStateOf("") }
    ConfirmDialog(
        title = "Cancelar cita",
        confirmLabel = "Confirmar",
        onConfirm = { model.cancel(appointment, reason) },
        onDismiss = onClose,
        error = error,
        onDone = onClose,
        message = "${appointment.doctorName} · ${formatAppointmentDateTime(appointment.start)}",
        destructive = true,
        busy = busy,
        confirmEnabled = reason.trim().length >= AppointmentActions.REASON_MIN,
        body = { FormField("Motivo", reason, { reason = it.take(AppointmentActions.REASON_MAX) }, singleLine = false, hint = AppointmentActions.counter(reason)) },
    )
}

private fun formatAppointmentDateTime(value: String) = runCatching { appointmentTimeFormatter.format(Instant.parse(value).atZone(sanSalvador)) }.getOrDefault(value)
