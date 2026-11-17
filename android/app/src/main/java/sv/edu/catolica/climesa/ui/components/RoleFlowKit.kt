package sv.edu.catolica.climesa.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.MutableState

/**
 * S13: a confirmation dialog stays open, showing progress, until its write answers. Set [sent] when the person confirms;
 * once [busy] drops back, [close] runs (an error then shows in the screen banner). A double tap cannot send twice.
 */
@Composable
internal fun CloseWhenDone(busy: Boolean, sent: MutableState<Boolean>, error: String? = null, close: () -> Unit) {
    // R3 A-19: an error keeps the dialog open (with its typed input); only a clean answer closes it.
    LaunchedEffect(busy, error) { if (sent.value && !busy) { sent.value = false; if (error == null) close() } }
}
