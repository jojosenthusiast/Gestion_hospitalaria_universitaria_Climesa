@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class, androidx.compose.foundation.layout.ExperimentalLayoutApi::class)

package sv.edu.catolica.climesa.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Cancel
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.FilterList
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Publish
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.FilterChip
import androidx.compose.material3.AssistChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.clickable
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import sv.edu.catolica.climesa.R
import sv.edu.catolica.climesa.domain.AccessProfile
import sv.edu.catolica.climesa.domain.CatalogStaff
import sv.edu.catolica.climesa.domain.FILTER_ALL
import sv.edu.catolica.climesa.domain.PlannedShift
import sv.edu.catolica.climesa.domain.ShiftAssignment
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
                ShiftCard(shift, state.staffTypes[shift.staffId], state.canPlan, { open(PlanDialog.FORM, shift.id) }, { open(PlanDialog.CANCEL, shift.id) })
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

/** Search, then filters in a collapsible panel with active-filter chips; every option comes from the catalog, not from the loaded shifts. */
@Composable
private fun ShiftFilterPanel(state: PlanningState, model: ShiftPlanningViewModel) {
    var expanded by rememberSaveable { mutableStateOf(false) }
    val filter = state.shiftFilter
    val activeCount = listOf(filter.state, filter.area, filter.role, filter.person).count { it != FILTER_ALL }
    val people = remember(state.catalog) { state.catalog.staff.map { SuggestItem(it.id, it.name, listOfNotNull(IdentityCatalog.role(it.type).label, it.area).joinToString(" · ")) } }
    val roles = ShiftFilters.roleOptions(state.catalog)
    val areas = ShiftFilters.areaOptions(state.catalog)
    ClimesaCard {
        Column(Modifier.fillMaxWidth().padding(Spacing.md), verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
            SuggestPicker(
                stringResource(R.string.turnos_buscar_persona), people, people.firstOrNull { it.id == filter.person },
                { model.setPersonFilter(it?.id ?: FILTER_ALL) }, hint = stringResource(R.string.turnos_buscar_persona_hint),
            )
            OutlinedButton({ expanded = !expanded }, Modifier.fillMaxWidth().heightIn(min = 48.dp)) {
                Icon(Icons.Default.FilterList, contentDescription = null)
                Text(if (activeCount > 0) stringResource(R.string.turnos_filtros_con_cuenta, activeCount) else stringResource(R.string.turnos_filtros))
            }
            if (expanded) {
                Text(stringResource(R.string.turnos_filtro_rol), style = MaterialTheme.typography.labelLarge)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    roles.filter { it.first != FILTER_ALL }.forEach { (code, name) ->
                        ToggleChip(filter.role == code, { model.setRoleFilter(if (filter.role == code) FILTER_ALL else code) }) { RoleChip(code, label = name) }
                    }
                }
                Text(stringResource(R.string.turnos_filtro_area), style = MaterialTheme.typography.labelLarge)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    areas.filter { it.first != FILTER_ALL }.forEach { (id, name) ->
                        val type = state.catalog.areas.firstOrNull { it.id == id }?.type
                        ToggleChip(filter.area == id, { model.setAreaFilter(if (filter.area == id) FILTER_ALL else id) }) { AreaChip(name, type = type) }
                    }
                }
                Text(stringResource(R.string.turnos_filtro_estado), style = MaterialTheme.typography.labelLarge)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    ShiftFilters.stateOptions().filter { it.first != FILTER_ALL }.forEach { (code, name) ->
                        FilterChip(filter.state == code, { model.setFilter(if (filter.state == code) FILTER_ALL else code) }, { Text(name) })
                    }
                }
            }
            if (activeCount > 0) {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(4.dp), itemVerticalAlignment = Alignment.CenterVertically) {
                    if (filter.person != FILTER_ALL) ActiveChip("Persona: " + (people.firstOrNull { it.id == filter.person }?.label ?: "—")) { model.setPersonFilter(FILTER_ALL) }
                    if (filter.role != FILTER_ALL) ActiveChip("Rol: " + (roles.firstOrNull { it.first == filter.role }?.second ?: filter.role)) { model.setRoleFilter(FILTER_ALL) }
                    if (filter.area != FILTER_ALL) ActiveChip("Área: " + (areas.firstOrNull { it.first == filter.area }?.second ?: "—")) { model.setAreaFilter(FILTER_ALL) }
                    if (filter.state != FILTER_ALL) ActiveChip("Estado: " + (ShiftFilters.stateOptions().firstOrNull { it.first == filter.state }?.second ?: filter.state)) { model.setFilter(FILTER_ALL) }
                    TextButton(model::clearFilters) { Text(stringResource(R.string.filtro_limpiar)) }
                }
            }
            Text(stringResource(R.string.filtro_mostrando, state.visibleShifts.size, state.shifts.size), style = MaterialTheme.typography.labelLarge)
        }
    }
}

