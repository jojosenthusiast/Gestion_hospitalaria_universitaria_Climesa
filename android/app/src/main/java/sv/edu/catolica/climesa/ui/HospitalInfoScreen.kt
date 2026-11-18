package sv.edu.catolica.climesa.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.heightIn
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
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import sv.edu.catolica.climesa.R
import sv.edu.catolica.climesa.domain.HospitalInfoParser
import sv.edu.catolica.climesa.domain.HospitalInfoPart

/** A10 · información del hospital para todos los roles: ocupación general, médicos de turno y avisos. */
@Composable
fun HospitalInfoScreen(modifier: Modifier = Modifier, model: HospitalInfoViewModel = viewModel()) {
    val state by model.state.collectAsStateWithLifecycle()
    LaunchedEffect(Unit) { model.load(); model.startLive() }
    var allDoctors by androidx.compose.runtime.saveable.rememberSaveable { androidx.compose.runtime.mutableStateOf(false) }
    val uri = androidx.compose.ui.platform.LocalUriHandler.current
    PageList(modifier) {
        if (state.loading) item { LoadingState() }
        else if (state.error != null) item { ErrorState(state.error, { model.load() }) }
        else {
            // Ubicación first (iOS «Ubicación»): name, address, phone, call and map. Without it, a map search by name.
            item {
                val place = state.info.location
                SectionCard(place?.name ?: stringResource(R.string.pac_hospital_ubicacion)) {
                    place?.let {
                        if (it.address.isNotBlank()) Text(it.address, style = MaterialTheme.typography.bodyMedium)
                        val town = listOf(it.municipality, it.department).filter(String::isNotBlank).joinToString(", ")
                        if (town.isNotBlank()) Text(town, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        if (it.phone.isNotBlank()) Text(stringResource(R.string.pac_hospital_telefono, it.phone), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(Spacing.xs)) {
                        place?.callUri?.let { call -> RowAction(stringResource(R.string.pac_hospital_llamar), { runCatching { uri.openUri(call) } }) }
                        RowAction(stringResource(R.string.pac_hospital_mapa), { runCatching { uri.openUri(place?.mapUri ?: "geo:0,0?q=CLIMESA") } })
                    }
                }
            }
            item { Text(stringResource(R.string.hospital_info_avisos), style = MaterialTheme.typography.titleLarge) }
            if (HospitalInfoPart.NOTICES in state.info.failed) item { PartFailed { model.load() } }
            else if (state.info.notices.isEmpty()) item { EmptyState(stringResource(R.string.hospital_info_sin_avisos), icon = Icons.Default.Campaign) }
            else items(state.info.notices, key = { it.id }) { notice -> DataRow(notice.title, subtitle = notice.body, leadingIcon = Icons.Default.Campaign) }
            item { Text(stringResource(R.string.hospital_info_ocupacion), style = MaterialTheme.typography.titleLarge) }
            val floors = HospitalInfoParser.byFloor(state.info.occupancy)
            if (HospitalInfoPart.OCCUPANCY in state.info.failed) item { PartFailed { model.load() } }
            else if (floors.isEmpty()) item { EmptyState(stringResource(R.string.hospital_info_sin_camas), icon = Icons.Default.Bed) }
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
            val doctors = state.info.doctors
            if (HospitalInfoPart.DOCTORS in state.info.failed) item { PartFailed { model.load() } }
            else if (doctors.isEmpty()) item { EmptyState(stringResource(R.string.hospital_info_sin_medicos), icon = Icons.Default.Person) }
            else {
                // A long roster folds after the first few; one line opens the rest.
                items(if (allDoctors) doctors else doctors.take(DOCTORS_VISIBLE)) { doctor ->
                    DataRow(doctor.name, subtitle = listOfNotNull(doctor.specialty, doctor.area).joinToString(" · "), leadingIcon = Icons.Default.Person)
                }
                if (doctors.size > DOCTORS_VISIBLE) item {
                    androidx.compose.material3.TextButton(onClick = { allDoctors = !allDoctors }, modifier = Modifier.heightIn(min = Spacing.touch)) {
                        Text(if (allDoctors) stringResource(R.string.pac_hospital_medicos_menos) else stringResource(R.string.pac_hospital_medicos_todos, doctors.size))
                    }
                }
            }
        }
    }
}

private const val DOCTORS_VISIBLE = 5

/** A part of the screen that could not be read: its own notice and «Reintentar», the rest stays. */
@Composable
private fun PartFailed(retry: () -> Unit) {
    ClimesaActionGroup {
        NoticeBanner(NoticeKind.WARNING, stringResource(R.string.pac_hospital_parte_fallo))
        SecondaryButton(stringResource(R.string.camas_reintentar), retry)
    }
}
