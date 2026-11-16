package sv.edu.catolica.climesa.ui

import android.provider.Settings
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.FiniteAnimationSpec
import androidx.compose.animation.core.tween
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext

/**
 * Motion is feedback only (02-sistema.md, section 4): 100-200 ms to confirm an action or show where something went.
 * Nothing animates when a module opens. With the system "remove animations" setting (animator duration scale 0) every
 * duration becomes 0, the Android equivalent of `prefers-reduced-motion: reduce`.
 */
internal object Motion {
    const val INSTANT = 100
    const val FAST = 160
    const val STANDARD = 200

    /** Web `--ease-out` `cubic-bezier(0.2, 0, 0, 1)`. */
    val EaseOut = CubicBezierEasing(0.2f, 0f, 0f, 1f)

    /**
     * Duration to play for [base] ms under the system [animatorScale]. 0 turns motion off; any other scale plays the token
     * unchanged, so a debug "slow animations" setting never stretches feedback past 200 ms.
     */
    fun duration(base: Int, animatorScale: Float): Int = if (animatorScale == 0f) 0 else base.coerceIn(0, STANDARD)
}

/** The system animator duration scale; 0 means the person turned animations off. */
@Composable
internal fun rememberAnimatorScale(): Float {
    val resolver = LocalContext.current.contentResolver
    return remember(resolver) { runCatching { Settings.Global.getFloat(resolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) }.getOrDefault(1f) }
}

/** A [tween] of a motion token that respects reduced motion. */
@Composable
internal fun <T> motionTween(base: Int = Motion.FAST): FiniteAnimationSpec<T> =
    tween(durationMillis = Motion.duration(base, rememberAnimatorScale()), easing = Motion.EaseOut)
