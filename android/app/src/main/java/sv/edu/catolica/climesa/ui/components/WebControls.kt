package sv.edu.catolica.climesa.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/** Web `.cl-chip` label: sans 13/700. */
private val ChipText = TextStyle(fontFamily = ClimesaSans, fontWeight = FontWeight.Bold, fontSize = 13.sp, lineHeight = 17.sp)

/** Web `.segment` label: sans 14/600. */
private val SegmentText = TextStyle(fontFamily = ClimesaSans, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, lineHeight = 19.sp)

/**
 * Neutral filter or choice chip, the web `.cl-chip`: pill, 36dp tall (48dp touch), 1.5dp border in the line colour,
 * surface fill and ink text; selected it takes a primary border, the soft fill and primary text. No checkmark: the fill
 * and the border say it is on. Same parameters as the Material `FilterChip` so call sites read the same.
 */
@Composable
internal fun ClimesaFilterChip(
    selected: Boolean,
    onClick: () -> Unit,
    label: @Composable () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    leadingIcon: (@Composable () -> Unit)? = null,
    trailingIcon: (@Composable () -> Unit)? = null,
) {
    val colors = MaterialTheme.climesa
    val border = if (selected) MaterialTheme.colorScheme.primary else colors.line
    val fill = if (selected) colors.soft else MaterialTheme.colorScheme.surface
    val ink = if (selected) colors.primaryText else MaterialTheme.colorScheme.onSurface
    Surface(
        selected = selected,
        onClick = onClick,
        enabled = enabled,
        shape = RoundedCornerShape(percent = 50),
        color = fill,
        contentColor = ink,
        border = BorderStroke(1.5.dp, border),
        modifier = modifier.heightIn(min = 36.dp).alpha(if (enabled) 1f else .5f),
    ) {
        Row(
            Modifier.padding(horizontal = 12.dp, vertical = 4.dp),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            CompositionLocalProvider(LocalContentColor provides ink) {
                leadingIcon?.invoke()
                androidx.compose.material3.ProvideTextStyle(ChipText) { label() }
                trailingIcon?.invoke()
            }
        }
    }
}

/** One option of a [SegmentedControl]: its label and, when it helps, a count shown in a small pill (web `.segment small`). */
internal data class Segment(val label: String, val count: Int? = null)

/**
 * The one segmented control (web `.segmented`): a bordered group at least 44dp tall with 6dp corners; options are split by a line,
 * and the selected one takes the soft fill and primary text, its count pill turns primary. Scrolls sideways when the
 * options do not fit. Replaces the Material `TabRow`.
 */
@Composable
internal fun SegmentedControl(segments: List<Segment>, selectedIndex: Int, onSelect: (Int) -> Unit, modifier: Modifier = Modifier) {
    val colors = MaterialTheme.climesa
    val shape = RoundedCornerShape(Radius.control)
    Row(
        modifier
            // Lote 5 S1: grows with "Tamaño de letra" (min 44dp) instead of clipping the labels at a fixed height.
            .heightIn(min = 44.dp)
            .height(IntrinsicSize.Min)
            .border(1.dp, colors.controlLine, shape)
            .background(MaterialTheme.colorScheme.surface, shape)
            .padding(1.dp)
            .horizontalScroll(rememberScrollState())
            .selectableGroup(),
    ) {
        segments.forEachIndexed { index, segment ->
            if (index > 0) Box(Modifier.width(1.dp).fillMaxHeight().background(colors.line))
            val selected = index == selectedIndex
            val ink = if (selected) colors.primaryText else MaterialTheme.colorScheme.onSurface
            Row(
                Modifier
                    .fillMaxHeight()
                    .background(if (selected) colors.soft else MaterialTheme.colorScheme.surface)
                    .selectable(selected = selected, onClick = { onSelect(index) }, role = Role.Tab)
                    .padding(horizontal = 12.dp),
                horizontalArrangement = Arrangement.spacedBy(Space2),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(segment.label, style = SegmentText, color = ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
                segment.count?.let { count ->
                    Text(
                        count.toString(),
                        Modifier
                            .background(if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.background, RoundedCornerShape(percent = 50))
                            .padding(horizontal = 6.dp),
                        style = ChipText.copy(fontSize = 12.sp, fontFeatureSettings = TabularNumbers),
                        color = if (selected) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}
