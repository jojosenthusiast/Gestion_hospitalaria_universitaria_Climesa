package sv.edu.catolica.climesa.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * What a card action does, which decides its look (owner batch 5, S2; web `crud.css`):
 * [Primary] the main next step (Registrar llegada, Confirmar, Asignar) is solid primary; [Edit] (Reprogramar, Editar) is
 * outlined in primary; [Danger] (Cancelar, Rechazar, Descartar) is outlined in red; [Neutral] (Ver, Detalle) is outlined grey.
 */
internal enum class ActionRole { Primary, Edit, Danger, Neutral }

/** Tone of an action's ink and border. Kept apart from colours so the role mapping is testable on the JVM. */
internal enum class ActionTone { Primary, PrimaryText, Danger, Ink }

/** Resolved look of a role: [filled] draws a solid button, otherwise an outlined one with [tone] for ink and border. */
@Immutable
internal data class ActionStyle(val filled: Boolean, val tone: ActionTone, val border: ActionTone)

/** Role to look, the same table as the web `CrudButton` (create, edit, deactivate, view). */
internal fun ActionRole.style(): ActionStyle = when (this) {
    ActionRole.Primary -> ActionStyle(filled = true, tone = ActionTone.Primary, border = ActionTone.Primary)
    ActionRole.Edit -> ActionStyle(filled = false, tone = ActionTone.PrimaryText, border = ActionTone.PrimaryText)
    ActionRole.Danger -> ActionStyle(filled = false, tone = ActionTone.Danger, border = ActionTone.Danger)
    // View keeps ink text with the neutral control line, like `.crud-view`.
    ActionRole.Neutral -> ActionStyle(filled = false, tone = ActionTone.Ink, border = ActionTone.Ink)
}

/**
 * One action of a card. [loading] shows "Un momento…" on this action only; [enabled] false keeps it visible at 50 %. An action
 * the person can never do is not passed at all (never shown disabled).
 */
@Immutable
internal data class CardAction(
    val label: String,
    val role: ActionRole,
    val onClick: () -> Unit,
    val icon: ImageVector? = null,
    val enabled: Boolean = true,
    val loading: Boolean = false,
)

/**
 * One button of a [CardActionRow], drawn by its [ActionRole]: 44dp min height, 6dp corners, 15/800 label, grows with
 * "Tamaño de letra". Use it alone when a single action sits outside a card.
 */
@Composable
internal fun CardActionButton(action: CardAction, modifier: Modifier = Modifier) {
    val style = action.role.style()
    val ink = toneColor(style.tone)
    val active = action.enabled && !action.loading
    val padding = PaddingValues(horizontal = 14.dp, vertical = 8.dp)
    val size = modifier.heightIn(min = CardActionMinHeight).alpha(if (action.enabled) 1f else .5f)
    val body: @Composable () -> Unit = {
        if (action.loading) {
            Spinner(size = 18.dp, strokeWidth = 2.dp, color = if (style.filled) MaterialTheme.colorScheme.onPrimary else ink)
            Spacer(Modifier.width(8.dp))
            Text(androidx.compose.ui.res.stringResource(sv.edu.catolica.climesa.R.string.ui_un_momento), style = CardActionText, maxLines = 1)
        } else {
            action.icon?.let { Icon(it, null, Modifier.size(18.dp)); Spacer(Modifier.width(6.dp)) }
            Text(action.label, style = CardActionText, maxLines = 2, overflow = TextOverflow.Ellipsis)
        }
    }
    if (style.filled) {
        Button(
            onClick = action.onClick,
            enabled = active,
            modifier = size,
            shape = ButtonShape,
            colors = ButtonDefaults.buttonColors(disabledContainerColor = MaterialTheme.colorScheme.primary, disabledContentColor = MaterialTheme.colorScheme.onPrimary),
            contentPadding = padding,
        ) { body() }
    } else {
        OutlinedButton(
            onClick = action.onClick,
            enabled = active,
            modifier = size,
            shape = ButtonShape,
            border = BorderStroke(1.dp, if (style.border == ActionTone.Ink) MaterialTheme.climesa.controlLine else toneColor(style.border)),
            colors = ButtonDefaults.outlinedButtonColors(
                containerColor = MaterialTheme.colorScheme.surface, contentColor = ink,
                disabledContainerColor = MaterialTheme.colorScheme.surface, disabledContentColor = ink,
            ),
            contentPadding = padding,
        ) { body() }
    }
}

