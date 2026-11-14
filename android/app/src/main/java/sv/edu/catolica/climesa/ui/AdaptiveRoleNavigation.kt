@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package sv.edu.catolica.climesa.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.ui.Alignment
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import sv.edu.catolica.climesa.domain.MoreEntry
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
    AndroidSection.PATIENTS -> "Pacientes"
    AndroidSection.APPOINTMENTS -> "Citas"
    AndroidSection.MY_APPOINTMENTS -> "Mis citas"
    AndroidSection.PATIENT_QUEUE -> "Mi turno"
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
    AndroidSection.MEDICAL_DAY -> "Mi día"
    AndroidSection.RESULT_REVIEW -> "Resultados"
    AndroidSection.RESULTS -> "Exámenes"
    AndroidSection.HOSPITALIZED -> "Internados"
    AndroidSection.SERVICE -> "Servicio"
    AndroidSection.UNIT -> "Unidad"
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
    AndroidSection.RESULTS,
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
    role: String,
    sections: List<AndroidSection>,
    selected: AndroidSection,
    onSelected: (AndroidSection) -> Unit,
    dark: Boolean,
    setDark: (Boolean) -> Unit,
    topBar: @Composable () -> Unit,
    onLogout: () -> Unit,
    showNavigation: Boolean = true,
    snackbarHost: @Composable () -> Unit = {},
    content: @Composable (PaddingValues) -> Unit,
) {
    androidx.compose.foundation.layout.BoxWithConstraints(Modifier.fillMaxSize()) {
        when (AndroidNavigationPolicy.mode(maxWidth.value.toInt())) {
            AndroidNavigationMode.BOTTOM_BAR -> CompactRoleScaffold(role, sections, selected, onSelected, dark, setDark, topBar, onLogout, showNavigation, snackbarHost, content)
            AndroidNavigationMode.RAIL -> RailRoleScaffold(sections, selected, onSelected, topBar, onLogout, showNavigation, snackbarHost, content)
            AndroidNavigationMode.DRAWER -> DrawerRoleScaffold(sections, selected, onSelected, topBar, onLogout, showNavigation, snackbarHost, content)
        }
    }
}

/**
 * Phone navigation: Inicio plus the role's core tasks, and a fifth "Más" item that opens a grouped sheet with everything else.
 * No hamburger: the top bar only carries the screen title and, on detail screens, the back arrow.
 */
@Composable
private fun CompactRoleScaffold(
    role: String,
    sections: List<AndroidSection>,
    selected: AndroidSection,
    onSelected: (AndroidSection) -> Unit,
    dark: Boolean,
    setDark: (Boolean) -> Unit,
    topBar: @Composable () -> Unit,
    onLogout: () -> Unit,
    showNavigation: Boolean,
    snackbarHost: @Composable () -> Unit,
    content: @Composable (PaddingValues) -> Unit,
) {
    val navigation = AndroidNavigationPolicy.compact(role, sections)
    var moreOpen by rememberSaveable { mutableStateOf(false) }
    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = topBar,
        snackbarHost = snackbarHost,
        bottomBar = {
            if (showNavigation) NavigationBar(containerColor = MaterialTheme.colorScheme.surface, tonalElevation = 0.dp) {
                navigation.primary.forEach { section ->
                    NavigationBarItem(
                        selected = selected == section,
                        onClick = { onSelected(section) },
                        icon = { Icon(iconFor(section), contentDescription = null) },
                        label = { Text(compactLabel(section), maxLines = 1, overflow = TextOverflow.Ellipsis) },
                        colors = barItemColors(),
                    )
                }
                NavigationBarItem(
                    selected = selected !in navigation.primary,
                    onClick = { moreOpen = true },
                    icon = { Icon(Icons.Default.GridView, contentDescription = null) },
                    label = { Text(stringResource(R.string.ui_mas), maxLines = 1) },
                    colors = barItemColors(),
                )
            }
        },
        content = content,
    )
    if (moreOpen) MoreSheet(navigation.more, selected, dark, setDark, { onSelected(it); moreOpen = false }, { moreOpen = false }, onLogout)
}

