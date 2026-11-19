package sv.edu.catolica.climesa.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Density

/**
 * "Tamaño de letra" in Perfil (owner batch 5, S1): three proven steps on top of the system font size, like the iOS
 * Dynamic Type "larger" steps and the web 100/115/130 % zoom. [stored] is the value kept on the device; never rename it.
 */
enum class TextScale(val stored: String, val factor: Float, val label: String) {
    NORMAL("normal", 1f, "Normal"),
    LARGE("grande", 1.15f, "Grande"),
    EXTRA_LARGE("muy_grande", 1.3f, "Muy grande");

    /** "Normal (100 %)": the label with its percentage, for the option and its screen-reader text. */
    val percentLabel: String get() = "$label (${Math.round(factor * 100)} %)"

    companion object {
        /**
         * Largest font scale the app draws (system scale times the chosen step). Past it, fixed-width rows and the bottom
         * bar stop fitting; Android's own largest "font size" setting before 14 was 1.3 and Material tests layouts to 1.5.
         */
        const val MAX_FONT_SCALE = 1.5f

        /** The stored value back to its step; anything unknown or missing is [NORMAL]. */
        fun fromStored(value: String?): TextScale = entries.firstOrNull { it.stored == value } ?: NORMAL

        /**
         * Font scale to draw with: the system scale times the step, capped at [MAX_FONT_SCALE]. The cap never goes below the
         * person's own system setting, so the app is never smaller than what they chose for the whole phone.
         */
        fun effectiveFontScale(system: Float, step: TextScale): Float =
            if (step == NORMAL) system else minOf(system * step.factor, maxOf(system, MAX_FONT_SCALE))
    }
}

/** The chosen text size and how to change it; provided once by the activity, read by the Perfil option. */
internal data class TextScaleControl(val value: TextScale, val set: (TextScale) -> Unit)

/** Default control for previews and tests: Normal, and changes are ignored. */
internal val LocalTextScaleControl = staticCompositionLocalOf { TextScaleControl(TextScale.NORMAL) {} }

/**
 * Applies [step] to everything inside by scaling the Compose `Density.fontScale` on top of the system setting. Normal keeps
 * the platform density untouched (and its non-linear scaling on Android 14+). Components must use `heightIn(min = …)`,
 * never a fixed `height`, around text so they grow with it.
 */
@Composable
internal fun ProvideTextScale(step: TextScale, content: @Composable () -> Unit) {
    if (step == TextScale.NORMAL) { content(); return }
    val density = LocalDensity.current
    val scaled = Density(density.density, TextScale.effectiveFontScale(density.fontScale, step))
    CompositionLocalProvider(LocalDensity provides scaled, content = content)
}
