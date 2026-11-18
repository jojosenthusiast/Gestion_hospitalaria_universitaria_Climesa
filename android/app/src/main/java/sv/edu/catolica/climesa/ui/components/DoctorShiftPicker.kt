package sv.edu.catolica.climesa.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import sv.edu.catolica.climesa.R
import sv.edu.catolica.climesa.domain.DoctorShiftFilter

/** Owner rule R2: «Con turno (N)» wears the available badge's look; «Todos» stays neutral. */
@Composable
internal fun DoctorShiftChips(filter: DoctorShiftFilter, total: Int, withShift: Int, onFilter: (DoctorShiftFilter) -> Unit) = ChipRow(
    listOf(Triple(DoctorShiftFilter.WITH_SHIFT, stringResource(R.string.medico_con_turno), withShift), Triple(DoctorShiftFilter.ALL, stringResource(R.string.medico_todos), total)),
    filter, { if (it == DoctorShiftFilter.WITH_SHIFT) ChipTone.Family(StatusFamily.LISTO) else null }, onFilter,
)

/**
 * One doctor of a picker (R1): every state wears its tag. A doctor with a shift shows «Con turno» (available family)
 * and can be picked; one without shows its reason with the closed family and is dimmed. The chosen one is marked with
 * a check and a tinted row. Text stays on-surface, never link blue.
 */
@Composable
internal fun DoctorShiftRow(name: String, detail: String, hasShift: Boolean, reason: String?, selected: Boolean, onPick: () -> Unit, extra: (@Composable () -> Unit)? = null) {
    val colors = MaterialTheme.climesa
    val dim = if (hasShift) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant
    Row(
        Modifier.fillMaxWidth().heightIn(min = Spacing.touch)
            .then(if (selected) Modifier.background(colors.successSoft, MaterialTheme.shapes.small) else Modifier)
            .clickable(enabled = hasShift, role = Role.RadioButton, onClick = onPick)
            .padding(horizontal = Spacing.sm, vertical = Spacing.sm),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Spacing.sm),
    ) {
        if (selected) Icon(Icons.Default.CheckCircle, stringResource(R.string.cat_elegido), Modifier.size(20.dp), tint = colors.success)
        Column(Modifier.weight(1f)) {
            Text(name, style = MaterialTheme.typography.titleSmall, color = dim, fontWeight = if (selected) FontWeight.Bold else null)
            Text(detail, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        extra?.invoke()
        if (hasShift) FamilyBadge(stringResource(R.string.medico_con_turno), StatusFamily.LISTO)
        else FamilyBadge(reason ?: stringResource(R.string.rec_agendar_sin_turno), StatusFamily.CERRADO)
    }
    HorizontalDivider(color = colors.line)
}
