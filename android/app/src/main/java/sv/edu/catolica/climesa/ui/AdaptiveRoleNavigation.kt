@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package sv.edu.catolica.climesa.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.NavigationDrawerItem
import androidx.compose.material3.NavigationRail
import androidx.compose.material3.NavigationRailItem
import androidx.compose.material3.PermanentDrawerSheet
import androidx.compose.material3.PermanentNavigationDrawer
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.material3.NavigationRailItemDefaults
import androidx.compose.material3.NavigationDrawerItemDefaults
import androidx.compose.material3.HorizontalDivider
import sv.edu.catolica.climesa.R
import androidx.compose.ui.unit.dp
import sv.edu.catolica.climesa.domain.AndroidNavigationMode
import sv.edu.catolica.climesa.domain.AndroidNavigationPolicy
import sv.edu.catolica.climesa.domain.AndroidSection

private fun compactLabel(section: AndroidSection): String = when (section) {
    AndroidSection.QUEUE -> "Fila"
    AndroidSection.LINKING, AndroidSection.LINK_RECORD -> "Vincular"
    AndroidSection.ADMISSION -> "Admisión"
    AndroidSection.BEDS -> "Camas"
    AndroidSection.ASSISTANT_STATION -> "Consultorio"
    AndroidSection.VITAL_SIGNS -> "Signos"
    AndroidSection.WARD -> "Planta"
    AndroidSection.INPATIENT_CARE -> "Paciente"
    AndroidSection.CLEANING -> "Limpieza"
    AndroidSection.SUPPLIES -> "Insumos"
    AndroidSection.AMBULANCE_RECEPTION, AndroidSection.AMBULANCE_ARRIVAL -> "Llegada"
    AndroidSection.RESULT_REVIEW -> "Resultados"
    AndroidSection.RESULTS -> "Mis exámenes"
    AndroidSection.HOSPITALIZED -> "Hospitalizados"
    AndroidSection.SAMPLE -> "Muestra"
    AndroidSection.CAPTURE_RESULTS -> "Captura"
    AndroidSection.PREHOSPITAL_REPORT -> "Reporte"
    AndroidSection.UNIDENTIFIED_PATIENT -> "Paciente"
    else -> section.label
}

internal fun iconFor(section: AndroidSection): ImageVector = when (section) {
    AndroidSection.HOME -> Icons.Default.Home
    AndroidSection.PROFILE -> Icons.Default.AccountCircle
    AndroidSection.SHIFTS, AndroidSection.PLANNING -> Icons.Default.Schedule
    AndroidSection.APPOINTMENTS, AndroidSection.MY_APPOINTMENTS -> Icons.Default.DateRange
    AndroidSection.PATIENTS, AndroidSection.STAFF, AndroidSection.UNIDENTIFIED_PATIENT -> Icons.Default.Person
    AndroidSection.BEDS, AndroidSection.ADMISSION, AndroidSection.WARD -> Icons.Default.Bed
    AndroidSection.UNIT, AndroidSection.SERVICE, AndroidSection.DISPATCH, AndroidSection.AMBULANCE_REQUEST,
    AndroidSection.AMBULANCE_ARRIVAL, AndroidSection.AMBULANCE_RECEPTION -> Icons.Default.LocalShipping
    AndroidSection.LAB, AndroidSection.SAMPLE, AndroidSection.CAPTURE_RESULTS, AndroidSection.RESULTS,
    AndroidSection.RESULT_REVIEW -> Icons.Default.Science
    AndroidSection.PATIENT_QUEUE, AndroidSection.QUEUE -> Icons.AutoMirrored.Filled.List
    AndroidSection.HISTORY, AndroidSection.RECORD, AndroidSection.LOG, AndroidSection.MY_ACCESS -> Icons.Default.Description
    AndroidSection.LINK_RECORD -> Icons.Default.Link
    AndroidSection.SUPPLIES -> Icons.Default.Inventory
    AndroidSection.MEDICAL_DAY, AndroidSection.CONSULTATIONS, AndroidSection.HOSPITALIZED,
    AndroidSection.INPATIENT_CARE, AndroidSection.VITAL_SIGNS -> Icons.Default.LocalHospital
    AndroidSection.HOSPITAL_INFO -> Icons.Default.Info
    else -> Icons.Default.Dashboard
}