@Composable
private fun RailRoleScaffold(
    sections: List<AndroidSection>,
    selected: AndroidSection,
    onSelected: (AndroidSection) -> Unit,
    topBar: @Composable () -> Unit,
    onLogout: () -> Unit,
    showNavigation: Boolean,
    snackbarHost: @Composable () -> Unit,
    content: @Composable (PaddingValues) -> Unit,
) {
    Row(Modifier.fillMaxSize()) {
        if (showNavigation) NavigationRail(containerColor = MaterialTheme.colorScheme.surface) {
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
                NavigationRailItem(
                    selected = false,
                    onClick = onLogout,
                    icon = { Icon(Icons.Default.Logout, contentDescription = null) },
                    label = { Text(stringResource(R.string.cerrar_sesion), maxLines = 2) },
                )
            }
        }
        Scaffold(
            modifier = Modifier.weight(1f),
            containerColor = MaterialTheme.colorScheme.background,
            topBar = topBar,
            snackbarHost = snackbarHost,
            content = content,
        )
    }
}

@Composable
private fun DrawerRoleScaffold(
    sections: List<AndroidSection>,
    selected: AndroidSection,
    onSelected: (AndroidSection) -> Unit,
    topBar: @Composable () -> Unit,
    onLogout: () -> Unit,
    showNavigation: Boolean,
    snackbarHost: @Composable () -> Unit,
    content: @Composable (PaddingValues) -> Unit,
) {
    val screen: @Composable () -> Unit = {
        Scaffold(containerColor = MaterialTheme.colorScheme.background, topBar = topBar, snackbarHost = snackbarHost, content = content)
    }
    if (!showNavigation) { screen(); return }
    PermanentNavigationDrawer(
        drawerContent = {
            PermanentDrawerSheet(
                modifier = Modifier.widthIn(min = 248.dp, max = 288.dp),
                drawerContainerColor = MaterialTheme.colorScheme.surface,
            ) {
                Column(Modifier.fillMaxHeight().verticalScroll(rememberScrollState()).safeDrawingPadding().padding(horizontal = 12.dp, vertical = 20.dp)) {
                    Row(Modifier.padding(start = 12.dp, bottom = 20.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
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
                    HorizontalDivider(modifier = Modifier.padding(vertical = 12.dp))
                    NavigationDrawerItem(label = { Text(stringResource(R.string.cerrar_sesion)) }, selected = false, onClick = onLogout, icon = { Icon(Icons.Default.Logout, contentDescription = null) })
                }
            }
        },
        content = { screen() },
    )
}

/** "Más": everything that is not in the bar, in labelled groups with 56dp rows, plus appearance and sign-out. */
@Composable
private fun MoreSheet(
    more: List<MoreEntry>,
    selected: AndroidSection,
    dark: Boolean,
    setDark: (Boolean) -> Unit,
    onSelected: (AndroidSection) -> Unit,
    onDismiss: () -> Unit,
    onLogout: () -> Unit,
) {
    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(Modifier.verticalScroll(rememberScrollState()).padding(horizontal = 16.dp).padding(bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            more.forEach { entry ->
                MoreHeading(entry.group.title)
                entry.sections.forEach { section -> MoreRow(iconFor(section), section.label, selected == section) { onSelected(section) } }
            }
            MoreHeading(stringResource(R.string.ui_ajustes))
            Row(Modifier.fillMaxWidth().heightIn(min = 56.dp).padding(horizontal = 12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                Icon(Icons.Default.DarkMode, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(stringResource(R.string.ui_modo_oscuro), style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
                Switch(dark, setDark)
            }
            MoreRow(Icons.Default.Logout, stringResource(R.string.cerrar_sesion), false, chevron = false, onClick = onLogout)
        }
    }
}

@Composable
private fun MoreHeading(text: String) =
    Text(text, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(start = 12.dp, top = 12.dp, bottom = 4.dp))

@Composable
private fun MoreRow(icon: ImageVector, label: String, selected: Boolean, chevron: Boolean = true, onClick: () -> Unit) {
    Surface(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth().heightIn(min = 56.dp),
        color = if (selected) MaterialTheme.colorScheme.primaryContainer else Color.Transparent,
        shape = MaterialTheme.shapes.medium,
    ) {
        Row(Modifier.padding(horizontal = 12.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            Icon(icon, contentDescription = null, tint = if (selected) MaterialTheme.climesa.primaryText else MaterialTheme.colorScheme.onSurfaceVariant)
            Text(label, style = MaterialTheme.typography.bodyLarge, color = if (selected) MaterialTheme.climesa.primaryText else MaterialTheme.colorScheme.onSurface, modifier = Modifier.weight(1f), maxLines = 2)
            if (chevron) Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
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
