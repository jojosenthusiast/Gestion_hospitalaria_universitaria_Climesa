@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package sv.edu.catolica.climesa.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.DarkMode
import androidx.compose.material.icons.filled.LightMode
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import sv.edu.catolica.climesa.R
import sv.edu.catolica.climesa.domain.AndroidSection

/** Square brand mark (web `.brand-mark`): a cross on the accent colour. */
@Composable
internal fun BrandMark(modifier: Modifier = Modifier) {
    Box(modifier.size(36.dp).background(MaterialTheme.climesa.accent, MaterialTheme.shapes.medium), contentAlignment = Alignment.Center) {
        Icon(Icons.Default.Add, null, Modifier.size(26.dp), tint = BrandNavy)
    }
}

/**
 * Top bar of every signed-in screen: brand, a mono subtitle (role or section), then `actions`.
 * `navigationIcon` defaults to the menu button; pass a back button for detail screens.
 */
@Composable
internal fun ClimesaTopBar(
    subtitle: String,
    modifier: Modifier = Modifier,
    title: String = stringResource(R.string.ui_marca),
    navigationIcon: @Composable () -> Unit = {},
    actions: @Composable () -> Unit = {},
) {
    TopAppBar(
        modifier = modifier,
        navigationIcon = navigationIcon,
        title = {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                BrandMark()
                Column {
                    Text(title, style = MaterialTheme.typography.titleMedium, maxLines = 1)
                    Text(subtitle, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onPrimary.copy(alpha = .78f), maxLines = 1)
                }
            }
        },
        actions = { actions() },
        colors = TopAppBarDefaults.topAppBarColors(
            containerColor = MaterialTheme.colorScheme.primary,
            titleContentColor = MaterialTheme.colorScheme.onPrimary,
            navigationIconContentColor = MaterialTheme.colorScheme.onPrimary,
            actionIconContentColor = MaterialTheme.colorScheme.onPrimary,
        ),
    )
}

@Composable
internal fun MenuButton(onClick: () -> Unit) =
    IconButton(onClick = onClick) { Icon(Icons.Default.Menu, stringResource(R.string.ui_abrir_menu)) }

@Composable
internal fun ThemeToggleButton(dark: Boolean, setDark: (Boolean) -> Unit) =
    IconButton(onClick = { setDark(!dark) }) { Icon(if (dark) Icons.Default.LightMode else Icons.Default.DarkMode, stringResource(R.string.ui_cambiar_apariencia)) }

/**
 * Page scaffold for a role: [ClimesaTopBar] plus adaptive section navigation (bottom bar on phones, rail on tablets, permanent
 * drawer on wide screens, overflow sheet "Más funciones"). Sections already come filtered by permission; this only draws them.
 * `content` receives the inner padding: apply it to the root of the screen.
 */
@Composable
internal fun PortalScaffold(
    roleLabel: String,
    sections: List<AndroidSection>,
    selected: AndroidSection,
    onSelected: (AndroidSection) -> Unit,
    dark: Boolean,
    setDark: (Boolean) -> Unit,
    onLogout: () -> Unit,
    content: @Composable (PaddingValues) -> Unit,
) {
    AdaptiveRoleScaffold(
        sections = sections,
        selected = selected,
        onSelected = onSelected,
        onLogout = onLogout,
        topBar = { openMenu ->
            ClimesaTopBar(
                subtitle = roleLabel,
                navigationIcon = { MenuButton(openMenu) },
                actions = { HospitalClock(); ThemeToggleButton(dark, setDark) },
            )
        },
        content = content,
    )
}

/** Standard page body: a scrolling column with the page gutter and block gap. Use it instead of ad hoc `LazyColumn` paddings. */
@Composable
internal fun PageList(modifier: Modifier = Modifier, content: LazyListScope.() -> Unit) {
    LazyColumn(
        modifier.fillMaxSize(),
        contentPadding = PaddingValues(horizontal = Spacing.page, vertical = Spacing.lg - Spacing.xs),
        verticalArrangement = Arrangement.spacedBy(Spacing.block),
        content = content,
    )
}

/** Fills the width with the gutter when a screen is not a list. */
@Composable
internal fun PageColumn(modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    Column(modifier.fillMaxWidth().padding(horizontal = Spacing.page), verticalArrangement = Arrangement.spacedBy(Spacing.block)) { content() }
}