@Composable
internal fun AdaptiveRoleScaffold(
    sections: List<AndroidSection>,
    selected: AndroidSection,
    onSelected: (AndroidSection) -> Unit,
    topBar: @Composable (openMenu: () -> Unit) -> Unit,
    onLogout: () -> Unit,
    content: @Composable (PaddingValues) -> Unit,
) {
    androidx.compose.foundation.layout.BoxWithConstraints(Modifier.fillMaxSize()) {
        when (AndroidNavigationPolicy.mode(maxWidth.value.toInt())) {
            AndroidNavigationMode.BOTTOM_BAR -> CompactRoleScaffold(sections, selected, onSelected, topBar, onLogout, content)
            AndroidNavigationMode.RAIL -> RailRoleScaffold(sections, selected, onSelected, topBar, onLogout, content)
            AndroidNavigationMode.DRAWER -> DrawerRoleScaffold(sections, selected, onSelected, topBar, onLogout, content)
        }
    }
}

@Composable
private fun CompactRoleScaffold(
    sections: List<AndroidSection>,
    selected: AndroidSection,
    onSelected: (AndroidSection) -> Unit,
    topBar: @Composable (openMenu: () -> Unit) -> Unit,
    onLogout: () -> Unit,
    content: @Composable (PaddingValues) -> Unit,
) {
    val partition = AndroidNavigationPolicy.compact(sections)
    var menuOpen by rememberSaveable { mutableStateOf(false) }
    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = { topBar { menuOpen = true } },
        bottomBar = {
            NavigationBar(containerColor = MaterialTheme.colorScheme.surface, tonalElevation = 0.dp) {
                partition.primary.forEach { section ->
                    NavigationBarItem(
                        selected = selected == section,
                        onClick = { onSelected(section) },
                        icon = { Icon(iconFor(section), contentDescription = null) },
                        label = { Text(compactLabel(section), maxLines = 2) },
                        colors = barItemColors(),
                    )
                }
            }
        },
        content = content,
    )
    if (menuOpen) RoleMenuSheet(partition.overflow, selected, { onSelected(it); menuOpen = false }, { menuOpen = false }, onLogout)
}

@Composable
private fun RailRoleScaffold(
    sections: List<AndroidSection>,
    selected: AndroidSection,
    onSelected: (AndroidSection) -> Unit,
    topBar: @Composable (openMenu: () -> Unit) -> Unit,
    onLogout: () -> Unit,
    content: @Composable (PaddingValues) -> Unit,
) {
    var menuOpen by rememberSaveable { mutableStateOf(false) }
    Row(Modifier.fillMaxSize()) {
        NavigationRail(containerColor = MaterialTheme.colorScheme.surface) {
            Column(Modifier.fillMaxHeight().verticalScroll(rememberScrollState()).safeDrawingPadding()) {
                sections.forEach { section ->
                    NavigationRailItem(
                        colors = railItemColors(),
                        selected = selected == section,
                        onClick = { onSelected(section) },
                        icon = { Icon(iconFor(section), contentDescription = null) },
                        label = { Text(section.label, maxLines = 2) },
                    )
                }
            }
        }
        Scaffold(
            modifier = Modifier.weight(1f),
            containerColor = MaterialTheme.colorScheme.background,
            topBar = { topBar { menuOpen = true } },
            content = content,
        )
    }
    if (menuOpen) RoleMenuSheet(AndroidNavigationPolicy.compact(sections).overflow, selected, { onSelected(it); menuOpen = false }, { menuOpen = false }, onLogout)
}

