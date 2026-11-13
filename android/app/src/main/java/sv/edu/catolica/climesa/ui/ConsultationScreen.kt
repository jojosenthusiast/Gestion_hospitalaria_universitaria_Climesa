@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
package sv.edu.catolica.climesa.ui

import androidx.compose.foundation.layout.Arrangement
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
import androidx.compose.material.icons.filled.Stethoscope
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
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import sv.edu.catolica.climesa.domain.MedicalAppointment
import sv.edu.catolica.climesa.domain.AccessProfile

private val sanSalvador = ZoneId.of("America/El_Salvador")
private val appointmentFormatter = DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm")

@Composable
fun ConsultationScreen(profile: AccessProfile? = null, modifier: Modifier = Modifier, model: ConsultationViewModel = viewModel()) {
    val state by model.state.collectAsStateWithLifecycle()
    var selected by rememberSaveable { mutableStateOf<String?>(null) }
    LaunchedEffect(Unit) { model.load() }
    val selectedItem = state.appointments.firstOrNull { it.appointmentId == selected }
    selectedItem?.let { item -> ConsultationDialog(item, profile, state.saving, model, onClose = { selected = null }) }
    LazyColumn(modifier, contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        item { SectionIntro("Medicina / Atención", "Mi consultorio", "Agenda propia y registro clínico conectado a cada cita confirmada.") }
        state.error?.let { error -> item { ClimesaActionGroup { Text(error, color = MaterialTheme.colorScheme.error); ClimesaButton("Reintentar", Icons.Default.Refresh, { model.clearMessages(); model.load() }, outlined = true) } } }
        state.notice?.let { notice -> item { InlineStatus(notice, Icons.Default.CheckCircle) } }
        if (state.loading) item { CircularProgressIndicator() }
        else if (state.appointments.isEmpty()) item { ClimesaCard { Text("No tienes citas confirmadas en el rango actual.", Modifier.padding(18.dp)) } }
        else items(state.appointments, key = { it.appointmentId }) { item -> MedicalAppointmentCard(item, onOpen = { selected = item.appointmentId }) }
    }
}

