package sv.edu.catolica.climesa.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import sv.edu.catolica.climesa.R
import sv.edu.catolica.climesa.domain.HospitalInfoParser

/** A10 · información del hospital para todos los roles: ocupación general, médicos de turno y avisos. */
@Composable
fun HospitalInfoScreen(modifier: Modifier = Modifier, model: HospitalInfoViewModel = viewModel()) {
    val state by model.state.collectAsStateWithLifecycle()
    LaunchedEffect(Unit) { model.load(); model.startLive() }
    LazyColumn(modifier, contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        item { SectionIntro(stringResource(R.string.hospital_info_eyebrow), stringResource(R.string.hospital_info_titulo), stringResource(R.string.hospital_info_detalle)) }
        state.error?.let { error -> item { ClimesaActionGroup { Text(error, color = MaterialTheme.colorScheme.error); ClimesaButton(stringResource(R.string.camas_reintentar), Icons.Default.Refresh, { model.load() }, outlined = true) } } }
        if (state.loading) item { CircularProgressIndicator() }
        else if (state.error == null) {
            item { Text(stringResource(R.string.hospital_info_avisos), style = MaterialTheme.typography.titleLarge) }
            if (state.info.notices.isEmpty()) item { ClimesaCard { Text(stringResource(R.string.hospital_info_sin_avisos), Modifier.padding(18.dp)) } }
            else items(state.info.notices, key = { it.id }) { notice ->
                ClimesaCard { Column(Modifier.fillMaxWidth().padding(18.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(notice.title, style = MaterialTheme.typography.titleMedium)
                    Text(notice.body, style = MaterialTheme.typography.bodyMedium)
                } }
            }
            item { Text(stringResource(R.string.hospital_info_ocupacion), style = MaterialTheme.typography.titleLarge) }
            val floors = HospitalInfoParser.byFloor(state.info.occupancy)
            if (floors.isEmpty()) item { ClimesaCard { Text(stringResource(R.string.hospital_info_sin_camas), Modifier.padding(18.dp)) } }
            else items(floors, key = { it.first ?: -1 }) { (floor, free, total) ->
                ClimesaCard { Column(Modifier.fillMaxWidth().padding(18.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(if (floor == null) stringResource(R.string.hospital_info_sin_planta) else stringResource(R.string.hospital_info_planta, floor), style = MaterialTheme.typography.titleMedium)
                    Text(stringResource(R.string.hospital_info_libres_de, free, total), style = MaterialTheme.typography.bodyMedium)
                    state.info.occupancy.filter { it.floor == floor }.forEach { row ->
                        Text(stringResource(R.string.hospital_info_tipo, HospitalInfoParser.categoryLabels[row.category] ?: row.category, row.free, row.beds), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                } }
            }
            item { Text(stringResource(R.string.hospital_info_medicos), style = MaterialTheme.typography.titleLarge) }
            if (state.info.doctors.isEmpty()) item { ClimesaCard { Text(stringResource(R.string.hospital_info_sin_medicos), Modifier.padding(18.dp)) } }
            else items(state.info.doctors) { doctor ->
                ClimesaCard { Column(Modifier.fillMaxWidth().padding(18.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(doctor.name, style = MaterialTheme.typography.titleMedium)
                    Text(listOfNotNull(doctor.specialty, doctor.area).joinToString(" · "), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                } }
            }
        }
    }
}
