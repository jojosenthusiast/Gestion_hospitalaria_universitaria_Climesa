package sv.edu.catolica.climesa.ui

import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import sv.edu.catolica.climesa.R

/**
 * Confirmation before a consequential action. While `busy` the dialog cannot be dismissed and the confirm button shows progress,
 * so the write is not sent twice. `destructive` paints the confirm action in the error colour.
 * Extra inputs (a reason field, an error) go in `body`.
 */
@Composable
internal fun ConfirmDialog(
    title: String,
    confirmLabel: String,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
    message: String? = null,
    dismissLabel: String = stringResource(R.string.ui_cancelar),
    destructive: Boolean = false,
    busy: Boolean = false,
    confirmEnabled: Boolean = true,
    body: (@Composable () -> Unit)? = null,
) {
    AlertDialog(
        onDismissRequest = { if (!busy) onDismiss() },
        shape = MaterialTheme.shapes.large,
        containerColor = MaterialTheme.colorScheme.surface,
        title = { Text(title, style = MaterialTheme.typography.titleLarge) },
        text = if (message != null || body != null) ({
            androidx.compose.foundation.layout.Column(verticalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(Spacing.sm + Spacing.xs)) {
                message?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                body?.invoke()
            }
        }) else null,
        confirmButton = {
            TextButton(
                onClick = onConfirm,
                enabled = confirmEnabled && !busy,
                colors = if (destructive) ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.error) else ButtonDefaults.textButtonColors(),
            ) { Text(if (busy) stringResource(R.string.ui_un_momento) else confirmLabel, style = MaterialTheme.typography.labelLarge) }
        },
        dismissButton = { TextButton(onClick = onDismiss, enabled = !busy) { Text(dismissLabel, style = MaterialTheme.typography.labelLarge) } },
    )
}
