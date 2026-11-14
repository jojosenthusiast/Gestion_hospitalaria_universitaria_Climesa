package sv.edu.catolica.climesa.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Link
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import sv.edu.catolica.climesa.R
import sv.edu.catolica.climesa.domain.LinkRequestRow
import sv.edu.catolica.climesa.domain.ReceptionLinking

/** A33 Vinculaciones: explica qué es, lista las solicitudes con la comparación de datos y permite aprobar o rechazar con motivo. */
@Composable
fun ReceptionLinkingScreen(channels: List<String>, canVerify: Boolean, openPatients: () -> Unit, modifier: Modifier = Modifier, model: ReceptionLinkingViewModel = viewModel()) {
    val state by model.state.collectAsStateWithLifecycle()
    var rejecting by rememberSaveable { mutableStateOf<String?>(null) }
    LaunchedEffect(Unit) { model.load(); model.startLive(channels) }
    val target = state.rows.firstOrNull { it.id == rejecting }
    PageList(modifier) {
        item { SectionIntro(stringResource(R.string.rec_vinc_eyebrow), stringResource(R.string.rec_vinc_titulo), "") }
        item { LinkingGuide() }
        state.error?.let { error -> item { ClimesaActionGroup { NoticeBanner(NoticeKind.ERROR, error); SecondaryButton("Reintentar", { model.clearMessages(); model.load() }, icon = Icons.Default.Refresh) } } }
        state.notice?.let { notice -> item { NoticeBanner(NoticeKind.SUCCESS, notice) } }
        when {
            state.loading && state.rows.isEmpty() -> item { LoadingState() }
            state.rows.isEmpty() -> item { EmptyState(stringResource(R.string.rec_vinc_vacio), detail = stringResource(R.string.rec_vinc_vacio_detalle), icon = Icons.Default.Link) }
            else -> {
                item { Text(stringResource(R.string.rec_vinc_resumen, state.rows.size, state.rows.count { it.hasCandidate }), style = MaterialTheme.typography.labelLarge) }
                items(state.rows, key = { it.id }) { row -> LinkCard(row, canVerify, state.busyId == row.id, onApprove = { model.approve(row) }, onReject = { rejecting = row.id }, onSearch = openPatients) }
            }
        }
    }
    if (target != null) RejectDialog(target, state.busyId == target.id, onConfirm = { reason -> model.reject(target, reason); rejecting = null }, onDismiss = { rejecting = null })
}

@Composable
private fun LinkingGuide() {
    SectionCard(stringResource(R.string.rec_vinc_que_es)) {
        Text(stringResource(R.string.rec_vinc_explicacion), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(stringResource(R.string.rec_vinc_paso1), style = MaterialTheme.typography.bodySmall)
            Text(stringResource(R.string.rec_vinc_paso2), style = MaterialTheme.typography.bodySmall)
            Text(stringResource(R.string.rec_vinc_paso3), style = MaterialTheme.typography.bodySmall)
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            StatusPill(stringResource(R.string.rec_vinc_coincide), StatusTone.SUCCESS)
            StatusPill(stringResource(R.string.rec_vinc_revisar), StatusTone.WARNING)
        }
    }
}

@Composable
private fun LinkCard(row: LinkRequestRow, canVerify: Boolean, busy: Boolean, onApprove: () -> Unit, onReject: () -> Unit, onSearch: () -> Unit) {
    SectionCard(row.email) {
        if (row.accountName.isNotBlank()) Text(row.accountName, style = MaterialTheme.typography.bodyMedium)
        Text(stringResource(R.string.rec_vinc_declarado, row.declaredDui, row.declaredBirth), style = MaterialTheme.typography.bodySmall)
        if (row.hasCandidate) Text(stringResource(R.string.rec_vinc_candidato, row.candidateRecord.orEmpty(), row.candidateName.orEmpty()), style = MaterialTheme.typography.bodySmall)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            if (row.hasCandidate) StatusPill(stringResource(R.string.rec_vinc_coincide), StatusTone.SUCCESS) else StatusPill(stringResource(R.string.rec_vinc_revisar), StatusTone.WARNING)
        }
        NoticeBanner(if (row.hasCandidate) NoticeKind.SUCCESS else NoticeKind.INFO, row.guidance)
        if (canVerify) ClimesaActionGroup {
            if (row.canApprove) PrimaryButton(stringResource(R.string.rec_vinc_aprobar), onApprove, icon = Icons.Default.Check, loading = busy)
            else SecondaryButton(stringResource(R.string.rec_vinc_buscar_antes), onSearch, icon = Icons.Default.Search)
            SecondaryButton(stringResource(R.string.rec_vinc_rechazar), onReject, icon = Icons.Default.Close, enabled = !busy)
        }
    }
}

@Composable
private fun RejectDialog(row: LinkRequestRow, busy: Boolean, onConfirm: (String) -> Unit, onDismiss: () -> Unit) {
    var reason by rememberSaveable(row.id) { mutableStateOf("") }
    ConfirmDialog(
        title = stringResource(R.string.rec_vinc_rechazo_titulo), confirmLabel = stringResource(R.string.rec_vinc_rechazar), onConfirm = { onConfirm(reason) }, onDismiss = onDismiss,
        message = stringResource(R.string.rec_vinc_rechazo_mensaje, row.email), destructive = true, busy = busy,
        confirmEnabled = ReceptionLinking.rejectError(reason) == null,
        body = { FormField(stringResource(R.string.rec_vinc_rechazo_motivo), reason, { reason = it.take(500) }, singleLine = false, hint = "Mínimo 10 caracteres.") },
    )
}
