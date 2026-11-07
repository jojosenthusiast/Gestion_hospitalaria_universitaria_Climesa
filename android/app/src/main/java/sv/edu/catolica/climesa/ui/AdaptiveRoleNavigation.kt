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
import androidx.compose.ui.unit.dp
import sv.edu.catolica.climesa.domain.AndroidNavigationMode
import sv.edu.catolica.climesa.domain.AndroidNavigationPolicy
import sv.edu.catolica.climesa.domain.AndroidSection

private fun iconFor(section: AndroidSection): ImageVector = when (section) {
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
    topBar: @Composable () -> Unit,
    content: @Composable (PaddingValues) -> Unit,
) {
    androidx.compose.foundation.layout.BoxWithConstraints(Modifier.fillMaxSize()) {
        when (AndroidNavigationPolicy.mode(maxWidth.value.toInt())) {
            AndroidNavigationMode.BOTTOM_BAR -> CompactRoleScaffold(sections, selected, onSelected, topBar, content)
            AndroidNavigationMode.RAIL -> RailRoleScaffold(sections, selected, onSelected, topBar, content)
            AndroidNavigationMode.DRAWER -> DrawerRoleScaffold(sections, selected, onSelected, topBar, content)
        }
    }
}

@Composable
private fun CompactRoleScaffold(
    sections: List<AndroidSection>,
    selected: AndroidSection,
    onSelected: (AndroidSection) -> Unit,
    topBar: @Composable () -> Unit,
    content: @Composable (PaddingValues) -> Unit,
) {
    val partition = AndroidNavigationPolicy.compact(sections)
    var moreOpen by rememberSaveable { mutableStateOf(false) }
    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = topBar,
        bottomBar = {
            NavigationBar(containerColor = MaterialTheme.colorScheme.surface, tonalElevation = 0.dp) {
                partition.primary.forEach { section ->
                    NavigationBarItem(
                        selected = selected == section,
                        onClick = { onSelected(section) },
                        icon = { Icon(iconFor(section), contentDescription = null) },
                        label = { Text(section.label) },
                        colors = NavigationBarItemDefaults.colors(
                            selectedIconColor = MaterialTheme.colorScheme.onPrimary,
                            selectedTextColor = MaterialTheme.colorScheme.primary,
                            indicatorColor = MaterialTheme.colorScheme.primary,
                        ),
                    )
                }
                if (partition.overflow.isNotEmpty()) {
                    NavigationBarItem(
                        selected = selected in partition.overflow,
                        onClick = { moreOpen = true },
                        icon = { Icon(Icons.Default.MoreHoriz, contentDescription = null) },
                        label = { Text("Más") },
                    )
                }
            }
        },
        content = content,
    )
    if (moreOpen) {
        ModalBottomSheet(onDismissRequest = { moreOpen = false }) {
            Column(Modifier.padding(bottom = 20.dp)) {
                Text("Más secciones", style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(horizontal = 24.dp, vertical = 12.dp))
                partition.overflow.forEach { section ->
                    NavigationDrawerItem(
                        label = { Text(section.label) },
                        selected = selected == section,
                        onClick = { onSelected(section); moreOpen = false },
                        icon = { Icon(iconFor(section), contentDescription = null) },
                        badge = { Text(section.screenId.ifBlank { "CLIMESA" }, style = MaterialTheme.typography.labelSmall) },
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 2.dp),
                    )
                }
            }
        }
    }
}

@Composable
private fun RailRoleScaffold(
    sections: List<AndroidSection>,
    selected: AndroidSection,
    onSelected: (AndroidSection) -> Unit,
    topBar: @Composable () -> Unit,
    content: @Composable (PaddingValues) -> Unit,
) {
    Row(Modifier.fillMaxSize()) {
        NavigationRail(containerColor = MaterialTheme.colorScheme.surface) {
            Column(Modifier.fillMaxHeight().verticalScroll(rememberScrollState()).safeDrawingPadding()) {
                sections.forEach { section ->
                    NavigationRailItem(
                        selected = selected == section,
                        onClick = { onSelected(section) },
                        icon = { Icon(iconFor(section), contentDescription = null) },
                        label = { Text(section.label) },
                    )
                }
            }
        }
        Scaffold(
            modifier = Modifier.weight(1f),
            containerColor = MaterialTheme.colorScheme.background,
            topBar = topBar,
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
    content: @Composable (PaddingValues) -> Unit,
) {
    PermanentNavigationDrawer(
        drawerContent = {
            PermanentDrawerSheet(
                modifier = Modifier.widthIn(min = 248.dp, max = 288.dp),
                drawerContainerColor = MaterialTheme.colorScheme.surface,
            ) {
                Column(Modifier.fillMaxHeight().verticalScroll(rememberScrollState()).safeDrawingPadding().padding(horizontal = 12.dp, vertical = 20.dp)) {
                    Text("CLIMESA", style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.primary)
                    Text("Navegación", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(bottom = 20.dp))
                    sections.forEach { section ->
                        NavigationDrawerItem(
                            label = { Text(section.label) },
                            selected = selected == section,
                            onClick = { onSelected(section) },
                            icon = { Icon(iconFor(section), contentDescription = null) },
                        )
                    }
                }
            }
        },
    ) {
        Scaffold(
            containerColor = MaterialTheme.colorScheme.background,
            topBar = topBar,
            content = content,
        )
    }
}