/**
 * The actions of one card on one line under its content (S2): the main step first on the left, edit next, the destructive
 * one last on the right. On narrow widths or large text the buttons wrap to the next line instead of shrinking their
 * labels. 44dp touch targets, 8dp apart. Put it inside [ActionCard] so a top divider ties it to its card.
 *
 * Usage: `CardActionRow(listOf(CardAction("Registrar llegada", ActionRole.Primary, ::arrive), CardAction("Cancelar cita", ActionRole.Danger, ::cancel)))`
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun CardActionRow(actions: List<CardAction>, modifier: Modifier = Modifier) {
    if (actions.isEmpty()) return
    val ordered = actions.sortedBy { it.role.ordinal }
    val danger = ordered.filter { it.role == ActionRole.Danger }
    val rest = ordered.filter { it.role != ActionRole.Danger }
    FlowRow(
        modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(Spacing.sm),
        verticalArrangement = Arrangement.spacedBy(Spacing.sm),
    ) {
        rest.forEach { CardActionButton(it) }
        // The destructive action sits at the right end of the line (owner: "asignar a la izquierda ... rechazar a la derecha").
        if (danger.isNotEmpty() && rest.isNotEmpty()) Spacer(Modifier.weight(1f))
        danger.forEach { CardActionButton(it) }
    }
}

/** Tone of a [CardStatusStrip], matched to the status families (neutral, info, success, warning, danger). */
internal enum class StripTone { Neutral, Info, Success, Warning, Danger }

/**
 * Full-width status line inside a card (S6: the state "toma toda la fila"): a tinted band edge to edge with the state as
 * text, so it reads as part of the card and not as a floating chip. Place it right above the [CardActionRow].
 */
@Composable
internal fun CardStatusStrip(text: String, tone: StripTone, modifier: Modifier = Modifier, icon: ImageVector? = null, detail: String? = null) {
    val (fill, ink) = stripColors(tone)
    Row(
        modifier.fillMaxWidth().heightIn(min = 36.dp).background(fill).padding(horizontal = Spacing.md, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(Spacing.sm),
    ) {
        icon?.let { Icon(it, null, Modifier.size(16.dp), tint = ink) }
        Text(text, Modifier.semantics { heading() }, style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.Bold), color = ink)
        detail?.let { Text(it, Modifier.weight(1f), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2, overflow = TextOverflow.Ellipsis) }
    }
}

/**
 * Record card with its own actions (S2): surface, 1dp border and 10dp corners, the [content] padded on top, an optional
 * full-width [status] strip, then a top divider and the [actions] row inside the same card, so every button clearly
 * belongs to this card. Lists of these cards keep the page gap (16dp) between cards.
 *
 * Usage: `ActionCard(actions = listOf(...), status = { CardStatusStrip("Por asignar", StripTone.Warning) }) { Text(name) }`
 */
@Composable
internal fun ActionCard(
    actions: List<CardAction>,
    modifier: Modifier = Modifier,
    onClick: (() -> Unit)? = null,
    status: (@Composable () -> Unit)? = null,
    footer: (@Composable ColumnScope.() -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    val body: @Composable () -> Unit = {
        Column(Modifier.fillMaxWidth()) {
            Column(Modifier.fillMaxWidth().padding(Spacing.md), verticalArrangement = Arrangement.spacedBy(Spacing.xs + 2.dp), content = content)
            footer?.let { Column(Modifier.fillMaxWidth().padding(start = Spacing.md, end = Spacing.md, bottom = Spacing.sm), verticalArrangement = Arrangement.spacedBy(Spacing.xs), content = it) }
            status?.invoke()
            if (actions.isNotEmpty()) {
                if (status == null) HorizontalDivider(color = MaterialTheme.climesa.line)
                CardActionRow(actions, Modifier.padding(horizontal = Spacing.md, vertical = Spacing.sm + Spacing.xs))
            }
        }
    }
    if (onClick != null) ClimesaClickableCard(onClick, modifier) { body() } else ClimesaCard(modifier) { body() }
}

/** Minimum height of a card action (web `.crud-button` 44px), inside Material's 48dp interactive area. */
internal val CardActionMinHeight = 44.dp

/** Card action label: sans 15/800 like the web `.crud-button`. */
private val CardActionText = ButtonText.copy(fontWeight = FontWeight.ExtraBold, lineHeight = 18.sp)

@Composable
private fun toneColor(tone: ActionTone): Color = when (tone) {
    ActionTone.Primary -> MaterialTheme.colorScheme.primary
    ActionTone.PrimaryText -> MaterialTheme.climesa.primaryText
    ActionTone.Danger -> MaterialTheme.climesa.danger
    ActionTone.Ink -> MaterialTheme.colorScheme.onSurface
}

@Composable
private fun stripColors(tone: StripTone): Pair<Color, Color> {
    val c = MaterialTheme.climesa
    return when (tone) {
        StripTone.Neutral -> MaterialTheme.colorScheme.surfaceVariant to MaterialTheme.colorScheme.onSurface
        StripTone.Info -> c.soft to c.primaryText
        StripTone.Success -> c.successSoft to c.success
        StripTone.Warning -> c.warningSoft to c.warning
        StripTone.Danger -> c.dangerSoft to c.danger
    }
}
