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

/** App theme: colours for [dark], the web type scale and shapes, and the "Tamaño de letra" step ([textScale]) on top of the system size. */
@Composable
fun ClimesaTheme(dark: Boolean, textScale: TextScale = TextScale.NORMAL, content: @Composable () -> Unit) {
    CompositionLocalProvider(
        LocalClimesaColors provides if (dark) DarkClimesaColors else LightClimesaColors,
        LocalSystemColors provides if (dark) DarkSystemColors else LightSystemColors,
    ) {
        MaterialTheme(
            colorScheme = if (dark) DarkScheme else LightScheme,
            typography = ClimesaTypography,
            shapes = ClimesaShapes,
        ) { ProvideTextScale(textScale, content) }
    }
}
