package sv.edu.catolica.climesa.ui

import androidx.compose.foundation.layout.size
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.ProgressBarRangeInfo
import androidx.compose.ui.semantics.progressBarRangeInfo
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * Obs 1: Material's indeterminate indicators run on an infinite transition, and Compose scales every animation by the
 * system animator duration scale: with "Remove animations" (scale 0) they freeze and the screen looks hung. These read
 * the raw frame clock instead, which is not scaled, so a loading state keeps moving under reduced motion (like the web).
 */
internal object SpinnerMotion {
    const val TURN_NANOS = 1_100_000_000L
    const val SWEEP_NANOS = 1_600_000_000L

    /** Rotation in degrees after [elapsedNanos]: one full turn every [TURN_NANOS]. */
    fun angle(elapsedNanos: Long): Float = (Math.floorMod(elapsedNanos, TURN_NANOS).toFloat() / TURN_NANOS) * 360f

    /** Position 0..1 of the linear bar: goes and comes back every [SWEEP_NANOS]. */
    fun sweep(elapsedNanos: Long): Float {
        val t = Math.floorMod(elapsedNanos, SWEEP_NANOS).toFloat() / SWEEP_NANOS
        return if (t < 0.5f) t * 2f else 2f - t * 2f
    }
}

@Composable
private fun rememberElapsedNanos(): Long {
    var elapsed by remember { mutableLongStateOf(0L) }
    LaunchedEffect(Unit) {
        val start = withFrameNanos { it }
        while (true) withFrameNanos { elapsed = it - start }
    }
    return elapsed
}

/** Indeterminate circular spinner that keeps turning when system animations are off. */
@Composable
internal fun Spinner(modifier: Modifier = Modifier, size: Dp = 40.dp, strokeWidth: Dp = 4.dp, color: Color = MaterialTheme.colorScheme.primary) {
    val elapsed = rememberElapsedNanos()
    CircularProgressIndicator(
        progress = { 0.28f },
        modifier = modifier.size(size).semantics { progressBarRangeInfo = ProgressBarRangeInfo.Indeterminate }.rotate(SpinnerMotion.angle(elapsed)),
        color = color,
        strokeWidth = strokeWidth,
        trackColor = Color.Transparent,
        gapSize = 0.dp,
    )
}

/** Indeterminate linear bar for a reload in place; moves with system animations off too. */
@Composable
internal fun LinearSpinner(modifier: Modifier = Modifier) {
    val elapsed = rememberElapsedNanos()
    LinearProgressIndicator(progress = { SpinnerMotion.sweep(elapsed) }, modifier = modifier.semantics { progressBarRangeInfo = ProgressBarRangeInfo.Indeterminate })
}
