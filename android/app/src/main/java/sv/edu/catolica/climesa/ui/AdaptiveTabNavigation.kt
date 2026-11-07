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
import androidx.compose.material.icons.filled.MoreHoriz
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationDrawerItem
import androidx.compose.material3.NavigationRail
import androidx.compose.material3.NavigationRailItem
import androidx.compose.material3.ModalBottomSheet
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

data class AdaptiveNavItem(val label: String, val icon: ImageVector)

@Composable
internal fun AdaptiveTabScaffold(
    items: List<AdaptiveNavItem>,
    selected: Int,
    onSelected: (Int) -> Unit,
    showNavigation: Boolean,
    topBar: @Composable () -> Unit,
    snackbarHost: @Composable () -> Unit,
    content: @Composable (PaddingValues) -> Unit,
) {
    androidx.compose.foundation.layout.BoxWithConstraints(Modifier.fillMaxSize()) {
        val primaryIndices = if (items.size <= 5) items.indices.toList() else items.indices.take(4)
        val overflowIndices = items.indices.drop(primaryIndices.size)
        var moreOpen by rememberSaveable { mutableStateOf(false) }
        when (AndroidNavigationPolicy.mode(maxWidth.value.toInt())) {
            AndroidNavigationMode.BOTTOM_BAR -> Scaffold(
                containerColor = MaterialTheme.colorScheme.background,
                topBar = topBar,
                snackbarHost = snackbarHost,
                bottomBar = {
                    if (showNavigation) {
                        NavigationBar(containerColor = MaterialTheme.colorScheme.surface, tonalElevation = 0.dp) {
                            primaryIndices.forEach { index ->
                                val item = items[index]
                                NavigationBarItem(
                                    selected = selected == index,
                                    onClick = { onSelected(index) },
                                    icon = { Icon(item.icon, contentDescription = null) },
                                    label = { Text(item.label) },
                                )
                            }
                            if (overflowIndices.isNotEmpty()) NavigationBarItem(
                                selected = selected in overflowIndices,
                                onClick = { moreOpen = true },
                                icon = { Icon(Icons.Default.MoreHoriz, contentDescription = null) },
                                label = { Text("Más") },
                            )
                        }
                    }
                },
                content = content,
            )
            AndroidNavigationMode.RAIL -> Row(Modifier.fillMaxSize()) {
                if (showNavigation) {
                    NavigationRail(containerColor = MaterialTheme.colorScheme.surface) {
                        Column(Modifier.fillMaxHeight().verticalScroll(rememberScrollState()).safeDrawingPadding()) {
                            items.forEachIndexed { index, item ->
                                NavigationRailItem(
                                    selected = selected == index,
                                    onClick = { onSelected(index) },
                                    icon = { Icon(item.icon, contentDescription = null) },
                                    label = { Text(item.label) },
                                )
                            }
                        }
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
            AndroidNavigationMode.DRAWER -> {
                if (showNavigation) {
                    PermanentNavigationDrawer(
                        drawerContent = {
                            PermanentDrawerSheet(
                                modifier = Modifier.widthIn(min = 248.dp, max = 288.dp),
                                drawerContainerColor = MaterialTheme.colorScheme.surface,
                            ) {
                                Column(Modifier.fillMaxHeight().verticalScroll(rememberScrollState()).safeDrawingPadding().padding(horizontal = 12.dp, vertical = 20.dp)) {
                                    Text("CLIMESA", style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.primary)
                                    Text("Recepción", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(bottom = 20.dp))
                                    items.forEachIndexed { index, item ->
                                        NavigationDrawerItem(
                                            label = { Text(item.label) },
                                            selected = selected == index,
                                            onClick = { onSelected(index) },
                                            icon = { Icon(item.icon, contentDescription = null) },
                                        )
                                    }
                                }
                            }
                        },
                    ) {
                        Scaffold(
                            containerColor = MaterialTheme.colorScheme.background,
                            topBar = topBar,
                            snackbarHost = snackbarHost,
                            content = content,
                        )
                    }
                } else {
                    Scaffold(
                        containerColor = MaterialTheme.colorScheme.background,
                        topBar = topBar,
                        snackbarHost = snackbarHost,
                        content = content,
                    )
                }
            }
        }
        if (moreOpen) ModalBottomSheet(onDismissRequest = { moreOpen = false }) {
            Column(Modifier.padding(horizontal = 16.dp, vertical = 12.dp)) {
                Text("Más secciones", style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(horizontal = 8.dp, vertical = 8.dp))
                overflowIndices.forEach { index ->
                    val item = items[index]
                    NavigationDrawerItem(
                        label = { Text(item.label) },
                        selected = selected == index,
                        onClick = { onSelected(index); moreOpen = false },
                        icon = { Icon(item.icon, contentDescription = null) },
                    )
                }
            }
        }
    }
}
