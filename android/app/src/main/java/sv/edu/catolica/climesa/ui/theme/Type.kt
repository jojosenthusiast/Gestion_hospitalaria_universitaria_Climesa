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

/** Web scale: Atkinson Hyperlegible Next for text, Atkinson Hyperlegible Mono for eyebrows and labels (`.eyebrow`, `.mono-label`). */
internal val ClimesaTypography = Typography(
    displaySmall = TextStyle(fontFamily = ClimesaSans, fontWeight = FontWeight.Bold, fontSize = 32.sp, lineHeight = 37.sp, letterSpacing = (-.6).sp),
    headlineLarge = TextStyle(fontFamily = ClimesaSans, fontWeight = FontWeight.Bold, fontSize = 28.sp, lineHeight = 34.sp, letterSpacing = (-.4).sp),
    headlineMedium = TextStyle(fontFamily = ClimesaSans, fontWeight = FontWeight.Bold, fontSize = 24.sp, lineHeight = 30.sp, letterSpacing = (-.3).sp),
    headlineSmall = TextStyle(fontFamily = ClimesaSans, fontWeight = FontWeight.SemiBold, fontSize = 22.sp, lineHeight = 28.sp),
    titleLarge = TextStyle(fontFamily = ClimesaSans, fontWeight = FontWeight.Bold, fontSize = 20.sp, lineHeight = 25.sp),
    titleMedium = TextStyle(fontFamily = ClimesaSans, fontWeight = FontWeight.SemiBold, fontSize = 16.sp, lineHeight = 23.sp),
    titleSmall = TextStyle(fontFamily = ClimesaSans, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, lineHeight = 20.sp),
    bodyLarge = TextStyle(fontFamily = ClimesaSans, fontSize = 16.sp, lineHeight = 24.sp),
    bodyMedium = TextStyle(fontFamily = ClimesaSans, fontSize = 16.sp, lineHeight = 24.sp),
    bodySmall = TextStyle(fontFamily = ClimesaSans, fontSize = 14.sp, lineHeight = 21.sp),
    labelLarge = TextStyle(fontFamily = ClimesaSans, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, lineHeight = 20.sp),
    labelMedium = TextStyle(fontFamily = ClimesaMono, fontSize = 13.sp, lineHeight = 18.sp),
    labelSmall = TextStyle(fontFamily = ClimesaMono, fontWeight = FontWeight.Medium, fontSize = 12.sp, lineHeight = 17.sp, letterSpacing = .8.sp),
)
