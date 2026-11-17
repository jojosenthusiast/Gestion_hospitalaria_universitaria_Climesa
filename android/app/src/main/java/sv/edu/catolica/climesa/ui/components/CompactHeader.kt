package sv.edu.catolica.climesa.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.FlowRowScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import sv.edu.catolica.climesa.domain.headerText

/**
 * S1: compact bar of a module (web `CompactHeader`). Small breadcrumb, a 20 sp title (the screen heading), filters and the
 * primary action. No description under the title: the space goes to the content.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun CompactHeader(
    title: String,
    modifier: Modifier = Modifier,
    breadcrumb: String? = null,
    filters: (@Composable FlowRowScope.() -> Unit)? = null,
    actions: (@Composable RowScope.() -> Unit)? = null,
) {
    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(Space3)) {
        // R3 A-10: inside a portal section the top bar already carries the title; a blank title draws only filters and actions.
        if (title.isNotBlank() || actions != null) Row(Modifier.fillMaxWidth().heightIn(min = Spacing.touch), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Space3)) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                breadcrumb?.takeIf { it.isNotBlank() && title.isNotBlank() }?.let {
                    Text(it, style = MaterialTheme.typography.bodySmall.copy(fontSize = 12.sp, lineHeight = 16.sp, fontWeight = FontWeight.SemiBold), color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                if (title.isNotBlank()) Text(headerText(title), Modifier.semantics { heading() }, style = MaterialTheme.typography.titleLarge, maxLines = 2, overflow = TextOverflow.Ellipsis)
            }
            actions?.let { Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Space2), content = it) }
        }
        filters?.let { FlowRow(horizontalArrangement = Arrangement.spacedBy(Space2), verticalArrangement = Arrangement.spacedBy(Space2), content = it) }
        HorizontalDivider(color = MaterialTheme.climesa.line)
    }
}

