package sv.edu.catolica.climesa.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.automirrored.filled.Send
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
import sv.edu.catolica.climesa.domain.LinkStatus

/** A03 · Vincular expediente (spec 101). The typed DUI and date survive rotation (`rememberSaveable`). */
@Composable
fun LinkRecordScreen(profile: AccessProfile, modifier: Modifier = Modifier, model: LinkRecordViewModel = viewModel()) {
    val state by model.state.collectAsStateWithLifecycle()
    var dui by rememberSaveable { mutableStateOf("") }
    var birth by rememberSaveable { mutableStateOf("") }
    LaunchedEffect(profile.patientId) { model.init(profile.patientId) }
    LaunchedEffect(profile.channels) { model.startLive(profile.channels) }
    LazyColumn(modifier, contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        item { SectionIntro(stringResource(R.string.vinculo_eyebrow), stringResource(R.string.vinculo_titulo), stringResource(R.string.vinculo_detalle)) }
        when (state.status) {
            LinkStatus.APPROVED -> item { ClimesaCard { Column(Modifier.fillMaxWidth().padding(18.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                InlineStatus(stringResource(R.string.vinculo_aprobada), Icons.Default.Check)
                Text(stringResource(R.string.vinculo_aprobada_detalle), style = MaterialTheme.typography.bodyMedium)
            } } }
            LinkStatus.PENDING -> item { ClimesaCard { Column(Modifier.fillMaxWidth().padding(18.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(stringResource(R.string.vinculo_en_verificacion), style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.primary)
                Text(stringResource(R.string.vinculo_en_verificacion_detalle), style = MaterialTheme.typography.bodyMedium)
            } } }
            LinkStatus.REJECTED -> item { ClimesaActionGroup {
                Text(stringResource(R.string.vinculo_rechazada), style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.error)
                Text(stringResource(R.string.vinculo_rechazada_detalle), style = MaterialTheme.typography.bodyMedium)
                ClimesaButton(stringResource(R.string.vinculo_volver_a_pedir), Icons.Default.Refresh, { model.retry() }, outlined = true)
            } }
            LinkStatus.FORM -> item { ClimesaActionGroup {
                state.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                OutlinedTextField(dui, { dui = it.take(10) }, label = { Text(stringResource(R.string.vinculo_dui)) }, modifier = Modifier.fillMaxWidth(), singleLine = true,
                    isError = "dui" in state.fieldErrors, supportingText = state.fieldErrors["dui"]?.let { { Text(it) } })
                OutlinedTextField(birth, { birth = it.take(10) }, label = { Text(stringResource(R.string.vinculo_nacimiento)) }, placeholder = { Text(stringResource(R.string.vinculo_nacimiento_formato)) }, modifier = Modifier.fillMaxWidth(), singleLine = true,
                    isError = "birth" in state.fieldErrors, supportingText = state.fieldErrors["birth"]?.let { { Text(it) } })
                Text(stringResource(R.string.vinculo_privacidad), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                ClimesaButton(stringResource(if (state.busy) R.string.vinculo_enviando else R.string.vinculo_enviar), Icons.AutoMirrored.Filled.Send, { model.submit(dui, birth) }, enabled = !state.busy && dui.isNotBlank() && birth.isNotBlank())
            } }
        }
    }
}
