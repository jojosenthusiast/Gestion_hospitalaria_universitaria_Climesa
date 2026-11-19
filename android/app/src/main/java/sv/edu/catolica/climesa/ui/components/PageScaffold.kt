@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package sv.edu.catolica.climesa.ui

import sv.edu.catolica.climesa.ui.icons.ClimesaIcons
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.sp
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
        Icon(ClimesaIcons.Plus, null, Modifier.size(26.dp), tint = BrandNavy)
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
                if (!subtitle.isNullOrBlank()) Text(subtitle, style = MaterialTheme.typography.labelMedium, color = TopBarMuted, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        },
        actions = { actions() },
        // Navy like the web `.hospital-header` and the iOS bar, white ink.
        colors = TopAppBarDefaults.topAppBarColors(
            containerColor = MaterialTheme.climesa.navy,
            titleContentColor = Color.White,
            navigationIconContentColor = Color.White,
            actionIconContentColor = Color.White,
        ),
    )
}

@Composable
internal fun BackButton(onClick: () -> Unit, enabled: Boolean = true) =
    IconButton(onClick = onClick, enabled = enabled) { Icon(ClimesaIcons.Back, stringResource(R.string.ui_volver)) }

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
    badges: Map<AndroidSection, Int> = emptyMap(),
    noticeCritical: Boolean = false,
    /** Lote 5 S9: a compact app-wide notice right under the top bar (the shift state); draws nothing when empty. */
    topNotice: (@Composable () -> Unit)? = null,
    content: @Composable (PaddingValues) -> Unit,
) {
    AdaptiveRoleScaffold(
        badges = badges,
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
                // Notices sit one tap away on every screen (not buried in "Más"); the badge counts the unread ones.
                actions = {
                    if (AndroidSection.NOTICES in sections && selected != AndroidSection.NOTICES) {
                        val unread = badges[AndroidSection.NOTICES] ?: 0
                        NoticesBell(unread, noticeCritical) { onSelected(AndroidSection.NOTICES) }
                    }
                    HospitalClock()
                },
            )
        },
        content = if (topNotice == null) content else { padding ->
            Column(Modifier.fillMaxSize().padding(padding)) {
                topNotice()
                Box(Modifier.weight(1f).fillMaxWidth()) { content(PaddingValues()) }
            }
        },
    )
}

/** Muted ink on the navy bar (web `.topbar-date` #d3dbe6). */
internal val TopBarMuted = Color(0xFFD3DBE6)

/**
 * Colours of the bell count (web `.notices-bell-count`): a white pill with primary text, and critical red with white text
 * only while a critical notice is unread. Returns container to content.
 */
internal fun bellCountColors(critical: Boolean, surface: Color, primaryText: Color, criticalRed: Color): Pair<Color, Color> =
    if (critical) criticalRed to Color.White else surface to primaryText

/**
 * Text of the bell count (Lote 5 S1): "1" to "99", "99+" from a hundred, null for none (no badge). Up to three characters,
 * and the pill is sized for them, so the count is never cut off.
 */
internal fun bellBadgeText(count: Int): String? = when {
    count <= 0 -> null
    count > 99 -> "99+"
    else -> count.toString()
}

/**
 * Header bell: notices one tap away, with the unread count. The count pill is drawn next to the icon button, not inside it:
 * the Material icon button clips its content to a circle, which used to cut the count off (Lote 5 S1).
 */
@Composable
private fun NoticesBell(unread: Int, critical: Boolean, onClick: () -> Unit) {
    val (container, content) = bellCountColors(critical, MaterialTheme.colorScheme.surface, MaterialTheme.climesa.primaryText, MaterialTheme.system.critical)
    Box {
        IconButton(onClick = onClick, modifier = Modifier.semantics { contentDescription = if (unread > 0) "Avisos, $unread sin leer" else "Avisos" }) {
            Icon(ClimesaIcons.Bell, null)
        }
        bellBadgeText(unread)?.let { text ->
            Text(
                text,
                Modifier
                    .align(Alignment.TopEnd)
                    .offset(x = (-2).dp, y = 4.dp)
                    .heightIn(min = 18.dp)
                    .widthIn(min = 18.dp)
                    .background(container, RoundedCornerShape(percent = 50))
                    .padding(horizontal = 5.dp, vertical = 1.dp),
                color = content,
                maxLines = 1,
                softWrap = false,
                style = MaterialTheme.typography.labelSmall.copy(fontSize = 11.sp, lineHeight = 16.sp, letterSpacing = 0.sp, textAlign = TextAlign.Center),
            )
        }
    }
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
