@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package sv.edu.catolica.climesa.ui.dashboard

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
import sv.edu.catolica.climesa.ui.ClimesaCard
import sv.edu.catolica.climesa.ui.EmptyState
import sv.edu.catolica.climesa.ui.ErrorState
import sv.edu.catolica.climesa.ui.LoadingState
import sv.edu.catolica.climesa.ui.NoticeBanner
import sv.edu.catolica.climesa.ui.NoticeKind
import sv.edu.catolica.climesa.ui.PageList
import sv.edu.catolica.climesa.ui.PrimaryButton
import sv.edu.catolica.climesa.ui.SecondaryButton
import sv.edu.catolica.climesa.ui.SectionCard
import sv.edu.catolica.climesa.ui.Spacing
import sv.edu.catolica.climesa.ui.cardBorder
import sv.edu.catolica.climesa.ui.climesa
import sv.edu.catolica.climesa.ui.iconFor

private fun helpFor(role: String) = when (role) {
    "JOP" -> R.string.dash_ayuda_jop
    "REC" -> R.string.dash_ayuda_rec
    "AST" -> R.string.dash_ayuda_ast
    "ENF" -> R.string.dash_ayuda_enf
    "MED" -> R.string.dash_ayuda_med
    "LAB" -> R.string.dash_ayuda_lab
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
) {
    val state by model.state.collectAsStateWithLifecycle()
    LaunchedEffect(role, account.profile.permissions, account.profile.channels, account.profile.patientId) {
        model.start(role, account.profile.permissions, account.profile.channels, account.profile.patientId != null)
    }
    PageList(modifier) {
        item { DashboardHeader(account.profile.name, RoleAccess.label(role), stringResource(helpFor(role))) }
        val dashboard = state.model
        when {
            state.loading && dashboard == null -> item { LoadingState() }
            state.error != null && dashboard == null -> item { ErrorState(state.error, model::reload) }
            dashboard != null -> dashboardContent(dashboard, onAction)
        }
    }
}

private fun LazyListScope.dashboardContent(dashboard: DashboardModel, onAction: (QuickActionRequest) -> Unit) {
    if (dashboard.unavailable.isNotEmpty()) item { NoticeBanner(NoticeKind.WARNING, stringResource(R.string.dash_datos_parciales)) }
    if (dashboard.kpis.isEmpty() && dashboard.actions.isEmpty() && dashboard.attention.isEmpty()) {
        item { EmptyState(stringResource(R.string.dash_vacio), detail = stringResource(R.string.dash_vacio_detalle)) }
        return
    }
    if (dashboard.kpis.isNotEmpty()) {
        item { Text(stringResource(R.string.dash_resumen), style = MaterialTheme.typography.titleLarge) }
        items(dashboard.kpis.chunked(2)) { pair ->
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                pair.forEach { kpi -> KpiTile(kpi, Modifier.weight(1f).heightIn(min = 112.dp)) { kpi.target?.let { onAction(QuickActionRequest(it)) } } }
                if (pair.size == 1) Spacer(Modifier.weight(1f))
            }
        }
    }
    item { Text(stringResource(R.string.dash_atencion), style = MaterialTheme.typography.titleLarge) }
    if (dashboard.attention.isEmpty()) item { NoticeBanner(NoticeKind.SUCCESS, stringResource(R.string.dash_atencion_ok)) }
    items(dashboard.attention) { entry -> AttentionCard(entry) { onAction(entry.request) } }
    if (dashboard.actions.isNotEmpty()) {
        item {
            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(stringResource(R.string.dash_acciones), style = MaterialTheme.typography.titleLarge)
                Text(stringResource(R.string.dash_acciones_ayuda), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        items(dashboard.actions.chunked(2)) { pair ->
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                pair.forEach { action -> ActionTile(action, Modifier.weight(1f)) { onAction(action.request) } }
                if (pair.size == 1) Spacer(Modifier.weight(1f))
            }
        }
    }
    if (dashboard.charts.isNotEmpty()) {
        item { Text(stringResource(R.string.dash_graficos), style = MaterialTheme.typography.titleLarge) }
        items(dashboard.charts) { chart -> SectionCard(chart.title) { ChartContent(chart) } }
    }
}

