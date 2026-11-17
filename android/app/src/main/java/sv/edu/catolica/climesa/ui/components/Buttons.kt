package sv.edu.catolica.climesa.ui

import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.BorderStroke
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import sv.edu.catolica.climesa.R

private val ButtonPadding = PaddingValues(horizontal = 18.dp, vertical = 12.dp)

@Composable
private fun ButtonBody(text: String, icon: ImageVector?, loading: Boolean, spinnerColor: androidx.compose.ui.graphics.Color) {
    if (loading) {
        CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp, color = spinnerColor)
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
) {
    Button(
        onClick = onClick,
        enabled = enabled && !loading,
        modifier = modifier.buttonSize(fill),
        contentPadding = ButtonPadding,
    ) { ButtonBody(text, icon, loading, MaterialTheme.colorScheme.onPrimary) }
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
 * never stacks full-width buttons. `loading` is per row: only the row being saved shows "Un momento…".
 */
@Composable
internal fun RowAction(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    loading: Boolean = false,
) {
    androidx.compose.material3.TextButton(
        onClick = onClick,
        enabled = enabled && !loading,
        modifier = modifier.heightIn(min = Spacing.touch),
        contentPadding = PaddingValues(horizontal = Spacing.md, vertical = Spacing.sm),
    ) { ButtonBody(text, null, loading, MaterialTheme.colorScheme.primary) }
}
