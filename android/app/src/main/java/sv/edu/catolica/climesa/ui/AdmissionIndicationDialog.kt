package sv.edu.catolica.climesa.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Hotel
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Checkbox
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import sv.edu.catolica.climesa.R
import sv.edu.catolica.climesa.domain.AccessProfile
import sv.edu.catolica.climesa.domain.AdmissionIndication
import sv.edu.catolica.climesa.domain.AdmissionIntake
import sv.edu.catolica.climesa.domain.IndicationContext
import sv.edu.catolica.climesa.domain.IsolationType
import sv.edu.catolica.climesa.domain.MedicalAppointment

/**
 * MOV-02 entry inside an open consultation: "Indicar hospitalización" for a physician with `admision.solicitar`, once the
 * consultation exists and while it is still editable. Without a linked staff record it explains why instead of failing later.
 */
@Composable
internal fun AdmissionIndicationEntry(item: MedicalAppointment, profile: AccessProfile?, enabled: Boolean, model: AdmissionIndicationViewModel = viewModel()) {
    if (profile == null || "admision.solicitar" !in profile.permissions || item.consultationId == null || item.consultationState == "firmada") return
    val context = IndicationContext(item.patientId.takeIf { it.isNotBlank() }, item.patientName, item.consultationId, profile.staffId, profile.name)
    val blocked = AdmissionIndication.contextError(context)
    Text(stringResource(R.string.ind_titulo), style = MaterialTheme.typography.titleSmall)
    if (blocked != null) NoticeBanner(NoticeKind.INFO, blocked)
    else SecondaryButton(stringResource(R.string.ind_abrir), { model.open(context) }, icon = Icons.Default.Hotel, enabled = enabled)
    AdmissionIndicationDialog(model)
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun AdmissionIndicationDialog(model: AdmissionIndicationViewModel) {
    val state by model.state.collectAsStateWithLifecycle()
    val context = state.context ?: return
    if (state.sent) {
        AlertDialog(
            onDismissRequest = model::close,
            shape = MaterialTheme.shapes.large,
            title = { Text(stringResource(R.string.ind_enviada_titulo), style = MaterialTheme.typography.titleLarge) },
            text = { NoticeBanner(NoticeKind.SUCCESS, stringResource(R.string.ind_enviada_detalle, context.patientName)) },
            confirmButton = { TextButton(onClick = model::close) { Text(stringResource(R.string.ind_cerrar), style = MaterialTheme.typography.labelLarge) } },
        )
        return
    }
    val fields = state.fields
    ConfirmDialog(
        title = stringResource(R.string.ind_titulo),
        confirmLabel = stringResource(R.string.ind_enviar),
        onConfirm = model::submit,
        onDismiss = model::close,
        busy = state.busy,
        confirmEnabled = state.contextError == null,
    ) {
        Column(Modifier.heightIn(max = 520.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(Spacing.sm + Spacing.xs)) {
            // Locked context: what the consultation already knows is shown, never asked again.
            LabeledValue(stringResource(R.string.ind_paciente), context.patientName.ifBlank { stringResource(R.string.clin_consulta_sin_nombre) })
            Row(horizontalArrangement = Arrangement.spacedBy(Spacing.lg)) {
                LabeledValue(stringResource(R.string.ind_origen), stringResource(R.string.ind_origen_consulta), Modifier.weight(1f))
                LabeledValue(stringResource(R.string.ind_medico), context.doctorName.ifBlank { stringResource(R.string.ind_medico_yo) }, Modifier.weight(1f))
            }
            (state.error ?: state.contextError)?.let { NoticeBanner(NoticeKind.ERROR, it) }
            val motive = state.draft.motive
            val short = motive.trim().length < AdmissionIntake.MOTIVE_MIN
            FormField(
                stringResource(R.string.ind_motivo), motive, model::motive, singleLine = false, enabled = !state.busy,
                error = fields["motive"],
                hint = AdmissionIndication.motiveCounter(motive) + if (short) " · " + stringResource(R.string.ind_motivo_minimo, AdmissionIntake.MOTIVE_MIN) else " ✓",
            )
            Text(stringResource(R.string.ind_categoria), style = MaterialTheme.typography.labelLarge)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                AdmissionIndication.CATEGORIES.forEach { code ->
                    FilterChip(selected = state.draft.category == code, onClick = { model.category(code) }, enabled = !state.busy, label = { Text(AdmissionIntake.CATEGORY_LABELS[code] ?: code) })
                }
            }
            fields["requestedCategory"]?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
            CheckRow(stringResource(R.string.ind_aislamiento), state.draft.isolation, !state.busy, model::isolation)
            if (state.draft.isolation) FlowRow(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                IsolationType.entries.forEach { type ->
                    FilterChip(selected = state.draft.isolationType == type, onClick = { model.isolationType(if (state.draft.isolationType == type) null else type) }, enabled = !state.busy, label = { Text(type.label) })
                }
            }
            fields["isolationType"]?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
            CheckRow(stringResource(R.string.ind_inestable), state.draft.unstable, !state.busy, model::unstable)
            CheckRow(stringResource(R.string.ind_posquirurgico), state.draft.postSurgical, !state.busy, model::postSurgical)
        }
    }
}

/** Whole row toggles (48 dp target), not only the small box. */
@Composable
private fun CheckRow(label: String, checked: Boolean, enabled: Boolean, onChange: (Boolean) -> Unit) {
    Row(
        Modifier.fillMaxWidth().heightIn(min = 48.dp).toggleable(checked, enabled = enabled, role = Role.Checkbox, onValueChange = onChange),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Checkbox(checked, null, enabled = enabled)
        Text(label, style = MaterialTheme.typography.bodyMedium)
    }
}
