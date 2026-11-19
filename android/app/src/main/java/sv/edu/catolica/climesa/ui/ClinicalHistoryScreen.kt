package sv.edu.catolica.climesa.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.UploadFile
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import sv.edu.catolica.climesa.R
import sv.edu.catolica.climesa.domain.AccessProfile
import sv.edu.catolica.climesa.domain.ClinicalHistory
import sv.edu.catolica.climesa.domain.ClinicalHistoryParser
import sv.edu.catolica.climesa.domain.ClinicalRecordLab
import sv.edu.catolica.climesa.domain.ExternalRecordRules
import sv.edu.catolica.climesa.domain.HistoryConsultation
import sv.edu.catolica.climesa.domain.LaboratoryLabels
import sv.edu.catolica.climesa.domain.RecordLabDetail
import sv.edu.catolica.climesa.domain.RecordLabRow
import sv.edu.catolica.climesa.ui.icons.ClimesaIcons
import sv.edu.catolica.climesa.ui.lab.ExternalRecordDialog
import sv.edu.catolica.climesa.ui.lab.ExternalRecordViewModel

/**
 * A08 (own history, [own] = true) and A22 (clinician record). The patient needs a linked account (RN-39); the clinician
 * searches a patient with the shared [RecordPatientSearch] and the API applies the care relationship.
 */
@Composable
fun ClinicalHistoryScreen(
    profile: AccessProfile, own: Boolean, modifier: Modifier = Modifier, model: ClinicalHistoryViewModel = viewModel(),
    external: ExternalRecordViewModel = viewModel(),
) {
    val state by model.state.collectAsStateWithLifecycle()
    var query by rememberSaveable { mutableStateOf("") }
    var selectedId by rememberSaveable { mutableStateOf<String?>(null) }
    val patientId = if (own) profile.patientId else selectedId
    if (!own && selectedId == null) {
        PageList(modifier) {
            item { RecordPatientSearch(query, { query = it }, { model.search(query) }, state.searching, state.candidates, state.error) { selectedId = it.id } }
        }
        return
    }
    if (own && profile.patientId == null) {
        PageList(modifier) { item { EmptyState(stringResource(R.string.historial_sin_vinculo), icon = ClimesaIcons.Lock) } }
        return
    }
    RecordBody(profile, patientId, own, modifier, model, external, onOtherPatient = if (own) null else ({ selectedId = null }))
}

/**
 * Lote 5 S15: a patient's record opened from the module that needs it (Mi día, consultation, laboratory, hospitalization), over
 * that module, with a back arrow that returns to it. Its own view model instance, so the standalone "Expediente" keeps its patient.
 */
@Composable
internal fun PatientRecordPage(profile: AccessProfile, patientId: String, modifier: Modifier = Modifier, onClose: () -> Unit) {
    val model: ClinicalHistoryViewModel = viewModel(key = "record-embedded")
    val external: ExternalRecordViewModel = viewModel(key = "record-embedded-external")
    val state by model.state.collectAsStateWithLifecycle()
    Column(modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth().padding(end = Spacing.md), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onClose) { Icon(ClimesaIcons.Back, contentDescription = stringResource(R.string.exp5_volver)) }
            Text(state.history?.patientName?.let { "${stringResource(R.string.exp5_titulo)} · $it" } ?: stringResource(R.string.exp5_titulo), Modifier.weight(1f), style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        HorizontalDivider(color = MaterialTheme.climesa.line)
        RecordBody(profile, patientId, own = false, Modifier.weight(1f), model, external, onOtherPatient = null)
    }
}

