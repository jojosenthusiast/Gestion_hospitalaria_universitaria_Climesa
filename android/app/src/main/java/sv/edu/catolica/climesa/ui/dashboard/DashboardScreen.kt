@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package sv.edu.catolica.climesa.ui.dashboard

import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.LocalHospital
import androidx.compose.material3.AssistChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import sv.edu.catolica.climesa.R
import sv.edu.catolica.climesa.domain.AuthenticatedAccount
import sv.edu.catolica.climesa.domain.DashboardAction
import sv.edu.catolica.climesa.domain.DashboardAttention
import sv.edu.catolica.climesa.domain.DashboardKpi
import sv.edu.catolica.climesa.domain.DashboardModel
import sv.edu.catolica.climesa.domain.DashboardTone
import sv.edu.catolica.climesa.domain.QuickActionRequest
import sv.edu.catolica.climesa.domain.RoleAccess
import sv.edu.catolica.climesa.domain.NoticeInboxRules
import sv.edu.catolica.climesa.ui.CompactHeader
import sv.edu.catolica.climesa.ui.CriticalNoticeBanner
import sv.edu.catolica.climesa.ui.RefreshAt
import sv.edu.catolica.climesa.ui.noticeInboxModel
import sv.edu.catolica.climesa.ui.ClimesaCard
import sv.edu.catolica.climesa.ui.EmptyState
import sv.edu.catolica.climesa.ui.ErrorState
import sv.edu.catolica.climesa.ui.LoadingState
import sv.edu.catolica.climesa.ui.NoticeBanner
import sv.edu.catolica.climesa.ui.NoticeKind
import sv.edu.catolica.climesa.ui.PageList
import sv.edu.catolica.climesa.ui.PrimaryButton
import sv.edu.catolica.climesa.ui.RowAction
import sv.edu.catolica.climesa.ui.SecondaryButton
import sv.edu.catolica.climesa.ui.SectionCard
import sv.edu.catolica.climesa.ui.Spacing
import sv.edu.catolica.climesa.ui.cardBorder
import sv.edu.catolica.climesa.ui.climesa
import sv.edu.catolica.climesa.ui.iconFor

private fun helpFor(role: String) = when (role) {
    "REC" -> R.string.dash_ayuda_rec
    "AST" -> R.string.dash_ayuda_ast
    "ENF" -> R.string.dash_ayuda_enf
    "MED" -> R.string.dash_ayuda_med
    "PAR" -> R.string.dash_ayuda_par
    else -> R.string.dash_ayuda_pac
}

/**
 * "Inicio" of every Android role: state tiles, what needs attention (each with the action that clears it), quick actions and
 * small charts. Tapping a tile or action calls [onAction]; the host navigates to the section and posts the verb in a
 * [sv.edu.catolica.climesa.ui.QuickActionInbox]. Reused by Recepción's scaffold, which is why it is public.
 */
