package sv.edu.catolica.climesa.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Bed
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
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
import sv.edu.catolica.climesa.R
import sv.edu.catolica.climesa.domain.AccessProfile
import sv.edu.catolica.climesa.domain.HistoryConsultation
import sv.edu.catolica.climesa.domain.LaboratoryLabels
import sv.edu.catolica.climesa.domain.LaboratoryOrder

/**
 * A08 (own history, [own] = true) and A22 (clinician record). The patient needs a linked account (RN-39); the clinician
 * searches a patient and the API applies the care relationship or exceptional access.
 */
@Composable
fun ClinicalHistoryScreen(profile: AccessProfile, own: Boolean, modifier: Modifier = Modifier, model: ClinicalHistoryViewModel = viewModel()) {
    val state by model.state.collectAsStateWithLifecycle()
    var query by rememberSaveable { mutableStateOf("") }
    var selectedId by rememberSaveable { mutableStateOf<String?>(null) }
    val patientId = if (own) profile.patientId else selectedId
    LaunchedEffect(patientId) { if (patientId != null) model.open(patientId) else model.close() }
    LaunchedEffect(profile.channels) { model.startLive(profile.channels) }
    PageList(modifier) {
        item { SectionIntro(stringResource(R.string.historial_eyebrow), stringResource(if (own) R.string.historial_titulo_propio else R.string.historial_titulo_expediente), stringResource(if (own) R.string.historial_detalle_propio else R.string.historial_detalle_expediente)) }
        if (own && profile.patientId == null) {
            item { EmptyState(stringResource(R.string.historial_sin_vinculo), icon = Icons.Default.Lock) }
            return@PageList
        }
        if (!own && selectedId == null) {
            item { SectionCard(stringResource(R.string.historial_buscar_boton)) {
                FormField(stringResource(R.string.historial_buscar), query, { query = it.take(100) })
                PrimaryButton(stringResource(R.string.historial_buscar_boton), { model.search(query) }, icon = Icons.Default.Search, enabled = query.trim().length >= 2, loading = state.searching)
            } }
            state.error?.let { item { NoticeBanner(NoticeKind.ERROR, it) } }
            if (state.candidates.isNotEmpty()) item { Text(stringResource(R.string.clin_historial_buscar_resultados), style = MaterialTheme.typography.titleLarge) }
            items(state.candidates, key = { it.id }) { candidate ->
                DataRow(candidate.fullName, meta = stringResource(R.string.historial_expediente, candidate.record), leadingIcon = Icons.Default.Person, onClick = { selectedId = candidate.id })
            }
            return@PageList
        }
        if (!own) item { SecondaryButton(stringResource(R.string.historial_otro_paciente), { selectedId = null }, icon = Icons.Default.Search) }
        if (state.loading && state.history == null) item { LoadingState() }
        else if (state.error != null && state.history == null) item { ErrorState(state.error, { model.open(patientId) }) }
        else state.history?.let { history ->
            if (state.loading) item { RefreshHint() }
            item { SectionCard(history.patientName, eyebrow = stringResource(R.string.historial_expediente, history.record)) {
                if (history.access == "acceso_excepcional") NoticeBanner(NoticeKind.WARNING, stringResource(R.string.historial_acceso_excepcional))
            } }
            item { Text(stringResource(R.string.historial_consultas), style = MaterialTheme.typography.titleLarge) }
            if (history.consultations.isEmpty()) item { EmptyState(stringResource(R.string.historial_sin_consultas)) }
            else items(history.consultations, key = { it.id }) { ConsultationHistoryCard(it) }
            item { Text(stringResource(R.string.historial_laboratorio), style = MaterialTheme.typography.titleLarge) }
            if (history.laboratory.isEmpty()) item { EmptyState(stringResource(R.string.historial_sin_ordenes)) }
            else items(history.laboratory, key = { it.id }) { OrderHistoryCard(it) }
            if (!own && history.admissions.isNotEmpty()) {
                item { Text(stringResource(R.string.historial_hospitalizaciones), style = MaterialTheme.typography.titleLarge) }
                items(history.admissions, key = { it.id }) { admission -> DataRow(admission.doctor, subtitle = admission.date, leadingIcon = Icons.Default.Bed, status = { StatusTag(admission.state) }) }
            }
        }
    }
}

@Composable
private fun ConsultationHistoryCard(consultation: HistoryConsultation) {
    SectionCard(
        title = consultation.reason.ifBlank { stringResource(R.string.historial_sin_motivo) },
        eyebrow = "${consultation.date} · ${consultation.doctor}",
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

@Composable
private fun OrderHistoryCard(order: LaboratoryOrder) {
    SectionCard(title = stringResource(R.string.historial_laboratorio), action = { StatusTag(order.state) }) {
        order.items.forEach { item ->
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Spacing.sm), verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                Text("${item.code} · ${item.name}", Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
                val result = item.result
                if (result != null) LabMarkTag(result.mark, "${result.text ?: result.value?.toString().orEmpty()} · ${LaboratoryLabels.mark(result.mark)}")
                else Text(stringResource(R.string.historial_valor_oculto), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}
