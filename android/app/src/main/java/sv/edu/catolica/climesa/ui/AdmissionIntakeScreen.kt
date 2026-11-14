@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class, androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
package sv.edu.catolica.climesa.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Bed
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.Checkbox
import androidx.compose.material3.FilterChip
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import sv.edu.catolica.climesa.R
import sv.edu.catolica.climesa.domain.AdmissionDraft
import sv.edu.catolica.climesa.domain.AdmissionIntake
import sv.edu.catolica.climesa.domain.IntakeBed
import sv.edu.catolica.climesa.domain.IntakeDoctor
import sv.edu.catolica.climesa.domain.IsolationType
import sv.edu.catolica.climesa.domain.OriginKind
import sv.edu.catolica.climesa.domain.OriginRecord
import sv.edu.catolica.climesa.domain.PickerPatient

/** A34: eight-step guided admission. Replaces the list while it is open, like the reception scheduling form. */
@Composable
fun AdmissionIntakeScreen(canAssignBed: Boolean, modifier: Modifier = Modifier, model: AdmissionIntakeViewModel = viewModel()) {
    val state by model.state.collectAsStateWithLifecycle()
    val draft = state.draft
    val step = state.step
    val problem = AdmissionIntake.stepError(step, draft, canAssignBed, state.feasibility?.feasible == true)
    PageList(modifier) {
        item { SectionIntro(stringResource(R.string.ing_eyebrow), stringResource(R.string.ing_titulo), stringResource(R.string.ing_paso, step + 1, AdmissionIntake.STEP_TITLES.size, AdmissionIntake.STEP_TITLES[step])) }
        item { LinearProgressIndicator(progress = { (step + 1f) / AdmissionIntake.STEP_TITLES.size }, modifier = Modifier.fillMaxWidth()) }
        state.error?.let { item { NoticeBanner(NoticeKind.ERROR, it) } }
        if (state.loading) item { LoadingState() }
        item {
            when (step) {
                0 -> PatientStep(state, model)
                1 -> OriginStep(state, model)
                2 -> DoctorStep(state, model)
                3 -> CategoryStep(state, model)
                4 -> RequirementsStep(draft, model)
                5 -> BedStep(state, canAssignBed, model)
                6 -> VisitorsStep(draft, model)
                else -> SummaryStep(state, canAssignBed)
            }
        }
        if (problem != null && !state.loading) item { Text(problem, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error) }
        item {
            if (step == AdmissionIntake.LAST_STEP) PrimaryButton(stringResource(R.string.ing_confirmar), { model.confirm(canAssignBed) }, icon = Icons.Default.Check, enabled = problem == null, loading = state.busy)
            else PrimaryButton(stringResource(R.string.ing_siguiente), { model.next(canAssignBed) }, enabled = problem == null && !state.loading)
        }
        item { if (step > 0) SecondaryButton(stringResource(R.string.ing_atras), { model.back(canAssignBed) }, enabled = !state.busy) }
        item { SecondaryButton(stringResource(R.string.ing_cancelar), model::close, icon = Icons.Default.Close, enabled = !state.busy) }
    }
}

@Composable private fun PatientStep(state: AdmissionIntakeState, model: AdmissionIntakeViewModel) = SectionCard(stringResource(R.string.ing_paciente_buscar)) {
    val chosen = state.draft.patient
    if (chosen != null) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Column(Modifier.weight(1f)) { Text(chosen.name, style = MaterialTheme.typography.titleMedium); Text(chosen.detail, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
            TextButton(onClick = { model.pickPatient(null) }) { Text(stringResource(R.string.ing_paciente_cambiar)) }
        }
    } else {
        FormField(stringResource(R.string.ing_paciente_buscar), state.query, model::query, hint = stringResource(R.string.ing_paciente_ayuda))
        if (state.searching && state.results.isEmpty()) LoadingState()
        state.results.forEach { p -> PatientResult(p) { model.pickPatient(p) } }
        if (state.hasMore) TextButton(onClick = model::moreResults, enabled = !state.searching) { Text(stringResource(R.string.ing_paciente_mas)) }
        if (!state.searching && state.results.isEmpty() && sv.edu.catolica.climesa.domain.ReceptionScheduling.canSearch(state.query)) Text(stringResource(R.string.ing_paciente_sin_resultados), style = MaterialTheme.typography.bodySmall)
    }
}
@Composable private fun PatientResult(p: PickerPatient, pick: () -> Unit) {
    TextButton(onClick = pick, modifier = Modifier.fillMaxWidth()) { Column(Modifier.fillMaxWidth()) { Text(p.name, style = MaterialTheme.typography.titleSmall); Text(p.detail, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) } }
}

