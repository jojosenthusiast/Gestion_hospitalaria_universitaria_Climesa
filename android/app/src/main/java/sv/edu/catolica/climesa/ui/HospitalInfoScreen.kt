package sv.edu.catolica.climesa.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Bed
import androidx.compose.material.icons.filled.Campaign
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
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
    PageList(modifier) {
        item {
            Column(verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                SectionIntro(stringResource(R.string.hospital_info_eyebrow), stringResource(R.string.hospital_info_titulo), stringResource(R.string.hospital_info_detalle))
                LiveIndicator(Modifier.fillMaxWidth())
            }
        }
        if (state.loading) item { LoadingState() }
        else if (state.error != null) item { ErrorState(state.error, { model.load() }) }
        else {
            item { Text(stringResource(R.string.hospital_info_avisos), style = MaterialTheme.typography.titleLarge) }
            if (state.info.notices.isEmpty()) item { EmptyState(stringResource(R.string.hospital_info_sin_avisos), icon = Icons.Default.Campaign) }
            else items(state.info.notices, key = { it.id }) { notice -> DataRow(notice.title, subtitle = notice.body, leadingIcon = Icons.Default.Campaign) }
            item { Text(stringResource(R.string.hospital_info_ocupacion), style = MaterialTheme.typography.titleLarge) }
            val floors = HospitalInfoParser.byFloor(state.info.occupancy)
            if (floors.isEmpty()) item { EmptyState(stringResource(R.string.hospital_info_sin_camas), icon = Icons.Default.Bed) }
            else items(floors, key = { it.first ?: -1 }) { (floor, free, total) ->
                SectionCard(if (floor == null) stringResource(R.string.hospital_info_sin_planta) else stringResource(R.string.hospital_info_planta, floor)) {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Spacing.sm + Spacing.xs)) {
                        StatTile(free.toString(), stringResource(R.string.ui_camas_libres), Modifier.weight(1f), suffix = "/ $total", icon = Icons.Default.Bed)
                    }
                    state.info.occupancy.filter { it.floor == floor }.forEach { row ->
                        Text(stringResource(R.string.hospital_info_tipo, HospitalInfoParser.categoryLabels[row.category] ?: row.category, row.free, row.beds), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
            item { Text(stringResource(R.string.hospital_info_medicos), style = MaterialTheme.typography.titleLarge) }
            if (state.info.doctors.isEmpty()) item { EmptyState(stringResource(R.string.hospital_info_sin_medicos), icon = Icons.Default.Person) }
            else items(state.info.doctors) { doctor ->
                DataRow(doctor.name, subtitle = listOfNotNull(doctor.specialty, doctor.area).joinToString(" · "), leadingIcon = Icons.Default.Person)
            }
        }
    }
}
