package sv.edu.catolica.climesa.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Campaign
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.KeyboardDoubleArrowUp
import androidx.compose.material.icons.filled.MonitorHeart
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

internal fun StatusIcon.vector(): ImageVector = when (this) {
    StatusIcon.SCHEDULE -> Icons.Default.Schedule
    StatusIcon.CAMPAIGN -> Icons.Default.Campaign
    StatusIcon.MONITOR_HEART -> Icons.Default.MonitorHeart
    StatusIcon.CHECK -> Icons.Default.Check
    StatusIcon.CLOSE -> Icons.Default.Close
    StatusIcon.WARNING -> Icons.Default.Warning
    StatusIcon.DOUBLE_ARROW_UP -> Icons.Default.KeyboardDoubleArrowUp
    StatusIcon.DASH -> Icons.Default.Remove
}

@Composable
private fun badgeTextStyle() = MaterialTheme.typography.labelLarge.copy(fontSize = 12.sp, fontWeight = FontWeight.Bold, lineHeight = 16.sp).tabular()

/**
 * Draws a family pattern behind a badge (web `.status-badge.pattern-*`): stripes, dots, solid, outline, dashed or double
 * border. The pattern, not the colour, tells families apart in grayscale.
 */
private fun Modifier.statusPattern(pattern: StatusPattern, fam: Color, soft: Color, surface: Color): Modifier = drawBehind {
    val radius = RadiusChip.toPx()
    val px = 1.dp.toPx()
    when (pattern) {
        StatusPattern.STRIPED -> {
            drawRoundRect(soft, cornerRadius = CornerRadius(radius))
            clipRect { stripes(fam.copy(alpha = .18f), step = 7.dp.toPx(), width = 3.dp.toPx()) }
            roundOutline(fam, radius, px)
        }
        StatusPattern.DOTTED -> {
            drawRoundRect(soft, cornerRadius = CornerRadius(radius))
            dots(fam.copy(alpha = .32f))
            roundOutline(fam, radius, px, PathEffect.dashPathEffect(floatArrayOf(.1f, 3.dp.toPx())))
        }
        StatusPattern.SOLID -> drawRoundRect(fam, cornerRadius = CornerRadius(radius))
        StatusPattern.OUTLINE -> { drawRoundRect(surface, cornerRadius = CornerRadius(radius)); roundOutline(fam, radius, 1.5f * px) }
        StatusPattern.DASHED -> roundOutline(fam, radius, 1.5f * px, PathEffect.dashPathEffect(floatArrayOf(4.dp.toPx(), 3.dp.toPx())))
        StatusPattern.DOUBLE -> {
            drawRoundRect(soft, cornerRadius = CornerRadius(radius))
            roundOutline(fam, radius, px, inset = px / 2)
            roundOutline(fam, radius, px, inset = px * 2.5f)
        }
    }
}

private fun DrawScope.roundOutline(color: Color, radius: Float, width: Float, effect: PathEffect? = null, inset: Float = width / 2) = drawRoundRect(
    color, topLeft = Offset(inset, inset), size = Size(size.width - inset * 2, size.height - inset * 2),
    cornerRadius = CornerRadius((radius - inset).coerceAtLeast(0f)), style = Stroke(width, pathEffect = effect, cap = StrokeCap.Round),
)

private fun DrawScope.dots(color: Color) {
    val step = 5.dp.toPx()
    var y = step / 2
    while (y < size.height) { var x = step / 2; while (x < size.width) { drawCircle(color, 1.dp.toPx() * .7f, Offset(x, y)); x += step }; y += step }
}

private fun DrawScope.stripes(color: Color, step: Float, width: Float) {
    var x = -size.height
    while (x < size.width + size.height) {
        drawLine(color, Offset(x, size.height), Offset(x + size.height, 0f), strokeWidth = width)
        x += step
    }
}

/** D10: a long state never pushes a row's title out; the label ends in an ellipsis past this width. */
private val BadgeMaxWidth = 180.dp

/**
 * State as icon + label + pattern (S7), never colour alone. Same as the web `StatusBadge`: [family] null is the neutral
 * badge with a dot (values like `alto`, `sin_rango`).
 */
