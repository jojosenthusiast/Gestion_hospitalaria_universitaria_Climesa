package sv.edu.catolica.climesa.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import kotlinx.coroutines.delay
import sv.edu.catolica.climesa.R
import sv.edu.catolica.climesa.domain.AuthenticatedAccount
import sv.edu.catolica.climesa.domain.InboxNotice
import sv.edu.catolica.climesa.domain.NoticeFilter
import sv.edu.catolica.climesa.domain.NoticeInboxRules
import sv.edu.catolica.climesa.domain.NoticeLevel
import sv.edu.catolica.climesa.domain.NoticeRefresh

/** One inbox per account, shared by "Avisos" and the banner of "Inicio" (the same key returns the same ViewModel). */
@Composable
internal fun noticeInboxModel(account: AuthenticatedAccount): NoticeInboxViewModel {
    val model: NoticeInboxViewModel = viewModel(key = "avisos-bandeja-${account.session.userId}")
    LaunchedEffect(account.profile.channels) { model.start(account.profile.channels) }
    return model
}

/** D1: the unread count on the "Avisos" entry, from the same shared inbox; nothing when the role has no "Avisos". */
@Composable
internal fun noticeBadges(account: AuthenticatedAccount, sections: List<sv.edu.catolica.climesa.domain.AndroidSection>): Map<sv.edu.catolica.climesa.domain.AndroidSection, Int> {
    if (sv.edu.catolica.climesa.domain.AndroidSection.NOTICES !in sections) return emptyMap()
    val state by noticeInboxModel(account).state.collectAsStateWithLifecycle()
    return mapOf(sv.edu.catolica.climesa.domain.AndroidSection.NOTICES to NoticeInboxRules.badge(state.inbox, state.hidden))
}

/**
 * The one re-read at `proximoCambio` (a notice expires or starts, or a snoozed reminder comes back). It belongs to the
 * screen that shows the inbox and is cancelled with it; a new `proximoCambio` replaces it. No polling.
 */
@Composable
internal fun RefreshAt(nextChange: String?, onDue: () -> Unit) {
    LaunchedEffect(nextChange) {
        val wait = NoticeRefresh.delayMs(nextChange, System.currentTimeMillis()) ?: return@LaunchedEffect
        delay(wait)
        onDue()
    }
}

/** Level with icon and word (S7): red only for "Crítico", amber for "Importante", gray for "Informativo". */
@Composable
internal fun NoticeLevelBadge(level: NoticeLevel, modifier: Modifier = Modifier) = PriorityBadge(
    when (level) { NoticeLevel.CRITICAL -> Priority.EMERGENCIA; NoticeLevel.IMPORTANT -> Priority.URGENTE; NoticeLevel.INFORMATIVE -> Priority.RUTINA },
    modifier, label = level.label,
)

/**
 * S11 · Critical notice of "Inicio" (web `CriticalNoticeBanner`): only the `destacado` notices (critical, for the account's
 * role or area, without "Enterado" and not snoozed). It stays until "Enterado"; "Recordarme en N h" sets it aside and it
 * comes back when the API says so in `proximoCambio` or by an `aviso` event.
 */