@Composable
fun RoleDashboardScreen(
    account: AuthenticatedAccount,
    role: String,
    onAction: (QuickActionRequest) -> Unit,
    modifier: Modifier = Modifier,
    model: DashboardViewModel = viewModel(key = "dashboard-${account.session.userId}-$role"),
    onOpenNotices: () -> Unit = {},
) {
    val state by model.state.collectAsStateWithLifecycle()
    LaunchedEffect(role, account.profile.permissions, account.profile.channels, account.profile.patientId) {
        model.start(role, account.profile.permissions, account.profile.channels, account.profile.patientId != null, account.session.userId)
    }
    LaunchedEffect(Unit) { model.refreshSeen() }
    // S11: notices left the dashboard for their own area; "Inicio" keeps only the critical one for this role or area.
    val notices = noticeInboxModel(account)
    val inbox by notices.state.collectAsStateWithLifecycle()
    // The one re-read at `proximoCambio` lives here, outside the banner: a snoozed or scheduled critical notice must come
    // back on time even while no banner is shown (the banner leaves composition when nothing is highlighted).
    RefreshAt(inbox.inbox?.nextChange, notices::reload)
    val critical = NoticeInboxRules.banner(inbox.inbox, inbox.hidden).isNotEmpty()
    PageList(modifier) {
        item { DashboardHeader(account.profile.displayName, RoleAccess.label(role), stringResource(helpFor(role))) }
        if (critical) item(key = "aviso-critico") { CriticalNoticeBanner(account, onOpenNotices) }
        val dashboard = state.model
        when {
            state.loading && dashboard == null -> item { LoadingState() }
            state.error != null && dashboard == null -> item { ErrorState(state.error, model::reload) }
            dashboard != null -> dashboardContent(dashboard, onAction)
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
private fun LazyListScope.dashboardContent(dashboard: DashboardModel, onAction: (QuickActionRequest) -> Unit) {
    if (dashboard.unavailable.isNotEmpty()) item { NoticeBanner(NoticeKind.WARNING, stringResource(R.string.dash_datos_parciales)) }
    if (dashboard.kpis.isEmpty() && dashboard.actions.isEmpty() && dashboard.attention.isEmpty() && dashboard.alerts.isEmpty()) {
        item { EmptyState(stringResource(R.string.dash_vacio), detail = stringResource(R.string.dash_vacio_detalle)) }
        return
    }
    // D25 (owner): an ambulance on its way or in the hospital is a large red card above everything else.
    items(dashboard.alerts) { alert -> AmbulanceAlertCard(alert) { onAction(alert.request) } }
    // R3 A-28: Inicio is a pending inbox first. Each pending row carries its count and its one action; the tiles below only
    // show what no row already says.
    item { SectionLabel(stringResource(R.string.dash_atencion)) }
    if (dashboard.attention.isEmpty()) item {
        Text(stringResource(R.string.dash_atencion_ok), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
    } else item { AttentionList(dashboard.attention, onAction) }
    if (dashboard.kpis.isNotEmpty()) {
        item { SectionLabel(stringResource(R.string.dash_resumen)) }
        items(dashboard.kpis.chunked(2)) { pair ->
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                pair.forEach { kpi -> KpiTile(kpi, Modifier.weight(1f)) { kpi.target?.let { onAction(QuickActionRequest(it, kpi.action)) } } }
                if (pair.size == 1) Spacer(Modifier.weight(1f))
            }
        }
    }
    if (dashboard.actions.isNotEmpty()) {
        item { SectionLabel(stringResource(R.string.dash_acciones)) }
        item {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(Spacing.sm), verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                dashboard.actions.forEach { action -> ActionChip(action) { onAction(action.request) } }
            }
        }
    }
    if (dashboard.charts.isNotEmpty()) {
        item { SectionLabel(stringResource(R.string.dash_graficos)) }
        items(dashboard.charts) { chart -> SectionCard(chart.title) { ChartContent(chart) } }
    }
}

@Composable
private fun SectionLabel(text: String) = Text(text, style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = Spacing.sm))

/** Only attention and critical tones take colour (R3 A-37); a plain count stays neutral. */
private val DashboardTone.signals: Boolean get() = this == DashboardTone.WARNING || this == DashboardTone.DANGER

/** S1: compact header instead of the blue welcome banner; the role help text is no longer drawn. */
@Composable
private fun DashboardHeader(name: String, roleLabel: String, @Suppress("UNUSED_PARAMETER") help: String) =
    CompactHeader(name.ifBlank { stringResource(R.string.dash_bienvenida) }, breadcrumb = "$roleLabel · ${stringResource(R.string.dash_inicio)}")

/** State tile: coloured top edge, a shape icon, the big value and its label. Tappable when it leads to a section. */
@Composable
private fun KpiTile(kpi: DashboardKpi, modifier: Modifier, onClick: () -> Unit) {
    val (fg, soft) = kpi.tone.colors()
    val content: @Composable () -> Unit = {
        Column {
            if (kpi.tone.signals) Box(Modifier.fillMaxWidth().height(3.dp).background(fg))
            Column(Modifier.padding(Spacing.md), verticalArrangement = Arrangement.spacedBy(Spacing.xs)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                    if (kpi.tone.signals) Box(Modifier.size(26.dp).background(soft, CircleShape), contentAlignment = Alignment.Center) { Icon(kpi.tone.icon(), null, Modifier.size(16.dp), tint = fg) }
                    Text(kpi.label, Modifier.weight(1f), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2, overflow = TextOverflow.Ellipsis)
                }
                Row(verticalAlignment = Alignment.Bottom) {
                    // D6/D132: long values step down and wrap (up to three lines at the largest font) instead of being cut.
                    val valueStyle = when { kpi.value.length > 14 -> MaterialTheme.typography.titleMedium; kpi.value.length > 7 -> MaterialTheme.typography.titleLarge; else -> MaterialTheme.typography.headlineLarge }
                    Text(kpi.value, Modifier.weight(1f, fill = false), style = valueStyle.copy(fontFeatureSettings = "tnum"), maxLines = 3, overflow = TextOverflow.Ellipsis)
                    kpi.suffix?.let { Text(" $it", Modifier.padding(bottom = 4.dp), style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                }
                kpi.hint?.let { Text(it, style = MaterialTheme.typography.labelSmall, color = if (kpi.tone.signals) fg else MaterialTheme.colorScheme.onSurfaceVariant) }
            }
        }
    }
    if (kpi.target != null) Surface(onClick, modifier, color = MaterialTheme.colorScheme.surface, shape = MaterialTheme.shapes.medium, border = cardBorder(), shadowElevation = 1.dp, content = content)
    else Surface(modifier, color = MaterialTheme.colorScheme.surface, shape = MaterialTheme.shapes.medium, border = cardBorder(), shadowElevation = 1.dp, content = content)
}

/** Pending rows in one surface split by 1px lines (no card per item, no side stripe). The critical row gets the primary action. */
@Composable
private fun AttentionList(items: List<DashboardAttention>, onAction: (QuickActionRequest) -> Unit) {
    // A heavy shift can pile up eight pending groups that only clear after real work: Inicio shows the two most urgent
    // (critical first) and folds the rest behind one line, so the first glance is what to do now, not a wall of rows.
    var expanded by androidx.compose.runtime.saveable.rememberSaveable { androidx.compose.runtime.mutableStateOf(false) }
    val ranked = items.sortedBy { when (it.tone) { DashboardTone.DANGER -> 0; DashboardTone.WARNING -> 1; else -> 2 } }
    val shown = if (expanded) ranked else ranked.take(ATTENTION_VISIBLE)
    val hidden = ranked.size - shown.size
    Surface(color = MaterialTheme.colorScheme.surface, shape = MaterialTheme.shapes.medium, border = cardBorder()) {
        Column {
            shown.forEachIndexed { index, item ->
                if (index > 0) HorizontalDivider(color = MaterialTheme.climesa.line)
                AttentionRow(item) { onAction(item.request) }
            }
            if (ranked.size > ATTENTION_VISIBLE) {
                HorizontalDivider(color = MaterialTheme.climesa.line)
                Box(Modifier.fillMaxWidth().padding(horizontal = Spacing.md, vertical = Spacing.xs)) {
                    RowAction(if (expanded) stringResource(R.string.dash_atencion_menos) else androidx.compose.ui.res.pluralStringResource(R.plurals.dash_atencion_mas, hidden, hidden), { expanded = !expanded })
                }
            }
        }
    }
}

private const val ATTENTION_VISIBLE = 2

/** D25: large red alert of an ambulance to receive, with its state and the one action that opens the reception. */
@Composable
private fun AmbulanceAlertCard(alert: sv.edu.catolica.climesa.domain.AmbulanceAlert, onClick: () -> Unit) {
    val (red, _) = DashboardTone.DANGER.colors()
    Surface(onClick = onClick, color = red, contentColor = androidx.compose.ui.graphics.Color.White, shape = MaterialTheme.shapes.medium, shadowElevation = 2.dp, modifier = Modifier.fillMaxWidth()) {
        Row(Modifier.padding(Spacing.md), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Spacing.md)) {
            Icon(Icons.Default.LocalHospital, null, Modifier.size(40.dp))
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(Spacing.xs)) {
                Text(alert.title, style = MaterialTheme.typography.titleLarge)
                Text(alert.detail, style = MaterialTheme.typography.bodyMedium)
                Text(alert.actionLabel + " ›", style = MaterialTheme.typography.labelLarge)
            }
        }
    }
}

