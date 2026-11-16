@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
package sv.edu.catolica.climesa.ui

import android.net.Uri
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
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.ui.Alignment
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Warning
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
    model: LaboratoryViewModel = viewModel(),
) {
    val state by model.state.collectAsStateWithLifecycle()
    var filterName by rememberSaveable(section) { mutableStateOf(LabFlow.defaultFilter(section).name) }
    val filter = LabFilter.entries.firstOrNull { it.name == filterName } ?: LabFilter.ALL
    var query by rememberSaveable { mutableStateOf("") }
    var urgentOnly by rememberSaveable { mutableStateOf(false) }
    // S10: the reviewing doctor also gets "Resultados por revisar" (critical values and relevant lab observations).
    val reviewer = !ownResults && "laboratorio.revisar" in profile.permissions
    var openGroups by rememberSaveable { mutableStateOf(listOf<String>()) }
    LaunchedEffect(ownResults, reviewer) {
        model.path = if (ownResults) "/me/laboratorio" else "/laboratorio/ordenes"; model.followUpsEnabled = reviewer
        model.load(); if (reviewer) model.loadFollowUps()
    }
    LaunchedEffect(profile.channels) { model.startLive(profile.channels) }
    val retry = { model.clearMessages(); model.load() }
    PageList(modifier) {
        item { SectionIntro("Atención / Diagnóstico", "Laboratorio", stringResource(if (ownResults) R.string.lab_ayuda_paciente else R.string.lab_ayuda)) }
        state.notice?.let { notice -> item { NoticeBanner(NoticeKind.SUCCESS, notice) } }
        // RN-25: critical values waiting for this doctor's review stay visible at the top of the list.
        val critical = if (ownResults) 0 else LabCritical.pendingReview(state.orders)
        if (critical > 0) item { NoticeBanner(NoticeKind.ERROR, stringResource(R.string.lab_criticos_por_revisar, critical)) }
        if (reviewer) item { FollowUpInbox(state.followUps, state.followUpBusy, model) }
        when {
            state.loading && state.orders.isEmpty() -> item { LoadingState() }
            state.error != null && state.orders.isEmpty() -> item { ErrorState(state.error, retry) }
            state.orders.isEmpty() -> item { EmptyState(stringResource(R.string.clin_lab_sin_ordenes), detail = stringResource(R.string.clin_lab_sin_ordenes_detalle)) }
            else -> {
                if (state.loading) item { RefreshHint() }
                state.error?.let { error -> item { NoticeBanner(NoticeKind.ERROR, error) } }
                if (!ownResults) {
                    item { LiveSearchField(query, { query = it }, stringResource(R.string.lab_buscar)) }
                    item { ChipRow(LabFilter.entries.map { Triple(it, it.label, state.orders.count(it::matches)) }, filter) { filterName = it.name } }
                    item { ChipRow(listOf(Triple(false, "Todas las prioridades", null), Triple(true, stringResource(R.string.lab_solo_urgentes), state.orders.count(LabWorklist::isUrgent))), urgentOnly) { urgentOnly = it } }
                }
                // The clock is read when the list is drawn: each realtime event redraws it, no timers.
                val now = System.currentTimeMillis()
                val visible = LabWorklist.sorted(state.orders.filter { filter.matches(it) && (!urgentOnly || LabWorklist.isUrgent(it)) && LabWorklist.matches(it, query) })
                if (visible.isEmpty()) item { EmptyState(stringResource(R.string.lab_filtro_vacio), detail = stringResource(R.string.lab_filtro_vacio_detalle)) }
                if (ownResults) items(visible, key = { it.id }) { order -> LaboratoryOrderCard(order, true, state.busy, model, now) }
                else {
                    // S10: grouped by what comes next; closed groups start folded unless the person filters or searches.
                    val foldable = filter == LabFilter.ALL && query.isBlank()
                    LabGroups.group(visible).forEach { (group, orders) ->
                        val open = !group.folded || !foldable || group.name in openGroups
                        item(key = "g-${group.name}") {
                            LabGroupHeader(group.label, orders.size, if (group.folded && foldable) open else null) {
                                openGroups = if (group.name in openGroups) openGroups - group.name else openGroups + group.name
                            }
                        }
                        if (open) items(orders, key = { it.id }) { order -> LaboratoryOrderCard(order, false, state.busy, model, now) }
                    }
                }
            }
        }
    }
    state.cancelOrderId?.let { id -> CancelOrderDialog(state, state.orders.firstOrNull { it.id == id }, model) }
    state.external?.let { draft -> SendExternalDialog(draft, state.orders.firstOrNull { it.id == draft.orderId }, model) }
    state.externalLoad?.let { draft -> ExternalResultDialog(draft, state.orders.firstOrNull { it.id == draft.orderId }, model) }
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

/** S10: "Resultados por revisar". Critical values first; the doctor marks each one reviewed after reading it. */
@Composable
private fun FollowUpInbox(items: List<LabFollowUp>, busy: String?, model: LaboratoryViewModel) {
    SectionCard(title = stringResource(R.string.lab_pendientes_titulo), eyebrow = stringResource(R.string.lab_pendientes_cuenta, items.size)) {
        if (items.isEmpty()) Text(stringResource(R.string.lab_pendientes_vacio), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        items.forEach { item ->
            Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(Spacing.xs)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                    Text(item.patientName, Modifier.weight(1f), style = MaterialTheme.typography.titleSmall)
                    if (item.critical) CriticalPill(stringResource(R.string.lab_critico)) else FamilyBadge(stringResource(R.string.lab_pendiente_observacion), StatusFamily.ATENCION)
                }
                item.record?.let { Text(stringResource(R.string.lab_expediente, it), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                Text(item.detail, style = MaterialTheme.typography.bodyMedium)
                SecondaryButton(stringResource(R.string.lab_pendiente_revisado), { model.reviewFollowUp(item) }, enabled = busy == null)
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
 * External report: a PDF or photo picked on the phone plus one key value per exam. Only the file's metadata and fingerprint
 * travel (there is no clinical file storage yet); the dialog says so.
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
            draft.attachment?.let { Text("${it.fileName} · ${it.sizeBytes / 1024} KB", style = MaterialTheme.typography.bodySmall) }
            order.items.forEach { item ->
                FormField(if (item.numeric && item.unit != null) "${item.name} (${item.unit})" else item.name, draft.values[item.id].orEmpty(), { model.setExternalValue(item.id, it) },
                    keyboardOptions = if (item.numeric) KeyboardOptions(keyboardType = KeyboardType.Decimal) else KeyboardOptions.Default)
            }
            FormField(stringResource(R.string.lab_cargar_externo_nota), draft.note, model::setExternalNote, singleLine = false)
            Text(stringResource(R.string.lab_cargar_externo_almacen), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        },
    )
}

/** Name, type, size and SHA-256 of the picked document; the bytes are read once here and never leave the phone. */
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
    if (size > LabExternalRules.MAX_ATTACHMENT_BYTES) return@runCatching LabAttachment(name, type, size)
    val digest = MessageDigest.getInstance("SHA-256")
    var read = 0L
    resolver.openInputStream(uri)?.use { input ->
        val buffer = ByteArray(64 * 1024)
        while (true) { val n = input.read(buffer); if (n < 0) break; digest.update(buffer, 0, n); read += n }
    }
    LabAttachment(name, type, if (size >= 0) size else read, digest.digest().joinToString("") { "%02x".format(it) })
}.getOrNull()

/** Cancel with a reason (D-13: at least 10 characters). The reason and the open dialog live in the ViewModel, so a rotation keeps them. */
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
private fun LaboratoryOrderCard(order: LaboratoryOrder, ownView: Boolean, busy: Boolean, model: LaboratoryViewModel, now: Long) {
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
        eyebrow = stringResource(if (order.priority == "urgente") R.string.lab_prioridad_urgente else R.string.lab_prioridad_rutina),
        action = { LabStagePill(LabWorklist.stage(order)) },
    ) {
        if (!ownView) LabWorkSummary(order, now)
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
        }
        if (canLoadExternal) PrimaryButton(stringResource(R.string.lab_cargar_externo), { model.openExternalLoad(order.id) }, enabled = !busy)
        if (canReview) PrimaryButton(stringResource(R.string.lab_revisar), { model.review(order) }, enabled = !busy, loading = busy)
        if (canSendExternal) SecondaryButton(stringResource(R.string.lab_externo_titulo), { model.openExternal(order.id) }, enabled = !busy)
        if (canCancel) SecondaryButton(stringResource(R.string.lab_cancelar_orden), { model.openCancel(order.id) }, enabled = !busy)
        if (!ownView && !(canReview || canLoadExternal || canSendExternal)) TextButton(onClick = { expanded = false }) { Text(stringResource(R.string.lab_ocultar_detalle)) }
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
 * Journey of the order: Solicitada, Muestra, En proceso, Completada, Revisada, Visible al paciente. Done steps are green with a
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
            if (current >= 0) stringResource(R.string.lab_paso_actual, current + 1, steps.size, steps[current].label) else stringResource(R.string.lab_paso_completo),
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
    LabStage.IN_PROCESS -> StatusFamily.LLAMADO
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
            if (LabWorklist.isUrgent(order)) { Icon(Icons.Default.Warning, null, Modifier.size(18.dp), tint = MaterialTheme.climesa.warning); Text(stringResource(R.string.lab_prioridad_urgente), style = MaterialTheme.typography.labelLarge, color = MaterialTheme.climesa.warning) }
            LabWorklist.elapsedMinutes(order, now)?.let { minutes ->
                Text(stringResource(R.string.lab_espera, elapsedText(minutes)), style = MaterialTheme.typography.labelLarge, color = slaColor(LabWorklist.sla(order, now)))
            }
            if (LabWorklist.isCritical(order)) CriticalPill(stringResource(R.string.lab_critico))
        }
    }
}
