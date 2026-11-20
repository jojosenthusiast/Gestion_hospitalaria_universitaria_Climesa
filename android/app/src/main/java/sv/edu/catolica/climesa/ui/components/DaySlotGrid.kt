@file:OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
package sv.edu.catolica.climesa.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.disabled
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import sv.edu.catolica.climesa.domain.DaySlot
import sv.edu.catolica.climesa.domain.SlotStatus
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

private val slotClock = DateTimeFormatter.ofPattern("HH:mm")
private val slotZone = ZoneId.of("America/El_Salvador")
internal fun slotTime(value: String) = runCatching { slotClock.format(Instant.parse(value).atZone(slotZone)) }.getOrDefault(value)

/** D126: the slot that holds the person's own appointment; compared as instants so "…Z" and "…+00:00" match. */
internal fun isSameSlot(a: String, b: String?): Boolean = b != null && (a == b || runCatching { Instant.parse(a) == Instant.parse(b) }.getOrDefault(false))

/**
 * Todas las franjas del día. Las libres van en verde, solo con la hora, y se pueden elegir; las demás salen apagadas con su motivo
 * (Ocupado, Médico sin turno, Ya pasó), nunca solo por color: cada estado lleva su texto.
 */
@Composable
internal fun DaySlotGrid(slots: List<DaySlot>, selected: DaySlot?, onSelect: (DaySlot) -> Unit, modifier: Modifier = Modifier, ownStart: String? = null) {
    // D126: equal columns across the whole width (no gap on the right), as many as fit.
    androidx.compose.foundation.layout.BoxWithConstraints(modifier.fillMaxWidth()) {
    val gap = 8.dp
    val columns = ((maxWidth + gap) / (84.dp + gap)).toInt().coerceAtLeast(3)
    val tile = (maxWidth - gap * (columns - 1)) / columns
    FlowRow(horizontalArrangement = Arrangement.spacedBy(gap), verticalArrangement = Arrangement.spacedBy(gap), maxItemsInEachRow = columns) {
        slots.forEach { slot ->
            val colors = MaterialTheme.climesa
            val chosen = selected?.start == slot.start
            val own = isSameSlot(slot.start, ownStart)
            val (fg, bg) = when {
                chosen -> colors.successSoft to colors.success
                slot.status == SlotStatus.FREE -> colors.success to colors.successSoft
                slot.status == SlotStatus.NO_SHIFT -> colors.blocked to colors.blockedSoft
                else -> MaterialTheme.colorScheme.onSurfaceVariant to colors.disabled
            }
            val border = if (slot.selectable) colors.success else colors.controlLine
            val label = if (own) "Tu cita" else slot.label
            val description = if (slot.selectable) "${slotTime(slot.start)}, libre" else "${slotTime(slot.start)}, no disponible: $label"
            Surface(
                modifier = Modifier.width(tile).semantics { contentDescription = description; if (!slot.selectable) disabled() },
                onClick = { onSelect(slot) }, enabled = slot.selectable,
                shape = MaterialTheme.shapes.small, color = bg, contentColor = fg, border = BorderStroke(2.dp, if (own) MaterialTheme.colorScheme.primary else border),
            ) {
                // Free tiles show only the time (the green outline already says «libre»); the others name their state.
                Column(Modifier.heightIn(min = 52.dp).padding(horizontal = 6.dp, vertical = 8.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                    Text(slotTime(slot.start), style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                    if (!slot.selectable) Text(label, style = MaterialTheme.typography.labelSmall, maxLines = 1, color = if (own) MaterialTheme.colorScheme.primary else androidx.compose.ui.graphics.Color.Unspecified)
                }
            }
        }
    }
    }
}
