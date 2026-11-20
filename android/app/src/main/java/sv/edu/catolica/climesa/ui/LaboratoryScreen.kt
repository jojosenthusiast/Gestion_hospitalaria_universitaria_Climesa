@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
package sv.edu.catolica.climesa.ui

import android.content.Intent
import android.net.Uri
import androidx.compose.material.icons.automirrored.filled.OpenInNew
import androidx.compose.material.icons.filled.Image
import androidx.compose.material.icons.filled.PictureAsPdf
import androidx.compose.material.icons.filled.UploadFile
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.HorizontalDivider
import androidx.compose.ui.text.style.TextOverflow
import sv.edu.catolica.climesa.domain.LabAttachmentRules
import sv.edu.catolica.climesa.domain.NoticeInboxRules
import android.provider.OpenableColumns
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.ui.Alignment
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.text.input.KeyboardType
import java.security.MessageDigest
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import androidx.compose.runtime.rememberCoroutineScope
import sv.edu.catolica.climesa.domain.LabAttachment
import sv.edu.catolica.climesa.domain.LabExternalAction
import sv.edu.catolica.climesa.domain.LabExternalRules
import sv.edu.catolica.climesa.domain.LabFollowUp
import sv.edu.catolica.climesa.domain.LabFollowUpRules
import sv.edu.catolica.climesa.domain.LabInbox
import sv.edu.catolica.climesa.domain.LabGroup
import sv.edu.catolica.climesa.domain.LabGroups
import androidx.compose.ui.res.stringResource
import sv.edu.catolica.climesa.R
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import sv.edu.catolica.climesa.domain.AccessProfile
import sv.edu.catolica.climesa.domain.LaboratoryLabels
import sv.edu.catolica.climesa.domain.AndroidSection
import sv.edu.catolica.climesa.domain.LabFilter
import sv.edu.catolica.climesa.domain.LabFlow
import sv.edu.catolica.climesa.domain.LabStepStatus
import sv.edu.catolica.climesa.domain.LaboratoryOrder
import sv.edu.catolica.climesa.domain.LabCritical
import sv.edu.catolica.climesa.domain.LabOrderAction
import sv.edu.catolica.climesa.domain.LabOrderRules
import sv.edu.catolica.climesa.domain.LabPatientList
import sv.edu.catolica.climesa.domain.LabStage
import sv.edu.catolica.climesa.domain.LabWorklist
import sv.edu.catolica.climesa.domain.elapsedText

/**
 * Lab orders for the reviewing doctor and the patient. [section] picks the stage filter that opens first (review).
 */
