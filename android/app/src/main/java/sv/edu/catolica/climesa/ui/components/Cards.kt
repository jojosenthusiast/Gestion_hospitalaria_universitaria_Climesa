package sv.edu.catolica.climesa.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp

@Composable
internal fun cardBorder() = BorderStroke(1.dp, MaterialTheme.climesa.line)

/**
 * Titled block of a page (web panel / module section). `eyebrow` is the mono uppercase kicker; `action` sits at the title's right.
 * Content goes in a padded column; pass `padded = false` for lists that bring their own padding.
 */
@Composable
internal fun SectionCard(
    title: String,
    modifier: Modifier = Modifier,
    eyebrow: String? = null,
    action: (@Composable () -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    ClimesaCard(modifier) {
        Column(Modifier.fillMaxWidth().padding(Spacing.md), verticalArrangement = Arrangement.spacedBy(Spacing.sm + Spacing.xs)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    eyebrow?.let { Text(it.uppercase(), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.climesa.primaryText) }
                    Text(title, style = MaterialTheme.typography.titleMedium, maxLines = 2, overflow = TextOverflow.Ellipsis)
                }
                action?.invoke()
            }
            content()
        }
    }
}

/** Big number with a caption, like the web `.number-strip` cell. Put several in a `Row` with `Modifier.weight(1f)`. */
@Composable
internal fun StatTile(value: String, label: String, modifier: Modifier = Modifier, suffix: String? = null, icon: ImageVector? = null) {
    Surface(
        modifier = modifier,
        color = MaterialTheme.colorScheme.surface,
        shape = MaterialTheme.shapes.medium,
        border = cardBorder(),
        shadowElevation = 1.dp,
    ) {
        Column(Modifier.padding(Spacing.md), verticalArrangement = Arrangement.spacedBy(Spacing.xs)) {
            icon?.let { Icon(it, null, Modifier.size(20.dp), tint = MaterialTheme.climesa.primaryText) }
            Row(verticalAlignment = Alignment.Bottom) {
                Text(value, style = MaterialTheme.typography.headlineLarge, color = MaterialTheme.colorScheme.onSurface)
                suffix?.let { Text(" $it", Modifier.padding(bottom = 4.dp), style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
            }
            Text(label, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

/**
 * List item: leading icon or avatar, title, optional subtitle, optional trailing tag and chevron when `onClick` is set.
 * Use it for every row that shows a record (patient, bed, order, shift).
 */
@Composable
internal fun DataRow(
    title: String,
    modifier: Modifier = Modifier,
    subtitle: String? = null,
    meta: String? = null,
    leadingIcon: ImageVector? = null,
    status: (@Composable () -> Unit)? = null,
    onClick: (() -> Unit)? = null,
    divider: Boolean = false,
) {
    val body: @Composable () -> Unit = {
        Column {
            Row(
                Modifier.fillMaxWidth().heightIn(min = Spacing.touch + Spacing.sm).padding(horizontal = Spacing.md, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                leadingIcon?.let {
                    Surface(color = MaterialTheme.colorScheme.primaryContainer, shape = MaterialTheme.shapes.medium) {
                        Icon(it, null, Modifier.padding(10.dp).size(22.dp), tint = MaterialTheme.climesa.primaryText)
                    }
                }
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                    Text(title, style = MaterialTheme.typography.titleMedium, maxLines = 2, overflow = TextOverflow.Ellipsis)
                    subtitle?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 3, overflow = TextOverflow.Ellipsis) }
                    meta?.let { Text(it, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                }
                status?.invoke()
                if (onClick != null) Icon(Icons.Default.ChevronRight, null, tint = MaterialTheme.climesa.primaryText)
            }
            if (divider) HorizontalDivider(color = MaterialTheme.climesa.line)
        }
    }
    if (onClick != null) ClimesaClickableCard(onClick, modifier) { body() } else ClimesaCard(modifier) { body() }
}

/** Label above a value, for detail sheets (ficha). */
@Composable
internal fun LabeledValue(label: String, value: String, modifier: Modifier = Modifier) {
    Column(modifier, verticalArrangement = Arrangement.spacedBy(Spacing.xs)) {
        Text(label.uppercase(), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value, style = MaterialTheme.typography.bodyLarge)
    }
}
