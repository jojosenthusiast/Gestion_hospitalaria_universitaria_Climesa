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
    LazyColumn(modifier, contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        item { SectionIntro(stringResource(R.string.historial_eyebrow), stringResource(if (own) R.string.historial_titulo_propio else R.string.historial_titulo_expediente), stringResource(if (own) R.string.historial_detalle_propio else R.string.historial_detalle_expediente)) }
        if (own && profile.patientId == null) {
            item { ClimesaCard { Text(stringResource(R.string.historial_sin_vinculo), Modifier.padding(18.dp)) } }
            return@LazyColumn
        }
        if (!own && selectedId == null) {
            item { ClimesaActionGroup {
                OutlinedTextField(query, { query = it.take(100) }, label = { Text(stringResource(R.string.historial_buscar)) }, modifier = Modifier.fillMaxWidth(), singleLine = true)
                ClimesaButton(stringResource(R.string.historial_buscar_boton), Icons.Default.Search, { model.search(query) }, enabled = query.trim().length >= 2 && !state.searching)
            } }
            if (state.searching) item { CircularProgressIndicator() }
            state.error?.let { item { Text(it, color = MaterialTheme.colorScheme.error) } }
            items(state.candidates, key = { it.id }) { candidate -> ClimesaClickableCard(onClick = { selectedId = candidate.id }) {
                Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(candidate.fullName, style = MaterialTheme.typography.titleMedium)
                    Text(stringResource(R.string.historial_expediente, candidate.record), style = MaterialTheme.typography.labelSmall)
                }
            } }
            return@LazyColumn
        }
        if (!own) item { ClimesaButton(stringResource(R.string.historial_otro_paciente), Icons.Default.Search, { selectedId = null }, outlined = true) }
        if (state.loading && state.history == null) item { CircularProgressIndicator() }
        else if (state.error != null && state.history == null) item { ClimesaActionGroup {
            Text(state.error!!, color = MaterialTheme.colorScheme.error)
            ClimesaButton(stringResource(R.string.camas_reintentar), Icons.Default.Refresh, { model.open(patientId) }, outlined = true)
        } }
        else state.history?.let { history ->
            item { Text("${history.patientName} · ${stringResource(R.string.historial_expediente, history.record)}", style = MaterialTheme.typography.titleMedium) }
            if (history.access == "acceso_excepcional") item { Text(stringResource(R.string.historial_acceso_excepcional), color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.bodySmall) }
            item { Text(stringResource(R.string.historial_consultas), style = MaterialTheme.typography.titleLarge) }
            if (history.consultations.isEmpty()) item { ClimesaCard { Text(stringResource(R.string.historial_sin_consultas), Modifier.padding(18.dp)) } }
            else items(history.consultations, key = { it.id }) { ConsultationHistoryCard(it) }
            item { Text(stringResource(R.string.historial_laboratorio), style = MaterialTheme.typography.titleLarge) }
            if (history.laboratory.isEmpty()) item { ClimesaCard { Text(stringResource(R.string.historial_sin_ordenes), Modifier.padding(18.dp)) } }
            else items(history.laboratory, key = { it.id }) { OrderHistoryCard(it) }
            if (!own && history.admissions.isNotEmpty()) {
                item { Text(stringResource(R.string.historial_hospitalizaciones), style = MaterialTheme.typography.titleLarge) }
                items(history.admissions, key = { it.id }) { admission -> ClimesaCard { Text("${admission.date} · ${admission.doctor} · ${admission.state.replace('_', ' ')}", Modifier.padding(18.dp)) } }
            }
        }
    }
}

@Composable
private fun ConsultationHistoryCard(consultation: HistoryConsultation) {
    ClimesaCard { Column(Modifier.fillMaxWidth().padding(18.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(consultation.reason.ifBlank { stringResource(R.string.historial_sin_motivo) }, style = MaterialTheme.typography.titleMedium)
        Text("${consultation.date} · ${consultation.doctor}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
        if (consultation.state != "firmada") Text(stringResource(if (consultation.state == "abierta") R.string.historial_borrador else R.string.historial_por_error), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.error)
        if (consultation.plan.isNotBlank()) Text(stringResource(R.string.historial_plan, consultation.plan), style = MaterialTheme.typography.bodyMedium)
        HorizontalDivider()
        Text(stringResource(R.string.historial_diagnosticos), style = MaterialTheme.typography.labelSmall)
        if (consultation.diagnoses.isEmpty()) Text(stringResource(R.string.historial_sin_diagnosticos), style = MaterialTheme.typography.bodySmall)
        consultation.diagnoses.forEach { Text("${it.code} · ${it.description}${if (it.principal) " · " + stringResource(R.string.historial_principal) else ""}", style = MaterialTheme.typography.bodyMedium) }
        Text(stringResource(R.string.historial_recetas), style = MaterialTheme.typography.labelSmall)
        if (consultation.prescriptions.isEmpty()) Text(stringResource(R.string.historial_sin_recetas), style = MaterialTheme.typography.bodySmall)
        consultation.prescriptions.forEach { Text("${it.medication} · ${it.dose} · ${it.route} · ${it.frequency} · ${it.duration}", style = MaterialTheme.typography.bodyMedium) }
    } }
}

@Composable
private fun OrderHistoryCard(order: LaboratoryOrder) {
    ClimesaCard { Column(Modifier.fillMaxWidth().padding(18.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(LaboratoryLabels.state(order.state), color = MaterialTheme.colorScheme.primary)
        order.items.forEach { item -> Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("${item.code} · ${item.name}", Modifier.weight(1f))
            Text(item.result?.let { r -> "${r.text ?: r.value?.toString().orEmpty()} · ${LaboratoryLabels.mark(r.mark)}" } ?: stringResource(R.string.historial_valor_oculto), style = MaterialTheme.typography.bodySmall)
        } }
    } }
}