@Composable
private fun DashboardHeader(name: String, roleLabel: String, help: String) {
    Surface(color = MaterialTheme.colorScheme.primary, shape = MaterialTheme.shapes.large) {
        Column(Modifier.fillMaxWidth().padding(18.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(name.ifBlank { stringResource(R.string.dash_bienvenida) }, style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.onPrimary)
            Text("$roleLabel · ${stringResource(R.string.dash_inicio)}", color = MaterialTheme.colorScheme.onPrimary.copy(alpha = .78f), style = MaterialTheme.typography.bodySmall)
            Text(help, color = MaterialTheme.colorScheme.onPrimary.copy(alpha = .9f), style = MaterialTheme.typography.bodySmall)
        }
    }
}

/** State tile: coloured top edge, a shape icon, the big value and its label. Tappable when it leads to a section. */
@Composable
private fun KpiTile(kpi: DashboardKpi, modifier: Modifier, onClick: () -> Unit) {
    val (fg, soft) = kpi.tone.colors()
    val content: @Composable () -> Unit = {
        Column {
            Box(Modifier.fillMaxWidth().height(4.dp).background(fg))
            Column(Modifier.padding(Spacing.md), verticalArrangement = Arrangement.spacedBy(Spacing.xs)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                    Box(Modifier.size(26.dp).background(soft, CircleShape), contentAlignment = Alignment.Center) { Icon(kpi.tone.icon(), null, Modifier.size(16.dp), tint = fg) }
                    Text(kpi.label, Modifier.weight(1f), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2, overflow = TextOverflow.Ellipsis)
                }
                Row(verticalAlignment = Alignment.Bottom) {
                    Text(kpi.value, style = (if (kpi.value.length > 7) MaterialTheme.typography.titleLarge else MaterialTheme.typography.headlineLarge).copy(fontFeatureSettings = "tnum"), maxLines = 2)
                    kpi.suffix?.let { Text(" $it", Modifier.padding(bottom = 4.dp), style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                }
                kpi.hint?.let { Text(it, style = MaterialTheme.typography.labelSmall, color = fg) }
            }
        }
    }
    if (kpi.target != null) Surface(onClick, modifier, color = MaterialTheme.colorScheme.surface, shape = MaterialTheme.shapes.medium, border = cardBorder(), shadowElevation = 1.dp, content = content)
    else Surface(modifier, color = MaterialTheme.colorScheme.surface, shape = MaterialTheme.shapes.medium, border = cardBorder(), shadowElevation = 1.dp, content = content)
}

@Composable
private fun AttentionCard(item: DashboardAttention, onClick: () -> Unit) {
    val (fg, soft) = item.tone.colors()
    ClimesaCard {
        Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min)) {
            Box(Modifier.fillMaxHeight().width(5.dp).background(fg))
            Column(Modifier.fillMaxWidth().padding(Spacing.md), verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                    Box(Modifier.size(28.dp).background(soft, CircleShape), contentAlignment = Alignment.Center) { Icon(item.tone.icon(), null, Modifier.size(18.dp), tint = fg) }
                    Text(item.title, Modifier.weight(1f), style = MaterialTheme.typography.titleSmall)
                }
                Text(item.detail, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                if (item.tone == DashboardTone.DANGER) PrimaryButton(item.actionLabel, onClick) else SecondaryButton(item.actionLabel, onClick)
            }
        }
    }
}

@Composable
private fun ActionTile(action: DashboardAction, modifier: Modifier, onClick: () -> Unit) {
    Surface(onClick, modifier.heightIn(min = 72.dp), color = MaterialTheme.climesa.soft, shape = MaterialTheme.shapes.medium, border = cardBorder()) {
        Row(Modifier.padding(Spacing.md), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
            Icon(iconFor(action.request.section), null, Modifier.size(22.dp), tint = MaterialTheme.climesa.primaryText)
            Text(action.label, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.climesa.primaryText, maxLines = 2, overflow = TextOverflow.Ellipsis)
        }
    }
}
