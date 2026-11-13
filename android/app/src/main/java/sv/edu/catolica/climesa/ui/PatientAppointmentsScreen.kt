@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
package sv.edu.catolica.climesa.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Cancel
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Send
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import sv.edu.catolica.climesa.domain.AppointmentDoctor
import sv.edu.catolica.climesa.domain.AppointmentSlot
import sv.edu.catolica.climesa.domain.PatientAppointment

private val appointmentDateFormatter = DateTimeFormatter.ofPattern("dd/MM/yyyy")
private val appointmentTimeFormatter = DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm")
private val sanSalvador = ZoneId.of("America/El_Salvador")

@Composable
fun PatientAppointmentsScreen(
    permissions: List<String>,
    channels: List<String>,
    modifier: Modifier = Modifier,
    model: PatientAppointmentsViewModel = viewModel(),
) {
    val state by model.state.collectAsStateWithLifecycle()
    var requestOpen by rememberSaveable { mutableStateOf(false) }
    var cancelTarget by rememberSaveable { mutableStateOf<String?>(null) }
    LaunchedEffect(Unit) { model.load(); model.startLive(channels) }
    val cancelAppointment = state.appointments.firstOrNull { it.id == cancelTarget }

    if (requestOpen) {
        AppointmentRequestDialog(state, model, onClose = { requestOpen = false })
    }
    if (cancelAppointment != null) {
        CancelAppointmentDialog(cancelAppointment, state.saving, model, onClose = { cancelTarget = null })
    }

    LazyColumn(modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        item { SectionIntro("Paciente / Atención", "Mis citas", "Consulta tus citas y solicita una nueva franja con un médico disponible.") }
        state.error?.let { error ->
            item { ClimesaActionGroup { Text(error, color = androidx.compose.material3.MaterialTheme.colorScheme.error); ClimesaButton("Reintentar", Icons.Default.Refresh, { model.clearMessages(); model.load() }, outlined = true) } }
        }
        state.notice?.let { notice -> item { InlineStatus(notice, Icons.Default.Send) } }
        if ("citas.solicitar" in permissions) {
            item { ClimesaButton("Solicitar cita", Icons.Default.CalendarMonth, { model.clearMessages(); requestOpen = true }) }
        }
        if (state.loading) {
            item { CircularProgressIndicator() }
        } else if (state.appointments.isEmpty()) {
            item { ClimesaCard { Text("Todavía no tienes citas registradas.", Modifier.padding(18.dp)) } }
        } else {
            items(state.appointments, key = { it.id }) { appointment ->
                AppointmentCard(appointment, onCancel = { cancelTarget = appointment.id })
            }
        }
    }
}

