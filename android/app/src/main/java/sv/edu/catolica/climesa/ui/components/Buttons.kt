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

/**
 * Filled primary action. `loading` shows a spinner and "Un momento…" and blocks taps, so a double tap cannot send twice.
 * Full width by default, 52dp tall like the web `.primary-button`.
 */
@Composable
internal fun PrimaryButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    icon: ImageVector? = null,
    enabled: Boolean = true,
    loading: Boolean = false,
) {
    Button(
        onClick = onClick,
        enabled = enabled && !loading,
        modifier = modifier.fillMaxWidth().heightIn(min = 52.dp),
        contentPadding = ButtonPadding,
    ) { ButtonBody(text, icon, loading, MaterialTheme.colorScheme.onPrimary) }
}

/** Outlined secondary action (web `.secondary-button`). */
@Composable
internal fun SecondaryButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    icon: ImageVector? = null,
    enabled: Boolean = true,
    loading: Boolean = false,
) {
    OutlinedButton(
        onClick = onClick,
        enabled = enabled && !loading,
        modifier = modifier.fillMaxWidth().heightIn(min = 52.dp),
        border = BorderStroke(1.dp, if (enabled) MaterialTheme.climesa.controlLine else MaterialTheme.climesa.line),
        contentPadding = ButtonPadding,
    ) { ButtonBody(text, icon, loading, MaterialTheme.colorScheme.primary) }
}

/** Destructive action (inactivar, cancelar, dar de baja). Always pair it with [ConfirmDialog]. */
@Composable
internal fun DangerButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    icon: ImageVector? = null,
    enabled: Boolean = true,
    loading: Boolean = false,
) {
    Button(
        onClick = onClick,
        enabled = enabled && !loading,
        modifier = modifier.fillMaxWidth().heightIn(min = 52.dp),
        colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error, contentColor = MaterialTheme.colorScheme.onError),
        contentPadding = ButtonPadding,
    ) { ButtonBody(text, icon, loading, MaterialTheme.colorScheme.onError) }
}
