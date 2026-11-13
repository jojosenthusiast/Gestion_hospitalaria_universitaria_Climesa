package sv.edu.catolica.climesa.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Save
import androidx.compose.material.icons.filled.ToggleOff
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
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
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import sv.edu.catolica.climesa.domain.AccessProfile
import sv.edu.catolica.climesa.domain.ChangeReason
import sv.edu.catolica.climesa.domain.StaffDraft
import sv.edu.catolica.climesa.domain.StaffMember
import sv.edu.catolica.climesa.domain.StaffRules

/** Pantalla de personal. Cada acción aparece solo con su permiso del catálogo (`personal.ver`, `personal.gestionar`). */
@Composable
fun StaffScreen(profile: AccessProfile, modifier: Modifier = Modifier) {
    val model: StaffViewModel = viewModel()
    val state by model.state.collectAsStateWithLifecycle()
    LaunchedEffect(profile.permissions, profile.channels) { model.start(profile.permissions.toSet(), profile.channels) }
    val form = state.form
    if (form != null) {
        StaffFormView(state, model, modifier)
        return
    }
    val member = state.selected
    if (member != null) {
        StaffDetail(member, state, model, modifier)
        return
    }
    LazyColumn(modifier.fillMaxSize(), contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        item { SectionIntro("Equipo / CLIMESA", "Personal") }
        item {
            LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                item { FilterChip(selected = !state.showInactive, onClick = { if (state.showInactive) model.toggleInactive() }, label = { Text("Activos") }) }
                item { FilterChip(selected = state.showInactive, onClick = { if (!state.showInactive) model.toggleInactive() }, label = { Text("Todos") }) }
            }
        }
        if (state.canManage) item { ClimesaButton("Registrar personal", Icons.Default.Add, model::newMember) }
        state.message?.let { item { Text(it, color = MaterialTheme.colorScheme.primary) } }
        when {
            state.loading -> item { CircularProgressIndicator() }
            state.error != null -> item { Text(state.error!!, color = MaterialTheme.colorScheme.error) }
            state.visible.isEmpty() -> item { Text("No hay personal para mostrar con este filtro.") }
            else -> items(state.visible, key = { it.id }) { m ->
                ClimesaClickableCard(onClick = { model.select(m.id) }) {
                    Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text(m.fullName, style = MaterialTheme.typography.titleMedium)
                        Text(StaffRules.typeLabel(m.type), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text(if (m.active) "● Activo" else "○ Inactivo", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
                    }
                }
            }
        }
    }
}

@Composable
private fun StaffDetail(m: StaffMember, state: StaffState, model: StaffViewModel, modifier: Modifier) {
    var dialog by remember(m.id) { mutableStateOf(false) }
    var reason by remember(m.id) { mutableStateOf("") }
    LazyColumn(modifier.fillMaxSize(), contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        item { TextButton(onClick = { model.select(null) }) { androidx.compose.material3.Icon(Icons.AutoMirrored.Filled.ArrowBack, null); Text("Volver") } }
        item { ClimesaCard { Column(Modifier.fillMaxWidth().padding(18.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(m.fullName, style = MaterialTheme.typography.headlineMedium)
            Text(if (m.active) "Activo" else "Inactivo", color = MaterialTheme.colorScheme.primary)
            HorizontalDivider()
            Text(StaffRules.typeLabel(m.type), style = MaterialTheme.typography.bodyMedium)
            if (m.specialty.isNotBlank()) Text(m.specialty, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            if (state.canSeePersonalData) Text("DUI: ${m.dui ?: "Sin registrar"}\nTeléfono: ${m.phone.ifBlank { "Sin registrar" }}", style = MaterialTheme.typography.bodySmall)
        } } }
        state.formError?.let { item { Text(it, color = MaterialTheme.colorScheme.error) } }
        if (state.canManage) {
            item { ClimesaActionGroup {
                ClimesaButton("Editar datos", Icons.Default.Edit, { model.edit(m) })
                ClimesaButton(if (m.active) "Inactivar" else "Reactivar", Icons.Default.ToggleOff, { dialog = true }, enabled = !state.saving, outlined = true)
            } }
        }
    }
    if (dialog) AlertDialog(
        onDismissRequest = { if (!state.saving) dialog = false },
        title = { Text(if (m.active) "Inactivar personal" else "Reactivar personal") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("La ficha y su historial se conservan.")
                OutlinedTextField(reason, { reason = it.take(ChangeReason.MAX) }, label = { Text("Motivo") }, supportingText = { Text("Mínimo ${ChangeReason.MIN} caracteres") })
            }
        },
        confirmButton = {
            TextButton(enabled = ChangeReason.error(reason) == null && !state.saving, onClick = { model.changeActive(m, reason) }) { Text("Confirmar") }
        },
        dismissButton = { TextButton(enabled = !state.saving, onClick = { dialog = false }) { Text("Cancelar") } },
    )
}

@Composable
private fun StaffFormView(state: StaffState, model: StaffViewModel, modifier: Modifier) {
    val form = state.form ?: return
    val d = form.draft
    LazyColumn(modifier.fillMaxSize(), contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        item { SectionIntro("Personal / CLIMESA", if (form.editingId == null) "Nuevo personal" else "Editar personal") }
        item { StaffField("Nombres", d.givenNames, form.fields["givenNames"], !state.saving) { model.draft(d.copy(givenNames = it.take(80))) } }
        item { StaffField("Apellidos", d.surnames, form.fields["surnames"], !state.saving) { model.draft(d.copy(surnames = it.take(100))) } }
        item { Text("Función", style = MaterialTheme.typography.labelLarge) }
        item {
            LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                itemsIndexed(StaffRules.typeCodes) { _, code -> FilterChip(selected = d.type == code, onClick = { model.draft(d.copy(type = code)) }, enabled = !state.saving, label = { Text(StaffRules.typeLabel(code)) }) }
            }
        }
        item { StaffField("Especialidad · opcional", d.specialty, form.fields["specialty"], !state.saving) { model.draft(d.copy(specialty = it.take(120))) } }
        if (state.canSeePersonalData) item { StaffField("DUI · opcional", d.dui, form.fields["dui"], !state.saving) { model.draft(d.copy(dui = it.take(10))) } }
        item { StaffField("Teléfono · opcional", d.phone, form.fields["phone"], !state.saving) { model.draft(d.copy(phone = it.take(9))) } }
        if (form.editingId != null) item {
            OutlinedTextField(form.reason, model::reason, modifier = Modifier.fillMaxWidth(), enabled = !state.saving, label = { Text("Motivo del cambio *") }, supportingText = { Text("Mínimo ${ChangeReason.MIN} caracteres. Queda en el historial.") })
        }
        state.formError?.let { item { Text(it, color = MaterialTheme.colorScheme.error) } }
        item { ClimesaActionGroup {
            ClimesaButton(if (state.saving) "Guardando…" else "Guardar", Icons.Default.Save, model::save, enabled = !state.saving)
            ClimesaButton("Cancelar", Icons.AutoMirrored.Filled.ArrowBack, model::closeForm, enabled = !state.saving, outlined = true)
        } }
        item { Spacer(Modifier.height(24.dp)) }
    }
}

@Composable
private fun StaffField(label: String, value: String, error: String?, enabled: Boolean, change: (String) -> Unit) {
    OutlinedTextField(value, change, modifier = Modifier.fillMaxWidth(), label = { Text(label) }, isError = error != null, enabled = enabled, singleLine = true, supportingText = { if (error != null) Text(error) })
}
