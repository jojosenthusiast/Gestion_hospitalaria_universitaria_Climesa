package sv.edu.catolica.climesa.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Arrangement
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

/** Profile card "Mis datos" (patient): own contact data with save. Shown only with `pacientes.editar_propios`. */
@Composable
internal fun MyDataCard(modifier: Modifier = Modifier, model: MyDataViewModel = viewModel()) {
    val state by model.state.collectAsStateWithLifecycle()
    LaunchedEffect(Unit) { model.load() }
    val data = state.data
    SectionCard("Mis datos", modifier) {
        if (data == null) {
            if (state.loading) Text("Cargando…", style = MaterialTheme.typography.bodyMedium)
            state.error?.let { NoticeBanner(NoticeKind.ERROR, it) }
            return@SectionCard
        }
        var phone by remember(data.version) { mutableStateOf(data.phone) }
        var email by remember(data.version) { mutableStateOf(data.email) }
        var address by remember(data.version) { mutableStateOf(data.address) }
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            LabeledValue("Nombre", data.fullName.ifBlank { "—" })
            LabeledValue("Expediente", data.record.ifBlank { "—" })
            Text("Tu nombre, DUI, fecha de nacimiento y sexo los corrige Recepción.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            state.error?.let { NoticeBanner(NoticeKind.ERROR, it) }
            if (state.saved) Text("Datos guardados.", style = MaterialTheme.typography.bodyMedium)
            FormField("Teléfono", phone, { phone = it.take(9) })
            FormField("Correo electrónico", email, { email = it.take(254) })
            FormField("Dirección", address, { address = it.take(500) })
            PrimaryButton(if (state.saving) "Guardando…" else "Guardar cambios", { model.save(phone, email, address) }, enabled = !state.saving, loading = state.saving)
        }
    }
}
