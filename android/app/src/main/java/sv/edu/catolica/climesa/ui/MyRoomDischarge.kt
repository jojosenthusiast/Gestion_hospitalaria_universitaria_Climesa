package sv.edu.catolica.climesa.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import sv.edu.catolica.climesa.R
import sv.edu.catolica.climesa.domain.DischargeSummaryRules
import sv.edu.catolica.climesa.domain.HospitalAdmission

/**
 * D7 «Resumen de tu alta» (iOS `DischargeSummaryCard`): type, diagnoses, indications, pending items with their responsible
 * and follow-up of the patient's own signed discharge. Read-only; no PDF.
 */
@Composable internal fun MyRoomDischargeCard(admission: HospitalAdmission) {
    val discharge = admission.discharge ?: return
    val type = discharge.type ?: return
    SectionCard(stringResource(R.string.pac_alta_titulo), eyebrow = DischargeSummaryRules.typeLabel(type), action = { StatusTag(admission.state) }) {
        Text(DischargeSummaryRules.signedLine(discharge), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        if (admission.state == "egresado") NoticeBanner(NoticeKind.INFO, stringResource(R.string.pac_alta_egresado))
        DischargeBlock(stringResource(R.string.pac_alta_diagnosticos)) {
            val diagnoses = DischargeSummaryRules.diagnoses(discharge)
            if (diagnoses.isEmpty()) Muted(stringResource(R.string.pac_alta_diagnosticos_ninguno))
            else diagnoses.forEach { Text(DischargeSummaryRules.diagnosisLine(it), style = MaterialTheme.typography.bodyMedium) }
        }
        DischargeBlock(stringResource(R.string.pac_alta_indicaciones)) {
            discharge.summary?.takeIf { it.isNotBlank() }?.let { Text(it, style = MaterialTheme.typography.bodyMedium) } ?: Muted(stringResource(R.string.pac_alta_indicaciones_ninguna))
        }
        DischargeBlock(stringResource(R.string.pac_alta_pendientes)) {
            val pending = discharge.pending.orEmpty()
            if (pending.isEmpty()) Muted(stringResource(R.string.pac_alta_pendientes_ninguno))
            else pending.forEach { Text(DischargeSummaryRules.pendingLine(it), style = MaterialTheme.typography.bodyMedium) }
        }
        DischargeBlock(stringResource(R.string.pac_alta_seguimiento)) {
            discharge.followUp?.let { Text(DischargeSummaryRules.followUpLine(it), style = MaterialTheme.typography.bodyMedium) } ?: Muted(stringResource(R.string.pac_alta_seguimiento_ninguno))
        }
    }
}

@Composable private fun DischargeBlock(title: String, content: @Composable () -> Unit) {
    HorizontalDivider()
    Column(verticalArrangement = Arrangement.spacedBy(Spacing.xs)) {
        Text(title, style = MaterialTheme.typography.labelLarge)
        content()
    }
}

@Composable private fun Muted(text: String) = Text(text, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
