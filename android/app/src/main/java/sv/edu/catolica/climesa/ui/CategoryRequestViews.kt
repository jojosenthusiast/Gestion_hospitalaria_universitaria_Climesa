@file:OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
package sv.edu.catolica.climesa.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccessibilityNew
import androidx.compose.material.icons.filled.Air
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.ChildCare
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Face
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.Healing
import androidx.compose.material.icons.filled.Hearing
import androidx.compose.material.icons.filled.LocalHospital
import androidx.compose.material.icons.filled.MedicalServices
import androidx.compose.material.icons.filled.Memory
import androidx.compose.material.icons.filled.PregnantWoman
import androidx.compose.material.icons.filled.Psychology
import androidx.compose.material.icons.filled.Restaurant
import androidx.compose.material.icons.filled.Send
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.WaterDrop
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import sv.edu.catolica.climesa.R
import sv.edu.catolica.climesa.domain.AppointmentAgenda
import sv.edu.catolica.climesa.domain.AppointmentDoctor
import sv.edu.catolica.climesa.domain.CategoryRequest
import sv.edu.catolica.climesa.domain.CategoryRequestRules
import sv.edu.catolica.climesa.domain.RequestFranja
import sv.edu.catolica.climesa.domain.matchesQuery

/** Stable icon keys of `atencion.categoria_cita.icono` mapped to Material icons; unknown keys fall back to a generic one. */
internal fun categoryIcon(key: String): ImageVector = when (key) {
    "general" -> Icons.Default.LocalHospital
    "nino" -> Icons.Default.ChildCare
    "mujer" -> Icons.Default.PregnantWoman
    "corazon" -> Icons.Default.Favorite
    "hueso" -> Icons.Default.AccessibilityNew
    "piel" -> Icons.Default.Face
    "ojo" -> Icons.Default.Visibility
    "oido" -> Icons.Default.Hearing
    "mente" -> Icons.Default.Psychology
    "neuro" -> Icons.Default.Memory
    "digestivo" -> Icons.Default.Restaurant
    "rinon" -> Icons.Default.WaterDrop
    "alergia" -> Icons.Default.Air
    "cirugia" -> Icons.Default.Healing
    else -> Icons.Default.MedicalServices
}

@Composable
private fun requestStateTag(state: String) = when (state) {
    "pendiente" -> StatusPill(stringResource(R.string.cat_estado_pendiente), StatusTone.WARNING)
    "asignada" -> StatusPill(stringResource(R.string.cat_estado_asignada), StatusTone.SUCCESS)
    "rechazada" -> StatusPill(stringResource(R.string.cat_estado_rechazada), StatusTone.DANGER)
    else -> StatusPill(stringResource(R.string.cat_estado_cancelada), StatusTone.NEUTRAL)
}

