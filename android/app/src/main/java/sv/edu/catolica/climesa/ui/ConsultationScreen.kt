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
import sv.edu.catolica.climesa.domain.LabExam
import sv.edu.catolica.climesa.domain.MedicalAppointment
import sv.edu.catolica.climesa.domain.AccessProfile

private val sanSalvador = ZoneId.of("America/El_Salvador")
private val appointmentFormatter = DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm")

@Composable
fun ConsultationScreen(profile: AccessProfile? = null, modifier: Modifier = Modifier, model: ConsultationViewModel = viewModel()) {
    val state by model.state.collectAsStateWithLifecycle()
    var selected by rememberSaveable { mutableStateOf<String?>(null) }
    LaunchedEffect(Unit) { model.load() }
    LaunchedEffect(profile?.channels) { profile?.let { model.startLive(it.channels) } }
    val selectedItem = state.appointments.firstOrNull { it.appointmentId == selected }
    selectedItem?.let { item -> ConsultationDialog(item, profile, state.saving, state.error, state.labCatalog, state.labCatalogLoading, model, onClose = { selected = null }) }
    val retry = { model.clearMessages(); model.load() }
    PageList(modifier) {
        item { SectionIntro("Medicina / Atención", "Mi consultorio", "Agenda propia y registro clínico conectado a cada cita confirmada.") }
        state.notice?.let { notice -> item { NoticeBanner(NoticeKind.SUCCESS, notice) } }
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
private fun ConsultationDialog(item: MedicalAppointment, profile: AccessProfile?, busy: Boolean, error: String?, labCatalog: List<LabExam>, labCatalogLoading: Boolean, model: ConsultationViewModel, onClose: () -> Unit) {
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
    // Selected exam ids joined by commas, so the selection survives rotation without a custom saver.
    var labExams by rememberSaveable(item.appointmentId) { mutableStateOf("") }
    var labUrgent by rememberSaveable(item.appointmentId) { mutableStateOf(false) }
    val signed = item.consultationState == "firmada"
    val permissions = profile?.permissions.orEmpty()
    AlertDialog(onDismissRequest = { if (!busy) onClose() }, shape = MaterialTheme.shapes.large, title = { Text(if (signed) "Consulta firmada" else if (item.consultationId == null) "Iniciar consulta" else "Continuar consulta", style = MaterialTheme.typography.titleLarge) }, text = { Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(Spacing.sm + Spacing.xs)) {
        Row(horizontalArrangement = Arrangement.spacedBy(Spacing.lg)) { LabeledValue("Paciente", item.patientName, Modifier.weight(1f)); LabeledValue("Cita", formatDateTime(item.start), Modifier.weight(1f)) }
        error?.let { NoticeBanner(NoticeKind.ERROR, it) }
        if (signed) NoticeBanner(NoticeKind.INFO, stringResource(R.string.clin_consulta_firmada_aviso))
        FormField("Motivo de consulta", reason, { reason = it.take(2000) }, enabled = !signed, singleLine = false)
        FormField("Examen físico", physicalExam, { physicalExam = it.take(10000) }, enabled = !signed, singleLine = false)
        FormField("Plan", plan, { plan = it.take(5000) }, enabled = !signed, singleLine = false)
        if (item.consultationId != null && "signos.registrar" in permissions) {
            Text(stringResource(R.string.clin_consulta_signos), style = MaterialTheme.typography.titleSmall)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) { FormField("PA sis.", systolic, { systolic = it }, Modifier.weight(1f)); FormField("PA dia.", diastolic, { diastolic = it }, Modifier.weight(1f)) }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) { FormField("FC", heartRate, { heartRate = it }, Modifier.weight(1f)); FormField("Temp.", temperature, { temperature = it }, Modifier.weight(1f)); FormField("Sat. O₂", oxygenSaturation, { oxygenSaturation = it }, Modifier.weight(1f)) }
            SecondaryButton("Registrar signos", { model.signs(item, systolic, diastolic, heartRate, temperature, oxygenSaturation) }, enabled = !busy && listOf(systolic, diastolic, heartRate, temperature, oxygenSaturation).any { it.isNotBlank() })
        }
        if (item.consultationId != null && !signed && "consulta.registrar" in permissions) {
            Text(stringResource(R.string.clin_consulta_diagnostico), style = MaterialTheme.typography.titleSmall)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) { FormField("Código", diagnosisCode, { diagnosisCode = it.take(20) }, Modifier.weight(1f)); FormField("Nota", diagnosisNote, { diagnosisNote = it.take(2000) }, Modifier.weight(2f)) }
            Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) { androidx.compose.material3.Checkbox(diagnosisPrincipal, { diagnosisPrincipal = it }); Text("Principal") }
            SecondaryButton("Registrar diagnóstico", { model.diagnosis(item, diagnosisCode, diagnosisNote, diagnosisPrincipal) { diagnosisCode = ""; diagnosisNote = ""; diagnosisPrincipal = false } }, enabled = !busy && diagnosisCode.trim().isNotBlank())
        }
        if (item.consultationId != null && !signed && "recetas.emitir" in permissions) {
            Text(stringResource(R.string.clin_consulta_receta), style = MaterialTheme.typography.titleSmall)
            FormField("Medicamento", medication, { medication = it.take(200) })
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) { FormField("Dosis", dose, { dose = it.take(200) }, Modifier.weight(1f)); FormField("Vía", route, { route = it.take(100) }, Modifier.weight(1f)) }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) { FormField("Frecuencia", frequency, { frequency = it.take(200) }, Modifier.weight(1f)); FormField("Duración", duration, { duration = it.take(100) }, Modifier.weight(1f)) }
            FormField("Indicaciones", instructions, { instructions = it.take(1000) }, singleLine = false)
            SecondaryButton("Emitir receta", { model.prescription(item, medication, dose, route, frequency, duration, instructions) { medication = ""; dose = ""; route = ""; frequency = ""; duration = ""; instructions = "" } }, enabled = !busy && listOf(medication, dose, route, frequency, duration).all { it.trim().isNotBlank() })
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
    } }, confirmButton = { if (!signed) TextButton(onClick = { if (item.consultationId == null) model.start(item, reason) else model.save(item, reason, physicalExam, plan) }, enabled = !busy && reason.trim().isNotBlank()) { Text(if (busy) stringResource(R.string.ui_un_momento) else if (item.consultationId == null) "Iniciar consulta" else "Guardar borrador", style = MaterialTheme.typography.labelLarge) } }, dismissButton = { Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) { if (!signed && item.consultationId != null) TextButton(onClick = { model.sign(item, reason, physicalExam, plan, onClose) }, enabled = !busy && reason.trim().isNotBlank() && plan.trim().isNotBlank()) { Text("Firmar", style = MaterialTheme.typography.labelLarge) }; TextButton(onClick = onClose, enabled = !busy) { Text("Cerrar", style = MaterialTheme.typography.labelLarge) } } })
}

private fun appointmentState(value: String) = mapOf("confirmada" to "Confirmada", "atendida" to "Atendida")[value] ?: value
private fun formatDateTime(value: String) = runCatching { appointmentFormatter.format(Instant.parse(value).atZone(sanSalvador)) }.getOrDefault(value)
private fun formatTime(value: String) = runCatching { DateTimeFormatter.ofPattern("HH:mm").format(Instant.parse(value).atZone(sanSalvador)) }.getOrDefault(value)
