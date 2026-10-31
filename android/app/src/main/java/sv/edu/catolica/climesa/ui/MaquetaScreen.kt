package sv.edu.catolica.climesa.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
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
        AssistChip(onClick = {}, label = { Text(Maquetas.LABEL) }, enabled = false)
        Text(maqueta.title, style = MaterialTheme.typography.headlineSmall)
        Text(maqueta.purpose, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        maqueta.rows.forEach { row ->
            Surface(color = MaterialTheme.colorScheme.surface, shape = RoundedCornerShape(0.dp), modifier = Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(row.label.uppercase(), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text(row.value, style = MaterialTheme.typography.bodyLarge)
                }
            }
            HorizontalDivider()
        }
        maqueta.actions.forEach { action ->
            Button(onClick = {}, enabled = false, modifier = Modifier.fillMaxWidth()) { Text(action) }
        }
        Text(Maquetas.NOTE, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}
