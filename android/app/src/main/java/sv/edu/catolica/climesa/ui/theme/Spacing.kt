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

/** Web radii: `--radius-chip` 4, `--radius-control` 6, `--radius-card` 10, `--radius-panel` 16. */
internal object Radius {
    val chip: Dp = 4.dp
    val control: Dp = 6.dp
    val card: Dp = 10.dp
    val panel: Dp = 16.dp
}

// Fase 2 scale (02-sistema.md, section 7). Names match the web `--space-*` and `--radius-*` tokens.
internal val Space1: Dp = 4.dp
internal val Space2: Dp = 8.dp
internal val Space3: Dp = 12.dp
internal val Space4: Dp = 16.dp
internal val Space5: Dp = 20.dp
internal val Space6: Dp = 24.dp
internal val Space8: Dp = 32.dp
internal val Space10: Dp = 40.dp
internal val Space12: Dp = 48.dp

/** Chip 4, control 6, card 10, panel 16. Nested: inner radius = outer radius − padding. */
internal val RadiusChip: Dp = 4.dp
internal val RadiusControl: Dp = Radius.control
internal val RadiusCard: Dp = Radius.card
internal val RadiusPanel: Dp = Radius.panel
