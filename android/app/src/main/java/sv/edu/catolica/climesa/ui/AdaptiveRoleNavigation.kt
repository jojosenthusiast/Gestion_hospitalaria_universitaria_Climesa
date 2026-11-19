@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package sv.edu.catolica.climesa.ui

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ListAlt
import androidx.compose.material.icons.outlined.AirportShuttle
import androidx.compose.material.icons.outlined.CleaningServices
import androidx.compose.material.icons.outlined.Emergency
import androidx.compose.material.icons.outlined.EventAvailable
import androidx.compose.material.icons.outlined.History
import androidx.compose.material.icons.outlined.HourglassTop
import androidx.compose.material.icons.outlined.KingBed
import androidx.compose.material.icons.outlined.Today
import androidx.compose.material.icons.outlined.DarkMode
import androidx.compose.material.icons.outlined.FolderShared
import androidx.compose.material.icons.outlined.Healing
import androidx.compose.material.icons.outlined.HowToReg
import androidx.compose.material.icons.outlined.Link
import androidx.compose.material.icons.outlined.MoveToInbox
import sv.edu.catolica.climesa.ui.icons.ClimesaIcons
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.ui.Alignment
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextOverflow
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
import sv.edu.catolica.climesa.domain.NoticeInboxRules
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics

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

/** E-04/E-07: every section has its own icon, so the bar and the "Más" sheet never repeat one. */
internal fun iconFor(section: AndroidSection): ImageVector = when (section) {
    // Web icon where the web has the concept (shell `moduleIcons`), Material Outlined where it has none or would repeat one.
    AndroidSection.HOME -> ClimesaIcons.Home
    AndroidSection.NOTICES -> ClimesaIcons.Bell
    AndroidSection.PROFILE -> ClimesaIcons.User
    AndroidSection.SHIFTS -> ClimesaIcons.Clock
    AndroidSection.APPOINTMENTS -> ClimesaIcons.Calendar
    AndroidSection.MY_APPOINTMENTS -> Icons.Outlined.EventAvailable
    AndroidSection.PATIENTS -> ClimesaIcons.Users
    AndroidSection.UNIDENTIFIED_PATIENT -> ClimesaIcons.Search
    AndroidSection.BEDS -> ClimesaIcons.Grid
    AndroidSection.ADMISSION -> ClimesaIcons.UserPlus
    AndroidSection.WARD -> ClimesaIcons.Building
    AndroidSection.UNIT -> ClimesaIcons.Ambulance
    AndroidSection.SERVICE -> Icons.Outlined.Emergency
    AndroidSection.DISPATCH -> ClimesaIcons.Desk
    AndroidSection.AMBULANCE_REQUEST -> ClimesaIcons.Phone
    AndroidSection.AMBULANCE_ARRIVAL -> Icons.Outlined.AirportShuttle
    AndroidSection.AMBULANCE_RECEPTION -> Icons.Outlined.MoveToInbox
    AndroidSection.RESULTS -> ClimesaIcons.Lab
    AndroidSection.RESULT_REVIEW -> ClimesaIcons.Audit
    AndroidSection.PATIENT_QUEUE -> Icons.Outlined.HourglassTop
    AndroidSection.QUEUE -> ClimesaIcons.Queue
    AndroidSection.HISTORY -> Icons.Outlined.History
    AndroidSection.MY_ROOM -> Icons.Outlined.KingBed
    AndroidSection.RECORD -> Icons.Outlined.FolderShared
    AndroidSection.LOG -> Icons.AutoMirrored.Outlined.ListAlt
    AndroidSection.MY_ACCESS -> ClimesaIcons.Privacy
    AndroidSection.LINK_RECORD -> Icons.Outlined.Link
    AndroidSection.LINKING -> Icons.Outlined.HowToReg
    AndroidSection.SUPPLIES -> ClimesaIcons.Inventory
    AndroidSection.MEDICAL_DAY -> Icons.Outlined.Today
    AndroidSection.CONSULTATIONS -> ClimesaIcons.Steth
    AndroidSection.HOSPITALIZED -> ClimesaIcons.Bed
    AndroidSection.INPATIENT_CARE -> Icons.Outlined.Healing
    AndroidSection.VITAL_SIGNS -> ClimesaIcons.Pulse
    AndroidSection.HOSPITAL_INFO -> ClimesaIcons.Info
    AndroidSection.ASSISTANT_STATION -> ClimesaIcons.Door
    AndroidSection.CLEANING -> Icons.Outlined.CleaningServices
    AndroidSection.PREHOSPITAL_REPORT -> ClimesaIcons.Clipboard
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
    /** D1: counts drawn on a section's entry (the unread notices on "Avisos"). */
    badges: Map<AndroidSection, Int> = emptyMap(),
    content: @Composable (PaddingValues) -> Unit,
) {
    androidx.compose.foundation.layout.BoxWithConstraints(Modifier.fillMaxSize()) {
        when (AndroidNavigationPolicy.mode(maxWidth.value.toInt())) {
            AndroidNavigationMode.BOTTOM_BAR -> CompactRoleScaffold(role, sections, selected, onSelected, dark, setDark, topBar, onLogout, showNavigation, snackbarHost, badges, content)
            AndroidNavigationMode.RAIL -> RailRoleScaffold(sections, selected, onSelected, topBar, onLogout, showNavigation, snackbarHost, badges, content)
            AndroidNavigationMode.DRAWER -> DrawerRoleScaffold(sections, selected, onSelected, topBar, onLogout, showNavigation, snackbarHost, badges, content)
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
    badges: Map<AndroidSection, Int>,
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
                        icon = { SectionIcon(section, badges) },
                        label = { Text(compactLabel(section), style = NavLabel, maxLines = 1, overflow = TextOverflow.Ellipsis) },
                        colors = barItemColors(),
                    )
                }
                NavigationBarItem(
                    selected = selected !in navigation.primary,
                    onClick = { moreOpen = true },
                    icon = { BadgedIcon(ClimesaIcons.Grid, navigation.more.flatMap { it.sections }.filter { it != AndroidSection.NOTICES }.sumOf { badges[it] ?: 0 }) },
                    label = { Text(stringResource(R.string.ui_mas), style = NavLabel, maxLines = 1) },
                    colors = barItemColors(),
                )
            }
        },
        content = content,
    )
    if (moreOpen) MoreSheet(navigation.more, selected, badges, dark, setDark, { onSelected(it); moreOpen = false }, { moreOpen = false }, onLogout)
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
    badges: Map<AndroidSection, Int>,
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
                        icon = { SectionIcon(section, badges) },
                        label = { Text(section.label, maxLines = 2) },
                    )
                }
                NavigationRailItem(
                    selected = false,
                    onClick = onLogout,
                    icon = { Icon(ClimesaIcons.Logout, contentDescription = null) },
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
    badges: Map<AndroidSection, Int>,
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
                            icon = { SectionIcon(section, badges) },
                        )
                    }
                    HorizontalDivider(modifier = Modifier.padding(vertical = 12.dp))
                    NavigationDrawerItem(label = { Text(stringResource(R.string.cerrar_sesion)) }, selected = false, onClick = onLogout, icon = { Icon(ClimesaIcons.Logout, contentDescription = null) })
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
    badges: Map<AndroidSection, Int>,
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
                entry.sections.forEach { section -> MoreRow(iconFor(section), section.label, selected == section, badge = badges[section] ?: 0) { onSelected(section) } }
            }
            MoreHeading(stringResource(R.string.ui_ajustes))
            Row(Modifier.fillMaxWidth().heightIn(min = 56.dp).padding(horizontal = 12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                Icon(Icons.Outlined.DarkMode, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(stringResource(R.string.ui_modo_oscuro), style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
                Switch(dark, setDark)
            }
            MoreRow(ClimesaIcons.Logout, stringResource(R.string.cerrar_sesion), false, chevron = false, onClick = onLogout)
        }
    }
}