@Composable
internal fun FamilyBadge(text: String, family: StatusFamily?, modifier: Modifier = Modifier) {
    val shape = RoundedCornerShape(RadiusChip)
    if (family == null) {
        val fg = MaterialTheme.colorScheme.onSurfaceVariant
        Row(
            modifier.widthIn(max = BadgeMaxWidth).clip(shape).background(MaterialTheme.colorScheme.background).border(1.dp, fg.copy(alpha = .3f), shape).padding(horizontal = Space2, vertical = 3.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Box(Modifier.size(7.dp).background(fg, CircleShape))
            Text(text, style = badgeTextStyle(), color = fg, maxLines = 1, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis)
        }
        return
    }
    val (fam, soft) = MaterialTheme.system.status(family)
    val fg = MaterialTheme.system.badge(family, MaterialTheme.colorScheme.surface).first
    Row(
        modifier.widthIn(max = BadgeMaxWidth).statusPattern(family.pattern, fam, soft, MaterialTheme.colorScheme.surface).padding(horizontal = Space2, vertical = 3.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Icon(family.icon.vector(), null, Modifier.size(14.dp), tint = fg)
        Text(text, style = badgeTextStyle(), color = fg, maxLines = 1, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis)
    }
}

/**
 * Badge for an API state value. The value picks the family (shared table with web and iOS); a value the table does not
 * know uses the family of [fallback], the tone its catalog gives it, and with no fallback it is neutral.
 */
@Composable
internal fun StatusBadge(value: String, modifier: Modifier = Modifier, label: String? = null, fallback: StatusTone? = StatusCatalog.tone(value)) =
    if (StatusFamily.urgent(value)) PriorityBadge(Priority.URGENTE, modifier, label ?: StatusCatalog.label(value))
    else FamilyBadge(label ?: StatusCatalog.label(value), StatusFamily.resolve(value, fallback), modifier)

/** Priority (S7): emergency solid critical red, urgent amber tint, routine gray. */
@Composable
internal fun PriorityBadge(priority: Priority, modifier: Modifier = Modifier, label: String = priority.label) {
    val (fg, bg) = MaterialTheme.system.priority(priority)
    val shape = RoundedCornerShape(RadiusChip)
    val text = if (priority == Priority.EMERGENCIA) bg else fg
    val fill = if (priority == Priority.EMERGENCIA) fg else bg
    Row(
        modifier.widthIn(max = BadgeMaxWidth).clip(shape).background(fill).border(1.dp, fg, shape).padding(horizontal = Space2, vertical = 3.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Icon(priority.icon.vector(), null, Modifier.size(14.dp), tint = text)
        Text(label, style = badgeTextStyle(), color = text, maxLines = 1, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis)
    }
}

/** Area code chip (web `AreaTag`): solid area colour with the three-letter code, and the area name when [showName]. */
@Composable
internal fun AreaTag(code: String, modifier: Modifier = Modifier, showName: Boolean = false) {
    val area = Area.of(code)
    val (strong, _) = MaterialTheme.system.area(area)
    val described = if (showName) modifier else modifier.clearAndSetSemantics { contentDescription = "Área ${area.label}" }
    Row(described, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Space2)) {
        Text(
            area.code,
            Modifier.background(strong, RoundedCornerShape(RadiusChip)).padding(horizontal = 6.dp, vertical = 2.dp),
            style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Bold, letterSpacing = .5.sp),
            color = MaterialTheme.system.onArea,
        )
        if (showName) Text(area.label, style = badgeTextStyle(), color = strong)
    }
}

/**
 * Area surface (web `.area-surface`): soft area tint, 1 dp border at 35 %, strong 3 dp stripe on top. For cards and cells
 * that belong to an area.
 */
@Composable
internal fun Modifier.areaSurface(code: String): Modifier {
    val (strong, soft) = MaterialTheme.system.area(Area.of(code))
    val shape = RoundedCornerShape(RadiusCard)
    return clip(shape).background(soft).border(1.dp, strong.copy(alpha = .35f), shape).drawBehind {
        drawRect(strong, size = Size(size.width, 3.dp.toPx()))
    }
}

/** Legend with exactly the same pieces as cards and filters (web `StatusLegend`). */
@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun StatusLegend(modifier: Modifier = Modifier, areas: Boolean = true, statuses: Boolean = true, priorities: Boolean = true) {
    @Composable fun group(title: String, content: @Composable () -> Unit) = Column(verticalArrangement = Arrangement.spacedBy(Space2)) {
        Text(title, style = MaterialTheme.typography.labelLarge.copy(fontSize = 12.sp), color = MaterialTheme.colorScheme.onSurfaceVariant)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(Space2), verticalArrangement = Arrangement.spacedBy(Space2)) { content() }
    }
    Column(modifier.semantics { contentDescription = "Leyenda de colores y estados" }, verticalArrangement = Arrangement.spacedBy(Space4)) {
        if (areas) group("Áreas") { Area.entries.forEach { AreaTag(it.code, showName = true) } }
        if (statuses) group("Estados") { StatusFamily.entries.forEach { FamilyBadge(it.label, it) } }
        if (priorities) group("Prioridad") { Priority.entries.forEach { PriorityBadge(it) } }
    }
}

