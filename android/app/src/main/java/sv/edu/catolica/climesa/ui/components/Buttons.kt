package sv.edu.catolica.climesa.ui

import sv.edu.catolica.climesa.ui.icons.ClimesaIcons
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.compositeOver
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.IconButton
import androidx.compose.material3.Surface
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import sv.edu.catolica.climesa.R

private val ButtonPadding = PaddingValues(horizontal = 18.dp, vertical = 12.dp)

/** Web `.primary-button`/`.secondary-button`/`.crud-button`: 6dp corners (`--radius-control`), never the Material pill. */
internal val ButtonShape = RoundedCornerShape(Radius.control)

/** Button label: sans 15/700, line height 1.35 (web `.primary-button`). */
internal val ButtonText = TextStyle(fontFamily = ClimesaSans, fontWeight = FontWeight.Bold, fontSize = 15.sp, lineHeight = 20.sp)

/** CRUD label: sans 15/800 (web `.crud-button`); Atkinson has no 800, so it renders at its boldest. */
private val CrudText = ButtonText.copy(fontWeight = FontWeight.ExtraBold, lineHeight = 18.sp)

@Composable
private fun ButtonBody(text: String, icon: ImageVector?, loading: Boolean, spinnerColor: androidx.compose.ui.graphics.Color, textStyle: TextStyle = ButtonText) {
    if (loading) {
        Spinner(size = 20.dp, strokeWidth = 2.dp, color = spinnerColor)
        Spacer(Modifier.width(10.dp))
        Text(stringResource(R.string.ui_un_momento), style = textStyle)
    } else {
        icon?.let { Icon(it, null, Modifier.size(20.dp)); Spacer(Modifier.width(10.dp)) }
        Text(text, maxLines = 2, style = textStyle)
    }
}

/** Width of a button: [fill] stretches it to the row (forms, dialogs), otherwise it wraps its label (rows, bars). */
private fun Modifier.buttonSize(fill: Boolean) = if (fill) fillMaxWidth().heightIn(min = 52.dp) else heightIn(min = Spacing.touch)

/**
 * Filled primary action, one per screen. `loading` shows a spinner and "Un momento…" and blocks taps, so a double tap cannot
 * send twice. Full width by default, 52dp tall like the web `.primary-button`; `fill = false` wraps the label (48dp target).
 * Preconditions sweep (S0): a non-null [blockedReason] disables the button and says why under it, before the tap, instead of
 * letting the API refuse it. An action the person can never do is hidden by the caller, never shown blocked.
 */
@Composable
internal fun PrimaryButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    icon: ImageVector? = null,
    enabled: Boolean = true,
    loading: Boolean = false,
    fill: Boolean = true,
    blockedReason: String? = null,
) {
    val button: @Composable (Modifier) -> Unit = { m ->
        Button(
            onClick = onClick,
            enabled = enabled && !loading && blockedReason == null,
            modifier = m.buttonSize(fill),
            shape = ButtonShape,
            contentPadding = ButtonPadding,
        ) { ButtonBody(text, icon, loading, MaterialTheme.colorScheme.onPrimary) }
    }
    if (blockedReason == null) button(modifier)
    else Column(modifier, verticalArrangement = Arrangement.spacedBy(Spacing.xs)) { button(Modifier); BlockedReason(blockedReason) }
}

/**
 * The calm line under a blocked action (S0): an info icon and the reason with its next step, in muted text. Never red: the
 * person did nothing wrong, the action just is not available yet.
 */