@Composable private fun OriginStep(state: AdmissionIntakeState, model: AdmissionIntakeViewModel) = Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
    val draft = state.draft
    SectionCard(stringResource(R.string.ing_origen)) {
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            OriginKind.entries.forEach { kind ->
                val count = state.origins.count { it.origin == kind }
                FilterChip(selected = draft.origin == kind, onClick = { model.pickOrigin(kind) }, enabled = count > 0, label = { Text("${kind.label} · ${if (count == 0) stringResource(R.string.ing_origen_sin_registros) else count}") })
            }
        }
        if (!state.loading && state.origins.isEmpty()) Text(stringResource(R.string.ing_origen_vacio), style = MaterialTheme.typography.bodySmall)
    }
    draft.origin?.let { kind ->
        SectionCard(stringResource(R.string.ing_origen_registro)) { state.origins.filter { it.origin == kind }.forEach { RecordRow(it, draft.originRecord?.id == it.id) { model.pickRecord(it) } } }
    }
    FormField(stringResource(R.string.ing_motivo), draft.motive, model::motive, hint = stringResource(R.string.ing_motivo_ayuda), singleLine = false)
}
@Composable private fun RecordRow(record: OriginRecord, selected: Boolean, pick: () -> Unit) =
    DataRow(record.label, subtitle = record.detail, leadingIcon = if (selected) Icons.Default.Check else null, onClick = pick)

@Composable private fun DoctorStep(state: AdmissionIntakeState, model: AdmissionIntakeViewModel) = Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
    val draft = state.draft
    FormField(stringResource(R.string.ing_fecha), draft.at, model::at, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number))
    TextButton(onClick = { model.at(AdmissionIntake.nowLocal()) }) { Text(stringResource(R.string.ing_fecha_ahora)) }
    SectionCard(stringResource(R.string.ing_medico)) {
        Text(stringResource(R.string.ing_medico_ayuda), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        state.doctors.forEach { DoctorRow(it, draft.doctor?.id == it.id) { model.pickDoctor(it) } }
    }
}
@Composable private fun DoctorRow(d: IntakeDoctor, selected: Boolean, pick: () -> Unit) {
    TextButton(onClick = pick, enabled = d.available, modifier = Modifier.fillMaxWidth()) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Column(Modifier.weight(1f)) { Text(d.name, style = MaterialTheme.typography.titleSmall); Text(d.specialty ?: "Medicina general", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
            if (!d.available) StatusPill(d.reason ?: stringResource(R.string.ing_medico_sin_turno), StatusTone.BLOCKED) else if (selected) StatusPill("Elegido", StatusTone.SUCCESS)
        }
    }
}

@Composable private fun CategoryStep(state: AdmissionIntakeState, model: AdmissionIntakeViewModel) = SectionCard(stringResource(R.string.ing_resumen_categoria)) {
    Text(stringResource(R.string.ing_categoria_ayuda), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    state.bedMap?.categories?.forEach { item ->
        FilterChip(
            selected = state.draft.category == item.category, onClick = { model.pickCategory(item.category) }, enabled = item.selectable, modifier = Modifier.fillMaxWidth(),
            label = { Text("${AdmissionIntake.CATEGORY_LABELS[item.category] ?: item.category} · " + if (item.selectable) stringResource(R.string.ing_categoria_conteo, item.free, item.compatible) else stringResource(R.string.ing_categoria_sin_camas)) },
        )
    }
}

@Composable private fun RequirementsStep(draft: AdmissionDraft, model: AdmissionIntakeViewModel) = SectionCard(stringResource(R.string.ing_aislamiento)) {
    CheckLine(stringResource(R.string.ing_aislamiento), draft.isolation, model::isolation)
    if (draft.isolation) {
        Text(stringResource(R.string.ing_aislamiento_tipo), style = MaterialTheme.typography.labelLarge)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            IsolationType.entries.forEach { type -> FilterChip(selected = draft.isolationType == type, onClick = { model.isolationType(if (draft.isolationType == type) null else type) }, label = { Text(type.label) }) }
        }
    }
    CheckLine(stringResource(R.string.ing_inestable), draft.unstable, model::unstable)
    CheckLine(stringResource(R.string.ing_postquirurgico), draft.postSurgical, model::postSurgical)
}
@Composable private fun CheckLine(label: String, checked: Boolean, onChange: (Boolean) -> Unit) =
    Row(verticalAlignment = Alignment.CenterVertically) { Checkbox(checked, onChange); Text(label, style = MaterialTheme.typography.bodyMedium) }

