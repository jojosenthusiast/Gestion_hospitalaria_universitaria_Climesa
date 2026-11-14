package sv.edu.catolica.climesa.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Save
import androidx.compose.material.icons.filled.ToggleOff
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
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
    PageList(modifier) {
        item { SectionIntro("Equipo / CLIMESA", "Personal") }
        item {
            LazyRow(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                item { FilterChip(selected = !state.showInactive, onClick = { if (state.showInactive) model.toggleInactive() }, label = { Text("Activos") }) }
                item { FilterChip(selected = state.showInactive, onClick = { if (!state.showInactive) model.toggleInactive() }, label = { Text("Todos") }) }
            }
        }
        if (state.canManage) item { PrimaryButton("Registrar personal", model::newMember, icon = Icons.Default.Add) }
        state.message?.let { item { NoticeBanner(NoticeKind.SUCCESS, it) } }
        when {
            state.loading -> item { LoadingState() }
            state.error != null -> item { ErrorState(state.error, onRetry = { model.load() }) }
            state.visible.isEmpty() -> item { EmptyState("No hay personal para mostrar con este filtro.") }
            else -> items(state.visible, key = { it.id }) { m ->
                DataRow(m.fullName, subtitle = StaffRules.typeLabel(m.type), onClick = { model.select(m.id) }, status = { StatusTag(if (m.active) "activo" else "inactivo") })
            }
        }
    }
}

@Composable
private fun StaffDetail(m: StaffMember, state: StaffState, model: StaffViewModel, modifier: Modifier) {
    var dialog by remember(m.id) { mutableStateOf(false) }
    var reason by remember(m.id) { mutableStateOf("") }
    PageList(modifier) {
        item { SecondaryButton("Volver", { model.select(null) }, icon = Icons.AutoMirrored.Filled.ArrowBack) }
        item {
            SectionCard(m.fullName, eyebrow = StaffRules.typeLabel(m.type), action = { StatusTag(if (m.active) "activo" else "inactivo") }) {
                if (m.specialty.isNotBlank()) LabeledValue("Especialidad", m.specialty)
                if (state.canSeePersonalData) {
                    LabeledValue("DUI", m.dui ?: "Sin registrar")
                    LabeledValue("Teléfono", m.phone.ifBlank { "Sin registrar" })
                }
            }
        }
        state.formError?.let { item { NoticeBanner(NoticeKind.ERROR, it) } }
        if (state.canManage) {
            item {
                ClimesaActionGroup {
                    PrimaryButton("Editar datos", { model.edit(m) }, icon = Icons.Default.Edit)
                    SecondaryButton(if (m.active) "Inactivar" else "Reactivar", { dialog = true }, icon = Icons.Default.ToggleOff, enabled = !state.saving)
                }
            }
        }
    }
    if (dialog) ConfirmDialog(
        title = if (m.active) "Inactivar personal" else "Reactivar personal",
        confirmLabel = "Confirmar",
        onConfirm = { model.changeActive(m, reason) },
        onDismiss = { dialog = false },
        destructive = m.active,
        busy = state.saving,
        confirmEnabled = ChangeReason.error(reason) == null,
        message = "La ficha y su historial se conservan.",
        body = { FormField("Motivo", reason, { reason = it.take(ChangeReason.MAX) }, hint = "Mínimo ${ChangeReason.MIN} caracteres", enabled = !state.saving) },
    )
}

@Composable
private fun StaffFormView(state: StaffState, model: StaffViewModel, modifier: Modifier) {
    val form = state.form ?: return
    val d = form.draft
    PageList(modifier) {
        item { SectionIntro("Personal / CLIMESA", if (form.editingId == null) "Nuevo personal" else "Editar personal") }
        item {
            SectionCard("Datos del personal") {
                StaffField("Nombres", d.givenNames, form.fields["givenNames"], !state.saving) { model.draft(d.copy(givenNames = it.take(80))) }
                StaffField("Apellidos", d.surnames, form.fields["surnames"], !state.saving) { model.draft(d.copy(surnames = it.take(100))) }
                Text("Función", style = MaterialTheme.typography.labelLarge)
                LazyRow(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                    itemsIndexed(StaffRules.typeCodes) { _, code -> FilterChip(selected = d.type == code, onClick = { model.draft(d.copy(type = code)) }, enabled = !state.saving, label = { Text(StaffRules.typeLabel(code)) }) }
                }
                StaffField("Especialidad · opcional", d.specialty, form.fields["specialty"], !state.saving) { model.draft(d.copy(specialty = it.take(120))) }
                if (state.canSeePersonalData) StaffField("DUI · opcional", d.dui, form.fields["dui"], !state.saving) { model.draft(d.copy(dui = it.take(10))) }
                StaffField("Teléfono · opcional", d.phone, form.fields["phone"], !state.saving) { model.draft(d.copy(phone = it.take(9))) }
                if (form.editingId != null) FormField("Motivo del cambio *", form.reason, model::reason, hint = "Mínimo ${ChangeReason.MIN} caracteres. Queda en el historial.", enabled = !state.saving, singleLine = false)
            }
        }
        state.formError?.let { item { NoticeBanner(NoticeKind.ERROR, it) } }
        item {
            ClimesaActionGroup {
                PrimaryButton("Guardar", model::save, icon = Icons.Default.Save, loading = state.saving)
                SecondaryButton("Cancelar", model::closeForm, icon = Icons.AutoMirrored.Filled.ArrowBack, enabled = !state.saving)
            }
        }
        item { Spacer(Modifier.height(Spacing.lg)) }
    }
}

@Composable
private fun StaffField(label: String, value: String, error: String?, enabled: Boolean, change: (String) -> Unit) {
    FormField(label, value, change, error = error, enabled = enabled)
}
