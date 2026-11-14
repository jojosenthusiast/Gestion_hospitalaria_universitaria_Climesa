package sv.edu.catolica.climesa.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import sv.edu.catolica.climesa.R
import sv.edu.catolica.climesa.domain.Maqueta
import sv.edu.catolica.climesa.domain.Maquetas

/** Pantalla navegable de maqueta: rótulo "Maqueta", contenido ficticio y acciones deshabilitadas. */
@Composable
fun MaquetaContent(maqueta: Maqueta) {
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(Spacing.block)) {
        StatusPill(Maquetas.LABEL, StatusTone.RESERVED)
        SectionIntro("Próxima entrega", maqueta.title)
        SectionCard(stringResource(R.string.paciente_maqueta_datos)) {
            Text(maqueta.purpose, style = MaterialTheme.typography.bodyMedium)
            maqueta.rows.take(2).forEach { row ->
                HorizontalDivider(color = MaterialTheme.climesa.line)
                LabeledValue(row.label, row.value)
            }
            if (maqueta.rows.size > 2) {
                Text("Más información estará disponible en la entrega funcional.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        if (maqueta.actions.isNotEmpty()) {
            SecondaryButton("Función todavía no disponible", {}, icon = Icons.Default.Lock, enabled = false)
        }
        InlineStatus(Maquetas.NOTE, Icons.Default.Lock)
    }
}
