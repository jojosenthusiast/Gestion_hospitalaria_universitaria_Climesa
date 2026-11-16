@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
package sv.edu.catolica.climesa.ui

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
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
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
import sv.edu.catolica.climesa.domain.AppointmentDoctor
import sv.edu.catolica.climesa.domain.AppointmentSlot
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
) {
    val state by model.state.collectAsStateWithLifecycle()
    var requestOpen by rememberSaveable { mutableStateOf(false) }
    var cancelTarget by rememberSaveable { mutableStateOf<String?>(null) }
    LaunchedEffect(Unit) { model.load(); model.startLive(channels) }
    LaunchedEffect(quickAction) {
        if (quickAction == null) return@LaunchedEffect
        if (quickAction == QuickAction.REQUEST_APPOINTMENT && "citas.solicitar" in permissions) requestOpen = true
        onQuickActionHandled()
    }
    val cancelAppointment = state.appointments.firstOrNull { it.id == cancelTarget }

    if (requestOpen) {
        AppointmentRequestDialog(state, model, onClose = { requestOpen = false })
    }
    if (cancelAppointment != null) {
        CancelAppointmentDialog(cancelAppointment, state.saving, model, onClose = { cancelTarget = null })
    }
    state.rescheduleTarget?.let { RescheduleRequestDialog(it, state, model) }

    PageList(modifier) {
        item { SectionIntro("Paciente / Atención", "Mis citas", "Consulta tus citas y solicita una nueva franja con un médico disponible.") }
        state.error?.let { error ->
            item {
                ClimesaActionGroup {
                    NoticeBanner(NoticeKind.ERROR, error)
                    SecondaryButton("Reintentar", { model.clearMessages(); model.load() }, icon = Icons.Default.Refresh)
                }
            }
        }
        state.notice?.let { notice -> item { InlineStatus(notice, Icons.Default.Send) } }
        if ("citas.solicitar" in permissions) {
            item { PrimaryButton("Solicitar cita", { model.clearMessages(); requestOpen = true }, icon = Icons.Default.CalendarMonth) }
        }
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
            Text(stringResource(R.string.cita_plazo, formatTime(it)), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
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
private fun AppointmentRequestDialog(state: PatientAppointmentsState, model: PatientAppointmentsViewModel, onClose: () -> Unit) {
    var doctorMenu by rememberSaveable { mutableStateOf(false) }
    var reason by rememberSaveable { mutableStateOf("") }
    var datePickerOpen by rememberSaveable { mutableStateOf(false) }
    val selectedDoctor = state.doctors.firstOrNull { it.id == state.selectedDoctorId }
    ConfirmDialog(
        title = "Solicitar cita",
        confirmLabel = "Enviar solicitud",
        onConfirm = { model.request(reason); onClose() },
        onDismiss = onClose,
        message = "Selecciona un médico, una fecha y una franja publicada. Recepción confirmará la solicitud.",
        busy = state.saving,
        confirmEnabled = state.selectedSlot != null,
        body = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                androidx.compose.material3.ExposedDropdownMenuBox(expanded = doctorMenu, onExpandedChange = { doctorMenu = !doctorMenu }) {
                    OutlinedTextField(value = selectedDoctor?.name ?: "Selecciona un médico", onValueChange = {}, readOnly = true, label = { Text("Médico") }, modifier = Modifier.menuAnchor().fillMaxWidth())
                    DropdownMenu(expanded = doctorMenu, onDismissRequest = { doctorMenu = false }) {
                        state.doctors.forEach { doctor -> DropdownMenuItem(enabled = doctor.hasShift, text = { Text(doctorLabel(doctor) + if (doctor.hasShift) "" else " · " + (doctor.reason ?: "Sin turno")) }, onClick = { model.selectDoctor(doctor.id); doctorMenu = false }) }
                    }
                }
                OutlinedButton(onClick = { datePickerOpen = true }, modifier = Modifier.fillMaxWidth()) { androidx.compose.material3.Icon(Icons.Default.CalendarMonth, contentDescription = null); Spacer(Modifier.padding(4.dp)); Text("Fecha: ${state.selectedDate.format(appointmentDateFormatter)}") }
                if (state.selectedDoctorId.isNotBlank()) {
                    if (state.workPeriods.isNotEmpty()) Text("Jornada publicada: ${state.workPeriods.joinToString(" · ") { "${formatTime(it.start)}–${formatTime(it.end)}" }}", style = MaterialTheme.typography.bodySmall)
                    if (state.daySlots.isEmpty()) Text("No hay franjas publicadas para esta fecha.", style = MaterialTheme.typography.bodySmall)
                    else {
                        Text("Toca una franja libre de 20 minutos. Las apagadas no están disponibles y dicen por qué.", style = MaterialTheme.typography.bodySmall)
                        DaySlotGrid(state.daySlots, state.daySlots.firstOrNull { it.start == state.selectedSlot?.start }, { model.selectSlot(AppointmentSlot(it.start, it.end)) })
                    }
                }
                FormField("Motivo · opcional", reason, { reason = it.take(500) }, singleLine = false)
            }
        },
    )
    if (datePickerOpen) {
        val picker = rememberDatePickerState(initialSelectedDateMillis = state.selectedDate.atStartOfDay(sanSalvador).toInstant().toEpochMilli())
        DatePickerDialog(onDismissRequest = { datePickerOpen = false }, confirmButton = { TextButton(onClick = { picker.selectedDateMillis?.let { model.selectDate(Instant.ofEpochMilli(it).atZone(sanSalvador).toLocalDate()) }; datePickerOpen = false }) { Text("Aceptar") } }, dismissButton = { TextButton(onClick = { datePickerOpen = false }) { Text("Cancelar") } }) { DatePicker(state = picker) }
    }
}

@Composable
private fun SlotPicker(slots: List<AppointmentSlot>, selected: AppointmentSlot?, onSelected: (AppointmentSlot) -> Unit) {
    var open by rememberSaveable { mutableStateOf(false) }
    val text = selected?.let { "${formatTime(it.start)} – ${formatTime(it.end)}" } ?: "Selecciona un horario"
    androidx.compose.material3.ExposedDropdownMenuBox(expanded = open, onExpandedChange = { open = !open }) {
        OutlinedTextField(text, {}, readOnly = true, label = { Text("Horario disponible") }, modifier = Modifier.menuAnchor().fillMaxWidth())
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) { slots.forEach { slot -> DropdownMenuItem(text = { Text("${formatTime(slot.start)} – ${formatTime(slot.end)}") }, onClick = { onSelected(slot); open = false }) } }
    }
}