@Composable
fun LaboratoryScreen(
    profile: AccessProfile,
    modifier: Modifier = Modifier,
    ownResults: Boolean = false,
    section: AndroidSection? = null,
    userId: String? = null,
    model: LaboratoryViewModel = viewModel(),
) {
    val state by model.state.collectAsStateWithLifecycle()
    LaunchedEffect(ownResults, userId) { if (ownResults && userId != null) model.markResultsSeen(userId) }
    var filterName by rememberSaveable(section) { mutableStateOf(LabFlow.defaultFilter(section).name) }
    val filter = LabFilter.entries.firstOrNull { it.name == filterName } ?: LabFilter.ALL
    var query by rememberSaveable { mutableStateOf("") }
    var urgentOnly by rememberSaveable { mutableStateOf(false) }
    // S10: the reviewing doctor also gets "Resultados por revisar" (critical values and relevant lab observations).
    val reviewer = !ownResults && "laboratorio.revisar" in profile.permissions
    val inboxOnly = !ownResults && section == AndroidSection.RESULT_REVIEW
    var openGroups by rememberSaveable { mutableStateOf(listOf<String>()) }
    LaunchedEffect(ownResults, reviewer) {
        model.path = if (ownResults) "/me/laboratorio" else "/laboratorio/ordenes"; model.followUpsEnabled = reviewer
        // T07c: whoever loads or reviews results may upload the file of a reference-only attachment (as the web).
        model.canAttach = !ownResults && ("laboratorio.procesar" in profile.permissions || "laboratorio.revisar" in profile.permissions)
        model.load(); if (reviewer) model.loadFollowUps()
    }
    LaunchedEffect(profile.channels) { model.startLive(profile.channels) }
    val retry = { model.clearMessages(); model.load() }
    val listState = androidx.compose.foundation.lazy.rememberLazyListState()
    ScrollToTopOn(state.notice, listState)
    PageList(modifier, listState) {
        state.notice?.let { notice -> item { NoticeBanner(NoticeKind.SUCCESS, notice) } }
        // RN-25 / R3 A-29: critical values stay first in the inbox (with their critical pill); the portal keeps the one
        // persistent notice, so no second red banner here.
        // The inbox card only shows when it has something: an empty "Al día" card above a result still "Por revisar" read as a contradiction.
        if (reviewer && (state.followUps.isNotEmpty() || state.followUpsError != null)) item { FollowUpInbox(state.followUps, state.followUpBusy, state.busyIds, state.followUpsError, model) }
        when {
            state.loading && state.orders.isEmpty() -> item { LoadingState() }
            state.error != null && state.orders.isEmpty() -> item { ErrorState(state.error, retry) }
            // The follow-up inbox above already has something: no "Sin órdenes" under it.
            state.orders.isEmpty() && !(inboxOnly && state.followUps.isNotEmpty()) -> item { EmptyState(stringResource(R.string.clin_lab_sin_ordenes), detail = stringResource(R.string.clin_lab_sin_ordenes_detalle)) }
            else -> {
                if (state.loading) item { RefreshHint() }
                state.error?.let { error -> item { NoticeBanner(NoticeKind.ERROR, error) } }
                // The patient filters by stage too, with the badge each chip filters (no search: the list is short).
                if (ownResults) item { ChipRow(LabFilter.entries.map { Triple(it, it.label, state.orders.count(it::matches)) }, filter, FilterTones::lab) { filterName = it.name } }
                if (!ownResults && !inboxOnly) {
                    item { LiveSearchField(query, { query = it }, stringResource(R.string.lab_buscar)) }
                    item { ChipRow(LabFilter.entries.map { Triple(it, it.label, state.orders.count(it::matches)) }, filter, FilterTones::lab) { filterName = it.name } }
                    // R3 A-49: one toggle instead of a second row of priority chips.
                    item {
                        StatusFilterChip(urgentOnly, { urgentOnly = !urgentOnly }, stringResource(R.string.lab_solo_urgentes) + " (${state.orders.count(LabWorklist::isUrgent)})", ChipTone.Level(Priority.URGENTE), Modifier.heightIn(min = Spacing.touch))
                    }
                }
                // The clock is read when the list is drawn: each realtime event redraws it, no timers.
                val now = System.currentTimeMillis()
                val visible = LabWorklist.sorted(state.orders.filter { filter.matches(it) && (!urgentOnly || LabWorklist.isUrgent(it)) && LabWorklist.matches(it, query) })
                if (visible.isEmpty() && !inboxOnly) item { EmptyState(stringResource(R.string.lab_filtro_vacio), detail = stringResource(R.string.lab_filtro_vacio_detalle)) }
                // R3 A-9: "Resultados por revisar" is an inbox: only the orders this doctor can review, no queue filters.
                else if (inboxOnly) {
                    // An order already in the follow-up inbox is not listed twice; critical first, then urgent and the oldest.
                    val inInbox = state.followUps.map { it.orderId }.toSet()
                    val toReview = LabWorklist.sorted(state.orders.filter { it.allows(LabOrderAction.REVIEW) && it.id !in inInbox }).sortedByDescending(LabWorklist::isCritical)
                    // As on iOS: the doctor's own open orders that the API lets cancel or send/load as external.
                    val inProgress = LabWorklist.sorted(state.orders.filter { !it.allows(LabOrderAction.REVIEW) && (it.allows(LabOrderAction.CANCEL) || it.externalActions.isNotEmpty()) })
                    if (toReview.isEmpty() && state.followUps.isEmpty() && inProgress.isEmpty()) item { EmptyState(stringResource(R.string.lab_pendientes_vacio), icon = Icons.Default.Check) }
                    // One primary per screen: the inbox keeps it when it has a release; otherwise the first card here.
                    val inboxHasPrimary = LabInbox.rows(state.followUps).any { it.canRelease }
                    items(toReview, key = { it.id }) { order -> LaboratoryOrderCard(order, false, order.id in state.busyIds, model, now, primary = !inboxHasPrimary && order.id == toReview.first().id) }
                    if (inProgress.isNotEmpty()) {
                        item(key = "g-en-proceso") { LabGroupHeader(stringResource(R.string.lab_grupo_en_proceso), inProgress.size, null) {} }
                        items(inProgress, key = { it.id }) { order -> LaboratoryOrderCard(order, false, order.id in state.busyIds, model, now, primary = false) }
                    }
                }
                else {
                    // S10: grouped by what comes next; closed groups start folded unless the person filters or searches.
                    // The patient keeps released results open (they are what they came for) and folds only cancelled ones.
                    val foldable = filter == LabFilter.ALL && query.isBlank()
                    LabGroups.group(visible).forEach { (group, orders) ->
                        val folded = if (ownResults) group == LabGroup.CANCELLED else group.folded
                        val open = !folded || !foldable || group.name in openGroups
                        item(key = "g-${group.name}") {
                            LabGroupHeader(group.label, orders.size, if (folded && foldable) open else null) {
                                openGroups = if (group.name in openGroups) openGroups - group.name else openGroups + group.name
                            }
                        }
                        if (open) items(orders, key = { it.id }) { order -> LaboratoryOrderCard(order, ownResults, order.id in state.busyIds, model, now) }
                    }
                }
            }
        }
    }
    state.cancelOrderId?.let { id -> CancelOrderDialog(state, state.orders.firstOrNull { it.id == id }, model) }
    if (state.reviewOrderId != null) model.reviewTarget()?.let { ReviewOrderDialog(it, state, model) }
    state.external?.let { draft -> SendExternalDialog(draft, state.orders.firstOrNull { it.id == draft.orderId }, model) }
    state.externalLoad?.let { draft -> ExternalResultDialog(draft, state.orders.firstOrNull { it.id == draft.orderId }, model) }
    state.uploadFailure?.let { message -> UploadFailureDialog(message, model::dismissUploadFailure) }
    OpenSignedLink(state.openUrl, model)
}

