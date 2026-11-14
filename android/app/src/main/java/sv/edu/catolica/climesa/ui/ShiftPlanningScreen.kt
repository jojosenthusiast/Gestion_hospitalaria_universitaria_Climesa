@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package sv.edu.catolica.climesa.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Cancel
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Publish
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import sv.edu.catolica.climesa.R
import sv.edu.catolica.climesa.domain.AccessProfile
import sv.edu.catolica.climesa.domain.PlannedShift
import sv.edu.catolica.climesa.domain.ShiftFilters
import sv.edu.catolica.climesa.domain.ShiftForm
import sv.edu.catolica.climesa.domain.ShiftPlanning

private val shiftTypes = listOf("diurno", "nocturno", "guardia").map { it to ShiftPlanning.typeLabel(it) }

private enum class PlanDialog { NONE, FORM, CANCEL, PUBLISH }

/** Planificación de turnos (W16/W17 en móvil): lista, borradores, publicación y cancelación según los permisos del perfil. */
@Composable
fun ShiftPlanningScreen(profile: AccessProfile, modifier: Modifier = Modifier, model: ShiftPlanningViewModel = viewModel()) {
    val state by model.state.collectAsStateWithLifecycle()
    var dialog by rememberSaveable { mutableStateOf(PlanDialog.NONE) }
    var targetId by rememberSaveable { mutableStateOf<String?>(null) }
    LaunchedEffect(profile.permissions, profile.channels) { model.start(profile.permissions.toSet(), profile.channels) }
    LaunchedEffect(state.action.done) { if (state.action.done) { dialog = PlanDialog.NONE; model.resetAction() } }
    val target = state.shifts.firstOrNull { it.id == targetId }
    fun open(next: PlanDialog, id: String?) { model.resetAction(); targetId = id; dialog = next }

    PageList(modifier) {
        item { SectionIntro("Operaciones / CLIMESA", stringResource(R.string.plan_titulo), "Cobertura y turnos del equipo.") }
        if (!state.canPlan && !state.canPublish) item { NoticeBanner(NoticeKind.INFO, stringResource(R.string.plan_solo_lectura)) }
        if (state.canPlan || state.canPublish) item {
            ClimesaActionGroup {
                if (state.canPlan) PrimaryButton(stringResource(R.string.plan_nuevo), { open(PlanDialog.FORM, null) }, icon = Icons.Default.Add)
                if (state.canPublish) SecondaryButton(stringResource(R.string.plan_publicar), { open(PlanDialog.PUBLISH, null) }, icon = Icons.Default.Publish)
            }
        }
        state.summary?.let { summary ->
            item {
                SectionCard(stringResource(R.string.op_turnos_resumen), action = { TextButton(model::dismissSummary) { Text(stringResource(R.string.plan_entendido)) } }) {
                    Text(ShiftPlanning.summaryText(summary), style = MaterialTheme.typography.titleSmall)
                    summary.gaps.take(3).forEach { NoticeBanner(NoticeKind.WARNING, ShiftPlanning.gapText(it)) }
                    if (summary.gaps.size > 3) Text("${summary.gaps.size - 3} alertas adicionales", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
        item { ShiftFilterPanel(state, model) }
        when {
            state.loading -> item { LoadingState() }
            state.error != null -> item { ErrorState(state.error, onRetry = { model.load() }) }
            state.visibleShifts.isEmpty() && state.shiftFilter.active -> item { EmptyState(stringResource(R.string.filtro_sin_coincidencias), detail = stringResource(R.string.filtro_sin_coincidencias_detalle), action = { SecondaryButton(stringResource(R.string.filtro_limpiar), model::clearFilters) }) }
            state.visibleShifts.isEmpty() -> item { EmptyState(stringResource(R.string.plan_vacio)) }
            else -> items(state.visibleShifts, key = { it.id }) { shift ->
                ShiftCard(shift, state.canPlan, { open(PlanDialog.FORM, shift.id) }, { open(PlanDialog.CANCEL, shift.id) })
            }
        }
    }

    when (dialog) {
        PlanDialog.FORM -> ShiftFormDialog(model, state, target, targetId) { dialog = PlanDialog.NONE; model.resetAction() }
        PlanDialog.CANCEL -> target?.let { CancelDialog(model, state, it) { dialog = PlanDialog.NONE; model.resetAction() } }
        PlanDialog.PUBLISH -> PublishDialog(model, state) { dialog = PlanDialog.NONE; model.resetAction() }
        PlanDialog.NONE -> Unit
    }
}

/** State, area and staff function, each with "Todos". The options come from the shifts shown, so they never offer an empty result. */
@Composable
private fun ShiftFilterPanel(state: PlanningState, model: ShiftPlanningViewModel) {
    ClimesaCard {
        Column(Modifier.fillMaxWidth().padding(Spacing.md), verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
            Text(stringResource(R.string.filtro_titulo), style = MaterialTheme.typography.titleMedium)
            Text(stringResource(R.string.filtro_ayuda), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Picker(stringResource(R.string.filtro_estado), ShiftFilters.stateOptions(), state.filter, model::setFilter)
            Picker(stringResource(R.string.filtro_area), ShiftFilters.areaOptions(state.shifts), state.areaFilter, model::setAreaFilter)
            val roles = ShiftFilters.roleOptions(state.shifts, state.staffTypes)
            if (roles.size > 1) Picker(stringResource(R.string.filtro_rol), roles, state.roleFilter, model::setRoleFilter)
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(stringResource(R.string.filtro_mostrando, state.visibleShifts.size, state.shifts.size), Modifier.weight(1f), style = MaterialTheme.typography.labelLarge)
                if (state.shiftFilter.active) TextButton(model::clearFilters) { Text(stringResource(R.string.filtro_limpiar)) }
            }
        }
    }
}

@Composable
private fun ShiftCard(shift: PlannedShift, canPlan: Boolean, onEdit: () -> Unit, onCancel: () -> Unit) {
    SectionCard(shift.person, eyebrow = ShiftPlanning.typeLabel(shift.type), action = { StatusTag(shift.state, label = ShiftPlanning.stateLabel(shift.state)) }) {
        DataRow(shift.area, subtitle = "${ShiftPlanning.format(shift.start)} — ${ShiftPlanning.format(shift.end)}", leadingIcon = Icons.Default.Schedule)
        if (canPlan && ShiftPlanning.cancellable(shift.state)) {
            ClimesaActionGroup {
                SecondaryButton(stringResource(R.string.plan_editar), onEdit, icon = Icons.Default.Edit)
                SecondaryButton(stringResource(R.string.plan_cancelar_turno), onCancel, icon = Icons.Default.Cancel)
            }
        }
    }
}

@Composable
private fun Picker(label: String, options: List<Pair<String, String>>, selected: String, onSelect: (String) -> Unit) {
    var open by remember { mutableStateOf(false) }
    Box {
        OutlinedButton({ open = true }, Modifier.fillMaxWidth().heightIn(min = 56.dp)) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(options.firstOrNull { it.first == selected }?.second ?: stringResource(R.string.plan_seleccionar), maxLines = 2)
            }
        }
        DropdownMenu(open, { open = false }) {
            options.forEach { (code, text) -> DropdownMenuItem({ Text(text) }, { onSelect(code); open = false }) }
        }
    }
}

@Composable
private fun ShiftFormDialog(model: ShiftPlanningViewModel, state: PlanningState, shift: PlannedShift?, key: String?, onClose: () -> Unit) {
    val initial = remember(key) { shift?.let(ShiftPlanning::formOf) ?: ShiftForm() }
    var staff by rememberSaveable(key) { mutableStateOf(initial.staffId) }
    var area by rememberSaveable(key) { mutableStateOf(initial.areaId) }
    var startDate by rememberSaveable(key) { mutableStateOf(initial.startDate) }
    var startTime by rememberSaveable(key) { mutableStateOf(initial.startTime) }
    var endDate by rememberSaveable(key) { mutableStateOf(initial.endDate) }
    var endTime by rememberSaveable(key) { mutableStateOf(initial.endTime) }
    var type by rememberSaveable(key) { mutableStateOf(initial.type) }
    var note by rememberSaveable(key) { mutableStateOf(initial.justification) }
    var reason by rememberSaveable(key) { mutableStateOf("") }
    val action = state.action
    AlertDialog(
        onDismissRequest = { if (!action.busy) onClose() },
        title = { Text(stringResource(if (shift == null) R.string.plan_nuevo else R.string.plan_editar)) },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(stringResource(R.string.plan_horario), style = MaterialTheme.typography.bodySmall)
                action.error?.let { NoticeBanner(NoticeKind.ERROR, it) }
                if (!action.conflict) {
                    Picker(stringResource(R.string.plan_persona), state.people.map { it.id to it.label }, staff) { staff = it }
                    Picker(stringResource(R.string.plan_area), state.areas.map { it.id to it.label }, area) { area = it }
                    FormField(stringResource(R.string.plan_inicio_fecha), startDate, { startDate = it.take(10) })
                    FormField(stringResource(R.string.plan_inicio_hora), startTime, { startTime = it.take(5) })
                    FormField(stringResource(R.string.plan_fin_fecha), endDate, { endDate = it.take(10) })
                    FormField(stringResource(R.string.plan_fin_hora), endTime, { endTime = it.take(5) })
                    Picker(stringResource(R.string.plan_tipo), shiftTypes, type) { type = it }
                    FormField(stringResource(R.string.plan_observacion), note, { note = it.take(ShiftPlanning.MAX_NOTE) }, singleLine = false)
                    if (shift != null) FormField(stringResource(R.string.plan_motivo_cambio), reason, { reason = it.take(500) }, singleLine = false)
                }
            }
        },
        confirmButton = {
            if (action.conflict) TextButton({ onClose(); model.load(silent = true) }) { Text(stringResource(R.string.plan_cerrar_recargar)) }
            else Button({ model.save(ShiftForm(staff, area, startDate, startTime, endDate, endTime, type, note), shift, reason) }, enabled = !action.busy) {
                Text(stringResource(if (action.busy) R.string.plan_guardando else if (shift == null) R.string.plan_guardar_borrador else R.string.plan_guardar_cambios))
            }
        },
        dismissButton = { if (!action.conflict) TextButton(onClose, enabled = !action.busy) { Text(stringResource(R.string.plan_volver)) } },
    )
}