@Composable
private fun MedicalAppointmentCard(item: MedicalAppointment, onOpen: () -> Unit) {
    ClimesaCard { Column(Modifier.fillMaxWidth().padding(18.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(item.patientName.ifBlank { "Paciente sin nombre" }, style = MaterialTheme.typography.titleMedium)
        Text("${formatDateTime(item.start)} — ${formatTime(item.end)}", style = MaterialTheme.typography.bodyMedium)
        Text("Cita: ${appointmentState(item.appointmentState)} · Consulta: ${consultationState(item.consultationState)}", color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.bodySmall)
        item.reason?.let { Text("Motivo informado: $it", style = MaterialTheme.typography.bodySmall) }
        OutlinedButton(onClick = onOpen, modifier = Modifier.fillMaxWidth()) { androidx.compose.material3.Icon(if (item.consultationState == "firmada") Icons.Default.CheckCircle else Icons.Default.EditNote, null); Spacer(Modifier.padding(4.dp)); Text(if (item.consultationState == "firmada") "Ver consulta" else if (item.consultationId == null) "Iniciar consulta" else "Continuar consulta") }
    } }
}

@Composable
private fun ConsultationDialog(item: MedicalAppointment, profile: AccessProfile?, busy: Boolean, model: ConsultationViewModel, onClose: () -> Unit) {
    var reason by rememberSaveable(item.appointmentId) { mutableStateOf(item.consultationReason ?: item.reason.orEmpty()) }
    var physicalExam by rememberSaveable(item.appointmentId) { mutableStateOf(item.physicalExam.orEmpty()) }
    var plan by rememberSaveable(item.appointmentId) { mutableStateOf(item.plan.orEmpty()) }
    var systolic by rememberSaveable(item.appointmentId) { mutableStateOf("") }
    var diastolic by rememberSaveable(item.appointmentId) { mutableStateOf("") }
    var heartRate by rememberSaveable(item.appointmentId) { mutableStateOf("") }
    var temperature by rememberSaveable(item.appointmentId) { mutableStateOf("") }
    var oxygenSaturation by rememberSaveable(item.appointmentId) { mutableStateOf("") }
    var diagnosisCode by rememberSaveable(item.appointmentId) { mutableStateOf("") }
    var diagnosisNote by rememberSaveable(item.appointmentId) { mutableStateOf("") }
    var diagnosisPrincipal by rememberSaveable(item.appointmentId) { mutableStateOf(false) }
    var medication by rememberSaveable(item.appointmentId) { mutableStateOf("") }
    var dose by rememberSaveable(item.appointmentId) { mutableStateOf("") }
    var route by rememberSaveable(item.appointmentId) { mutableStateOf("") }
    var frequency by rememberSaveable(item.appointmentId) { mutableStateOf("") }
    var duration by rememberSaveable(item.appointmentId) { mutableStateOf("") }
    var instructions by rememberSaveable(item.appointmentId) { mutableStateOf("") }
    val signed = item.consultationState == "firmada"
    AlertDialog(onDismissRequest = { if (!busy) onClose() }, title = { Text(if (signed) "Consulta firmada" else if (item.consultationId == null) "Iniciar consulta" else "Continuar consulta") }, text = { Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text("Paciente: ${item.patientName}\nCita: ${formatDateTime(item.start)}", style = MaterialTheme.typography.bodySmall)
        if (signed) Text("Este registro está firmado. Las correcciones futuras se harán mediante addendum.", color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.bodySmall)
        OutlinedTextField(reason, { reason = it.take(2000) }, label = { Text("Motivo de consulta") }, enabled = !signed, modifier = Modifier.fillMaxWidth(), minLines = 2)
        OutlinedTextField(physicalExam, { physicalExam = it.take(10000) }, label = { Text("Examen físico") }, enabled = !signed, modifier = Modifier.fillMaxWidth(), minLines = 3)
        OutlinedTextField(plan, { plan = it.take(5000) }, label = { Text("Plan") }, enabled = !signed, modifier = Modifier.fillMaxWidth(), minLines = 3)
        if (item.consultationId != null && profile?.permissions?.contains("signos.registrar") == true) {
            Text("Signos vitales", style = MaterialTheme.typography.titleSmall)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) { OutlinedTextField(systolic, { systolic = it }, label = { Text("PA sis.") }, modifier = Modifier.weight(1f), singleLine = true); OutlinedTextField(diastolic, { diastolic = it }, label = { Text("PA dia.") }, modifier = Modifier.weight(1f), singleLine = true) }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) { OutlinedTextField(heartRate, { heartRate = it }, label = { Text("FC") }, modifier = Modifier.weight(1f), singleLine = true); OutlinedTextField(temperature, { temperature = it }, label = { Text("Temp.") }, modifier = Modifier.weight(1f), singleLine = true); OutlinedTextField(oxygenSaturation, { oxygenSaturation = it }, label = { Text("Sat. O₂") }, modifier = Modifier.weight(1f), singleLine = true) }
            OutlinedButton(onClick = { model.signs(item, systolic, diastolic, heartRate, temperature, oxygenSaturation) }, enabled = !busy && listOf(systolic, diastolic, heartRate, temperature, oxygenSaturation).any { it.isNotBlank() }, modifier = Modifier.fillMaxWidth()) { Text("Registrar signos") }
        }
        if (item.consultationId != null && !signed && profile?.permissions?.contains("consulta.registrar") == true) {
            Text("Diagnóstico CIE-10", style = MaterialTheme.typography.titleSmall)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) { OutlinedTextField(diagnosisCode, { diagnosisCode = it.take(20) }, label = { Text("Código") }, modifier = Modifier.weight(1f), singleLine = true); OutlinedTextField(diagnosisNote, { diagnosisNote = it.take(2000) }, label = { Text("Nota") }, modifier = Modifier.weight(2f), singleLine = true) }
            Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) { androidx.compose.material3.Checkbox(diagnosisPrincipal, { diagnosisPrincipal = it }); Text("Principal") }
            OutlinedButton(onClick = { model.diagnosis(item, diagnosisCode, diagnosisNote, diagnosisPrincipal); diagnosisCode = ""; diagnosisNote = ""; diagnosisPrincipal = false }, enabled = !busy && diagnosisCode.trim().isNotBlank(), modifier = Modifier.fillMaxWidth()) { Text("Registrar diagnóstico") }
        }
        if (item.consultationId != null && !signed && profile?.permissions?.contains("recetas.emitir") == true) {
            Text("Emitir receta", style = MaterialTheme.typography.titleSmall)
            OutlinedTextField(medication, { medication = it.take(200) }, label = { Text("Medicamento") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) { OutlinedTextField(dose, { dose = it.take(200) }, label = { Text("Dosis") }, modifier = Modifier.weight(1f), singleLine = true); OutlinedTextField(route, { route = it.take(100) }, label = { Text("Vía") }, modifier = Modifier.weight(1f), singleLine = true) }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) { OutlinedTextField(frequency, { frequency = it.take(200) }, label = { Text("Frecuencia") }, modifier = Modifier.weight(1f), singleLine = true); OutlinedTextField(duration, { duration = it.take(100) }, label = { Text("Duración") }, modifier = Modifier.weight(1f), singleLine = true) }
            OutlinedTextField(instructions, { instructions = it.take(1000) }, label = { Text("Indicaciones") }, modifier = Modifier.fillMaxWidth(), minLines = 2)
            OutlinedButton(onClick = { model.prescription(item, medication, dose, route, frequency, duration, instructions); medication = ""; dose = ""; route = ""; frequency = ""; duration = ""; instructions = "" }, enabled = !busy && listOf(medication, dose, route, frequency, duration).all { it.trim().isNotBlank() }, modifier = Modifier.fillMaxWidth()) { Text("Emitir receta") }
        }
    } }, confirmButton = { if (!signed) Button(onClick = { if (item.consultationId == null) model.start(item, reason) else model.save(item, reason, physicalExam, plan) }, enabled = !busy && reason.trim().isNotBlank()) { Text(if (busy) "Guardando…" else if (item.consultationId == null) "Iniciar consulta" else "Guardar borrador") } }, dismissButton = { Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) { if (!signed && item.consultationId != null) Button(onClick = { model.sign(item, reason, physicalExam, plan, onClose) }, enabled = !busy && reason.trim().isNotBlank() && plan.trim().isNotBlank()) { Text("Firmar") }; TextButton(onClick = onClose, enabled = !busy) { Text("Cerrar") } } })
}

private fun appointmentState(value: String) = mapOf("confirmada" to "Confirmada", "atendida" to "Atendida")[value] ?: value
private fun consultationState(value: String?) = mapOf(null to "Sin iniciar", "abierta" to "Abierta", "firmada" to "Firmada")[value] ?: value.orEmpty()
private fun formatDateTime(value: String) = runCatching { appointmentFormatter.format(Instant.parse(value).atZone(sanSalvador)) }.getOrDefault(value)
private fun formatTime(value: String) = runCatching { DateTimeFormatter.ofPattern("HH:mm").format(Instant.parse(value).atZone(sanSalvador)) }.getOrDefault(value)