@Composable
private fun AppointmentCard(appointment: PatientAppointment, onCancel: () -> Unit) {
    ClimesaCard {
        Column(Modifier.fillMaxWidth().padding(18.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(appointment.doctorName.ifBlank { "Médico asignado" }, style = androidx.compose.material3.MaterialTheme.typography.titleMedium)
            Text("${formatAppointmentDateTime(appointment.start)} — ${formatTime(appointment.end)}")
            Text(appointmentStateLabel(appointment.state), color = androidx.compose.material3.MaterialTheme.colorScheme.primary)
            appointment.reason?.let { Text("Motivo: $it", style = androidx.compose.material3.MaterialTheme.typography.bodySmall) }
            if (appointment.state == "solicitada" || appointment.state == "confirmada") {
                OutlinedButton(onClick = onCancel) { androidx.compose.material3.Icon(Icons.Default.Cancel, contentDescription = null); Spacer(Modifier.padding(4.dp)); Text("Cancelar") }
            }
        }
    }
}

@Composable
private fun AppointmentRequestDialog(state: PatientAppointmentsState, model: PatientAppointmentsViewModel, onClose: () -> Unit) {
    var doctorMenu by rememberSaveable { mutableStateOf(false) }
    var reason by rememberSaveable { mutableStateOf("") }
    var datePickerOpen by rememberSaveable { mutableStateOf(false) }
    val selectedDoctor = state.doctors.firstOrNull { it.id == state.selectedDoctorId }
    androidx.compose.material3.AlertDialog(
        onDismissRequest = { if (!state.saving) onClose() },
        title = { Text("Solicitar cita") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("Selecciona un médico, una fecha y una franja publicada. Recepción confirmará la solicitud.", style = androidx.compose.material3.MaterialTheme.typography.bodySmall)
                androidx.compose.material3.ExposedDropdownMenuBox(expanded = doctorMenu, onExpandedChange = { doctorMenu = !doctorMenu }) {
                    OutlinedTextField(value = selectedDoctor?.name ?: "Selecciona un médico", onValueChange = {}, readOnly = true, label = { Text("Médico") }, modifier = Modifier.menuAnchor().fillMaxWidth())
                    DropdownMenu(expanded = doctorMenu, onDismissRequest = { doctorMenu = false }) {
                        state.doctors.forEach { doctor -> DropdownMenuItem(text = { Text(doctorLabel(doctor)) }, onClick = { model.selectDoctor(doctor.id); doctorMenu = false }) }
                    }
                }
                OutlinedButton(onClick = { datePickerOpen = true }, modifier = Modifier.fillMaxWidth()) { androidx.compose.material3.Icon(Icons.Default.CalendarMonth, contentDescription = null); Spacer(Modifier.padding(4.dp)); Text("Fecha: ${state.selectedDate.format(appointmentDateFormatter)}") }
                if (state.selectedDoctorId.isNotBlank()) {
                    if (state.workPeriods.isNotEmpty()) Text("Jornada publicada: ${state.workPeriods.joinToString(" · ") { "${formatTime(it.start)}–${formatTime(it.end)}" }}", style = androidx.compose.material3.MaterialTheme.typography.bodySmall)
                    if (state.slots.isEmpty()) Text("No hay franjas publicadas para esta fecha.", style = androidx.compose.material3.MaterialTheme.typography.bodySmall)
                    else { Text("Franjas disponibles de 20 minutos", style = androidx.compose.material3.MaterialTheme.typography.bodySmall); SlotPicker(state.slots, state.selectedSlot, model::selectSlot) }
                }
                OutlinedTextField(reason, { reason = it.take(500) }, label = { Text("Motivo · opcional") }, modifier = Modifier.fillMaxWidth(), maxLines = 3)
            }
        },
        confirmButton = { Button(onClick = { model.request(reason); onClose() }, enabled = !state.saving && state.selectedSlot != null) { Text(if (state.saving) "Enviando…" else "Enviar solicitud") } },
        dismissButton = { TextButton(onClick = onClose, enabled = !state.saving) { Text("Cancelar") } },
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
    AlertDialog(onDismissRequest = { if (!busy) onClose() }, title = { Text("Cancelar cita") }, text = { Column(verticalArrangement = Arrangement.spacedBy(8.dp)) { Text("${appointment.doctorName} · ${formatAppointmentDateTime(appointment.start)}"); OutlinedTextField(reason, { reason = it.take(500) }, label = { Text("Motivo") }, minLines = 3, modifier = Modifier.fillMaxWidth()) } }, confirmButton = { Button(onClick = { model.cancel(appointment, reason); onClose() }, enabled = !busy && reason.trim().length >= 10) { Text(if (busy) "Cancelando…" else "Confirmar") } }, dismissButton = { TextButton(onClick = onClose, enabled = !busy) { Text("Volver") } })
}

private fun doctorLabel(doctor: AppointmentDoctor) = doctor.specialty?.let { "${doctor.name} · $it" } ?: doctor.name
private fun appointmentStateLabel(state: String) = mapOf("solicitada" to "Solicitud pendiente", "confirmada" to "Confirmada", "cancelada" to "Cancelada", "rechazada" to "Rechazada", "atendida" to "Atendida", "no_asistio" to "No asistió")[state] ?: state
private fun formatAppointmentDateTime(value: String) = runCatching { appointmentTimeFormatter.format(Instant.parse(value).atZone(sanSalvador)) }.getOrDefault(value)
private fun formatTime(value: String) = runCatching { java.time.format.DateTimeFormatter.ofPattern("HH:mm").format(Instant.parse(value).atZone(sanSalvador)) }.getOrDefault(value)