@Composable
private fun CancelDialog(model: ShiftPlanningViewModel, state: PlanningState, shift: PlannedShift, onClose: () -> Unit) {
    var reason by rememberSaveable(shift.id) { mutableStateOf("") }
    val action = state.action
    AlertDialog(
        onDismissRequest = { if (!action.busy) onClose() },
        title = { Text(stringResource(R.string.plan_cancelar_turno)) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("${shift.person} · ${shift.area}\n${ShiftPlanning.format(shift.start)} — ${ShiftPlanning.format(shift.end)}", style = MaterialTheme.typography.bodySmall)
                action.error?.let { NoticeBanner(NoticeKind.ERROR, it) }
                if (!action.conflict) FormField(stringResource(R.string.plan_motivo_cancelacion), reason, { reason = it.take(500) }, singleLine = false)
            }
        },
        confirmButton = {
            if (action.conflict) TextButton({ onClose(); model.load(silent = true) }) { Text(stringResource(R.string.plan_cerrar_recargar)) }
            else Button({ model.cancel(shift, reason) }, enabled = !action.busy) { Text(stringResource(if (action.busy) R.string.plan_guardando else R.string.plan_cancelar_turno)) }
        },
        dismissButton = { if (!action.conflict) TextButton(onClose, enabled = !action.busy) { Text(stringResource(R.string.plan_volver)) } },
    )
}

