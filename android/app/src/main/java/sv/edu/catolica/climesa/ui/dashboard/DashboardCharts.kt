package sv.edu.catolica.climesa.ui.dashboard

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Error
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import sv.edu.catolica.climesa.domain.ChartKind
import sv.edu.catolica.climesa.domain.ChartSlice
import sv.edu.catolica.climesa.domain.DashboardChart
import sv.edu.catolica.climesa.domain.DashboardTone
import sv.edu.catolica.climesa.ui.Spacing
import sv.edu.catolica.climesa.ui.climesa

/** Foreground and soft background of a tone, from the same tokens as the status pills (web `.status-*`). */
@Composable
internal fun DashboardTone.colors(): Pair<Color, Color> {
    val c = MaterialTheme.climesa
    return when (this) {
        DashboardTone.SUCCESS -> c.success to c.successSoft
        DashboardTone.PROCESS -> c.process to c.processSoft
        DashboardTone.RESERVED -> c.reserved to c.reservedSoft
        DashboardTone.WARNING -> c.warning to c.warningSoft
        DashboardTone.BLOCKED -> c.blocked to c.blockedSoft
        DashboardTone.DANGER -> c.danger to c.dangerSoft
        DashboardTone.NEUTRAL -> MaterialTheme.colorScheme.onSurfaceVariant to MaterialTheme.colorScheme.background
    }
}

/** Shape next to the colour, so a state is never told by colour alone. */
internal fun DashboardTone.icon(): ImageVector = when (this) {
    DashboardTone.SUCCESS -> Icons.Default.CheckCircle
    DashboardTone.WARNING -> Icons.Default.Warning
    DashboardTone.DANGER -> Icons.Default.Error
    DashboardTone.PROCESS -> Icons.Default.Schedule
    else -> Icons.Default.Info
}

/** Content description that reads the whole chart: "Ocupación de camas: Libres 4, Ocupadas 8...". */
private fun DashboardChart.description() = title + ": " + slices.joinToString(", ") { "${it.label} ${it.value}" }

@Composable
internal fun ChartContent(chart: DashboardChart) {
    Column(Modifier.fillMaxWidth().semantics(mergeDescendants = true) { contentDescription = chart.description() }, verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
        when (chart.kind) {
            ChartKind.BARS -> BarChart(chart.slices)
            ChartKind.DONUT -> DonutChart(chart.slices, chart.total)
        }
    }
}

/** Horizontal bars drawn on a Canvas: label and count on the row, bar scaled to the largest value. */
@Composable
internal fun BarChart(slices: List<ChartSlice>) {
    val max = (slices.maxOfOrNull { it.value } ?: 0).coerceAtLeast(1)
    val track = MaterialTheme.climesa.line
    slices.forEach { slice ->
        val (fg, _) = slice.tone.colors()
        Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text(slice.label, Modifier.weight(1f), style = MaterialTheme.typography.bodySmall)
                Text(slice.value.toString(), style = MaterialTheme.typography.labelLarge.copy(fontFeatureSettings = "tnum"))
            }
            Canvas(Modifier.fillMaxWidth().height(10.dp)) {
                drawRoundRect(track.copy(alpha = .45f), Offset.Zero, size, CornerRadius(size.height / 2))
                if (slice.value > 0) drawRoundRect(fg, Offset.Zero, Size((size.width * slice.value / max).coerceAtLeast(size.height), size.height), CornerRadius(size.height / 2))
            }
        }
    }
}

/** Ring split by state with its legend (colour dot, name and count), so each slice is readable without colour. */
@Composable
internal fun DonutChart(slices: List<ChartSlice>, total: Int) {
    val ring = MaterialTheme.climesa.line
    val colored = slices.map { it to it.tone.colors().first }
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Spacing.md), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(116.dp), contentAlignment = Alignment.Center) {
            Canvas(Modifier.size(116.dp)) {
                val stroke = 20.dp.toPx()
                val inset = stroke / 2
                val arcSize = Size(size.width - stroke, size.height - stroke)
                drawArc(ring.copy(alpha = .45f), 0f, 360f, false, Offset(inset, inset), arcSize, style = Stroke(stroke))
                var start = -90f
                colored.forEach { (slice, color) ->
                    val sweep = if (total > 0) 360f * slice.value / total else 0f
                    if (sweep > 0f) drawArc(color, start, (sweep - 1.5f).coerceAtLeast(0.5f), false, Offset(inset, inset), arcSize, style = Stroke(stroke, cap = StrokeCap.Butt))
                    start += sweep
                }
            }
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text(total.toString(), style = MaterialTheme.typography.headlineSmall.copy(fontFeatureSettings = "tnum"))
                Text("total", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(5.dp)) {
            colored.forEach { (slice, color) ->
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                    Box(Modifier.size(10.dp).background(color, CircleShape))
                    Text(slice.label, Modifier.weight(1f), style = MaterialTheme.typography.bodySmall)
                    Box(Modifier.width(Spacing.xs))
                    Text(slice.value.toString(), style = MaterialTheme.typography.labelLarge.copy(fontFeatureSettings = "tnum"))
                }
            }
        }
    }
}