@Composable
private fun DrawerRoleScaffold(
    sections: List<AndroidSection>,
    selected: AndroidSection,
    onSelected: (AndroidSection) -> Unit,
    topBar: @Composable (openMenu: () -> Unit) -> Unit,
    onLogout: () -> Unit,
    content: @Composable (PaddingValues) -> Unit,
) {
    var menuOpen by rememberSaveable { mutableStateOf(false) }
    PermanentNavigationDrawer(
        drawerContent = {
            PermanentDrawerSheet(
                modifier = Modifier.widthIn(min = 248.dp, max = 288.dp),
                drawerContainerColor = MaterialTheme.colorScheme.surface,
            ) {
                Column(Modifier.fillMaxHeight().verticalScroll(rememberScrollState()).safeDrawingPadding().padding(horizontal = 12.dp, vertical = 20.dp)) {
                    Row(Modifier.padding(start = 12.dp, bottom = 20.dp), verticalAlignment = androidx.compose.ui.Alignment.CenterVertically, horizontalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(10.dp)) {
                        BrandMark()
                        Column {
                            Text(stringResource(R.string.ui_marca), style = MaterialTheme.typography.titleLarge)
                            Text(stringResource(R.string.ui_marca_subtitulo), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                    sections.forEach { section ->
                        NavigationDrawerItem(
                            colors = drawerItemColors(),
                            label = { Text(section.label, maxLines = 2) },
                            selected = selected == section,
                            onClick = { onSelected(section) },
                            icon = { Icon(iconFor(section), contentDescription = null) },
                        )
                    }
                    androidx.compose.material3.HorizontalDivider(modifier = Modifier.padding(vertical = 12.dp))
                    NavigationDrawerItem(label = { Text(stringResource(R.string.cerrar_sesion)) }, selected = false, onClick = onLogout, icon = { Icon(Icons.Default.Logout, contentDescription = null) })
                }
            }
        },
    ) {
        Scaffold(
            containerColor = MaterialTheme.colorScheme.background,
            topBar = { topBar { menuOpen = true } },
            content = content,
        )
    }
    if (menuOpen) RoleMenuSheet(AndroidNavigationPolicy.compact(sections).overflow, selected, { onSelected(it); menuOpen = false }, { menuOpen = false }, onLogout)
}

@Composable
private fun RoleMenuSheet(
    sections: List<AndroidSection>,
    selected: AndroidSection,
    onSelected: (AndroidSection) -> Unit,
    onDismiss: () -> Unit,
    onLogout: () -> Unit,
) {
    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(Modifier.fillMaxHeight(0.82f).verticalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 12.dp)) {
            Text(stringResource(R.string.ui_mas_funciones), style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(horizontal = 8.dp, vertical = 8.dp))
            sections.forEach { section ->
                NavigationDrawerItem(
                    colors = drawerItemColors(),
                    label = { Text(section.label, maxLines = 2) },
                    selected = selected == section,
                    onClick = { onSelected(section) },
                    icon = { Icon(iconFor(section), contentDescription = null) },
                )
            }
            androidx.compose.material3.HorizontalDivider(modifier = Modifier.padding(vertical = 12.dp))
            NavigationDrawerItem(label = { Text(stringResource(R.string.cerrar_sesion)) }, selected = false, onClick = onLogout, icon = { Icon(Icons.Default.Logout, contentDescription = null) })
        }
    }
}

// Selected section reads like the web nav: soft blue pill with the primary text colour.
@Composable
internal fun barItemColors() = NavigationBarItemDefaults.colors(
    selectedIconColor = MaterialTheme.climesa.primaryText,
    selectedTextColor = MaterialTheme.climesa.primaryText,
    indicatorColor = MaterialTheme.colorScheme.primaryContainer,
    unselectedIconColor = MaterialTheme.colorScheme.onSurfaceVariant,
    unselectedTextColor = MaterialTheme.colorScheme.onSurfaceVariant,
)

@Composable
internal fun railItemColors() = NavigationRailItemDefaults.colors(
    selectedIconColor = MaterialTheme.climesa.primaryText,
    selectedTextColor = MaterialTheme.climesa.primaryText,
    indicatorColor = MaterialTheme.colorScheme.primaryContainer,
    unselectedIconColor = MaterialTheme.colorScheme.onSurfaceVariant,
    unselectedTextColor = MaterialTheme.colorScheme.onSurfaceVariant,
)

@Composable
internal fun drawerItemColors() = NavigationDrawerItemDefaults.colors(
    selectedContainerColor = MaterialTheme.colorScheme.primaryContainer,
    selectedIconColor = MaterialTheme.climesa.primaryText,
    selectedTextColor = MaterialTheme.climesa.primaryText,
    unselectedContainerColor = androidx.compose.ui.graphics.Color.Transparent,
)