@Composable
internal fun BlockedReason(text: String, modifier: Modifier = Modifier) {
    Row(modifier, horizontalArrangement = Arrangement.spacedBy(Spacing.xs), verticalAlignment = Alignment.Top) {
        Icon(ClimesaIcons.Info, null, Modifier.size(16.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(text, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

/** Outlined secondary action (web `.secondary-button`). `fill = false` wraps the label for actions in a row. */
@Composable
internal fun SecondaryButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    icon: ImageVector? = null,
    enabled: Boolean = true,
    loading: Boolean = false,
    fill: Boolean = true,
) {
    OutlinedButton(
        onClick = onClick,
        enabled = enabled && !loading,
        modifier = modifier.buttonSize(fill),
        shape = ButtonShape,
        border = BorderStroke(1.dp, if (enabled) MaterialTheme.climesa.controlLine else MaterialTheme.climesa.line),
        colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.onSurface),
        contentPadding = ButtonPadding,
    ) { ButtonBody(text, icon, loading, MaterialTheme.colorScheme.primary) }
}

/**
 * Compact action inside a list row (R3 A-17): a text button that wraps its label and keeps the 48dp touch target, so a row
 * never stacks full-width buttons. `loading` is per row: only the row being saved shows "Un momento…". A non-null
 * [blockedReason] disables it and shows the [BlockedReason] line under it (S0).
 */
@Composable
internal fun RowAction(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    loading: Boolean = false,
    blockedReason: String? = null,
) {
    val button: @Composable (Modifier) -> Unit = { m ->
        androidx.compose.material3.TextButton(
            onClick = onClick,
            enabled = enabled && !loading && blockedReason == null,
            modifier = m.heightIn(min = Spacing.touch),
            shape = ButtonShape,
            contentPadding = PaddingValues(horizontal = Spacing.md, vertical = Spacing.sm),
        ) { ButtonBody(text, null, loading, MaterialTheme.colorScheme.primary) }
    }
    if (blockedReason == null) button(modifier)
    else Column(modifier, verticalArrangement = Arrangement.spacedBy(Spacing.xs)) { button(Modifier); BlockedReason(blockedReason, Modifier.padding(horizontal = Spacing.md)) }
}

/** The four CRUD verbs (S0, obs 6/10). Each one always has the same look, on every screen and role, like the web `CrudButton`. */
internal enum class CrudKind { Create, Edit, Deactivate, View }

/** Icon of each CRUD verb: create = add, edit = pencil, deactivate = trash, view = eye. */
internal fun CrudKind.icon(): ImageVector = when (this) {
    CrudKind.Create -> ClimesaIcons.Plus
    CrudKind.Edit -> ClimesaIcons.Pencil
    CrudKind.Deactivate -> ClimesaIcons.Trash
    CrudKind.View -> ClimesaIcons.Eye
}

/**
 * Shared CRUD action (S0): create is the filled primary button with the add icon; edit is outlined in the primary color with
 * a pencil; deactivate, delete or retire is outlined in red with a trash icon; view is outlined neutral with an eye.
 * [iconOnly] draws a 48dp icon button for list rows, with [label] as its content description.
 */
@Composable
internal fun CrudButton(
    kind: CrudKind,
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    iconOnly: Boolean = false,
    enabled: Boolean = true,
    loading: Boolean = false,
    fill: Boolean = true,
) {
    val tint = crudTint(kind)
    val active = enabled && !loading
    if (iconOnly) {
        // Web `.crud-icon`: a 36dp square with the verb's border and colour, inside the 48dp touch target.
        val (container, content) = if (kind == CrudKind.Create) MaterialTheme.colorScheme.primary to MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.surface to tint
        Box(modifier.size(Spacing.touch).alpha(if (enabled) 1f else .5f), contentAlignment = Alignment.Center) {
            Surface(
                onClick = onClick,
                enabled = active,
                shape = ButtonShape,
                color = container,
                contentColor = content,
                border = BorderStroke(1.dp, crudBorder(kind)),
                modifier = Modifier.size(36.dp).semantics { contentDescription = label },
            ) {
                Box(contentAlignment = Alignment.Center) {
                    if (loading) Spinner(size = 18.dp, strokeWidth = 2.dp, color = content) else Icon(kind.icon(), null, Modifier.size(18.dp))
                }
            }
        }
        return
    }
    // Web `.crud-button`: 44dp tall, 8/16 padding, 15/800, 6dp corners; disabled keeps its colours at 50 % opacity.
    val padding = PaddingValues(horizontal = 16.dp, vertical = 8.dp)
    val size = if (fill) Modifier.fillMaxWidth().heightIn(min = 44.dp) else Modifier.heightIn(min = 44.dp)
    if (kind == CrudKind.Create) {
        Button(
            onClick = onClick,
            enabled = active,
            modifier = modifier.then(size).alpha(if (enabled) 1f else .5f),
            shape = ButtonShape,
            colors = ButtonDefaults.buttonColors(disabledContainerColor = MaterialTheme.colorScheme.primary, disabledContentColor = MaterialTheme.colorScheme.onPrimary),
            contentPadding = padding,
        ) { ButtonBody(label, kind.icon(), loading, MaterialTheme.colorScheme.onPrimary, CrudText) }
        return
    }
    val content = if (kind == CrudKind.View) MaterialTheme.colorScheme.onSurface else tint
    OutlinedButton(
        onClick = onClick,
        enabled = active,
        modifier = modifier.then(size).alpha(if (enabled) 1f else .5f),
        shape = ButtonShape,
        border = BorderStroke(1.dp, crudBorder(kind)),
        colors = ButtonDefaults.outlinedButtonColors(
            containerColor = MaterialTheme.colorScheme.surface, contentColor = content,
            disabledContainerColor = MaterialTheme.colorScheme.surface, disabledContentColor = content,
        ),
        contentPadding = padding,
    ) { ButtonBody(label, kind.icon(), loading, tint, CrudText) }
}

/** Text colour of a CRUD verb (web `crud.css`): create primary, edit primary text, deactivate danger, view ink. */
@Composable
private fun crudTint(kind: CrudKind) = when (kind) {
    CrudKind.Create -> MaterialTheme.colorScheme.primary
    CrudKind.Edit -> MaterialTheme.climesa.primaryText
    CrudKind.Deactivate -> MaterialTheme.climesa.danger
    CrudKind.View -> MaterialTheme.colorScheme.onSurface
}

/** Border of a CRUD verb: its own colour, neutral control line for view. */
@Composable
private fun crudBorder(kind: CrudKind) = when (kind) {
    CrudKind.Create -> MaterialTheme.colorScheme.primary
    CrudKind.View -> MaterialTheme.climesa.controlLine
    else -> crudTint(kind)
}

/** Text of the read-only explanation (obs 15), the same sentence as the web `ReadOnlyBadge`. */
internal object ReadOnlyCopy {
    const val LABEL = "Solo lectura"
    fun explain(who: String, what: String = "esta información"): String = "Puedes consultar $what. Para hacer cambios, contacta a $who."
}

/**
 * Visible read-only cue (obs 15): a lock pill «Solo lectura». A tap or long press opens the explanation under it
 * («Puedes consultar X. Para hacer cambios, contacta a Y.»); screen readers hear the full sentence right away.
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
internal fun ReadOnlyBadge(who: String, what: String = "esta información", modifier: Modifier = Modifier) {
    var open by rememberSaveable { mutableStateOf(false) }
    val explanation = ReadOnlyCopy.explain(who, what)
    Column(modifier, verticalArrangement = Arrangement.spacedBy(Spacing.xs)) {
        // Web `.readonly-badge`: pill with a warning-tinted border and fill, ink text, warning-coloured lock, 14/800.
        val warning = MaterialTheme.climesa.warning
        Surface(
            shape = RoundedCornerShape(50),
            color = warning.copy(alpha = .12f).compositeOver(MaterialTheme.colorScheme.surface),
            contentColor = MaterialTheme.colorScheme.onSurface,
            border = BorderStroke(1.dp, warning.copy(alpha = .55f)),
            modifier = Modifier
                .heightIn(min = Spacing.touch)
                .combinedClickable(onClick = { open = !open }, onLongClick = { open = true })
                .semantics(mergeDescendants = true) { contentDescription = "${ReadOnlyCopy.LABEL}. $explanation" },
        ) {
            Row(Modifier.padding(horizontal = Spacing.md, vertical = Spacing.sm), horizontalArrangement = Arrangement.spacedBy(Spacing.xs), verticalAlignment = Alignment.CenterVertically) {
                Icon(ClimesaIcons.Lock, null, Modifier.size(16.dp), tint = warning)
                Text(ReadOnlyCopy.LABEL, style = ButtonText.copy(fontSize = 14.sp, fontWeight = FontWeight.ExtraBold))
            }
        }
        if (open) Text(explanation, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}
