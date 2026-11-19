package sv.edu.catolica.climesa.ui

import androidx.compose.foundation.layout.Arrangement
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
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material3.IconButton
import androidx.compose.material3.Surface
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Info
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

@Composable
private fun ButtonBody(text: String, icon: ImageVector?, loading: Boolean, spinnerColor: androidx.compose.ui.graphics.Color) {
    if (loading) {
        Spinner(size = 20.dp, strokeWidth = 2.dp, color = spinnerColor)
        Spacer(Modifier.width(10.dp))
        Text(stringResource(R.string.ui_un_momento), style = MaterialTheme.typography.labelLarge)
    } else {
        icon?.let { Icon(it, null, Modifier.size(20.dp)); Spacer(Modifier.width(10.dp)) }
        Text(text, maxLines = 2, style = MaterialTheme.typography.labelLarge)
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
        Icon(Icons.Outlined.Info, null, Modifier.size(16.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
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
        border = BorderStroke(1.dp, if (enabled) MaterialTheme.climesa.controlLine else MaterialTheme.climesa.line),
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
    CrudKind.Create -> Icons.Default.Add
    CrudKind.Edit -> Icons.Default.Edit
    CrudKind.Deactivate -> Icons.Default.Delete
    CrudKind.View -> Icons.Default.Visibility
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
    val tint = when (kind) {
        CrudKind.Create -> MaterialTheme.colorScheme.primary
        CrudKind.Edit -> MaterialTheme.climesa.primaryText
        CrudKind.Deactivate -> MaterialTheme.climesa.danger
        CrudKind.View -> MaterialTheme.colorScheme.onSurfaceVariant
    }
    if (iconOnly) {
        IconButton(onClick = onClick, enabled = enabled && !loading, modifier = modifier.size(Spacing.touch).semantics { contentDescription = label }) {
            if (loading) Spinner(size = 20.dp, strokeWidth = 2.dp, color = tint)
            else Icon(kind.icon(), null, tint = if (enabled) tint else MaterialTheme.colorScheme.onSurface.copy(alpha = 0.38f))
        }
        return
    }
    if (kind == CrudKind.Create) {
        Button(
            onClick = onClick,
            enabled = enabled && !loading,
            modifier = modifier.buttonSize(fill),
            contentPadding = ButtonPadding,
        ) { ButtonBody(label, kind.icon(), loading, MaterialTheme.colorScheme.onPrimary) }
        return
    }
    val border = when {
        !enabled -> MaterialTheme.climesa.line
        kind == CrudKind.View -> MaterialTheme.climesa.controlLine
        else -> tint
    }
    OutlinedButton(
        onClick = onClick,
        enabled = enabled && !loading,
        modifier = modifier.buttonSize(fill),
        border = BorderStroke(1.dp, border),
        colors = ButtonDefaults.outlinedButtonColors(contentColor = if (kind == CrudKind.View) MaterialTheme.colorScheme.onSurface else tint),
        contentPadding = ButtonPadding,
    ) { ButtonBody(label, kind.icon(), loading, tint) }
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
        Surface(
            shape = RoundedCornerShape(50),
            color = MaterialTheme.climesa.blockedSoft,
            contentColor = MaterialTheme.climesa.blocked,
            modifier = Modifier
                .heightIn(min = Spacing.touch)
                .combinedClickable(onClick = { open = !open }, onLongClick = { open = true })
                .semantics(mergeDescendants = true) { contentDescription = "${ReadOnlyCopy.LABEL}. $explanation" },
        ) {
            Row(Modifier.padding(horizontal = Spacing.md, vertical = Spacing.sm), horizontalArrangement = Arrangement.spacedBy(Spacing.xs), verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.Lock, null, Modifier.size(16.dp))
                Text(ReadOnlyCopy.LABEL, style = MaterialTheme.typography.labelLarge)
            }
        }
        if (open) Text(explanation, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}