@Composable
internal fun CriticalNoticeBanner(account: AuthenticatedAccount, onOpenNotices: () -> Unit, modifier: Modifier = Modifier) {
    val model = noticeInboxModel(account)
    val state by model.state.collectAsStateWithLifecycle()
    val pending = NoticeInboxRules.banner(state.inbox, state.hidden)
    val notice = pending.firstOrNull() ?: return
    val colors = MaterialTheme.system
    val shape = RoundedCornerShape(RadiusCard)
    val inner = RoundedCornerShape((RadiusCard - 3.dp).coerceAtLeast(2.dp))
    val busy = state.busyId != null
    // The double edge is the "crítico" pattern of the status system (02-sistema §4), not a side stripe.
    Column(
        modifier.fillMaxWidth().clip(shape).background(colors.criticalSoft).border(1.5.dp, colors.critical, shape).padding(3.dp)
            .border(1.dp, colors.critical, inner).padding(horizontal = Space4, vertical = Space4)
            .semantics { liveRegion = LiveRegionMode.Polite },
        verticalArrangement = Arrangement.spacedBy(Space2),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Space3)) {
            Icon(Icons.Default.Warning, null, Modifier.size(24.dp), tint = colors.critical)
            NoticeLevelBadge(NoticeLevel.CRITICAL)
            if (pending.size > 1) Text(stringResource(R.string.aviso_banner_cuenta, pending.size), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Text(notice.title, Modifier.semantics { heading() }, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onSurface)
        if (notice.body.isNotBlank()) Text(notice.body, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface)
        state.actionError?.let { NoticeBanner(NoticeKind.ERROR, it) }
        PrimaryButton(stringResource(R.string.aviso_enterado), { model.acknowledge(notice.id) }, icon = Icons.Default.Check, enabled = !busy, loading = state.busyId == notice.id)
        if (NoticeInboxRules.canSnooze(notice)) {
            SecondaryButton(stringResource(R.string.aviso_recordarme, NoticeInboxRules.hoursText(state.inbox?.reminderHours ?: 4.0)), { model.snooze(notice.id) }, enabled = !busy)
        }
        TextButton(onClick = { model.setFilter(NoticeFilter.CRITICAL); model.clearMessages(); onOpenNotices() }, modifier = Modifier.heightIn(min = Spacing.touch)) {
            Text(stringResource(R.string.aviso_ver_en_avisos))
            Icon(Icons.Default.ChevronRight, null, Modifier.size(18.dp))
        }
    }
}

/**
 * W25 / A14 · "Avisos" (S11): pending-items inbox of the account. Critical first (server order), filters Todos, Sin leer and
 * Críticos with the counts the API computes, and a detail where "Enterado" is the primary action. Publishing stays on the web.
 */
@Composable
fun NoticesScreen(account: AuthenticatedAccount, modifier: Modifier = Modifier) {
    val model = noticeInboxModel(account)
    val state by model.state.collectAsStateWithLifecycle()
    RefreshAt(state.inbox?.nextChange, model::reload)
    val inbox = state.inbox
    val items = NoticeInboxRules.filter(inbox?.notices.orEmpty(), state.filter)
    val selected = state.selectedId?.let { id -> inbox?.notices?.firstOrNull { it.id == id } }
    // The opened notice left the inbox (withdrawn or expired): back to the list, with the reason if a write said it.
    LaunchedEffect(state.selectedId, inbox) { if (state.selectedId != null && inbox != null && selected == null) model.select(null) }
    BackHandler(selected != null) { model.select(null) }
    if (selected != null) { NoticeDetail(selected, state, model, modifier); return }
    PageList(modifier) {
        item {
            CompactHeader(
                "",
                filters = {
                    NoticeFilter.entries.forEach { f ->
                        val count = inbox?.let { NoticeInboxRules.count(it, f) }?.takeIf { it > 0 }
                        StatusFilterChip(state.filter == f, { model.setFilter(f) }, if (count != null) "${f.label} ($count)" else f.label, FilterTones.notice(f), Modifier.heightIn(min = Spacing.touch))
                    }
                },
            )
        }
        state.done?.let { done -> item { NoticeBanner(NoticeKind.SUCCESS, done) } }
        state.actionError?.let { error -> item { NoticeBanner(NoticeKind.ERROR, error) } }
        when {
            inbox == null && state.loading -> item { LoadingState() }
            inbox == null -> item { ErrorState(state.error ?: NoticeInboxRules.LOAD_FALLBACK, model::reload) }
            inbox.notices.isEmpty() -> item { EmptyState(stringResource(R.string.avisos_vacio), detail = stringResource(R.string.avisos_vacio_detalle)) }
            items.isEmpty() -> item {
                EmptyState(stringResource(if (state.filter == NoticeFilter.CRITICAL) R.string.avisos_sin_criticos else R.string.avisos_todo_leido), detail = stringResource(R.string.avisos_filtro_vacio_detalle))
            }
            else -> items(items, key = { it.id }) { notice -> NoticeRow(notice) { model.select(notice.id) } }
        }
    }
}

