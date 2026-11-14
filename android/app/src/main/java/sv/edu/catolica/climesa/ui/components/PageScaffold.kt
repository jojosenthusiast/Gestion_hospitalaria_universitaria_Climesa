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
import androidx.compose.material.icons.automirrored.filled.ArrowBack
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
import androidx.compose.ui.text.style.TextOverflow
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
 * Top bar of every signed-in screen: the screen title and, when it helps, a context line (patient, unit, area). Never the
 * role or the app name as a breadcrumb. Detail screens pass a back button as `navigationIcon`.
 */
@Composable
internal fun ClimesaTopBar(
    title: String,
    modifier: Modifier = Modifier,
    subtitle: String? = null,
    navigationIcon: @Composable () -> Unit = {},
    actions: @Composable () -> Unit = {},
) {
    TopAppBar(
        modifier = modifier,
        navigationIcon = navigationIcon,
        title = {
            Column {
                Text(title, style = MaterialTheme.typography.titleLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
                if (!subtitle.isNullOrBlank()) Text(subtitle, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onPrimary.copy(alpha = .82f), maxLines = 1, overflow = TextOverflow.Ellipsis)
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
internal fun BackButton(onClick: () -> Unit, enabled: Boolean = true) =
    IconButton(onClick = onClick, enabled = enabled) { Icon(Icons.AutoMirrored.Filled.ArrowBack, stringResource(R.string.ui_volver)) }

/**
 * Page scaffold for a role: [ClimesaTopBar] plus adaptive section navigation (bottom bar with core tasks and "Más" on phones,
 * rail on tablets, permanent drawer on wide screens). Sections already come filtered by permission; this only draws them.
 * `title` defaults to the selected section; pass `subtitle` for context (patient, unit). `content` receives the inner padding.
 */
@Composable
internal fun PortalScaffold(
    role: String,
    sections: List<AndroidSection>,
    selected: AndroidSection,
    onSelected: (AndroidSection) -> Unit,
    dark: Boolean,
    setDark: (Boolean) -> Unit,
    onLogout: () -> Unit,
    title: String = selected.label,
    subtitle: String? = null,
    navigationIcon: @Composable () -> Unit = {},
    showNavigation: Boolean = true,
    snackbarHost: @Composable () -> Unit = {},
    content: @Composable (PaddingValues) -> Unit,
) {
    AdaptiveRoleScaffold(
        role = role,
        sections = sections,
        selected = selected,
        onSelected = onSelected,
        dark = dark,
        setDark = setDark,
        onLogout = onLogout,
        showNavigation = showNavigation,
        snackbarHost = snackbarHost,
        topBar = {
            ClimesaTopBar(
                title = title,
                subtitle = subtitle,
                navigationIcon = navigationIcon,
                actions = { HospitalClock() },
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