@Composable
private fun RecordBody(profile: AccessProfile, patientId: String?, own: Boolean, modifier: Modifier, model: ClinicalHistoryViewModel, external: ExternalRecordViewModel, onOtherPatient: (() -> Unit)?) {
    val state by model.state.collectAsStateWithLifecycle()
    val externalState by external.state.collectAsStateWithLifecycle()
    // Master-detail: the exam open in detail; back returns to the list.
    var labOrder by rememberSaveable(patientId) { mutableStateOf<String?>(null) }
    LaunchedEffect(patientId) { external.dismissNotice(); if (patientId != null) model.open(patientId) else model.close() }
    LaunchedEffect(profile.channels) { model.startLive(profile.channels) }
    // D4: a recorded external result shows up in the laboratory list right away.
    LaunchedEffect(externalState.saved) { if (externalState.saved > 0) patientId?.let { model.open(it, silent = true) } }
    // S4: offered only when the history's `allowedActions` says the API would accept it (older API: by permission).
    val canRecordExternal = !own && ExternalRecordRules.canOffer(profile.permissions, state.history?.allowedActions)
    if (canRecordExternal && patientId != null) state.history?.let { ExternalRecordDialog(it.patientName, externalState, external) }
    val detail = labOrder?.let { id -> state.history?.let { ClinicalRecordLab.detail(it, id) } }
    if (detail != null) {
        BackHandler { labOrder = null }
        PageList(modifier) { labDetailItems(detail, own) { labOrder = null } }
        return
    }
    PageList(modifier) {
        onOtherPatient?.let { item { SecondaryButton(stringResource(R.string.historial_otro_paciente), it, icon = ClimesaIcons.Search) } }
        if (state.loading && state.history == null) item { LoadingState() }
        else if (state.error != null && state.history == null) item { ErrorState(state.error, { model.open(patientId) }) }
        else state.history?.let { history ->
            if (state.loading) item { RefreshHint() }
            item { SectionCard(history.patientName, eyebrow = stringResource(R.string.historial_expediente, history.record)) {
                if (canRecordExternal) SecondaryButton(stringResource(R.string.extres_titulo), { patientId?.let(external::open) }, icon = Icons.Outlined.UploadFile)
            } }
            externalState.notice?.let { item { NoticeBanner(NoticeKind.SUCCESS, it) } }
            externalState.uploadFailure?.let { item { NoticeBanner(NoticeKind.WARNING, it) } }
            recordItems(history, own) { labOrder = it }
        }
    }
}

/** The record's sections: exams first as a master list (S15), then consultations and admissions. */
private fun LazyListScope.recordItems(history: ClinicalHistory, own: Boolean, onOpenLab: (String) -> Unit) {
    val labRows = ClinicalRecordLab.rows(history)
    item { RecordSectionTitle(stringResource(R.string.exp5_examenes_cuenta, labRows.size)) }
    if (labRows.isEmpty()) item { EmptyState(stringResource(R.string.historial_sin_ordenes)) }
    else items(labRows, key = { "lab-${it.orderId}" }) { row -> LabMasterRow(row) { onOpenLab(row.orderId) } }
    item { RecordSectionTitle(stringResource(R.string.exp5_consultas_cuenta, history.consultations.size)) }
    if (history.consultations.isEmpty()) item { EmptyState(stringResource(R.string.historial_sin_consultas)) }
    else items(history.consultations, key = { it.id }) { ConsultationHistoryCard(it) }
    if (!own && history.admissions.isNotEmpty()) {
        item { RecordSectionTitle(stringResource(R.string.historial_hospitalizaciones)) }
        items(history.admissions, key = { it.id }) { admission -> DataRow(admission.doctor, subtitle = ClinicalHistoryParser.label(admission.date), leadingIcon = ClimesaIcons.Bed, status = { StatusTag(admission.state) }) }
    }
}

@Composable
private fun RecordSectionTitle(text: String) = Text(text, Modifier.padding(top = Spacing.sm).semantics { heading() }, style = MaterialTheme.typography.titleLarge)