/** T07c: the values are already saved; only the file is missing, and it can be uploaded later from the order. */
@Composable
private fun UploadFailureDialog(message: String, onClose: () -> Unit) {
    AlertDialog(
        onDismissRequest = onClose,
        title = { Text(stringResource(R.string.lab_cargar_externo)) },
        text = { Column(verticalArrangement = Arrangement.spacedBy(Spacing.sm)) { NoticeBanner(NoticeKind.ERROR, message); Text(stringResource(R.string.lab_subida_fallida_ayuda)) } },
        confirmButton = { TextButton(onClick = onClose) { Text(stringResource(R.string.lab_entendido)) } },
    )
}

/** Hands a fresh signed http(s) link to the system once (ACTION_VIEW) and forgets it; the link is never stored or shown. */
@Composable
private fun OpenSignedLink(url: String?, model: LaboratoryViewModel) {
    val context = LocalContext.current
    LaunchedEffect(url) {
        val link = url ?: return@LaunchedEffect
        val opened = runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(link)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }.isSuccess
        if (opened) model.urlOpened() else model.openFailed()
    }
}

/** Group title with its count; [open] is null when the group cannot fold (it shows its orders). */
@Composable
private fun LabGroupHeader(label: String, count: Int, open: Boolean?, onToggle: () -> Unit) {
    Row(Modifier.fillMaxWidth().padding(top = Spacing.sm), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
        Text(label, Modifier.semantics { heading() }, style = MaterialTheme.typography.titleSmall)
        Text("$count", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
        if (open != null) {
            Box(Modifier.weight(1f))
            TextButton(onClick = onToggle) { Text(stringResource(if (open) R.string.lab_grupo_ocultar else R.string.lab_grupo_mostrar, label.lowercase())) }
        }
    }
}

/**
 * S10 / C1: "Resultados por revisar". One row per order, critical first, with its key values inline. "Revisar y liberar" opens
 * the confirmation with the summary; an older API without the order version keeps the per-item "Marcar revisado".
 */
@Composable
private fun FollowUpInbox(items: List<LabFollowUp>, busy: String?, busyOrders: Set<String>, error: String?, model: LaboratoryViewModel) {
    val rows = LabInbox.rows(items)
    SectionCard(title = stringResource(R.string.lab_pendientes_titulo), eyebrow = stringResource(R.string.lab_pendientes_cuenta, rows.size)) {
        error?.let { ClimesaActionGroup { NoticeBanner(NoticeKind.ERROR, it); SecondaryButton(stringResource(R.string.ui_reintentar), model::loadFollowUps, icon = Icons.Default.Refresh) } }
        if (rows.isEmpty() && error == null) Text(stringResource(R.string.lab_pendientes_vacio), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        // One primary per screen: only the first row that can be released gets the filled button.
        val first = rows.firstOrNull { it.canRelease }?.orderId
        rows.forEach { row ->
            Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(Spacing.xs)) {
                // D69: the state pill goes above the name, so the full name keeps the whole width and is never cut.
                if (row.critical) CriticalPill(stringResource(R.string.lab_critico)) else FamilyBadge(stringResource(R.string.lab_pendiente_observacion), StatusFamily.ESPERA)
                Text(row.patientName, style = MaterialTheme.typography.titleSmall)
                row.record?.let { Text(stringResource(R.string.lab_expediente, it), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                row.keyValues.take(3).forEach { Text(it, style = MaterialTheme.typography.bodyMedium) }
                if (row.keyValues.isEmpty()) row.details.forEach { Text(it, style = MaterialTheme.typography.bodyMedium) }
                val rowBusy = row.orderId in busyOrders
                when {
                    row.canRelease && row.orderId == first -> PrimaryButton(stringResource(R.string.u5_lab_revisar_liberar), { model.openReview(row.orderId) }, icon = Icons.Default.Check, enabled = !rowBusy, loading = rowBusy)
                    row.canRelease -> SecondaryButton(stringResource(R.string.u5_lab_revisar_liberar), { model.openReview(row.orderId) }, icon = Icons.Default.Check, enabled = !rowBusy)
                    else -> items.filter { it.orderId == row.orderId }.forEach { item -> RowAction(stringResource(R.string.lab_pendiente_revisado), { model.reviewFollowUp(item) }, enabled = busy == null, loading = busy == item.id) }
                }
            }
        }
    }
}

@Composable
private fun SendExternalDialog(draft: ExternalDraft, order: LaboratoryOrder?, model: LaboratoryViewModel) {
    LaunchedEffect(order?.id, order?.allowsExternal(LabExternalAction.SEND)) { if (order == null || !order.allowsExternal(LabExternalAction.SEND)) model.dismissExternal() }
    if (order == null) return
    ConfirmDialog(
        title = stringResource(R.string.lab_externo_titulo),
        message = stringResource(R.string.lab_externo_efecto, order.patientName),
        confirmLabel = stringResource(R.string.lab_externo_confirmar),
        onConfirm = { model.confirmExternal(order) },
        onDismiss = model::dismissExternal,
        dismissLabel = stringResource(R.string.lab_cancelar_volver),
        busy = draft.busy,
        body = {
            draft.error?.let { NoticeBanner(NoticeKind.ERROR, it) }
            FormField(stringResource(R.string.lab_externo_lugar), draft.place, { model.editExternal(place = it) })
            FormField(stringResource(R.string.lab_externo_instrucciones), draft.instructions, { model.editExternal(instructions = it) }, singleLine = false)
        },
    )
}

/**
 * External report: a PDF or photo picked on the phone plus one key value per exam. The values go first with the file reference,
 * then the file itself uploads to the API, which keeps it in the private clinical storage (T07c, as the web does).
 */
@Composable
private fun ExternalResultDialog(draft: ExternalLoadDraft, order: LaboratoryOrder?, model: LaboratoryViewModel) {
    LaunchedEffect(order?.id, order?.allowsExternal(LabExternalAction.LOAD_RESULT)) { if (order == null || !order.allowsExternal(LabExternalAction.LOAD_RESULT)) model.dismissExternalLoad() }
    if (order == null) return
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri: Uri? ->
        if (uri != null) scope.launch { model.setAttachment(withContext(Dispatchers.IO) { describe(context, uri) }) }
    }
    ConfirmDialog(
        title = stringResource(R.string.lab_cargar_externo),
        message = stringResource(R.string.lab_cargar_externo_efecto),
        confirmLabel = stringResource(R.string.lab_cargar_externo_guardar),
        onConfirm = { model.confirmExternalLoad(order) },
        onDismiss = model::dismissExternalLoad,
        dismissLabel = stringResource(R.string.lab_cancelar_volver),
        busy = draft.busy,
        body = {
            draft.error?.let { NoticeBanner(NoticeKind.ERROR, it) }
            SecondaryButton(stringResource(if (draft.attachment == null) R.string.lab_cargar_externo_elegir else R.string.lab_cargar_externo_cambiar), { picker.launch(LabExternalRules.ATTACHMENT_TYPES.toTypedArray()) }, enabled = !draft.busy)
            draft.attachment?.let { Text("${it.fileName} · ${LabAttachmentRules.sizeText(it.sizeBytes)}", style = MaterialTheme.typography.bodySmall) }
            order.items.forEach { item ->
                FormField(if (item.numeric && item.unit != null) "${item.name} (${item.unit})" else item.name, draft.values[item.id].orEmpty(), { model.setExternalValue(item.id, it) },
                    keyboardOptions = if (item.numeric) KeyboardOptions(keyboardType = KeyboardType.Decimal) else KeyboardOptions.Default)
            }
            FormField(stringResource(R.string.lab_cargar_externo_nota), draft.note, model::setExternalNote, singleLine = false)
            Text(stringResource(R.string.lab_cargar_externo_almacen), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        },
    )
}

/** Name, type, size and SHA-256 of the picked document; its bytes are read again when the file is uploaded (T07c). */
private fun describe(context: android.content.Context, uri: Uri): LabAttachment? = runCatching {
    val resolver = context.contentResolver
    var name = "informe"; var size = -1L
    resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null)?.use { cursor ->
        if (cursor.moveToFirst()) {
            cursor.getString(0)?.let { name = it }
            if (!cursor.isNull(1)) size = cursor.getLong(1)
        }
    }
    val type = resolver.getType(uri) ?: "application/octet-stream"
    if (size > LabExternalRules.MAX_ATTACHMENT_BYTES) return@runCatching LabAttachment(name, type, size, uri = uri.toString())
    val digest = MessageDigest.getInstance("SHA-256")
    var read = 0L
    resolver.openInputStream(uri)?.use { input ->
        val buffer = ByteArray(64 * 1024)
        while (true) { val n = input.read(buffer); if (n < 0) break; digest.update(buffer, 0, n); read += n }
    }
    LabAttachment(name, type, if (size >= 0) size else read, digest.digest().joinToString("") { "%02x".format(it) }, uri.toString())
}.getOrNull()

/** Cancel with a reason (D-13: at least 10 characters). The reason and the open dialog live in the ViewModel, so a rotation keeps them. */
/** R3 A-16: releasing a result to the patient is confirmed with what they will see; it closes only once the API accepts it. */
@Composable
private fun ReviewOrderDialog(target: LabReviewTarget, state: LaboratoryState, model: LaboratoryViewModel) {
    val busy = target.orderId in state.busyIds
    ConfirmDialog(
        title = stringResource(R.string.lab_revisar_titulo),
        message = stringResource(R.string.lab_revisar_efecto, target.patientName),
        confirmLabel = stringResource(R.string.lab_revisar_confirmar),
        onConfirm = model::release,
        onDismiss = model::dismissReview,
        busy = busy,
        // D71: with a critical value the release waits for the explicit tick below.
        confirmEnabled = target.canRelease(state.reviewCriticalAck),
        error = state.error,
        onDone = model::dismissReview,
        body = {
            Column(verticalArrangement = Arrangement.spacedBy(Spacing.xs)) {
                target.lines.forEach { line ->
                    val critical = line in target.criticalLines
                    Text(line, style = MaterialTheme.typography.bodyMedium, color = if (critical) MaterialTheme.colorScheme.error else androidx.compose.ui.graphics.Color.Unspecified, fontWeight = if (critical) androidx.compose.ui.text.font.FontWeight.SemiBold else null)
                }
                if (target.critical) {
                    Text(stringResource(R.string.lab_revisar_critico), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
                    CheckRow(stringResource(R.string.lab_revisar_critico_check), state.reviewCriticalAck, !busy, model::setReviewCriticalAck)
                }
                // C1: on release the API proposes the follow-up appointment unless the doctor turns it off here.
                CheckRow(stringResource(R.string.u5_lab_proponer_seguimiento), state.reviewFollowUp, !busy, model::setReviewFollowUp)
                FormField(stringResource(R.string.u5_lab_nota_paciente), state.reviewNote, model::setReviewNote, singleLine = false, hint = stringResource(R.string.u5_lab_nota_ayuda))
            }
        },
    )
}

@Composable
private fun CancelOrderDialog(state: LaboratoryState, order: LaboratoryOrder?, model: LaboratoryViewModel) {
    // The order left the list or no longer allows cancelling (realtime update): the dialog closes on its own.
    LaunchedEffect(order?.id, order?.allows(LabOrderAction.CANCEL)) { if (order == null || !order.allows(LabOrderAction.CANCEL)) model.dismissCancel() }
    if (order == null) return
    ConfirmDialog(
        title = stringResource(R.string.lab_cancelar_titulo),
        message = stringResource(R.string.lab_cancelar_efecto, order.patientName),
        confirmLabel = stringResource(R.string.lab_cancelar_confirmar),
        onConfirm = { model.confirmCancel(order) },
        onDismiss = model::dismissCancel,
        dismissLabel = stringResource(R.string.lab_cancelar_volver),
        destructive = true,
        busy = state.cancelling,
        body = {
            state.cancelError?.let { NoticeBanner(NoticeKind.ERROR, it) }
            FormField(stringResource(R.string.lab_cancelar_motivo, LabOrderRules.MIN_CANCEL_REASON), state.cancelReason, model::setCancelReason)
        },
    )
}

@Composable
private fun LaboratoryOrderCard(order: LaboratoryOrder, ownView: Boolean, busy: Boolean, model: LaboratoryViewModel, now: Long, primary: Boolean = true) {
    // Buttons follow `allowedActions` from the API for this reader, never the role or the state.
    val canReview = !ownView && order.allows(LabOrderAction.REVIEW)
    val canCancel = !ownView && order.allows(LabOrderAction.CANCEL)
    val inReview = order.state == "completado" && !order.reviewed
    val canSendExternal = !ownView && order.allowsExternal(LabExternalAction.SEND)
    val canLoadExternal = !ownView && order.allowsExternal(LabExternalAction.LOAD_RESULT)
    // Progressive detail: the patient and orders with something to do open expanded; the rest show the summary only.
    var expanded by rememberSaveable(order.id) { mutableStateOf(ownView || canReview || canLoadExternal || canSendExternal) }
    SectionCard(
        title = order.patientName,
        action = { LabStagePill(LabWorklist.stage(order)) },
    ) {
        // R3 A-33: routine is the default and gets no label; an urgent order says so once, with the shared PriorityBadge.
        if (!ownView) LabWorkSummary(order, now)
        else {
            Row(horizontalArrangement = Arrangement.spacedBy(Spacing.sm), verticalAlignment = Alignment.CenterVertically) {
                LabPatientList.shortDate(order.createdAtMillis).takeIf(String::isNotEmpty)?.let { Text(it, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                if (LabWorklist.isUrgent(order)) PriorityBadge(Priority.URGENTE)
            }
        }
        if (order.state == "cancelado") order.cancellationReason?.let { Text(stringResource(R.string.lab_motivo_cancelacion, it), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        if (ownView && order.reviewed) order.patientNote?.let { Text(stringResource(R.string.lab_nota_medico, it), style = MaterialTheme.typography.bodyMedium) }
        if (order.external) ExternalNote(order)
        if (!expanded) {
            Text(LabFlow.nextStep(order, ownView), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            TextButton(onClick = { expanded = true }) { Text(stringResource(R.string.lab_ver_detalle, order.items.size)) }
            return@SectionCard
        }
        LabStepper(order, ownView)
        order.items.forEach { item ->
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Spacing.sm), verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                Text("${item.code} · ${item.name}", Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
                val result = item.result
                if (result != null) LabMarkTag(result.mark, LaboratoryLabels.valueAndMark(result, item.unit))
                else Text(if (inReview) stringResource(R.string.lab_valor_en_revision) else stringResource(R.string.clin_lab_pendiente), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            item.result?.let { result -> LabFollowUpRules.labNote(result, ownView)?.let { ObservationLine(it, result.relevant) } }
            // C-3: the doctor reviews against the range valid for this patient (never sent to the patient).
            if (!ownView) LaboratoryLabels.rangeText(item.range)?.let { Text(stringResource(R.string.lab_referencia, it), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
            // D1: once the doctor released the result, the patient sees its range (without critical limits) and whether it fell outside.
            if (ownView && order.reviewed) item.result?.let { result ->
                LaboratoryLabels.patientRangeText(item.range)?.let { range ->
                    Row(horizontalArrangement = Arrangement.spacedBy(Spacing.sm), verticalAlignment = Alignment.CenterVertically) {
                        Text(stringResource(R.string.lab_referencia, range), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        if (LaboratoryLabels.outOfRange(result.mark)) LabMarkTag(result.mark, stringResource(R.string.lab_fuera_de_rango))
                    }
                }
            }
        }
        // T07c: the report file of a completed external order. Never in the patient's own view.
        if (!ownView && order.external && order.state == "completado") ExternalReport(order, model)
        if (canLoadExternal && primary) PrimaryButton(stringResource(R.string.lab_cargar_externo), { model.openExternalLoad(order.id) }, enabled = !busy)
        else if (canLoadExternal) SecondaryButton(stringResource(R.string.lab_cargar_externo), { model.openExternalLoad(order.id) }, enabled = !busy)
        if (canReview && primary) PrimaryButton(stringResource(R.string.lab_revisar), { model.openReview(order.id) }, enabled = !busy, loading = busy)
        else if (canReview) SecondaryButton(stringResource(R.string.lab_revisar), { model.openReview(order.id) }, enabled = !busy)
        if (canSendExternal) SecondaryButton(stringResource(R.string.lab_externo_titulo), { model.openExternal(order.id) }, enabled = !busy)
        if (canCancel) SecondaryButton(stringResource(R.string.lab_cancelar_orden), { model.openCancel(order.id) }, enabled = !busy)
        if (!ownView && !(canReview || canLoadExternal || canSendExternal)) TextButton(onClick = { expanded = false }) { Text(stringResource(R.string.lab_ocultar_detalle)) }
    }
}

/**
 * T07c · "Informe externo" (web `ExternalReport`): each file with its kind, size, date and who loaded it. A stored file opens
 * through a fresh signed link on every tap; a reference-only file says so, and whoever may load results can upload it here.
 */
@Composable
private fun ExternalReport(order: LaboratoryOrder, model: LaboratoryViewModel) {
    val state by model.state.collectAsStateWithLifecycle()
    LaunchedEffect(order.id, order.version) { model.loadAttachments(order.id, order.version) }
    val report = state.attachments[order.id]
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var target by rememberSaveable(order.id) { mutableStateOf<String?>(null) }
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri: Uri? ->
        val id = target
        if (uri != null && id != null) scope.launch { model.uploadAttachment(order.id, order.version, id, withContext(Dispatchers.IO) { describe(context, uri) }) }
    }
    val canAttach = model.canAttach
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
        HorizontalDivider(color = MaterialTheme.climesa.line)
        Text(stringResource(R.string.lab_informe_externo), Modifier.semantics { heading() }, style = MaterialTheme.typography.titleSmall)
        when {
            report == null || (report.loading && report.files.isEmpty()) -> Text(stringResource(R.string.lab_adjunto_cargando), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            report.files.isEmpty() && report.error == null -> Text(stringResource(R.string.lab_adjunto_sin), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        report?.files?.forEach { file ->
            val busy = state.attachmentBusy == file.id
            Column(verticalArrangement = Arrangement.spacedBy(Spacing.xs)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                    Icon(if (file.mimeType == "application/pdf") Icons.Default.PictureAsPdf else Icons.Default.Image, null, Modifier.size(20.dp), tint = MaterialTheme.climesa.primaryText)
                    Text(file.fileName, Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold, maxLines = 2, overflow = TextOverflow.Ellipsis)
                }
                Text(
                    listOfNotNull(LabAttachmentRules.kindLabel(file.mimeType), LabAttachmentRules.sizeText(file.sizeBytes), NoticeInboxRules.dateText(file.uploadedAt).takeIf { it.isNotBlank() }, file.uploadedByName).joinToString(" · "),
                    style = MaterialTheme.typography.labelSmall.copy(fontFeatureSettings = "tnum"), color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                file.note?.let { Text(it, style = MaterialTheme.typography.bodySmall) }
                if (file.stored) {
                    val description = stringResource(R.string.lab_adjunto_abrir_desc, file.fileName)
                    SecondaryButton(stringResource(R.string.lab_adjunto_abrir), { model.openAttachment(order.id, file.id) }, Modifier.semantics { contentDescription = description }, icon = Icons.AutoMirrored.Filled.OpenInNew, enabled = state.attachmentBusy == null, loading = busy)
                } else {
                    Text(stringResource(R.string.lab_adjunto_solo_referencia), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    if (canAttach) SecondaryButton(stringResource(R.string.lab_adjunto_subir), { target = file.id; picker.launch(LabExternalRules.ATTACHMENT_TYPES.toTypedArray()) }, icon = Icons.Default.UploadFile, enabled = state.attachmentBusy == null, loading = busy)
                }
            }
        }
        report?.error?.let { error ->
            NoticeBanner(NoticeKind.ERROR, error)
            if (report.files.isEmpty()) TextButton(onClick = { model.loadAttachments(order.id, order.version, force = true) }) { Text(stringResource(R.string.lab_adjunto_reintentar)) }
        }
    }
}

/** Where the exam is done and what the patient was told; the patient reads exactly this text. */
@Composable
private fun ExternalNote(order: LaboratoryOrder) {
    Column(verticalArrangement = Arrangement.spacedBy(Spacing.xs)) {
        Text(stringResource(R.string.lab_externo_lugar_valor, order.externalPlace ?: stringResource(R.string.lab_externo_sin_lugar)), style = MaterialTheme.typography.labelLarge)
        order.externalInstructions?.let { Text(it, style = MaterialTheme.typography.bodyMedium) }
    }
}

@Composable
private fun ObservationLine(note: String, relevant: Boolean) {
    Text(
        stringResource(if (relevant) R.string.lab_observacion_relevante else R.string.lab_observacion, note),
        style = MaterialTheme.typography.bodySmall,
        fontWeight = if (relevant) FontWeight.Bold else FontWeight.Normal,
        color = if (relevant) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant,
    )
}

/**
 * Journey of the order: Solicitada, Muestra, En Proceso, Completada, Revisada, Visible al paciente. Done steps are green with a
 * check, the current one is blue with a ring, pending ones are empty; the caption and the next hand-off say it in words too.
 */
@Composable
private fun LabStepper(order: LaboratoryOrder, ownView: Boolean) {
    val steps = LabFlow.steps(order)
    if (steps.isEmpty()) {
        Text(LabFlow.nextStep(order, ownView), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        return
    }
    val colors = MaterialTheme.climesa
    val current = steps.indexOfFirst { it.status == LabStepStatus.CURRENT }
    val summary = steps.joinToString(", ") { "${it.label}: " + when (it.status) { LabStepStatus.DONE -> "hecho"; LabStepStatus.CURRENT -> "ahora"; LabStepStatus.PENDING -> "pendiente" } }
    Column(Modifier.fillMaxWidth().semantics { contentDescription = summary }, verticalArrangement = Arrangement.spacedBy(Spacing.xs + 2.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            steps.forEachIndexed { index, step ->
                if (index > 0) Box(Modifier.weight(1f).height(2.dp).background(if (steps[index - 1].status == LabStepStatus.DONE) colors.success else colors.line))
                val fill = when (step.status) { LabStepStatus.DONE -> colors.success; LabStepStatus.CURRENT -> colors.processSoft; LabStepStatus.PENDING -> MaterialTheme.colorScheme.surface }
                val ring = when (step.status) { LabStepStatus.DONE -> colors.success; LabStepStatus.CURRENT -> colors.process; LabStepStatus.PENDING -> colors.line }
                Box(Modifier.size(22.dp).background(fill, CircleShape).border(2.dp, ring, CircleShape), contentAlignment = Alignment.Center) {
                    if (step.status == LabStepStatus.DONE) Icon(Icons.Default.Check, null, Modifier.size(14.dp), tint = MaterialTheme.colorScheme.surface)
                    if (step.status == LabStepStatus.CURRENT) Box(Modifier.size(8.dp).background(colors.process, CircleShape))
                }
            }
        }
        Text(
            if (current >= 0) stringResource(R.string.lab_paso_actual, current + 1, steps.size, LabFlow.currentLabel(current)) else stringResource(R.string.lab_paso_completo),
            style = MaterialTheme.typography.labelLarge,
        )
        Text(LabFlow.nextStep(order, ownView), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

/** One family per stage, the same table as the web `STAGE_STATUS`: pending and to review wait, in process is called, released is done. */
@Composable
private fun LabStagePill(stage: LabStage) = FamilyBadge(stage.label, labStageFamily(stage))

internal fun labStageFamily(stage: LabStage): StatusFamily = when (stage) {
    LabStage.PENDING, LabStage.TO_REVIEW -> StatusFamily.ESPERA
    LabStage.IN_PROCESS -> StatusFamily.ATENCION
    LabStage.RELEASED -> StatusFamily.LISTO
    LabStage.CANCELLED -> StatusFamily.CERRADO
}

/** Identity (record, age, sex), ordering doctor, elapsed time with its goal colour and the critical-value flag. */
@Composable
private fun LabWorkSummary(order: LaboratoryOrder, now: Long) {
    Column(verticalArrangement = Arrangement.spacedBy(Spacing.xs)) {
        Text(LabWorklist.identityLine(order).ifBlank { stringResource(R.string.lab_sin_datos_expediente) }, style = MaterialTheme.typography.bodyMedium)
        order.doctorName?.let { Text(stringResource(R.string.lab_pidio, it), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        Row(horizontalArrangement = Arrangement.spacedBy(Spacing.sm), verticalAlignment = Alignment.CenterVertically) {
            // S7: urgent is amber; red is only for critical values.
            if (LabWorklist.isUrgent(order)) PriorityBadge(Priority.URGENTE)
            LabWorklist.elapsedMinutes(order, now)?.let { minutes ->
                Text(stringResource(R.string.lab_espera, elapsedText(minutes)), style = MaterialTheme.typography.labelLarge, color = slaColor(LabWorklist.sla(order, now)))
            }
            if (LabWorklist.isCritical(order)) CriticalPill(stringResource(R.string.lab_critico))
        }
    }
}
