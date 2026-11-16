package sv.edu.catolica.climesa.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.MutableState

/**
 * S13: a confirmation dialog stays open, showing progress, until its write answers. Set [sent] when the person confirms;
 * once [busy] drops back, [close] runs (an error then shows in the screen banner). A double tap cannot send twice.
 */
@Composable
internal fun CloseWhenDone(busy: Boolean, sent: MutableState<Boolean>, close: () -> Unit) {
    LaunchedEffect(busy) { if (sent.value && !busy) { sent.value = false; close() } }
}