/** Master row: what was ordered, when, its state and the result summary in words; tapping opens the detail. */
@Composable
private fun LabMasterRow(row: RecordLabRow, onOpen: () -> Unit) {
    val tone = when {
        row.state == "cancelado" -> StripTone.Neutral
        row.critical > 0 -> StripTone.Danger
        row.outOfRange > 0 -> StripTone.Warning
        row.pending > 0 -> StripTone.Info
        else -> StripTone.Success
    }
    ActionCard(
        actions = listOf(CardAction(stringResource(R.string.exp5_ver_detalle), ActionRole.Neutral, onOpen, icon = ClimesaIcons.Chevron)),
        onClick = onOpen,
        status = { CardStatusStrip(LaboratoryLabels.state(row.state), tone, icon = ClimesaIcons.Flask, detail = ClinicalRecordLab.summary(row)) },
    ) {
        Text(row.exams, style = MaterialTheme.typography.titleMedium, maxLines = 3, overflow = TextOverflow.Ellipsis)
        row.orderedOn?.let { Text(stringResource(R.string.exp5_examen_pedido, ClinicalHistoryParser.label(it)), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
    }
}

/** Detail of one exam order: why it was ordered (consultation, reason, diagnoses, doctor) and every result with its flag. */
private fun LazyListScope.labDetailItems(detail: RecordLabDetail, own: Boolean, onBack: () -> Unit) {
    item { RowAction(stringResource(R.string.exp5_volver), onBack) }
    item {
        SectionCard(detail.row.exams, eyebrow = stringResource(R.string.exp5_detalle_titulo), action = { StatusTag(detail.order.state) }) {
            detail.row.orderedOn?.let { Text(stringResource(R.string.exp5_examen_pedido, ClinicalHistoryParser.label(it)), style = MaterialTheme.typography.bodyMedium) }
            detail.completedOn?.let { Text(stringResource(R.string.exp5_completado, ClinicalHistoryParser.label(it)), style = MaterialTheme.typography.bodyMedium) }
            Text(stringResource(if (detail.order.reviewed) R.string.exp5_revisado else R.string.exp5_sin_revisar), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
    item {
        SectionCard(stringResource(R.string.exp5_por_que)) {
            val origin = detail.origin
            if (origin == null) Text(stringResource(R.string.exp5_origen_sin_consulta), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            else {
                Text(stringResource(R.string.exp5_origen_consulta, ClinicalHistoryParser.label(origin.date)), style = MaterialTheme.typography.titleSmall)
                if (origin.doctor.isNotBlank()) Text(stringResource(R.string.exp5_origen_medico, origin.doctor), style = MaterialTheme.typography.bodyMedium)
                if (origin.reason.isNotBlank()) Text(stringResource(R.string.exp5_origen_motivo, origin.reason), style = MaterialTheme.typography.bodyMedium)
                Text(stringResource(R.string.exp5_origen_diagnosticos), style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
                if (origin.diagnoses.isEmpty()) Text(stringResource(R.string.historial_sin_diagnosticos), style = MaterialTheme.typography.bodySmall)
                origin.diagnoses.forEach { Text("${it.code} · ${it.description}${if (it.principal) " · " + stringResource(R.string.historial_principal) else ""}", style = MaterialTheme.typography.bodyMedium) }
            }
        }
    }
    item {
        SectionCard(stringResource(R.string.exp5_resultados)) {
            detail.order.items.forEachIndexed { index, item ->
                if (index > 0) HorizontalDivider(color = MaterialTheme.climesa.line)
                LabResultRow(item, showRange = !own, pendingText = stringResource(R.string.historial_valor_oculto))
            }
        }
    }
}

@Composable
private fun ConsultationHistoryCard(consultation: HistoryConsultation) {
    SectionCard(
        title = consultation.reason.ifBlank { stringResource(R.string.historial_sin_motivo) },
        eyebrow = "${ClinicalHistoryParser.label(consultation.date)} · ${consultation.doctor}",
        action = { StatusTag(consultation.state) },
    ) {
        if (consultation.state != "firmada") NoticeBanner(NoticeKind.WARNING, stringResource(if (consultation.state == "abierta") R.string.historial_borrador else R.string.historial_por_error))
        if (consultation.plan.isNotBlank()) Text(stringResource(R.string.historial_plan, consultation.plan), style = MaterialTheme.typography.bodyMedium)
        HorizontalDivider(color = MaterialTheme.climesa.line)
        Text(stringResource(R.string.historial_diagnosticos), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        if (consultation.diagnoses.isEmpty()) Text(stringResource(R.string.historial_sin_diagnosticos), style = MaterialTheme.typography.bodySmall)
        consultation.diagnoses.forEach { Text("${it.code} · ${it.description}${if (it.principal) " · " + stringResource(R.string.historial_principal) else ""}", style = MaterialTheme.typography.bodyMedium) }
        Text(stringResource(R.string.historial_recetas), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        if (consultation.prescriptions.isEmpty()) Text(stringResource(R.string.historial_sin_recetas), style = MaterialTheme.typography.bodySmall)
        consultation.prescriptions.forEach { Text("${it.medication} · ${it.dose} · ${it.route} · ${it.frequency} · ${it.duration}", style = MaterialTheme.typography.bodyMedium) }
    }
}
