package sv.edu.catolica.climesa.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import kotlinx.coroutines.delay
import sv.edu.catolica.climesa.R
import sv.edu.catolica.climesa.data.ColdStart

/** True once [active] has lasted [ColdStart.SLOW_HINT_MS] without finishing (MA-OPS-01). */
@Composable
internal fun rememberSlowServer(active: Boolean): Boolean {
    var slow by remember { mutableStateOf(false) }
    LaunchedEffect(active) {
        slow = false
        if (active) { delay(ColdStart.SLOW_HINT_MS); slow = true }
    }
    return active && slow
}

/** "El servidor se está activando…" under a login or loading indicator that has been waiting for a while. */
@Composable
internal fun SlowServerHint(active: Boolean, modifier: Modifier = Modifier, color: Color = MaterialTheme.colorScheme.onSurfaceVariant) {
    if (!rememberSlowServer(active)) return
    Text(
        stringResource(R.string.servidor_activando),
        modifier.semantics { liveRegion = LiveRegionMode.Polite },
        style = MaterialTheme.typography.bodySmall,
        color = color,
        textAlign = TextAlign.Center,
    )
}
