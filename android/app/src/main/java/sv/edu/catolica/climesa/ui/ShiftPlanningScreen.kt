@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package sv.edu.catolica.climesa.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
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
import sv.edu.catolica.climesa.domain.ShiftForm
import sv.edu.catolica.climesa.domain.ShiftPlanning

private val filters = listOf("todos" to "Todos", "borrador" to "Borradores", "publicado" to "Publicados", "en_curso" to "En curso", "completado" to "Completados", "cancelado" to "Cancelados")
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

    LazyColumn(modifier.fillMaxSize(), contentPadding = PaddingValues(22.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        item {
            Text("OPERACIONES / CLIMESA", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
            Text(stringResource(R.string.plan_titulo) + ".", style = MaterialTheme.typography.displaySmall)
        }
        if (!state.canPlan && !state.canPublish) item { Text(stringResource(R.string.plan_solo_lectura), style = MaterialTheme.typography.bodySmall) }
        if (state.canPlan || state.canPublish) item {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                if (state.canPlan) Button({ open(PlanDialog.FORM, null) }, Modifier.fillMaxWidth()) { Text(stringResource(R.string.plan_nuevo)) }
                if (state.canPublish) OutlinedButton({ open(PlanDialog.PUBLISH, null) }, Modifier.fillMaxWidth()) { Text(stringResource(R.string.plan_publicar)) }
            }
        }
        state.summary?.let { summary ->
            item {
                Surface(color = MaterialTheme.colorScheme.surface, shape = RoundedCornerShape(0.dp)) {
                    Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(ShiftPlanning.summaryText(summary), style = MaterialTheme.typography.titleSmall)
                        summary.gaps.forEach { Text(ShiftPlanning.gapText(it), style = MaterialTheme.typography.bodySmall) }
                        TextButton(model::dismissSummary) { Text(stringResource(R.string.plan_entendido)) }
                    }
                }
            }
        }
        item {
            LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                items(filters) { (code, label) -> FilterChip(state.filter == code, { model.setFilter(code) }, { Text(label) }) }
            }
        }
        when {
            state.loading -> item { Box(Modifier.fillMaxWidth().padding(40.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator() } }
            state.error != null -> item {
                Text(state.error!!, color = MaterialTheme.colorScheme.error)
                Button({ model.load() }) { Text(stringResource(R.string.camas_reintentar)) }
            }
            state.visibleShifts.isEmpty() -> item { Text(stringResource(R.string.plan_vacio), style = MaterialTheme.typography.bodyMedium) }
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

@Composable
private fun ShiftCard(shift: PlannedShift, canPlan: Boolean, onEdit: () -> Unit, onCancel: () -> Unit) {
    Surface(color = MaterialTheme.colorScheme.surface, shape = RoundedCornerShape(0.dp)) {
        Column(Modifier.fillMaxWidth().padding(18.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(shift.person, style = MaterialTheme.typography.titleMedium)
            Text(shift.area, style = MaterialTheme.typography.bodySmall)
            Text("${ShiftPlanning.format(shift.start)} — ${ShiftPlanning.format(shift.end)}", style = MaterialTheme.typography.bodyMedium)
            Text("${ShiftPlanning.typeLabel(shift.type)} · ${ShiftPlanning.stateLabel(shift.state)}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
            if (canPlan && ShiftPlanning.cancellable(shift.state)) {
                HorizontalDivider()
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    TextButton(onEdit) { Text(stringResource(R.string.plan_editar)) }
                    TextButton(onCancel) { Text(stringResource(R.string.plan_cancelar_turno)) }
                }
            }
        }
    }
}

@Composable
private fun Picker(label: String, options: List<Pair<String, String>>, selected: String, onSelect: (String) -> Unit) {
    var open by remember { mutableStateOf(false) }
    Box {
        OutlinedButton({ open = true }, Modifier.fillMaxWidth()) {
            Text("$label: ${options.firstOrNull { it.first == selected }?.second ?: stringResource(R.string.plan_seleccionar)}", maxLines = 1)
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
                action.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                if (!action.conflict) {
                    Picker(stringResource(R.string.plan_persona), state.people.map { it.id to it.label }, staff) { staff = it }
                    Picker(stringResource(R.string.plan_area), state.areas.map { it.id to it.label }, area) { area = it }
                    OutlinedTextField(startDate, { startDate = it.take(10) }, label = { Text(stringResource(R.string.plan_inicio_fecha)) }, singleLine = true, modifier = Modifier.fillMaxWidth())
                    OutlinedTextField(startTime, { startTime = it.take(5) }, label = { Text(stringResource(R.string.plan_inicio_hora)) }, singleLine = true, modifier = Modifier.fillMaxWidth())
                    OutlinedTextField(endDate, { endDate = it.take(10) }, label = { Text(stringResource(R.string.plan_fin_fecha)) }, singleLine = true, modifier = Modifier.fillMaxWidth())
                    OutlinedTextField(endTime, { endTime = it.take(5) }, label = { Text(stringResource(R.string.plan_fin_hora)) }, singleLine = true, modifier = Modifier.fillMaxWidth())
                    Picker(stringResource(R.string.plan_tipo), shiftTypes, type) { type = it }
                    OutlinedTextField(note, { note = it.take(ShiftPlanning.MAX_NOTE) }, label = { Text(stringResource(R.string.plan_observacion)) }, modifier = Modifier.fillMaxWidth())
                    if (shift != null) OutlinedTextField(reason, { reason = it.take(500) }, label = { Text(stringResource(R.string.plan_motivo_cambio)) }, modifier = Modifier.fillMaxWidth())
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
                action.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                if (!action.conflict) OutlinedTextField(reason, { reason = it.take(500) }, label = { Text(stringResource(R.string.plan_motivo_cancelacion)) }, modifier = Modifier.fillMaxWidth())
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
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(stringResource(R.string.plan_publicar_detalle), style = MaterialTheme.typography.bodySmall)
                action.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                OutlinedTextField(from, { from = it.take(10) }, label = { Text(stringResource(R.string.plan_desde)) }, singleLine = true, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(to, { to = it.take(10) }, label = { Text(stringResource(R.string.plan_hasta)) }, singleLine = true, modifier = Modifier.fillMaxWidth())
                Picker(stringResource(R.string.plan_area), listOf("" to stringResource(R.string.plan_area_todas)) + state.areas.map { it.id to it.label }, area) { area = it }
            }
        },
        confirmButton = { Button({ model.publish(from, to, area.ifBlank { null }) }, enabled = !action.busy) { Text(stringResource(if (action.busy) R.string.plan_guardando else R.string.plan_publicar_turnos)) } },
        dismissButton = { TextButton(onClose, enabled = !action.busy) { Text(stringResource(R.string.plan_volver)) } },
    )
}