@Composable
private fun ActiveChip(text: String, onRemove: () -> Unit) {
    AssistChip(onRemove, { Text(text) }, trailingIcon = { Icon(Icons.Default.Close, contentDescription = stringResource(R.string.turnos_quitar_filtro, text)) })
}

/** A selectable wrapper around an identity chip: the selected one gets a thick outline, so the state never relies on color alone. */
@Composable
private fun ToggleChip(selected: Boolean, onClick: () -> Unit, content: @Composable () -> Unit) {
    Surface(
        Modifier.heightIn(min = 48.dp).selectable(selected, role = Role.Checkbox, onClick = onClick),
        shape = MaterialTheme.shapes.extraLarge, color = Color.Transparent,
        border = androidx.compose.foundation.BorderStroke(if (selected) 3.dp else 1.dp, if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant),
    ) { Box(Modifier.padding(4.dp), contentAlignment = Alignment.Center) { content() } }
}

@Composable
private fun ShiftCard(shift: PlannedShift, staffType: String?, canPlan: Boolean, onEdit: () -> Unit, onCancel: () -> Unit) {
    SectionCard(shift.person, eyebrow = ShiftPlanning.typeLabel(shift.type), action = { StatusTag(shift.state, label = ShiftPlanning.stateLabel(shift.state)) }) {
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            if (!staffType.isNullOrBlank()) RoleChip(staffType)
            AreaChip(shift.area)
        }
        DataRow(ShiftPlanning.format(shift.start) + " — " + ShiftPlanning.format(shift.end), leadingIcon = Icons.Default.Schedule)
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

/** One autosuggest option; `disabledReason` greys it out and explains why it cannot be chosen. */
private data class SuggestItem(val id: String, val label: String, val detail: String = "", val disabledReason: String? = null)

/** Autosuggest search (accent- and case-insensitive) instead of a long combo box: results appear while typing. */
@Composable
private fun SuggestPicker(label: String, items: List<SuggestItem>, selected: SuggestItem?, onSelect: (SuggestItem?) -> Unit, enabled: Boolean = true, hint: String? = null, emptyText: String? = null) {
    var query by rememberSaveable(label) { mutableStateOf("") }
    if (selected != null) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(selected.label, style = MaterialTheme.typography.titleSmall)
                if (selected.detail.isNotBlank()) Text(selected.detail, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            TextButton({ onSelect(null); query = "" }, enabled = enabled) { Text(stringResource(R.string.turnos_cambiar)) }
        }
        return
    }
    FormField(label, query, { query = it }, enabled = enabled, hint = hint)
    if (enabled && query.isNotBlank()) {
        val shown = items.filter { ShiftAssignment.matches(query, it.label, it.detail) }
        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
            shown.take(8).forEach { item ->
                val off = item.disabledReason != null
                Column(Modifier.fillMaxWidth().clickable(enabled = !off) { onSelect(item); query = "" }.padding(vertical = 6.dp)) {
                    Text(item.label, style = MaterialTheme.typography.bodyMedium, color = if (off) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.onSurface)
                    if (item.detail.isNotBlank()) Text(item.detail, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    item.disabledReason?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error) }
                }
                HorizontalDivider()
            }
            if (shown.size > 8) Text("${shown.size - 8} más: sigue escribiendo para acotar.", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            if (shown.isEmpty()) Text(emptyText ?: "Sin coincidencias.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

/** Assign a shift end to end: 1) area, 2) date and schedule, 3) staff eligible for that area and role, with the conflicts inline. */
@Composable
private fun ShiftFormDialog(model: ShiftPlanningViewModel, state: PlanningState, shift: PlannedShift?, key: String?, onClose: () -> Unit) {
    val initial = remember(key) { shift?.let(ShiftPlanning::formOf) ?: ShiftForm() }
    var staff by rememberSaveable(key) { mutableStateOf(initial.staffId) }
    var area by rememberSaveable(key) { mutableStateOf(initial.areaId) }
    var startDate by rememberSaveable(key) { mutableStateOf(initial.startDate) }
    var startTime by rememberSaveable(key) { mutableStateOf(initial.startTime) }
    var endTime by rememberSaveable(key) { mutableStateOf(initial.endTime) }
    var type by rememberSaveable(key) { mutableStateOf(initial.type) }
    var typeTouched by rememberSaveable(key) { mutableStateOf(shift != null) }
    var role by rememberSaveable(key) { mutableStateOf(FILTER_ALL) }
    var others by rememberSaveable(key) { mutableStateOf(false) }
    var note by rememberSaveable(key) { mutableStateOf(initial.justification) }
    var reason by rememberSaveable(key) { mutableStateOf("") }
    val action = state.action
    val catalog = state.catalog
    val window = ShiftAssignment.window(startDate, startTime, endTime)
    val kind = if (typeTouched || window == null) type else ShiftAssignment.suggestKind(window.first, window.second)
    val durationIssue = window?.let { ShiftAssignment.durationProblem(it.first, it.second, kind) }
    val pool = remember(catalog, area, role, others) { ShiftAssignment.eligible(catalog, area, role, others) }
    fun conflictsOf(person: CatalogStaff?) = if (window == null) emptyList() else ShiftAssignment.conflicts(person, window.first, window.second, kind, state.shifts, shift?.id)
    val areaItems = catalog.areas.map { SuggestItem(it.id, it.name, IdentityCatalog.area(it.name, it.type).label) }
    val areaSelected = areaItems.firstOrNull { it.id == area } ?: shift?.takeIf { area == it.areaId }?.let { SuggestItem(it.areaId, it.area) }
    val chosen = catalog.staff.firstOrNull { it.id == staff }
    val staffItems = pool.map { person ->
        val found = conflictsOf(person)
        SuggestItem(person.id, person.name, listOfNotNull(IdentityCatalog.role(person.type).label, person.specialty, person.area).joinToString(" · "), found.firstOrNull()?.text)
    }
    val staffSelected = staffItems.firstOrNull { it.id == staff } ?: chosen?.let { SuggestItem(it.id, it.name, IdentityCatalog.role(it.type).label) } ?: shift?.takeIf { staff == it.staffId }?.let { SuggestItem(it.staffId, it.person) }
    val chosenConflicts = conflictsOf(chosen)
    AlertDialog(
        onDismissRequest = { if (!action.busy) onClose() },
        title = { Text(stringResource(if (shift == null) R.string.plan_nuevo else R.string.plan_editar)) },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(stringResource(R.string.plan_horario), style = MaterialTheme.typography.bodySmall)
                action.error?.let { NoticeBanner(NoticeKind.ERROR, it) }
                if (!action.conflict) {
                    Text(stringResource(R.string.turnos_paso_area), style = MaterialTheme.typography.titleSmall)
                    SuggestPicker(
                        stringResource(R.string.turnos_area_campo), areaItems, areaSelected,
                        { picked ->
                            area = picked?.id.orEmpty()
                            if (picked != null && staff.isNotBlank() && ShiftAssignment.eligible(catalog, picked.id, FILTER_ALL, others).none { it.id == staff }) staff = ""
                        },
                        hint = stringResource(R.string.turnos_area_hint),
                    )
                    if (area.isNotBlank()) AreaChip(areaSelected?.label, type = catalog.areas.firstOrNull { it.id == area }?.type)

                    Text(stringResource(R.string.turnos_paso_horario), style = MaterialTheme.typography.titleSmall)
                    FormField(stringResource(R.string.turnos_fecha_inicio), startDate, { startDate = it.take(10) })
                    FormField(stringResource(R.string.turnos_hora_inicio), startTime, { startTime = it.take(5) })
                    FormField(
                        stringResource(R.string.turnos_hora_fin), endTime, { endTime = it.take(5) },
                        hint = if (window != null && window.second.toLocalDate() != window.first.toLocalDate()) stringResource(R.string.turnos_termina_siguiente) else null,
                    )
                    Text(stringResource(R.string.turnos_tipo), style = MaterialTheme.typography.labelLarge)
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        shiftTypes.forEach { (code, label) -> FilterChip(kind == code, { type = code; typeTouched = true }, { Text(label) }) }
                    }
                    if (window != null) {
                        val duration = stringResource(R.string.turnos_duracion, "%.1f".format(ShiftAssignment.hours(window.first, window.second)))
                        if (durationIssue != null) NoticeBanner(NoticeKind.ERROR, "$duration. $durationIssue") else Text(duration, style = MaterialTheme.typography.bodySmall)
                    }

                    Text(stringResource(R.string.turnos_paso_personal), style = MaterialTheme.typography.titleSmall)
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        ToggleChip(role == FILTER_ALL, { role = FILTER_ALL }) { Text(stringResource(R.string.turnos_todos), Modifier.padding(horizontal = 12.dp, vertical = 4.dp)) }
                        catalog.roles.forEach { r -> ToggleChip(role == r.code, { role = r.code; if (chosen != null && chosen.type != r.code) staff = "" }) { RoleChip(r.code, label = r.name) } }
                    }
                    SuggestPicker(
                        stringResource(R.string.turnos_persona_campo), staffItems, staffSelected, { staff = it?.id.orEmpty() }, enabled = area.isNotBlank(),
                        hint = if (area.isBlank()) stringResource(R.string.turnos_elige_area) else stringResource(R.string.turnos_elegibles, pool.size),
                        emptyText = stringResource(R.string.turnos_sin_coincidencias),
                    )
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Checkbox(others, { others = it })
                        Text(stringResource(R.string.turnos_otras_areas), style = MaterialTheme.typography.bodySmall)
                    }
                    if (chosen != null) FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        RoleChip(chosen.type)
                        chosen.area?.let { AreaChip(it) }
                    }
                    if (chosenConflicts.isNotEmpty()) NoticeBanner(NoticeKind.ERROR, stringResource(R.string.turnos_conflicto_aviso, chosenConflicts.joinToString(". ") { it.text }))
                    else if (chosen != null && window != null) NoticeBanner(NoticeKind.INFO, stringResource(R.string.turnos_sin_conflictos))
                    FormField(stringResource(R.string.plan_observacion), note, { note = it.take(ShiftPlanning.MAX_NOTE) }, singleLine = false)
                    if (shift != null) FormField(stringResource(R.string.plan_motivo_cambio), reason, { reason = it.take(500) }, singleLine = false)
                }
            }
        },
        confirmButton = {
            if (action.conflict) TextButton({ onClose(); model.load(silent = true) }) { Text(stringResource(R.string.plan_cerrar_recargar)) }
            else Button(
                {
                    val endDate = window?.second?.toLocalDate()?.toString().orEmpty()
                    model.save(ShiftForm(staff, area, startDate, startTime, endDate, endTime, kind, note), shift, reason)
                },
                enabled = !action.busy && durationIssue == null && chosenConflicts.isEmpty(),
            ) {
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
                Picker(stringResource(R.string.plan_area), listOf("" to stringResource(R.string.plan_area_todas)) + state.catalog.areas.map { it.id to it.name }, area) { area = it }
            }
        },
        confirmButton = { Button({ model.publish(from, to, area.ifBlank { null }) }, enabled = !action.busy) { Text(stringResource(if (action.busy) R.string.plan_guardando else R.string.plan_publicar_turnos)) } },
        dismissButton = { TextButton(onClose, enabled = !action.busy) { Text(stringResource(R.string.plan_volver)) } },
    )
}