/** A06 Android: the patient asks by reason (one to three categories with icon and search), time of day and note; the doctor is optional. */
@Composable
internal fun CategoryRequestForm(state: CategoryRequestsState, model: CategoryRequestsViewModel, doctors: List<AppointmentDoctor>, modifier: Modifier = Modifier) {
    var doctorOpen by rememberSaveable { mutableStateOf(state.preferredDoctorId != null) }
    var doctorQuery by rememberSaveable { mutableStateOf("") }
    PageList(modifier) {
        item { SectionIntro("Paciente / Atención", stringResource(R.string.cat_pedir_cita), stringResource(R.string.cat_form_detalle)) }
        state.error?.let { item { NoticeBanner(NoticeKind.ERROR, it) } }
        item {
            SectionCard(stringResource(R.string.cat_motivo_titulo)) {
                Text(stringResource(R.string.cat_motivo_ayuda, state.picked.size), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                LiveSearchField(state.query, model::search, stringResource(R.string.cat_buscar))
                val visible = state.visibleCategories
                if (visible.isEmpty()) Text(stringResource(R.string.cat_sin_coincidencias), style = MaterialTheme.typography.bodySmall)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                    visible.forEach { category ->
                        val selected = category.code in state.picked
                        val full = !selected && state.picked.size >= CategoryRequestRules.MAX_CATEGORIES
                        FilterChip(
                            selected = selected, onClick = { model.toggle(category.code) }, enabled = !full,
                            label = { Text(category.name) },
                            leadingIcon = { Icon(if (selected) Icons.Default.Check else categoryIcon(category.icon), contentDescription = null, modifier = Modifier.size(FilterChipDefaults.IconSize)) },
                            modifier = Modifier.semantics { contentDescription = "${category.name}: ${category.description}" },
                        )
                    }
                }
            }
        }
        item {
            SectionCard(stringResource(R.string.cat_franja)) {
                ChipRow(RequestFranja.entries.map { Triple(it, it.label, null) }, state.franja, model::franja)
            }
        }
        item { FormField(stringResource(R.string.cat_nota), state.note, model::note, singleLine = false, hint = stringResource(R.string.cat_nota_contador, state.note.length)) }
        item {
            SectionCard(stringResource(R.string.cat_ya_tengo_medico)) {
                val chosen = doctors.firstOrNull { it.id == state.preferredDoctorId }
                when {
                    chosen != null -> Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) { Text(chosen.name, style = MaterialTheme.typography.titleSmall); chosen.specialty?.let { Text(it, style = MaterialTheme.typography.bodySmall) } }
                        TextButton(onClick = { model.preferredDoctor(null) }) { Text(stringResource(R.string.cat_medico_quitar)) }
                    }
                    !doctorOpen -> TextButton(onClick = { doctorOpen = true }) { Text(stringResource(R.string.cat_ya_tengo_medico)) }
                    else -> {
                        LiveSearchField(doctorQuery, { doctorQuery = it.take(80) }, stringResource(R.string.cat_medico_preferido))
                        if (doctorQuery.isNotBlank()) doctors.filter { matchesQuery(doctorQuery, it.name, it.specialty) }.take(6).forEach { d ->
                            TextButton(onClick = { model.preferredDoctor(d.id); doctorQuery = "" }, modifier = Modifier.fillMaxWidth()) {
                                Column(Modifier.fillMaxWidth()) { Text(d.name, style = MaterialTheme.typography.titleSmall); Text(d.specialty ?: "Medicina general", style = MaterialTheme.typography.bodySmall) }
                            }
                        }
                    }
                }
            }
        }
        item { PrimaryButton(stringResource(R.string.cat_enviar), model::send, icon = Icons.Default.Send, enabled = state.canSend, loading = state.saving) }
        item { SecondaryButton(stringResource(R.string.ui_cancelar), model::closeForm, icon = Icons.Default.Close, enabled = !state.saving) }
    }
}

/** The patient's own requests with their state; "Retirar solicitud" only when the server allows it. */
@Composable
internal fun MyCategoryRequests(requests: List<CategoryRequest>, busy: Boolean, onWithdraw: (CategoryRequest) -> Unit) {
    var confirm by rememberSaveable { mutableStateOf<String?>(null) }
    SectionCard(stringResource(R.string.cat_mis_solicitudes)) {
        requests.forEach { r ->
            Column {
                DataRow(r.categoryNames, subtitle = listOfNotNull(r.franja.label, r.note).joinToString(" · "), leadingIcon = categoryIcon(r.categories.firstOrNull()?.icon.orEmpty()), status = { requestStateTag(r.state) })
                r.appointment?.let { Text(stringResource(R.string.cat_asignada_detalle, it.doctorName, formatShort(it.start)), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary) }
                r.rejectionReason?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                if (r.allows(CategoryRequestRules.CANCEL)) TextButton(onClick = { confirm = r.id }, enabled = !busy) { Text(stringResource(R.string.cat_retirar)) }
            }
        }
    }
    requests.firstOrNull { it.id == confirm }?.let { r ->
        ConfirmDialog(stringResource(R.string.cat_retirar), stringResource(R.string.cat_retirar), { onWithdraw(r); confirm = null }, { confirm = null },
            message = stringResource(R.string.cat_retirar_mensaje), destructive = true, busy = busy)
    }
}

