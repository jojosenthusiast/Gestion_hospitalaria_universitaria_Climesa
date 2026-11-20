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
import androidx.compose.material.icons.automirrored.filled.FactCheck
import androidx.compose.material.icons.automirrored.filled.ListAlt
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
import sv.edu.catolica.climesa.domain.NoticeInboxRules
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics

/** D85: the bottom-bar name of a section, for "Volver a Internados" outside the bar. */
internal fun sectionShortLabel(section: AndroidSection): String = compactLabel(section)

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
    // D132: one short word survives the largest font size in the bar.
    AndroidSection.SHIFTS -> "Turnos"
    AndroidSection.LOG -> "Bitácora"
    else -> section.label
}

/** E-04/E-07: every section has its own icon, so the bar and the "Más" sheet never repeat one. */
internal fun iconFor(section: AndroidSection): ImageVector = when (section) {
    AndroidSection.HOME -> Icons.Default.Home
    AndroidSection.NOTICES -> Icons.Default.Notifications
    AndroidSection.PROFILE -> Icons.Default.AccountCircle
    AndroidSection.SHIFTS -> Icons.Default.Schedule
    AndroidSection.APPOINTMENTS -> Icons.Default.DateRange
    AndroidSection.MY_APPOINTMENTS -> Icons.Default.EventAvailable
    AndroidSection.PATIENTS -> Icons.Default.Groups
    AndroidSection.UNIDENTIFIED_PATIENT -> Icons.Default.PersonSearch
    AndroidSection.BEDS -> Icons.Default.Bed
    AndroidSection.ADMISSION -> Icons.Default.AssignmentInd
    AndroidSection.WARD -> Icons.Default.Apartment
    AndroidSection.UNIT -> Icons.Default.LocalShipping
    AndroidSection.SERVICE -> Icons.Default.Emergency
    AndroidSection.DISPATCH -> Icons.Default.SupportAgent
    AndroidSection.AMBULANCE_REQUEST -> Icons.Default.Sos
    AndroidSection.AMBULANCE_ARRIVAL -> Icons.Default.AirportShuttle
    AndroidSection.AMBULANCE_RECEPTION -> Icons.Default.MoveToInbox
    AndroidSection.RESULTS -> Icons.Default.Science
    AndroidSection.RESULT_REVIEW -> Icons.AutoMirrored.Filled.FactCheck
    AndroidSection.PATIENT_QUEUE -> Icons.Default.HourglassTop
    AndroidSection.QUEUE -> Icons.Default.ConfirmationNumber
    AndroidSection.HISTORY -> Icons.Default.History
    AndroidSection.MY_ROOM -> Icons.Default.KingBed
    AndroidSection.RECORD -> Icons.Default.FolderShared
    AndroidSection.LOG -> Icons.AutoMirrored.Filled.ListAlt
    AndroidSection.MY_ACCESS -> Icons.Default.Shield
    AndroidSection.LINK_RECORD -> Icons.Default.Link
    AndroidSection.LINKING -> Icons.Default.HowToReg
    AndroidSection.SUPPLIES -> Icons.Default.Inventory
    AndroidSection.MEDICAL_DAY -> Icons.Default.Today
    AndroidSection.CONSULTATIONS -> Icons.Default.MedicalServices
    AndroidSection.HOSPITALIZED -> Icons.Default.Hotel
    AndroidSection.INPATIENT_CARE -> Icons.Default.Healing
    AndroidSection.VITAL_SIGNS -> Icons.Default.MonitorHeart
    AndroidSection.HOSPITAL_INFO -> Icons.Default.Info
    AndroidSection.ASSISTANT_STATION -> Icons.Default.MeetingRoom
    AndroidSection.CLEANING -> Icons.Default.CleaningServices
    AndroidSection.PREHOSPITAL_REPORT -> Icons.Default.NoteAlt
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
            // D79/D101: while the keyboard is open the bottom bar steps aside, so a form never has the bar (and a blank gap)
            // between its last field and the keyboard. Only the bar slot changes; the screen keeps its state.
            if (showNavigation && !imeVisible()) NavigationBar(containerColor = MaterialTheme.colorScheme.surface, tonalElevation = 0.dp) {
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
                    icon = { BadgedIcon(Icons.Default.GridView, navigation.more.flatMap { it.sections }.filter { it != AndroidSection.NOTICES }.sumOf { badges[it] ?: 0 }) },
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
            if (chevron) Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
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