/** Corner of a filter chip (Material filter chips use 8 dp); the texture is drawn with the same corner. */
private val ChipCorner = 8.dp

/**
 * Filter chip that filters by a status or priority (S7). With a [tone] it wears that badge's colour, texture and icon:
 * unselected it is the soft badge, selected it fills with the strong colour and keeps the texture in the text colour.
 * The label (with its count) always stays, so the chip never speaks by colour alone. Without a tone it is the plain
 * Material filter chip ("Todos").
 */
@OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
@Composable
internal fun StatusFilterChip(selected: Boolean, onClick: () -> Unit, label: String, tone: ChipTone?, modifier: Modifier = Modifier, enabled: Boolean = true) {
    if (tone == null) {
        FilterChip(selected, onClick, { Text(label) }, modifier, enabled = enabled)
        return
    }
    val colors = MaterialTheme.system
    val surface = MaterialTheme.colorScheme.surface
    val (strong, soft) = colors.tone(tone)
    val (fg, _) = colors.chip(tone, selected, surface)
    val ink = fg.copy(alpha = if (enabled) 1f else .38f)
    FilterChip(
        selected = selected,
        onClick = onClick,
        label = { Text(label, fontWeight = if (selected) FontWeight.Bold else FontWeight.SemiBold) },
        modifier = modifier.chipPattern(tone.pattern, selected, strong, soft, surface, colors.onStatus),
        enabled = enabled,
        leadingIcon = { Icon(tone.icon.vector(), null, Modifier.size(FilterChipDefaults.IconSize)) },
        shape = RoundedCornerShape(ChipCorner),
        colors = FilterChipDefaults.filterChipColors(
            containerColor = Color.Transparent, selectedContainerColor = Color.Transparent,
            disabledContainerColor = Color.Transparent, disabledSelectedContainerColor = Color.Transparent,
            labelColor = ink, selectedLabelColor = ink, disabledLabelColor = ink,
            iconColor = ink, selectedLeadingIconColor = ink, disabledLeadingIconColor = ink,
        ),
        border = null,
    )
}

/**
 * Texture of a status filter chip. Unselected: the badge pattern (a solid family or a plain priority shows as its soft
 * tint with a border, so the selected chip still stands out). Selected: strong fill with the same texture in [on].
 */
private fun Modifier.chipPattern(pattern: StatusPattern?, selected: Boolean, strong: Color, soft: Color, surface: Color, on: Color): Modifier = drawBehind {
    val radius = ChipCorner.toPx()
    val px = 1.dp.toPx()
    val corner = CornerRadius(radius)
    if (selected) {
        drawRoundRect(strong, cornerRadius = corner)
        when (pattern) {
            StatusPattern.STRIPED -> clipRect { stripes(on.copy(alpha = .22f), step = 7.dp.toPx(), width = 3.dp.toPx()) }
            StatusPattern.DOTTED -> dots(on.copy(alpha = .4f))
            StatusPattern.DASHED -> roundOutline(on, radius, px, PathEffect.dashPathEffect(floatArrayOf(4.dp.toPx(), 3.dp.toPx())), inset = px * 2.5f)
            StatusPattern.DOUBLE -> roundOutline(on, radius, px, inset = px * 2.5f)
            StatusPattern.SOLID, StatusPattern.OUTLINE, null -> Unit
        }
        return@drawBehind
    }
    when (pattern) {
        StatusPattern.STRIPED -> {
            drawRoundRect(soft, cornerRadius = corner)
            clipRect { stripes(strong.copy(alpha = .18f), step = 7.dp.toPx(), width = 3.dp.toPx()) }
            roundOutline(strong, radius, px)
        }
        StatusPattern.DOTTED -> {
            drawRoundRect(soft, cornerRadius = corner)
            dots(strong.copy(alpha = .32f))
            roundOutline(strong, radius, px, PathEffect.dashPathEffect(floatArrayOf(.1f, 3.dp.toPx())))
        }
        StatusPattern.OUTLINE -> { drawRoundRect(surface, cornerRadius = corner); roundOutline(strong, radius, 1.5f * px) }
        StatusPattern.DASHED -> { drawRoundRect(surface, cornerRadius = corner); roundOutline(strong, radius, 1.5f * px, PathEffect.dashPathEffect(floatArrayOf(4.dp.toPx(), 3.dp.toPx()))) }
        StatusPattern.DOUBLE -> {
            drawRoundRect(soft, cornerRadius = corner)
            roundOutline(strong, radius, px, inset = px / 2)
            roundOutline(strong, radius, px, inset = px * 2.5f)
        }
        StatusPattern.SOLID, null -> { drawRoundRect(soft, cornerRadius = corner); roundOutline(strong, radius, px) }
    }
}