@Composable
private fun PublishDialog(model: ShiftPlanningViewModel, state: PlanningState, onClose: () -> Unit) {
    var from by rememberSaveable { mutableStateOf("") }
    var to by rememberSaveable { mutableStateOf("") }
    var area by rememberSaveable { mutableStateOf("") }
    val action = state.action
    AlertDialog(
        onDismissRequest = { if (!action.busy) onClose() },
        title = { Text(stringResource(R.string.plan_publicar)) },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(stringResource(R.string.plan_publicar_detalle), style = MaterialTheme.typography.bodySmall)
                action.error?.let { NoticeBanner(NoticeKind.ERROR, it) }
                FormField(stringResource(R.string.plan_desde), from, { from = it.take(10) })
                FormField(stringResource(R.string.plan_hasta), to, { to = it.take(10) })
                Picker(stringResource(R.string.plan_area), listOf("" to stringResource(R.string.plan_area_todas)) + state.areas.map { it.id to it.label }, area) { area = it }
            }
        },
        confirmButton = { Button({ model.publish(from, to, area.ifBlank { null }) }, enabled = !action.busy) { Text(stringResource(if (action.busy) R.string.plan_guardando else R.string.plan_publicar_turnos)) } },
        dismissButton = { TextButton(onClose, enabled = !action.busy) { Text(stringResource(R.string.plan_volver)) } },
    )
}
