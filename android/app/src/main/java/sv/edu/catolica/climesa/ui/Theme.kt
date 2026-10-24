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

internal val BrandBlue = Color(0xFF2E49E6)
internal val BrandNavy = Color(0xFF171B2D)
internal val BrandLime = Color(0xFFDCED83)
internal val ClimesaSans = FontFamily(
    Font(R.font.dm_sans_regular, FontWeight.Normal),
    Font(R.font.dm_sans_medium, FontWeight.Medium),
    Font(R.font.dm_sans_semibold, FontWeight.SemiBold),
    Font(R.font.dm_sans_bold, FontWeight.Bold),
)
internal val ClimesaMono = FontFamily(
    Font(R.font.ibm_plex_mono_regular, FontWeight.Normal),
    Font(R.font.ibm_plex_mono_medium, FontWeight.Medium),
)
private val Light = lightColorScheme(
    primary = BrandBlue, onPrimary = Color.White,
    primaryContainer = Color(0xFFEEF0FF), onPrimaryContainer = Color(0xFF2339BA),
    background = Color(0xFFF6F5F1), surface = Color.White,
    onBackground = BrandNavy, onSurface = BrandNavy,
    onSurfaceVariant = Color(0xFF6B6C7C), outline = Color(0xFFB8BBC9),
    outlineVariant = Color(0xFFDCDCE2), surfaceVariant = Color(0xFFF0F0F6),
    error = Color(0xFFAA2C3B), errorContainer = Color(0xFFFFF0F1),
)
private val Dark = darkColorScheme(
    primary = Color(0xFFA8B5FF), onPrimary = Color(0xFF192464),
    primaryContainer = Color(0xFF263377), onPrimaryContainer = Color(0xFFD9DFFF),
    background = Color(0xFF101320), surface = BrandNavy,
    onBackground = Color(0xFFE9EAF2), onSurface = Color(0xFFE9EAF2),
    onSurfaceVariant = Color(0xFFA8ADC4), outline = Color(0xFF626A89),
    outlineVariant = Color(0xFF343B58), surfaceVariant = Color(0xFF20263D),
    error = Color(0xFFFFB2BB), errorContainer = Color(0xFF45242C),
)
private val Type = Typography(
    displaySmall = TextStyle(fontFamily = ClimesaSans, fontWeight = FontWeight.SemiBold, fontSize = 44.sp, lineHeight = 47.sp, letterSpacing = (-1.8).sp),
    headlineLarge = TextStyle(fontFamily = ClimesaSans, fontWeight = FontWeight.SemiBold, fontSize = 38.sp, lineHeight = 42.sp, letterSpacing = (-1.4).sp),
    headlineMedium = TextStyle(fontFamily = ClimesaSans, fontWeight = FontWeight.SemiBold, fontSize = 30.sp, lineHeight = 35.sp, letterSpacing = (-1).sp),
    headlineSmall = TextStyle(fontFamily = ClimesaSans, fontWeight = FontWeight.Medium, fontSize = 26.sp, lineHeight = 31.sp, letterSpacing = (-0.7).sp),
    titleLarge = TextStyle(fontFamily = ClimesaSans, fontWeight = FontWeight.SemiBold, fontSize = 23.sp, lineHeight = 29.sp, letterSpacing = (-0.7).sp),
    titleMedium = TextStyle(fontFamily = ClimesaSans, fontWeight = FontWeight.Medium, fontSize = 16.sp, lineHeight = 23.sp),
    bodyLarge = TextStyle(fontFamily = ClimesaSans, fontSize = 16.sp, lineHeight = 25.sp),
    bodyMedium = TextStyle(fontFamily = ClimesaSans, fontSize = 14.sp, lineHeight = 22.sp),
    bodySmall = TextStyle(fontFamily = ClimesaSans, fontSize = 12.sp, lineHeight = 19.sp),
    labelLarge = TextStyle(fontFamily = ClimesaSans, fontWeight = FontWeight.Medium, fontSize = 14.sp, lineHeight = 20.sp),
    labelMedium = TextStyle(fontFamily = ClimesaMono, fontSize = 11.sp, lineHeight = 17.sp),
    labelSmall = TextStyle(fontFamily = ClimesaMono, fontSize = 10.sp, lineHeight = 16.sp),
)
@Composable fun ClimesaTheme(dark: Boolean, content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = if (dark) Dark else Light, typography = Type,
        shapes = Shapes(extraSmall = RoundedCornerShape(0.dp), small = RoundedCornerShape(3.dp), medium = RoundedCornerShape(3.dp), large = RoundedCornerShape(4.dp), extraLarge = RoundedCornerShape(8.dp)), content = content)
}