/** W28 on Android: pending-assignment inbox for reception, with an inline assign panel prefilled by the view model. */
@Composable
internal fun CategoryRequestInbox(state: CategoryRequestsState, model: CategoryRequestsViewModel) {
    var rejecting by rememberSaveable { mutableStateOf<String?>(null) }
    SectionCard(stringResource(R.string.cat_bandeja_titulo), eyebrow = state.inbox.size.toString()) {
        Text(stringResource(R.string.cat_bandeja_detalle), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        if (state.inbox.isEmpty()) Text(stringResource(R.string.cat_bandeja_vacia), style = MaterialTheme.typography.bodyMedium)
        state.inbox.forEach { r ->
            Column {
                DataRow(r.patientName, subtitle = listOfNotNull(r.record, r.categoryNames, r.franja.label).joinToString(" · "), leadingIcon = categoryIcon(r.categories.firstOrNull()?.icon.orEmpty()), status = { requestStateTag(r.state) })
                r.note?.let { Text(it, style = MaterialTheme.typography.bodyMedium) }
                r.preferredDoctorName?.let { Text(stringResource(R.string.cat_prefiere, it), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                if (state.assigning?.id == r.id) AssignPanel(state, model)
                else ClimesaActionGroup {
                    if (r.allows(CategoryRequestRules.ASSIGN)) PrimaryButton(stringResource(R.string.cat_asignar), { model.clearMessages(); model.openAssign(r) }, icon = Icons.Default.Check, enabled = !state.saving)
                    if (r.allows(CategoryRequestRules.REJECT)) SecondaryButton(stringResource(R.string.cat_rechazar), { model.clearMessages(); rejecting = r.id }, icon = Icons.Default.Close, enabled = !state.saving)
                }
            }
        }
    }
    state.inbox.firstOrNull { it.id == rejecting }?.let { r ->
        var reason by rememberSaveable(r.id) { mutableStateOf("") }
        ConfirmDialog(stringResource(R.string.cat_rechazar_titulo), stringResource(R.string.cat_rechazar_titulo), { model.reject(r, reason); rejecting = null }, { rejecting = null },
            message = "${r.patientName} · ${r.categoryNames}", destructive = true, busy = state.saving,
            confirmEnabled = CategoryRequestRules.rejectError(reason) == null,
            body = { FormField(stringResource(R.string.cat_rechazar_motivo), reason, { reason = it.take(500) }, singleLine = false) })
    }
}

@Composable
private fun AssignPanel(state: CategoryRequestsState, model: CategoryRequestsViewModel) {
    val request = state.assigning ?: return
    Column(verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
        Text(stringResource(R.string.cat_asignar_titulo, request.patientName), style = MaterialTheme.typography.titleSmall)
        Text(AppointmentAgenda.dayLabel(state.date.toString()), style = MaterialTheme.typography.bodySmall)
        state.orderedDoctors.forEach { d ->
            TextButton(onClick = { model.pickDoctor(d) }, enabled = d.hasShift, modifier = Modifier.fillMaxWidth()) {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                    Column(Modifier.weight(1f)) { Text(d.name, style = MaterialTheme.typography.titleSmall); Text(d.detail, style = MaterialTheme.typography.bodySmall) }
                    when {
                        !d.hasShift -> StatusPill(d.reason ?: stringResource(R.string.rec_agendar_sin_turno), StatusTone.BLOCKED)
                        state.doctor?.id == d.id -> StatusPill(stringResource(R.string.rec_leyenda_libre), StatusTone.SUCCESS)
                        CategoryRequestRules.isSuggested(request, d) -> StatusPill(stringResource(R.string.cat_sugerido), StatusTone.PROCESS)
                    }
                }
            }
        }
        when {
            state.doctor == null -> Text(stringResource(R.string.rec_agendar_elige_medico), style = MaterialTheme.typography.bodySmall)
            state.loadingSlots -> LoadingState()
            else -> {
                if (state.visibleSlots.isNotEmpty()) DaySlotGrid(state.visibleSlots, state.slot, model::pickSlot)
                if (state.visibleSlots.none { it.selectable }) NoticeBanner(NoticeKind.INFO, stringResource(R.string.cat_sin_libres_franja))
                if (request.franja != RequestFranja.ANY) TextButton(onClick = { model.wholeDay(!state.wholeDay) }) {
                    Text(stringResource(if (state.wholeDay) R.string.cat_solo_franja else R.string.cat_ver_todo_dia))
                }
            }
        }
        PrimaryButton(stringResource(R.string.cat_confirmar_cita), model::assign, icon = Icons.Default.Check, enabled = state.canAssign, loading = state.saving)
        SecondaryButton(stringResource(R.string.ui_cancelar), model::closeAssign, icon = Icons.Default.Close, enabled = !state.saving)
    }
}