@Composable private fun BedStep(state: AdmissionIntakeState, canAssignBed: Boolean, model: AdmissionIntakeViewModel) {
    val draft = state.draft
    when {
        !canAssignBed -> NoticeBanner(NoticeKind.INFO, stringResource(R.string.ing_cama_sin_permiso))
        !AdmissionIntake.isImmediate(draft.at) -> NoticeBanner(NoticeKind.INFO, stringResource(R.string.ing_cama_futuro))
        else -> Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(stringResource(R.string.ing_cama_ayuda), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            val beds = state.bedMap?.beds.orEmpty().filter { it.category == draft.category }
            if (!state.loading && beds.none { it.compatible }) NoticeBanner(NoticeKind.ERROR, stringResource(R.string.ing_cama_sin_compatibles))
            AdmissionIntake.floors(beds).forEach { floor ->
                SectionCard(if (floor.floor == null) stringResource(R.string.ing_cama_sin_planta) else stringResource(R.string.ing_cama_planta, floor.floor)) {
                    floor.rooms.forEach { room ->
                        Text(stringResource(R.string.ing_cama_habitacion, room.name, room.capacity), style = MaterialTheme.typography.titleSmall)
                        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) { room.beds.forEach { BedChip(it, draft.bed?.id == it.id) { model.pickBed(it) } } }
                    }
                }
            }
        }
    }
}
@Composable private fun BedChip(bed: IntakeBed, selected: Boolean, pick: () -> Unit) {
    val note = if (bed.compatible) (if (bed.suggested) stringResource(R.string.ing_cama_sugerida) else null) else bed.reason
    FilterChip(selected = selected, onClick = pick, enabled = bed.compatible, label = { Text(bed.code + (note?.let { " · $it" } ?: "")) }, leadingIcon = { androidx.compose.material3.Icon(Icons.Default.Bed, null) })
}

@Composable private fun VisitorsStep(draft: AdmissionDraft, model: AdmissionIntakeViewModel) = SectionCard(stringResource(R.string.ing_resumen_visitas)) {
    Text(stringResource(R.string.ing_visitas_ayuda), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    CheckLine(stringResource(R.string.ing_visitas_permitidas), draft.visitorsAllowed, model::visitorsAllowed)
    if (draft.visitorsAllowed) FormField(stringResource(R.string.ing_visitas_numero), draft.visitorsMax.toString(), { model.visitorsMax(it.toIntOrNull() ?: 0) }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number))
}

@Composable private fun SummaryStep(state: AdmissionIntakeState, canAssignBed: Boolean) = Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
    val d = state.draft
    SectionCard(stringResource(R.string.ing_titulo)) {
        LabeledValue(stringResource(R.string.ing_resumen_paciente), d.patient?.name.orEmpty())
        LabeledValue(stringResource(R.string.ing_resumen_origen), "${d.origin?.label.orEmpty()} · ${d.originRecord?.label.orEmpty()}")
        LabeledValue(stringResource(R.string.ing_resumen_motivo), d.motive.trim())
        LabeledValue(stringResource(R.string.ing_resumen_medico), "${d.at} · ${d.doctor?.name.orEmpty()}")
        LabeledValue(stringResource(R.string.ing_resumen_categoria), AdmissionIntake.CATEGORY_LABELS[d.category] ?: d.category.orEmpty())
        val needs = listOfNotNull(if (d.isolation) "Aislamiento" + (d.isolationType?.let { " ${it.label.lowercase()}" } ?: "") else null, if (d.unstable) "Inestable" else null, if (d.postSurgical) "Posquirúrgico" else null)
        LabeledValue(stringResource(R.string.ing_resumen_requisitos), if (needs.isEmpty()) stringResource(R.string.ing_resumen_ninguno) else needs.joinToString(" · "))
        val bed = if (canAssignBed && AdmissionIntake.isImmediate(d.at) && d.bed != null) "${d.bed.code} · ${d.bed.room}" else stringResource(R.string.ing_resumen_pendiente_cama)
        LabeledValue(stringResource(R.string.ing_resumen_cama), bed)
        LabeledValue(stringResource(R.string.ing_resumen_visitas), if (d.visitorsAllowed) stringResource(R.string.ing_resumen_hasta, d.visitorsMax) else stringResource(R.string.ing_resumen_sin_visitas))
    }
    SectionCard(stringResource(R.string.ing_factibilidad)) {
        state.feasibility?.checks?.forEach { check -> Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) { StatusPill(if (check.ok) "OK" else "Revisar", if (check.ok) StatusTone.SUCCESS else StatusTone.BLOCKED); Text(check.message, style = MaterialTheme.typography.bodySmall, modifier = Modifier.weight(1f)) } }
    }
}