@Composable
private fun MoreHeading(text: String) =
    Text(text, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(start = 12.dp, top = 12.dp, bottom = 4.dp))

@Composable
private fun MoreRow(icon: ImageVector, label: String, selected: Boolean, chevron: Boolean = true, badge: Int = 0, onClick: () -> Unit) {
    Surface(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth().heightIn(min = 56.dp),
        color = if (selected) MaterialTheme.colorScheme.primaryContainer else Color.Transparent,
        shape = MaterialTheme.shapes.medium,
    ) {
        Row(Modifier.padding(horizontal = 12.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            Icon(icon, contentDescription = null, tint = if (selected) MaterialTheme.climesa.primaryText else MaterialTheme.colorScheme.onSurfaceVariant)
            Text(label, style = MaterialTheme.typography.bodyLarge, color = if (selected) MaterialTheme.climesa.primaryText else MaterialTheme.colorScheme.onSurface, modifier = Modifier.weight(1f), maxLines = 2)
            NoticeInboxRules.badgeText(badge)?.let { CountBadge(it, badge) }
            if (chevron) Icon(ClimesaIcons.Chevron, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

/** D1: the section icon, with its count when it has one (screen readers hear "N avisos sin leer"). */
@Composable
private fun SectionIcon(section: AndroidSection, badges: Map<AndroidSection, Int>) = BadgedIcon(iconFor(section), badges[section] ?: 0)

@Composable
private fun BadgedIcon(icon: ImageVector, count: Int) {
    val text = NoticeInboxRules.badgeText(count)
    if (text == null) Icon(icon, contentDescription = null)
    else BadgedBox(badge = { CountBadge(text, count) }) { Icon(icon, contentDescription = null) }
}

@Composable
private fun CountBadge(text: String, count: Int) {
    val description = pluralStringResource(R.plurals.u5_avisos_sin_leer, count, count)
    Badge(Modifier.semantics { contentDescription = description }) { Text(text) }
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
