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
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import sv.edu.catolica.climesa.R
import sv.edu.catolica.climesa.domain.LinkRequestRow
import sv.edu.catolica.climesa.domain.ReceptionLinking

/** A33 Vinculaciones: explica qué es, lista las solicitudes con la comparación de datos y permite aprobar o rechazar con motivo. */
@Composable
fun ReceptionLinkingScreen(channels: List<String>, canVerify: Boolean, openPatients: (LinkRequestRow) -> Unit, modifier: Modifier = Modifier, model: ReceptionLinkingViewModel = viewModel()) {
    val state by model.state.collectAsStateWithLifecycle()
    var rejecting by rememberSaveable { mutableStateOf<String?>(null) }
    // R7 U1 (G2), like the web: approving gives the account the whole record, so it confirms first, naming the record.
    var approving by rememberSaveable { mutableStateOf<String?>(null) }
    val approveTarget = state.rows.firstOrNull { it.id == approving && it.canApprove }
    val approveSent = remember { mutableStateOf(false) }
    CloseWhenDone(state.busyId != null, approveSent, state.error) { approving = null }
    LaunchedEffect(Unit) { model.load(); model.startLive(channels) }
    val target = state.rows.firstOrNull { it.id == rejecting }
    val sent = remember { mutableStateOf(false) }
    // Sweep: a failed reject keeps its dialog (and the typed reason) open, with the error.
    CloseWhenDone(state.busyId != null, sent, state.error) { rejecting = null }
    PageList(modifier) {
        item { LinkingGuide() }
        state.error?.let { error -> item { ClimesaActionGroup { NoticeBanner(NoticeKind.ERROR, error); SecondaryButton(stringResource(R.string.ui_reintentar), { model.clearMessages(); model.load() }, icon = Icons.Default.Refresh) } } }
        state.notice?.let { notice -> item { NoticeBanner(NoticeKind.SUCCESS, notice) } }
        when {
            state.loading && state.rows.isEmpty() -> item { LoadingState() }
            state.rows.isEmpty() -> item { EmptyState(stringResource(R.string.rec_vinc_vacio), detail = stringResource(R.string.rec_vinc_vacio_detalle), icon = Icons.Default.Link) }
            else -> {
                // Web wording: "N solicitudes esperan tu revisión · M con expediente que coincide · K por revisar a mano".
                val matching = state.rows.count { it.hasCandidate }
                item { Text(stringResource(R.string.rec_vinc_resumen, pluralStringResource(R.plurals.rec_vinc_esperan, state.rows.size, state.rows.size), matching, state.rows.size - matching), style = MaterialTheme.typography.labelLarge) }
                // One primary per screen: only the first request that can be approved gets the filled "Aprobar".
                val first = state.rows.firstOrNull { it.canApprove }?.id
                items(state.rows, key = { it.id }) { row -> LinkCard(row, canVerify, row.id == first, state.busyId == row.id, state.busyId != null, onApprove = { model.clearMessages(); approving = row.id }, onReject = { rejecting = row.id }, onSearch = { openPatients(row) }) }
            }
        }
    }
    if (approveTarget != null) ApproveDialog(approveTarget, state.busyId == approveTarget.id, state.error, onConfirm = { approveSent.value = true; model.approve(approveTarget) }, onDismiss = { approving = null })
    if (target != null) RejectDialog(target, state.busyId == target.id, state.error, onConfirm = { reason -> sent.value = true; model.reject(target, reason) }, onDismiss = { rejecting = null })
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
            StatusTag(LinkCheck.MATCH, label = stringResource(R.string.rec_vinc_coincide))
            StatusTag(LinkCheck.REVIEW, label = stringResource(R.string.rec_vinc_revisar))
        }
    }
}

