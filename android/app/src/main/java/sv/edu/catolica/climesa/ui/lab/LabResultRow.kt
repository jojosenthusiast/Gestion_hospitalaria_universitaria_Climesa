package sv.edu.catolica.climesa.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import sv.edu.catolica.climesa.domain.LabFlag
import sv.edu.catolica.climesa.domain.LabResultView
import sv.edu.catolica.climesa.domain.LaboratoryItem
import sv.edu.catolica.climesa.ui.icons.ClimesaIcons

/** Ink and fill of a result flag: green in range, amber high or low, red critical, neutral for text, no range or pending. */
@Composable
internal fun labFlagColors(flag: LabFlag): Pair<Color, Color> {
    val c = MaterialTheme.climesa
    return when {
        flag.critical -> c.danger to c.dangerSoft
        flag.outOfRange -> c.warning to c.warningSoft
        flag == LabFlag.NORMAL -> c.success to c.successSoft
        else -> MaterialTheme.colorScheme.onSurfaceVariant to MaterialTheme.colorScheme.surfaceVariant
    }
}

/** The flag as a small labelled chip (never colour alone: the word is always there). */
@Composable
internal fun LabFlagChip(flag: LabFlag, modifier: Modifier = Modifier) {
    val (ink, fill) = labFlagColors(flag)
    Row(modifier.background(fill, RoundedCornerShape(Radius.chip)).padding(horizontal = Spacing.sm, vertical = 3.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Spacing.xs)) {
        if (flag.outOfRange) Icon(ClimesaIcons.Alert, null, Modifier.size(14.dp), tint = ink)
        Text(flag.label, style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Bold), color = ink)
    }
}

/**
 * Lote 5 S13: one component of a result with hierarchy: the exam name and its flag on top, the value large with its unit (in
 * the flag colour when out of range), then the reference range and the lab's observation. [showRange] false is the patient's
 * view (no critical limits).
 */
@Composable
internal fun LabResultRow(item: LaboratoryItem, modifier: Modifier = Modifier, showRange: Boolean = true, pendingText: String? = null) {
    val line = LabResultView.line(item, withRange = showRange)
    val (ink, _) = labFlagColors(line.flag)
    val spoken = listOfNotNull(line.name, line.value?.let { v -> listOfNotNull(v, line.unit).joinToString(" ") }, line.flag.label, line.range?.let { "referencia $it" }).joinToString(", ")
    Column(modifier.fillMaxWidth().padding(vertical = Spacing.sm).semantics(mergeDescendants = true) { contentDescription = spoken }, verticalArrangement = Arrangement.spacedBy(Spacing.xs)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
            Text(line.name, Modifier.weight(1f), style = MaterialTheme.typography.titleSmall)
            LabFlagChip(line.flag)
        }
        if (line.value != null) Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(Spacing.xs)) {
            Text(line.value, style = (if (line.flag == LabFlag.TEXT) MaterialTheme.typography.bodyLarge else MaterialTheme.typography.headlineSmall).copy(fontFeatureSettings = "tnum"),
                color = if (line.flag.outOfRange) ink else MaterialTheme.colorScheme.onSurface)
            line.unit?.let { Text(it, Modifier.padding(bottom = 3.dp), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        } else Text(pendingText ?: LabFlag.PENDING.label, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        line.range?.let { Text("Referencia: $it", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        line.observation?.let { Text((if (line.relevant) "Observación relevante del laboratorio: " else "Observación del laboratorio: ") + it, style = MaterialTheme.typography.bodySmall.copy(fontWeight = if (line.relevant) FontWeight.Bold else FontWeight.Normal)) }
    }
}
