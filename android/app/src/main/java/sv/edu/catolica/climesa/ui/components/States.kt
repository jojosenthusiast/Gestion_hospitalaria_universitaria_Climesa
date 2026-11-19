package sv.edu.catolica.climesa.ui

import sv.edu.catolica.climesa.ui.icons.ClimesaIcons
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.ui.graphics.compositeOver
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.unit.Dp
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import sv.edu.catolica.climesa.R

internal enum class NoticeKind { SUCCESS, ERROR, INFO, WARNING }

/** Inline message (web `Notice`). Errors are announced assertively, the rest politely. */
@Composable
internal fun NoticeBanner(kind: NoticeKind, text: String, modifier: Modifier = Modifier) {
    val c = MaterialTheme.climesa
    val (fg, bg, icon) = when (kind) {
        NoticeKind.SUCCESS -> Triple(c.success, c.successSoft, ClimesaIcons.Check)
        NoticeKind.ERROR -> Triple(c.danger, c.dangerSoft, ClimesaIcons.Alert)
        NoticeKind.WARNING -> Triple(c.warning, c.warningSoft, ClimesaIcons.Info)
        NoticeKind.INFO -> Triple(c.primaryText, c.soft, ClimesaIcons.Info)
    }
    Surface(
        modifier.fillMaxWidth().semantics { liveRegion = if (kind == NoticeKind.ERROR) LiveRegionMode.Assertive else LiveRegionMode.Polite },
        color = bg,
        contentColor = fg,
        shape = MaterialTheme.shapes.medium,
    ) {
        Row(Modifier.padding(horizontal = 14.dp, vertical = 12.dp), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.Top) {
            Icon(icon, null, Modifier.size(22.dp))
            Text(text, style = MaterialTheme.typography.bodySmall, color = fg)
        }
    }
}

/**
 * Web `SectionState` layout (`modules.css` `.section-state-error`/`.section-state-info`): an inline box with the icon on the
 * left, a bold title over the text in ink, and the action under the text column. [boxed] false drops the tint and border,
 * like the web empty line (`.section-empty`).
 */
@Composable
private fun StateLayout(
    icon: ImageVector,
    tint: Color,
    title: String,
    detail: String?,
    modifier: Modifier,
    background: Color = Color.Transparent,
    border: Color? = null,
    action: (@Composable () -> Unit)? = null,
) {
    val shape = RoundedCornerShape(Radius.card)
    val box = if (border != null) Modifier.background(background, shape).border(1.dp, border, shape).padding(Spacing.md) else Modifier.padding(vertical = Spacing.sm)
    Row(modifier.fillMaxWidth().then(box), horizontalArrangement = Arrangement.spacedBy(Space3), verticalAlignment = Alignment.Top) {
        Icon(icon, null, Modifier.padding(top = 2.dp).size(20.dp), tint = tint)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(Space1)) {
            Text(title, style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold), color = if (border != null) tint else MaterialTheme.colorScheme.onSurface)
            detail?.let { Text(it, style = MaterialTheme.typography.bodyMedium.copy(fontSize = 15.sp, lineHeight = 22.sp), color = if (border != null) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant) }
            action?.let { Box(Modifier.padding(top = Space1)) { it() } }
        }
    }
}

/** Nothing to show yet (design 04, "Vacío"). `action` is an optional next step, e.g. a [SecondaryButton]. */
@Composable
internal fun EmptyState(title: String, modifier: Modifier = Modifier, detail: String? = null, icon: ImageVector = ClimesaIcons.Search, action: (@Composable () -> Unit)? = null) =
    StateLayout(icon, MaterialTheme.colorScheme.onSurfaceVariant, title, detail, modifier, action = action)

/**
 * S3: static placeholder that reserves a section's place while it loads (web `Skeleton`). No spinner and no shimmer;
 * [label] is read by screen readers. Rows default to the height of a [DataRow] so nothing jumps when the data arrives.
 */
