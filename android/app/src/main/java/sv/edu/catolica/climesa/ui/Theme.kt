package sv.edu.catolica.climesa.ui

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import sv.edu.catolica.climesa.R

internal val BrandBlue = Color(0xFF0043B2)
internal val BrandNavy = Color(0xFF0E1B33)
internal val BrandAccent = Color(0xFFE6EEFB)
internal val StateFree = Color(0xFF1D7444)
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
private val Light = lightColorScheme(
    primary = BrandBlue, onPrimary = Color.White,
    primaryContainer = Color(0xFFE6EEFB), onPrimaryContainer = BrandNavy,
    secondary = Color(0xFF1F55A3), onSecondary = Color.White,
    background = Color(0xFFF2F5F9), surface = Color.White,
    onBackground = BrandNavy, onSurface = BrandNavy,
    onSurfaceVariant = Color(0xFF55617A), outline = Color(0xFF55617A),
    outlineVariant = Color(0xFFD3DBE6), surfaceVariant = Color(0xFFE6EEFB),
    error = Color(0xFFB71C1C), errorContainer = Color(0xFFFCEAEA),
)
private val Dark = darkColorScheme(
    primary = Color(0xFF1D4FB8), onPrimary = Color.White,
    primaryContainer = Color(0xFF18284A), onPrimaryContainer = Color(0xFF8DB3FA),
    secondary = Color(0xFF8CB2F0), onSecondary = Color(0xFF0C1220),
    background = Color(0xFF0C1220), surface = Color(0xFF141C2D),
    onBackground = Color(0xFFE4EAF3), onSurface = Color(0xFFE4EAF3),
    onSurfaceVariant = Color(0xFF9AA6BA), outline = Color(0xFF9AA6BA),
    outlineVariant = Color(0xFF28344C), surfaceVariant = Color(0xFF18284A),
    error = Color(0xFFF2918A), errorContainer = Color(0xFF3A1A17),
)
private val Type = Typography(
    displaySmall = TextStyle(fontFamily = ClimesaSans, fontWeight = FontWeight.Bold, fontSize = 32.sp, lineHeight = 37.sp, letterSpacing = (-.6).sp),
    headlineLarge = TextStyle(fontFamily = ClimesaSans, fontWeight = FontWeight.Bold, fontSize = 28.sp, lineHeight = 34.sp, letterSpacing = (-.4).sp),
    headlineMedium = TextStyle(fontFamily = ClimesaSans, fontWeight = FontWeight.Bold, fontSize = 24.sp, lineHeight = 30.sp),
    headlineSmall = TextStyle(fontFamily = ClimesaSans, fontWeight = FontWeight.SemiBold, fontSize = 22.sp, lineHeight = 28.sp),
    titleLarge = TextStyle(fontFamily = ClimesaSans, fontWeight = FontWeight.Bold, fontSize = 20.sp, lineHeight = 25.sp),
    titleMedium = TextStyle(fontFamily = ClimesaSans, fontWeight = FontWeight.SemiBold, fontSize = 16.sp, lineHeight = 23.sp),
    bodyLarge = TextStyle(fontFamily = ClimesaSans, fontSize = 16.sp, lineHeight = 24.sp),
    bodyMedium = TextStyle(fontFamily = ClimesaSans, fontSize = 16.sp, lineHeight = 24.sp),
    bodySmall = TextStyle(fontFamily = ClimesaSans, fontSize = 16.sp, lineHeight = 23.sp),
    labelLarge = TextStyle(fontFamily = ClimesaSans, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, lineHeight = 20.sp),
    labelMedium = TextStyle(fontFamily = ClimesaMono, fontSize = 13.sp, lineHeight = 18.sp),
    labelSmall = TextStyle(fontFamily = ClimesaMono, fontWeight = FontWeight.Medium, fontSize = 12.sp, lineHeight = 17.sp),
)
@Composable fun ClimesaTheme(dark: Boolean, content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = if (dark) Dark else Light, typography = Type,
        shapes = Shapes(extraSmall = RoundedCornerShape(6.dp), small = RoundedCornerShape(10.dp), medium = RoundedCornerShape(10.dp), large = RoundedCornerShape(16.dp), extraLarge = RoundedCornerShape(16.dp)), content = content)
}
