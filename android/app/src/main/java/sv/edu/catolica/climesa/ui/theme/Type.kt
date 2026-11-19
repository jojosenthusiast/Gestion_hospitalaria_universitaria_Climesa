package sv.edu.catolica.climesa.ui

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import sv.edu.catolica.climesa.R

internal val ClimesaSans = FontFamily(
    Font(R.font.atkinson_hyperlegible_next, FontWeight.Normal),
    Font(R.font.atkinson_hyperlegible_next, FontWeight.Medium),
    Font(R.font.atkinson_hyperlegible_next, FontWeight.SemiBold),
    Font(R.font.atkinson_hyperlegible_next, FontWeight.Bold),
)
internal val ClimesaMono = FontFamily(
    Font(R.font.atkinson_hyperlegible_mono, FontWeight.Normal),
    Font(R.font.atkinson_hyperlegible_mono, FontWeight.Medium),
    Font(R.font.atkinson_hyperlegible_mono, FontWeight.Bold),
)

/** Tabular figures (`font-variant-numeric: tabular-nums`): digits keep one width so counters, times and record numbers do not jump. */
internal const val TabularNumbers = "tnum"

/** Same style with tabular figures, for a number that is not already in a tabular style. */
internal fun TextStyle.tabular(): TextStyle = copy(fontFeatureSettings = TabularNumbers)

/**
 * Web scale: Atkinson Hyperlegible Next for every text style, labels and eyebrows included (web `.eyebrow` is sans 12/700
 * uppercase 0.08em). Mono is only for codes (area code, ficha, ticket, DUI, CIE-10) through [CodeText], never a Material slot.
 * Display, headline (big counters), label (badges, times) styles use tabular figures; body text keeps proportional ones.
 */
internal val ClimesaTypography = Typography(
    displaySmall = TextStyle(fontFamily = ClimesaSans, fontWeight = FontWeight.Bold, fontSize = 32.sp, lineHeight = 37.sp, letterSpacing = (-.6).sp, fontFeatureSettings = TabularNumbers),
    headlineLarge = TextStyle(fontFamily = ClimesaSans, fontWeight = FontWeight.Bold, fontSize = 34.sp, lineHeight = 40.sp, letterSpacing = (-.4).sp, fontFeatureSettings = TabularNumbers),
    headlineMedium = TextStyle(fontFamily = ClimesaSans, fontWeight = FontWeight.Bold, fontSize = 24.sp, lineHeight = 30.sp, letterSpacing = (-.3).sp, fontFeatureSettings = TabularNumbers),
    headlineSmall = TextStyle(fontFamily = ClimesaSans, fontWeight = FontWeight.SemiBold, fontSize = 22.sp, lineHeight = 28.sp),
    titleLarge = TextStyle(fontFamily = ClimesaSans, fontWeight = FontWeight.Bold, fontSize = 20.sp, lineHeight = 25.sp),
    titleMedium = TextStyle(fontFamily = ClimesaSans, fontWeight = FontWeight.SemiBold, fontSize = 16.sp, lineHeight = 23.sp),
    titleSmall = TextStyle(fontFamily = ClimesaSans, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, lineHeight = 20.sp),
    bodyLarge = TextStyle(fontFamily = ClimesaSans, fontSize = 16.sp, lineHeight = 24.sp),
    bodyMedium = TextStyle(fontFamily = ClimesaSans, fontSize = 16.sp, lineHeight = 24.sp),
    bodySmall = TextStyle(fontFamily = ClimesaSans, fontSize = 14.sp, lineHeight = 21.sp),
    labelLarge = TextStyle(fontFamily = ClimesaSans, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, lineHeight = 20.sp, fontFeatureSettings = TabularNumbers),
    labelMedium = TextStyle(fontFamily = ClimesaSans, fontWeight = FontWeight.Medium, fontSize = 13.sp, lineHeight = 18.sp, fontFeatureSettings = TabularNumbers),
    labelSmall = TextStyle(fontFamily = ClimesaSans, fontWeight = FontWeight.Bold, fontSize = 12.sp, lineHeight = 17.sp, letterSpacing = .96.sp, fontFeatureSettings = TabularNumbers),
)

/** Codes only (area code, ficha, ticket, DUI, CIE-10): Atkinson Hyperlegible Mono 13, tabular. The one place mono is used. */
internal val CodeText = TextStyle(fontFamily = ClimesaMono, fontWeight = FontWeight.Bold, fontSize = 13.sp, lineHeight = 18.sp, fontFeatureSettings = TabularNumbers)

/** Bottom-bar labels: sans and without tracking, so long Spanish labels (Resultados, Internados) fit without an ellipsis. */
internal val NavLabel = TextStyle(fontFamily = ClimesaSans, fontWeight = FontWeight.Medium, fontSize = 12.sp, lineHeight = 16.sp)