/** One row of the inbox: level and read state, title, date. Read notices step back in colour; the words still say it. */
@Composable
private fun NoticeRow(notice: InboxNotice, onOpen: () -> Unit) {
    val read = notice.acknowledgedAt != null
    ClimesaClickableCard(onOpen) {
        Row(Modifier.fillMaxWidth().heightIn(min = Spacing.touch + Spacing.sm).padding(horizontal = Space4, vertical = Space3), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Space3)) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(Space1 + 2.dp)) {
                // Level and read state as their coloured, textured tags: the owner reads the inbox by these marks at a glance.
                Row(horizontalArrangement = Arrangement.spacedBy(Space2), verticalAlignment = Alignment.CenterVertically) {
                    NoticeLevelBadge(notice.level)
                    FamilyBadge(stringResource(if (read) R.string.aviso_enterado else R.string.aviso_sin_leer), if (read) StatusFamily.LISTO else StatusFamily.ESPERA)
                }
                Text(
                    notice.title, style = MaterialTheme.typography.titleMedium, fontWeight = if (read) FontWeight.Normal else FontWeight.SemiBold,
                    color = if (read) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.onSurface, maxLines = 2, overflow = TextOverflow.Ellipsis,
                )
                // Dates said the way people say them ("Ayer 23:22", "Jueves 01:53"), never a full date with the year.
                val now = java.time.Instant.now()
                fun near(iso: String?) = iso?.let { runCatching { sv.edu.catolica.climesa.domain.MyShifts.relative(java.time.Instant.parse(it), now) }.getOrNull() }
                val line = listOfNotNull(
                    near(notice.publishedAt),
                    near(notice.until)?.let { stringResource(R.string.aviso_hasta, it.replaceFirstChar { c -> c.lowercase() }) },
                ).joinToString(" · ")
                Text(line, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            Icon(Icons.Default.ChevronRight, null, tint = MaterialTheme.climesa.primaryText)
        }
    }
}

/** Detail of one notice: the whole text, who it is for, its dates and the action. "Enterado" is the primary action. */
@Composable
private fun NoticeDetail(notice: InboxNotice, state: NoticeInboxState, model: NoticeInboxViewModel, modifier: Modifier) {
    val busy = state.busyId != null
    val none = stringResource(R.string.aviso_sin_fecha)
    PageList(modifier) {
        item {
            TextButton(onClick = { model.select(null) }, modifier = Modifier.heightIn(min = Spacing.touch)) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, null, Modifier.size(18.dp))
                Text(stringResource(R.string.aviso_volver), Modifier.padding(start = Space2))
            }
        }
        item {
            ClimesaCard {
                Column(Modifier.fillMaxWidth().padding(Space4), verticalArrangement = Arrangement.spacedBy(Space3)) {
                    NoticeLevelBadge(notice.level)
                    Text(notice.title, Modifier.semantics { heading() }, style = MaterialTheme.typography.titleLarge)
                    if (notice.body.isNotBlank()) Text(notice.body, style = MaterialTheme.typography.bodyLarge)
                    Text(stringResource(R.string.aviso_para, NoticeInboxRules.audience(notice)), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    HorizontalDivider(color = MaterialTheme.climesa.line)
                    LabeledValue(stringResource(R.string.aviso_publicado), NoticeInboxRules.dateText(notice.publishedAt).ifBlank { none })
                    LabeledValue(stringResource(R.string.aviso_vigente_hasta), NoticeInboxRules.dateText(notice.until).ifBlank { none })
                    if (notice.remindAt != null && notice.acknowledgedAt == null) LabeledValue(stringResource(R.string.aviso_te_recordamos), NoticeInboxRules.dateText(notice.remindAt))
                }
            }
        }
        state.actionError?.let { error -> item { NoticeBanner(NoticeKind.ERROR, error) } }
        state.done?.let { done -> item { NoticeBanner(NoticeKind.SUCCESS, done) } }
        if (!NoticeInboxRules.canAcknowledge(notice)) {
            item {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Space2)) {
                    FamilyBadge(stringResource(R.string.aviso_enterado), StatusFamily.LISTO)
                    Text(stringResource(R.string.aviso_enterado_el, NoticeInboxRules.dateText(notice.acknowledgedAt)), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        } else {
            item { PrimaryButton(stringResource(R.string.aviso_enterado), { model.acknowledge(notice.id) }, icon = Icons.Default.Check, enabled = !busy, loading = state.busyId == notice.id) }
            if (NoticeInboxRules.canSnooze(notice)) item {
                SecondaryButton(stringResource(R.string.aviso_recordarme, NoticeInboxRules.hoursText(state.inbox?.reminderHours ?: 4.0)), { model.snooze(notice.id) }, enabled = !busy)
            }
        }
    }
}