@Composable
private fun AttentionRow(item: DashboardAttention, onClick: () -> Unit) {
    val (fg, soft) = item.tone.colors()
    val stacked = sv.edu.catolica.climesa.ui.largeText()
    val action: @Composable () -> Unit = { if (item.tone == DashboardTone.DANGER) PrimaryButton(item.actionLabel, onClick, fill = false) else RowAction(item.actionLabel, onClick) }
    Row(
        Modifier.fillMaxWidth().padding(start = Spacing.md, end = Spacing.sm, top = Spacing.sm, bottom = Spacing.sm),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(Spacing.sm),
    ) {
        Box(Modifier.size(28.dp).background(if (item.tone.signals) soft else MaterialTheme.climesa.soft, CircleShape), contentAlignment = Alignment.Center) {
            Icon(item.tone.icon(), null, Modifier.size(18.dp), tint = if (item.tone.signals) fg else MaterialTheme.climesa.primaryText)
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(item.title, style = MaterialTheme.typography.titleSmall, maxLines = 2, overflow = TextOverflow.Ellipsis)
            Text(item.detail, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2, overflow = TextOverflow.Ellipsis)
            // D10: with large text the action goes below the title instead of squeezing it.
            if (stacked) action()
        }
        if (!stacked) action()
    }
}

/** Shortcut that opens a section with the verb ready (Registrar paciente, Emitir número). No help text under the group. */
@Composable
private fun ActionChip(action: DashboardAction, onClick: () -> Unit) {
    AssistChip(
        onClick = onClick,
        label = { Text(action.label, maxLines = 1, overflow = TextOverflow.Ellipsis) },
        leadingIcon = { Icon(iconFor(action.request.section), null, Modifier.size(18.dp), tint = MaterialTheme.climesa.primaryText) },
        modifier = Modifier.heightIn(min = Spacing.touch),
    )
}
