package sv.edu.catolica.climesa.ui

import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.res.stringResource
import sv.edu.catolica.climesa.R

/**
 * Close-on-success contract of a confirmation (R3 A-19), pure so it is tested on the JVM. [confirm] marks the write as sent;
 * [settle] runs each time `busy` or `error` changes and answers true only when the sent write finished without an error.
 * After an error the dialog stays open with what the person typed, and the next confirm starts again.
 */
internal class ConfirmSubmission {
    var sent: Boolean = false
        private set

    fun confirm() { sent = true }

    fun settle(busy: Boolean, error: String?): Boolean {
        if (!sent || busy) return false
        sent = false
        return error == null
    }
}

/**
 * Confirmation before a consequential action. While `busy` the dialog cannot be dismissed and the confirm button shows progress,
 * so the write is not sent twice. `destructive` paints the confirm action in the error colour.
 * Extra inputs (a reason field) go in `body`. With [onDone] the dialog closes itself only when the write succeeds; [error]
 * then shows inside the dialog and the typed reason is kept, so a failure never loses it.
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
    error: String? = null,
    onDone: (() -> Unit)? = null,
    body: (@Composable () -> Unit)? = null,
) {
    val submission = androidx.compose.runtime.remember { ConfirmSubmission() }
    if (onDone != null) androidx.compose.runtime.LaunchedEffect(busy, error) { if (submission.settle(busy, error)) onDone() }
    val shownError = ConfirmDialogText.shownError(error, onDone != null)
    AlertDialog(
        onDismissRequest = { if (!busy) onDismiss() },
        // D4: taps inside the dialog window never reach Activity.onUserInteraction; they count as activity here.
        modifier = androidx.compose.ui.Modifier.keepsSessionAlive(),
        // D12: a dialog with inputs (a reason) is not dropped by a stray tap outside it.
        properties = androidx.compose.ui.window.DialogProperties(dismissOnClickOutside = body == null),
        shape = MaterialTheme.shapes.large,
        containerColor = MaterialTheme.colorScheme.surface,
        title = { Text(title, style = MaterialTheme.typography.titleLarge) },
        text = if (message != null || body != null || shownError != null) ({
            // D101: the body scrolls inside the dialog, so the keyboard (the dialog window resizes for it) never pushes the
            // confirm button out of reach; a focused field scrolls itself into view.
            androidx.compose.foundation.layout.Column(
                androidx.compose.ui.Modifier.verticalScroll(androidx.compose.foundation.rememberScrollState()),
                verticalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(Spacing.sm + Spacing.xs),
            ) {
                message?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                body?.invoke()
                shownError?.let { NoticeBanner(NoticeKind.ERROR, it) }
            }
        }) else null,
        confirmButton = {
            // D87: the action is a filled button (red when destructive), never a text link that looks like "Cancelar".
            androidx.compose.material3.Button(
                onClick = { if (onDone != null) submission.confirm(); onConfirm() },
                enabled = confirmEnabled && !busy,
                colors = if (destructive) ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error, contentColor = MaterialTheme.colorScheme.onError) else ButtonDefaults.buttonColors(),
            ) { Text(if (busy) stringResource(R.string.ui_un_momento) else confirmLabel, style = MaterialTheme.typography.labelLarge) }
        },
        dismissButton = { TextButton(onClick = onDismiss, enabled = !busy) { Text(dismissLabel, style = MaterialTheme.typography.labelLarge) } },
    )
}

/**
 * D4: every pointer event inside a dialog or sheet window (which `MainActivity.onUserInteraction` never sees) touches the
 * inactivity clock, so a person working in a dialog is not signed out. Observes in the Initial pass and consumes nothing.
 */
internal fun androidx.compose.ui.Modifier.keepsSessionAlive(): androidx.compose.ui.Modifier = pointerInput(Unit) {
    awaitPointerEventScope {
        while (true) { awaitPointerEvent(PointerEventPass.Initial); sv.edu.catolica.climesa.SessionActivity.timeout.touch() }
    }
}

/** What [ConfirmDialog] prints as its error. */
internal object ConfirmDialogText {
    /** #1: shown whenever it is set; dialogs without [onDone] (dispatch, discard, Recibido, finish) failed silently. */
    fun shownError(error: String?, @Suppress("UNUSED_PARAMETER") hasOnDone: Boolean = true): String? = error
}
