package sv.edu.catolica.climesa.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Upcoming
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Icon
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import sv.edu.catolica.climesa.domain.Maqueta
import sv.edu.catolica.climesa.domain.Maquetas

/** Pantalla navegable de maqueta: rótulo "Maqueta", contenido ficticio y acciones deshabilitadas. */
@Composable
fun MaquetaContent(maqueta: Maqueta) {
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        AssistChip(onClick = {}, label = { Text(Maquetas.LABEL) }, leadingIcon = { Icon(Icons.Default.Upcoming, null) }, enabled = false)
        SectionIntro("Próxima entrega", maqueta.title, maqueta.purpose)
        maqueta.rows.forEach { row ->
            ClimesaCard {
                Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(row.label.uppercase(), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
                    Text(row.value, style = MaterialTheme.typography.bodyLarge)
                }
            }
        }
        maqueta.actions.forEach { action -> ClimesaButton(action, Icons.Default.Lock, {}, enabled = false, outlined = true) }
        AnimatedVisibility(visible = true) { InlineStatus(Maquetas.NOTE, Icons.Default.Lock) }
    }
}