@Composable
private fun LinkCard(row: LinkRequestRow, canVerify: Boolean, primary: Boolean, busy: Boolean, anyBusy: Boolean, onApprove: () -> Unit, onReject: () -> Unit, onSearch: () -> Unit) {
    SectionCard(row.email) {
        // Field by field, like the web: what the account declared, what the record says (the exact candidate, else the closest,
        // which only helps compare and is never approvable) and a ✓/✗ tag per field.
        row.fields.forEach { field -> LinkFieldRow(field) }
        NoticeBanner(if (row.hasCandidate) NoticeKind.SUCCESS else NoticeKind.INFO, row.guidance)
        if (canVerify) ClimesaActionGroup {
            if (row.canApprove && primary) PrimaryButton(stringResource(R.string.rec_vinc_aprobar), onApprove, icon = Icons.Default.Check, enabled = !anyBusy, loading = busy)
            else if (row.canApprove) SecondaryButton(stringResource(R.string.rec_vinc_aprobar), onApprove, icon = Icons.Default.Check, enabled = !anyBusy, loading = busy)
            else SecondaryButton(stringResource(if (row.candidates > 1) R.string.rec_vinc_buscar_duplicado else R.string.rec_vinc_buscar_antes), onSearch, icon = Icons.Default.Search)
            // Rejecting is secondary and always asks for a reason in a confirmation (RejectDialog).
            SecondaryButton(stringResource(R.string.rec_vinc_rechazar), onReject, icon = Icons.Default.Close, enabled = !anyBusy)
        }
    }
}

@Composable
private fun LinkFieldRow(field: sv.edu.catolica.climesa.domain.LinkField) {
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
            Text(field.label, Modifier.weight(1f), style = MaterialTheme.typography.labelLarge)
            StatusTag(if (field.matches) LinkCheck.MATCH else LinkCheck.REVIEW, label = (if (field.matches) "✓ " else "✗ ") + stringResource(if (field.matches) R.string.rec_vinc_coincide else R.string.rec_vinc_revisar))
        }
        Text(stringResource(R.string.rec_vinc_dio, field.declared), style = MaterialTheme.typography.bodySmall)
        Text(stringResource(R.string.rec_vinc_expediente, field.record), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun ApproveDialog(row: LinkRequestRow, busy: Boolean, error: String?, onConfirm: () -> Unit, onDismiss: () -> Unit) {
    ConfirmDialog(
        title = stringResource(R.string.rec_vinc_aprobar_titulo), confirmLabel = stringResource(R.string.rec_vinc_aprobar_confirmar), onConfirm = onConfirm, onDismiss = onDismiss,
        message = stringResource(R.string.rec_vinc_aprobar_mensaje, row.email, row.candidateRecord.orEmpty(), row.candidateName ?: row.accountName), busy = busy, error = error,
        body = {
            if (row.mismatched.isNotEmpty()) NoticeBanner(NoticeKind.ERROR, stringResource(R.string.rec_vinc_no_coincide, row.mismatched.joinToString(", ")))
            Text(stringResource(R.string.rec_vinc_aprobar_verifica), style = MaterialTheme.typography.bodySmall)
        },
    )
}

@Composable
private fun RejectDialog(row: LinkRequestRow, busy: Boolean, error: String?, onConfirm: (String) -> Unit, onDismiss: () -> Unit) {
    var reason by rememberSaveable(row.id) { mutableStateOf("") }
    ConfirmDialog(
        title = stringResource(R.string.rec_vinc_rechazo_titulo), confirmLabel = stringResource(R.string.rec_vinc_rechazar), onConfirm = { onConfirm(reason) }, onDismiss = onDismiss,
        message = stringResource(R.string.rec_vinc_rechazo_mensaje, row.email), destructive = true, busy = busy, error = error,
        confirmEnabled = ReceptionLinking.rejectError(reason) == null,
        body = { FormField(stringResource(R.string.rec_vinc_rechazo_motivo), reason, { reason = it.take(500) }, singleLine = false, hint = stringResource(R.string.ui_minimo_10)) },
    )
}
