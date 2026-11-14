package sv.edu.catolica.climesa.ui

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider

internal val ClimesaShapes = Shapes(
    extraSmall = RoundedCornerShape(Radius.control),
    small = RoundedCornerShape(Radius.control),
    medium = RoundedCornerShape(Radius.card),
    large = RoundedCornerShape(Radius.panel),
    extraLarge = RoundedCornerShape(Radius.panel),
)

@Composable
fun ClimesaTheme(dark: Boolean, content: @Composable () -> Unit) {
    CompositionLocalProvider(LocalClimesaColors provides if (dark) DarkClimesaColors else LightClimesaColors) {
        MaterialTheme(
            colorScheme = if (dark) DarkScheme else LightScheme,
            typography = ClimesaTypography,
            shapes = ClimesaShapes,
            content = content,
        )
    }
}
