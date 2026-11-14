package sv.edu.catolica.climesa.ui

import androidx.compose.material3.ColorScheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color

// Brand constants kept for screens that paint on a fixed brand surface (login, hero banners).
internal val BrandBlue = Color(0xFF0043B2)
internal val BrandNavy = Color(0xFF0E1B33)
internal val BrandAccent = Color(0xFFE6EEFB)
internal val StateFree = Color(0xFF1D7444)

/**
 * Tokens that Material 3 has no slot for, ported 1:1 from `web/src/styles.css` (`:root` and the dark media query).
 * Read them with `MaterialTheme.climesa`.
 */
@Immutable
internal data class ClimesaColors(
    val primaryText: Color,
    val soft: Color,
    val line: Color,
    val controlLine: Color,
    val navy: Color,
    val accent: Color,
    val disabled: Color,
    val success: Color,
    val successSoft: Color,
    val warning: Color,
    val warningSoft: Color,
    val danger: Color,
    val dangerSoft: Color,
    val reserved: Color,
    val reservedSoft: Color,
    val blocked: Color,
    val blockedSoft: Color,
    val process: Color,
    val processSoft: Color,
)

internal val LightClimesaColors = ClimesaColors(
    primaryText = Color(0xFF0043B2), soft = Color(0xFFE6EEFB), line = Color(0xFFD3DBE6), controlLine = Color(0xFF8794AA),
    navy = Color(0xFF0E1B33), accent = Color(0xFF8DB3FA), disabled = Color(0xFFE3E7EE),
    success = Color(0xFF1D7444), successSoft = Color(0xFFE7F4EC),
    warning = Color(0xFF8A5300), warningSoft = Color(0xFFFFF2D9),
    danger = Color(0xFFB71C1C), dangerSoft = Color(0xFFFCEAEA),
    reserved = Color(0xFF6A45A6), reservedSoft = Color(0xFFF1EBFA),
    blocked = Color(0xFF4A5865), blockedSoft = Color(0xFFEDF0F2),
    process = Color(0xFF1F55A3), processSoft = Color(0xFFE8EFF9),
)

internal val DarkClimesaColors = ClimesaColors(
    primaryText = Color(0xFF8DB3FA), soft = Color(0xFF18284A), line = Color(0xFF28344C), controlLine = Color(0xFF65738C),
    navy = Color(0xFF0C1220), accent = Color(0xFF8DB3FA), disabled = Color(0xFF28344C),
    success = Color(0xFF6CCB92), successSoft = Color(0xFF13301F),
    warning = Color(0xFFE8B25E), warningSoft = Color(0xFF33260E),
    danger = Color(0xFFF2918A), dangerSoft = Color(0xFF3A1A17),
    reserved = Color(0xFFBCA3EE), reservedSoft = Color(0xFF2B2140),
    blocked = Color(0xFFAAB7C1), blockedSoft = Color(0xFF222B36),
    process = Color(0xFF8CB2F0), processSoft = Color(0xFF18284A),
)

internal val LocalClimesaColors = staticCompositionLocalOf { LightClimesaColors }

internal val MaterialTheme.climesa: ClimesaColors
    @Composable @ReadOnlyComposable get() = LocalClimesaColors.current

internal val LightScheme: ColorScheme = lightColorScheme(
    primary = BrandBlue, onPrimary = Color.White,
    primaryContainer = Color(0xFFE6EEFB), onPrimaryContainer = BrandNavy,
    secondary = Color(0xFF1F55A3), onSecondary = Color.White,
    secondaryContainer = Color(0xFFE8EFF9), onSecondaryContainer = BrandNavy,
    tertiary = Color(0xFF6A45A6), onTertiary = Color.White,
    background = Color(0xFFF2F5F9), onBackground = BrandNavy,
    surface = Color.White, onSurface = BrandNavy,
    surfaceVariant = Color(0xFFE6EEFB), onSurfaceVariant = Color(0xFF55617A),
    surfaceContainerLowest = Color.White, surfaceContainerLow = Color.White, surfaceContainer = Color.White,
    surfaceContainerHigh = Color(0xFFF2F5F9), surfaceContainerHighest = Color(0xFFE6EEFB),
    outline = Color(0xFF8794AA), outlineVariant = Color(0xFFD3DBE6),
    error = Color(0xFFB71C1C), onError = Color.White,
    errorContainer = Color(0xFFFCEAEA), onErrorContainer = Color(0xFF7A1212),
)

internal val DarkScheme: ColorScheme = darkColorScheme(
    primary = Color(0xFF1D4FB8), onPrimary = Color.White,
    primaryContainer = Color(0xFF18284A), onPrimaryContainer = Color(0xFF8DB3FA),
    secondary = Color(0xFF8CB2F0), onSecondary = Color(0xFF0C1220),
    secondaryContainer = Color(0xFF18284A), onSecondaryContainer = Color(0xFF8CB2F0),
    tertiary = Color(0xFFBCA3EE), onTertiary = Color(0xFF0C1220),
    background = Color(0xFF0C1220), onBackground = Color(0xFFE4EAF3),
    surface = Color(0xFF141C2D), onSurface = Color(0xFFE4EAF3),
    surfaceVariant = Color(0xFF18284A), onSurfaceVariant = Color(0xFF9AA6BA),
    surfaceContainerLowest = Color(0xFF0C1220), surfaceContainerLow = Color(0xFF141C2D), surfaceContainer = Color(0xFF141C2D),
    surfaceContainerHigh = Color(0xFF1B2538), surfaceContainerHighest = Color(0xFF28344C),
    outline = Color(0xFF65738C), outlineVariant = Color(0xFF28344C),
    error = Color(0xFFF2918A), onError = Color(0xFF0C1220),
    errorContainer = Color(0xFF3A1A17), onErrorContainer = Color(0xFFF2918A),
)
