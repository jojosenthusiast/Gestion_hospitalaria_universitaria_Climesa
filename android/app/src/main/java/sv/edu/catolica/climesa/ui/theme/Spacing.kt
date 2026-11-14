package sv.edu.catolica.climesa.ui

import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/** One spacing scale for every screen. Use `Spacing.md` instead of loose dp literals. */
internal object Spacing {
    val xs: Dp = 4.dp
    val sm: Dp = 8.dp
    val md: Dp = 16.dp
    val lg: Dp = 24.dp
    val xl: Dp = 32.dp

    /** Horizontal gutter of a page and gap between its blocks. */
    val page: Dp = 16.dp
    val block: Dp = 14.dp

    /** Minimum touch target of buttons and rows (web `min-height: 48px`). */
    val touch: Dp = 48.dp
}

/** Web radii: `--radius-control` 6, `--radius-card` 10, `--radius-panel` 16. */
internal object Radius {
    val control: Dp = 6.dp
    val card: Dp = 10.dp
    val panel: Dp = 16.dp
}