@Composable
internal fun Skeleton(
    modifier: Modifier = Modifier,
    rows: Int = 3,
    rowHeight: Dp = Spacing.touch + Spacing.sm,
    label: String = stringResource(R.string.ui_cargando_titulo),
) {
    val fill = MaterialTheme.climesa.line.copy(alpha = .7f)
    val widths = listOf(.88f, 1f, .72f)
    Column(
        modifier.fillMaxWidth().padding(vertical = Space2).semantics {
            contentDescription = label
            liveRegion = LiveRegionMode.Polite
        },
        verticalArrangement = Arrangement.spacedBy(Space3),
    ) {
        repeat(rows) { i -> Box(Modifier.fillMaxWidth(widths[i % widths.size]).height(rowHeight).background(fill, RoundedCornerShape(RadiusControl))) }
    }
}

/**
 * Loading a section after sign-in: a [Skeleton] in place of the content, never a full-screen spinner (S3). `title` is the
 * screen-reader label; `detail` is kept for callers but not drawn. After a few seconds the first load still explains that
 * the server may be waking up (MA-OPS-01).
 */
@Composable
internal fun LoadingState(
    modifier: Modifier = Modifier,
    title: String = stringResource(R.string.ui_cargando_titulo),
    @Suppress("UNUSED_PARAMETER") detail: String? = null,
) {
    Column(modifier, verticalArrangement = Arrangement.spacedBy(Space2)) {
        Skeleton(rows = 4, label = title)
        SlowServerHint(active = true, modifier = Modifier.fillMaxWidth())
    }
}

/** Thin bar shown above stale content while a silent refresh runs (web `.refresh-hint`). */
@Composable
internal fun RefreshHint(modifier: Modifier = Modifier) {
    Column(modifier.fillMaxWidth().semantics { liveRegion = LiveRegionMode.Polite }, verticalArrangement = Arrangement.spacedBy(Spacing.xs)) {
        LinearSpinner(Modifier.fillMaxWidth())
        Text(stringResource(R.string.ui_actualizando), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

/**
 * Load failure with "Reintentar". S8: a 403 (`forbidden`, by default any text that came from a refusal, see
 * [sv.edu.catolica.climesa.data.ForbiddenMessages]) is not a failure: it is an info state with the server's own message
 * and no «Reintentar», because repeating the request can never pass. [onRetry] is ignored then.
 */
@Composable
internal fun ErrorState(
    message: String?,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier,
    forbidden: Boolean = sv.edu.catolica.climesa.data.ForbiddenMessages.isForbidden(message),
    title: String = stringResource(if (forbidden) R.string.ui_sin_acceso_titulo else R.string.ui_error_titulo),
) = if (forbidden) ForbiddenState(message, modifier, title)
else StateLayout(
    icon = ClimesaIcons.Alert,
    tint = MaterialTheme.climesa.danger,
    title = title,
    detail = message,
    modifier = modifier,
    background = MaterialTheme.climesa.dangerSoft,
    border = MaterialTheme.climesa.danger.copy(alpha = .35f).compositeOver(MaterialTheme.climesa.line),
    action = { SecondaryButton(stringResource(R.string.ui_reintentar), onRetry, icon = ClimesaIcons.Retry, fill = false) },
)

/** S8: what a 403 shows: a calm lock, the server message (or the generic access text) and no action. */
@Composable
internal fun ForbiddenState(message: String?, modifier: Modifier = Modifier, title: String = stringResource(R.string.ui_sin_acceso_titulo)) = StateLayout(
    icon = ClimesaIcons.Lock,
    tint = MaterialTheme.climesa.primaryText,
    title = title,
    detail = message?.takeIf { it.isNotBlank() } ?: stringResource(R.string.ui_sin_acceso_detalle),
    modifier = modifier,
    background = MaterialTheme.climesa.soft,
    border = MaterialTheme.climesa.line,
)

/** Version conflict (HTTP 409 `version_conflicto`): nothing was saved; the only way out is to reload. */
@Composable
internal fun ConflictBanner(onReload: () -> Unit, modifier: Modifier = Modifier, message: String? = null) {
    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        NoticeBanner(NoticeKind.ERROR, listOfNotNull(message, stringResource(R.string.ui_conflicto_detalle)).joinToString(" "))
        SecondaryButton(stringResource(R.string.ui_cerrar_recargar), onReload, icon = ClimesaIcons.Retry)
    }
}