@Composable
private fun CancelAppointmentDialog(appointment: PatientAppointment, busy: Boolean, model: PatientAppointmentsViewModel, onClose: () -> Unit) {
    var reason by rememberSaveable(appointment.id) { mutableStateOf("") }
    ConfirmDialog(
        title = "Cancelar cita",
        confirmLabel = "Confirmar",
        onConfirm = { model.cancel(appointment, reason); onClose() },
        onDismiss = onClose,
        message = "${appointment.doctorName} · ${formatAppointmentDateTime(appointment.start)}",
        destructive = true,
        busy = busy,
        confirmEnabled = reason.trim().length >= AppointmentActions.REASON_MIN,
        body = { FormField("Motivo", reason, { reason = it.take(AppointmentActions.REASON_MAX) }, singleLine = false, hint = AppointmentActions.counter(reason)) },
    )
}

private fun doctorLabel(doctor: AppointmentDoctor) = doctor.specialty?.let { "${doctor.name} · $it" } ?: doctor.name
private fun formatAppointmentDateTime(value: String) = runCatching { appointmentTimeFormatter.format(Instant.parse(value).atZone(sanSalvador)) }.getOrDefault(value)
private fun formatTime(value: String) = runCatching { java.time.format.DateTimeFormatter.ofPattern("HH:mm").format(Instant.parse(value).atZone(sanSalvador)) }.getOrDefault(value)
