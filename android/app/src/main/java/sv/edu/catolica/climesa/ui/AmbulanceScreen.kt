@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
package sv.edu.catolica.climesa.ui

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Map
import androidx.compose.material.icons.outlined.Send
import sv.edu.catolica.climesa.ui.icons.ClimesaIcons
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import kotlinx.coroutines.launch
import sv.edu.catolica.climesa.domain.AmbulanceForms
import sv.edu.catolica.climesa.domain.AmbulanceReadiness
import sv.edu.catolica.climesa.domain.AmbulanceSigns
import sv.edu.catolica.climesa.domain.AmbulanceStatus
import sv.edu.catolica.climesa.domain.AmbulanceTimeline
import sv.edu.catolica.climesa.domain.MaintenanceRules
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.AssistChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import java.net.URLEncoder
import sv.edu.catolica.climesa.R
import sv.edu.catolica.climesa.domain.AccessProfile
import sv.edu.catolica.climesa.domain.AmbulanceLabels
import sv.edu.catolica.climesa.domain.UnitStatusBadge
import sv.edu.catolica.climesa.domain.AmbulanceRequestRow
import sv.edu.catolica.climesa.domain.AmbulanceRules
import sv.edu.catolica.climesa.domain.AmbulanceService
import sv.edu.catolica.climesa.domain.AmbulanceLogEntry
import sv.edu.catolica.climesa.domain.AndroidSection
import sv.edu.catolica.climesa.domain.LogFilters
import sv.edu.catolica.climesa.domain.ParamedicRules
import sv.edu.catolica.climesa.domain.AmbulancePrefill
import sv.edu.catolica.climesa.domain.RequestDraft
import sv.edu.catolica.climesa.domain.RequestField

/**
 * Secciones de Android de la spec 109 que resuelve [AmbulanceScreen]. Lote 5 S8: A70 (Unidad) también vive aquí, con la
 * misma tarjeta de unidad, la bitácora del servicio y el mantenimiento que ven Despacho y Paramédico.
 */
val ambulanceSections = setOf(
    AndroidSection.AMBULANCE_REQUEST, AndroidSection.DISPATCH, AndroidSection.SERVICE, AndroidSection.PREHOSPITAL_REPORT,
    AndroidSection.UNIDENTIFIED_PATIENT, AndroidSection.LOG, AndroidSection.AMBULANCE_RECEPTION, AndroidSection.AMBULANCE_ARRIVAL,
    AndroidSection.UNIT,
)

/**
 * A09, A36, A71, A72, A73, A74, A54 y A25. Un solo ViewModel por cuenta para que el paciente provisional (A73) llegue al
 * reporte prehospital (A72) y el reporte en cola sobreviva al cambio de sección y al giro.
 */
@Composable
fun AmbulanceScreen(section: AndroidSection, profile: AccessProfile, accountId: String, modifier: Modifier = Modifier, quickAction: sv.edu.catolica.climesa.domain.QuickAction? = null, onQuickActionHandled: () -> Unit = {}, onOpenSection: ((AndroidSection) -> Unit)? = null) {
    if (ParamedicRules.handles(section, profile.permissions)) { ParamedicScreen(section, profile, accountId, modifier, onOpenSection); return }
    val model: AmbulanceViewModel = viewModel(key = "ambulance-$accountId")
    val state by model.state.collectAsStateWithLifecycle()
    val readsStatus = "ambulancia.ver_estado" in profile.permissions
    LaunchedEffect(section) {
        model.clearMessages()
        model.open(when (section) {
            AndroidSection.AMBULANCE_REQUEST -> AmbulanceMode.REQUEST
            AndroidSection.LOG -> AmbulanceMode.LOG
            AndroidSection.AMBULANCE_RECEPTION, AndroidSection.AMBULANCE_ARRIVAL -> AmbulanceMode.ARRIVAL
            else -> AmbulanceMode.STATUS
        }, readsStatus)
    }
    LaunchedEffect(profile.channels) { model.startLive(profile.channels) }
    // Lote 5 S8: who dispatches sees the hours without crew of the next days (the endpoint needs `ambulancia.ver_estado`).
    val readsCoverage = section == AndroidSection.DISPATCH && "ambulancia.despachar" in profile.permissions && readsStatus
    LaunchedEffect(readsCoverage) { if (readsCoverage) model.loadCoverage() }
    // Past days of the log stay folded until opened; the choice survives rotation.
    var pastOpen by rememberSaveable { mutableStateOf(false) }
    // Inicio "Despachar": open the dispatch form of the oldest pending request (the one the unit serves next) once loaded.
    var dispatchFor by rememberSaveable { mutableStateOf<String?>(null) }
    LaunchedEffect(quickAction, state.status) {
        if (quickAction == null || state.loading) return@LaunchedEffect
        if (quickAction == sv.edu.catolica.climesa.domain.QuickAction.DISPATCH && "ambulancia.despachar" in profile.permissions) dispatchFor = state.status?.pendingRequests?.firstOrNull()?.id
        onQuickActionHandled()
    }
    PageList(modifier) {
        // G4: the request form and the dispatch dialogs show their own error next to their button.
        if (section != AndroidSection.AMBULANCE_REQUEST && section != AndroidSection.DISPATCH) state.formError?.let { item { NoticeBanner(NoticeKind.ERROR, it) } }
        state.notice?.let { item { NoticeBanner(NoticeKind.SUCCESS, it) } }
        // S6: a patient without a linked record is told what to do before any form or refused read.
        val requestBlocker = if (section == AndroidSection.AMBULANCE_REQUEST) AmbulanceRules.requestBlocker(profile.patientId) else null
        if (requestBlocker != null) item { NoticeBanner(NoticeKind.INFO, requestBlocker) }
        else if (state.loading) item { LoadingState() }
        else if (state.error != null) item { ErrorState(state.error, onRetry = { model.open(modeOf(section), readsStatus) }) }
        else when (section) {
            AndroidSection.AMBULANCE_REQUEST -> requestContent(state, model)
            AndroidSection.DISPATCH -> dispatchContent(state, model, profile.permissions, dispatchFor) { dispatchFor = null }
            AndroidSection.UNIT -> unitContent(state, model, profile.permissions)
            AndroidSection.LOG -> logContent(state, model, pastOpen, showFilters = !ParamedicRules.crewOnly(profile.permissions)) { pastOpen = !pastOpen }
            else -> arrivalContent(state, model)
        }
    }
}

private fun modeOf(section: AndroidSection) = when (section) {
    AndroidSection.AMBULANCE_REQUEST -> AmbulanceMode.REQUEST
    AndroidSection.LOG -> AmbulanceMode.LOG
    AndroidSection.AMBULANCE_RECEPTION, AndroidSection.AMBULANCE_ARRIVAL -> AmbulanceMode.ARRIVAL
    else -> AmbulanceMode.STATUS
}

/**
 * A09: aviso del 911, solicitud y seguimiento. MA-AMB-05: el estado sale de `GET /ambulancia/solicitudes/mias` (sobrevive a
 * cerrar la app), se vuelve a pedir con cada evento del canal propio y la cancelación solo se ofrece si la API la permite.
 */
private fun LazyListScope.requestContent(state: AmbulanceUiState, model: AmbulanceViewModel) {
    item { NoticeBanner(NoticeKind.WARNING, AmbulanceRules.NOTICE_911) }
    val requests = state.ownRequests ?: return
    val active = AmbulanceRules.activeRequest(requests)
    // With nothing active, how the last request ended (discarded and why, cancelled, finished) sits above the form.
    if (active == null) AmbulanceRules.latestResolved(requests)?.let { last -> item(key = "last-${last.id}") { OwnRequestCard(last, state.busy, model) } }
    if (active == null) item { RequestForm(state.busy, state.requestPrefill, model, state.formError) }
    else {
        state.formError?.let { item { NoticeBanner(NoticeKind.ERROR, it) } }
        item { OwnRequestCard(active, state.busy, model) }
    }
}

@Composable
private fun OwnRequestCard(request: sv.edu.catolica.climesa.domain.OwnAmbulanceRequest, busy: Boolean, model: AmbulanceViewModel) {
    var cancelling by rememberSaveable(request.id) { mutableStateOf(false) }
    val finished = request.service?.finalState
    val tag = finished?.let { AmbulanceLabels.finalState(it) } ?: AmbulanceLabels.requestState(request.state)
    SectionCard(stringResource(if (request.active) R.string.amb_solicitud_enviada else R.string.amb_ultima_solicitud), eyebrow = localTime(request.createdAt), action = { FamilyBadge(tag, requestFamily(request)) }) {
        Text(AmbulanceRules.requestProgress(request), style = MaterialTheme.typography.bodyMedium)
        LabeledValue(stringResource(R.string.amb_donde), request.address)
        request.discardReason?.takeIf { request.state == "descartada" }?.let { LabeledValue(stringResource(R.string.amb_motivo_descarte), it) }
        request.service?.let { service ->
            HorizontalDivider()
            listOf("salida", "en_escena", "trasladando", "en_hospital").forEach { type ->
                val done = service.milestones.firstOrNull { it.type == type }
                Text("${AmbulanceLabels.milestone(type)}: ${done?.occurredAt?.let(::localTime) ?: stringResource(R.string.amb_pendiente)}", style = MaterialTheme.typography.bodySmall, color = if (done != null) MaterialTheme.climesa.success else MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        if (request.canCancel) SecondaryButton(stringResource(R.string.amb_cancelar_solicitud), { cancelling = true }, enabled = !busy)
    }
    var sent by remember(request.id) { mutableStateOf(false) }
    // The dialog stays open (busy) until the write answers, so a double tap cannot send twice.
    LaunchedEffect(busy) { if (sent && !busy) { sent = false; cancelling = false } }
    if (cancelling) {
        var reason by rememberSaveable { mutableStateOf("") }
        ConfirmDialog(
            title = stringResource(R.string.amb_cancelar_solicitud), confirmLabel = stringResource(R.string.amb_cancelar_solicitud), destructive = true, busy = busy,
            message = stringResource(R.string.amb_cancelar_detalle),
            onConfirm = { sent = true; model.cancelRequest(request, reason) }, onDismiss = { cancelling = false },
            body = { FormField(stringResource(R.string.amb_motivo_opcional), reason, { reason = it.take(300) }, singleLine = false) },
        )
    }
}

/** The request's state as a family tag: waiting, on its way, finished, or closed (discarded, cancelled, not completed). */
internal fun requestFamily(request: sv.edu.catolica.climesa.domain.OwnAmbulanceRequest): StatusFamily = when {
    request.state == "por_confirmar" -> StatusFamily.ESPERA
    request.state == "descartada" || request.state == "cancelada" -> StatusFamily.CERRADO
    request.service?.finalState == "completado" -> StatusFamily.LISTO
    request.service?.finalState != null -> StatusFamily.CERRADO
    else -> StatusFamily.ATENCION
}

/** Triage colour of an ambulance priority (roja, naranja, amarilla, verde) on the shared priority badge. */
internal fun triagePriority(priority: String) = Priority.of(AmbulanceRules.priorityLevel(priority))
/** Priority filter chips copy the triage badge; "Todas" stays neutral. */
internal fun triageTone(value: String): ChipTone? = if (value.isEmpty()) null else ChipTone.Level(triagePriority(value))

@Composable
internal fun TriageBadge(priority: String) = PriorityBadge(triagePriority(priority), label = AmbulanceLabels.priority(priority))

@Composable
private fun RequestForm(busy: Boolean, prefill: AmbulancePrefill?, model: AmbulanceViewModel, error: String?) {
    var address by rememberSaveable { mutableStateOf("") }
    var municipality by rememberSaveable { mutableStateOf("") }
    var reason by rememberSaveable { mutableStateOf("") }
    var phone by rememberSaveable { mutableStateOf("") }
    // Fields filled from the record, once per screen lifetime ("" = nothing filled, null = not applied yet).
    var filled by rememberSaveable { mutableStateOf<String?>(null) }
    LaunchedEffect(prefill) {
        if (prefill == null || filled != null) return@LaunchedEffect
        val (draft, fields) = prefill.applyTo(RequestDraft(address, phone))
        address = draft.address; phone = draft.phone
        filled = fields.joinToString(",") { it.name }
    }
    val names = filled.orEmpty().split(',').filter { it.isNotBlank() }.map { RequestField.valueOf(it) }
    // Lote 5 S3: required fields marked; a failed send puts each error under its field and moves to the first one.
    var tried by rememberSaveable { mutableStateOf(false) }
    val errors = if (tried) AmbulanceForms.requestErrors(address, reason, phone) else emptyMap()
    val focus = rememberFormErrorFocus()
    val scope = rememberCoroutineScope()
    SectionCard(stringResource(R.string.amb_enviar_solicitud)) {
        if (names.isNotEmpty()) NoticeBanner(NoticeKind.INFO, stringResource(R.string.amb_prefill_aviso, names.map { stringResource(it.label()) }.joinToString(stringResource(R.string.ui_y))))
        RequiredLegend()
        FormField(stringResource(R.string.amb_motivo), reason, { reason = it.take(500) }, Modifier.errorAnchor(focus, AmbulanceForms.REASON), singleLine = false, required = true, error = errors[AmbulanceForms.REASON])
        FormField(stringResource(R.string.amb_direccion), address, { address = it.take(300) }, Modifier.errorAnchor(focus, AmbulanceForms.ADDRESS), singleLine = false, required = true, error = errors[AmbulanceForms.ADDRESS])
        FormField(stringResource(R.string.amb_municipio), municipality, { municipality = it.take(80) })
        FormField(stringResource(R.string.amb_telefono), phone, { phone = it.take(20) }, Modifier.errorAnchor(focus, AmbulanceForms.PHONE), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone), required = true, error = errors[AmbulanceForms.PHONE])
        error?.let { NoticeBanner(NoticeKind.ERROR, it) }
        PrimaryButton(stringResource(R.string.amb_enviar_solicitud), {
            tried = true
            val found = AmbulanceForms.requestErrors(address, reason, phone)
            if (found.isEmpty()) model.submitRequest(address, municipality, reason, phone) else scope.launch { focus.focusFirst(found.keys) }
        }, icon = Icons.Outlined.Send, loading = busy, enabled = !busy)
    }
}

private fun RequestField.label(): Int = when (this) {
    RequestField.ADDRESS -> R.string.amb_campo_direccion
    RequestField.PHONE -> R.string.amb_campo_telefono
}

/**
 * A70 (Médico y quien vea la unidad sin despachar): la tarjeta de la unidad, el servicio en curso con su bitácora y, solo con
 * el permiso `ambulancia.mantenimiento`, poner o quitar el mantenimiento.
 */
private fun LazyListScope.unitContent(state: AmbulanceUiState, model: AmbulanceViewModel, permissions: Collection<String>) {
    val status = state.status ?: return
    item { UnitStatusCard(status, AmbulanceReadiness.blocker(status, withAction = false)) }
    status.activeService?.let { service -> item { ServiceSummary(service) } }
    maintenanceItem(state, model, permissions)
}

private fun LazyListScope.maintenanceItem(state: AmbulanceUiState, model: AmbulanceViewModel, permissions: Collection<String>) {
    val status = state.status ?: return
    if (MaintenanceRules.available(permissions, status.unit.state)) item { MaintenanceControl(status, state.busy, state.formError, model) }
}

/** A36: solicitudes por confirmar, confirmar y despachar o descartar. */
private fun LazyListScope.dispatchContent(state: AmbulanceUiState, model: AmbulanceViewModel, permissions: Collection<String>, openFor: String? = null, onOpened: () -> Unit = {}) {
    val status = state.status ?: return
    sv.edu.catolica.climesa.domain.AmbulanceCoverage.warning(state.coverage)?.let { text -> item(key = "cobertura") { NoticeBanner(NoticeKind.WARNING, text) } }
    item { UnitStatusCard(status, AmbulanceReadiness.blocker(status, withAction = true)) }
    status.activeService?.let { service -> item { ServiceSummary(service) } }
    item { Text(stringResource(R.string.amb_solicitudes_titulo, status.pendingRequests.size), style = MaterialTheme.typography.titleMedium) }
    if (status.pendingRequests.isEmpty()) item { EmptyState(stringResource(R.string.amb_sin_solicitudes)) }
    // One primary per screen: only the oldest request (the one the unit serves next) gets the filled "Confirmar y despachar".
    val first = status.pendingRequests.firstOrNull()?.id
    state.formError?.let { item { NoticeBanner(NoticeKind.ERROR, it) } }
    items(status.pendingRequests, key = { it.id }) { request -> PendingRequestCard(request, status.unit.state == "disponible" && status.dispatchBlock == null, state.busy, model, status.availableCrew, primary = request.id == first, error = state.formError, autoOpen = request.id == openFor, onAutoOpened = onOpened) }
    maintenanceItem(state, model, permissions)
}

/**
 * Lote 5 S8: the unit card every role sees. When the unit cannot be dispatched, the reason opens the card in a red (or amber,
 * while a service runs) band, larger than body text; under it the readiness checklist with an icon and colour per line.
 */
@Composable
internal fun UnitStatusCard(status: AmbulanceStatus, blocker: AmbulanceReadiness.Blocker?, showService: Boolean = true) {
    ClimesaCard {
        Column(Modifier.fillMaxWidth()) {
            blocker?.let { BlockerBand(it) }
            Column(Modifier.fillMaxWidth().padding(Spacing.md), verticalArrangement = Arrangement.spacedBy(Spacing.sm + Spacing.xs)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Text(stringResource(R.string.amb5_unidad).uppercase(), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.climesa.primaryText)
                        Text(status.unit.plate, style = MaterialTheme.typography.titleLarge)
                    }
                    // The band already says «No se puede despachar»; an available-but-blocked unit never reads «Disponible».
                    if (!(blocker != null && status.unit.state == "disponible")) OperacionStatusTag(status.unit.state, label = AmbulanceLabels.unitState(status.unit.state))
                }
                ReadinessChecklist(AmbulanceReadiness.checklist(status).filter { showService || it.key != "service" })
                if (status.unit.state == "en_mantenimiento") {
                    if (status.unit.stateSince.isNotBlank()) Text(stringResource(R.string.amb_estado_desde, localTime(status.unit.stateSince)), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    if (status.unit.stateReason.isNotBlank()) Text(stringResource(R.string.amb_estado_motivo, status.unit.stateReason), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}

/** The dispatch blocker: [CardStatusStrip] with the title, then the concrete reason in body-large text on the same tint. */
@Composable
private fun BlockerBand(blocker: AmbulanceReadiness.Blocker) {
    val danger = blocker.tone == AmbulanceReadiness.Tone.DANGER
    val soft = if (danger) MaterialTheme.climesa.dangerSoft else MaterialTheme.climesa.warningSoft
    Column(Modifier.fillMaxWidth().background(soft).semantics(mergeDescendants = true) { liveRegion = LiveRegionMode.Polite }) {
        CardStatusStrip(blocker.title, if (danger) StripTone.Danger else StripTone.Warning, icon = ClimesaIcons.Alert)
        if (blocker.reason.isNotBlank()) Text(
            blocker.reason, Modifier.padding(start = Spacing.md, end = Spacing.md, bottom = Spacing.sm + Spacing.xs),
            style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.SemiBold), color = MaterialTheme.colorScheme.onSurface,
        )
    }
}

/** Readiness lines (service, maintenance, crew): a check in green when ready, a cross in red when missing, a clock when busy. */
@Composable
internal fun ReadinessChecklist(items: List<AmbulanceReadiness.Item>) {
    Column(verticalArrangement = Arrangement.spacedBy(Spacing.xs + 2.dp)) {
        items.forEach { item ->
            val (icon, tint) = when (item.state) {
                AmbulanceReadiness.State.OK -> ClimesaIcons.Check to MaterialTheme.climesa.success
                AmbulanceReadiness.State.MISSING -> ClimesaIcons.Close to MaterialTheme.climesa.danger
                AmbulanceReadiness.State.BUSY -> ClimesaIcons.Clock to MaterialTheme.climesa.primaryText
            }
            Row(Modifier.fillMaxWidth().semantics(mergeDescendants = true) {}, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                Box(Modifier.size(24.dp).background(tint.copy(alpha = .12f), CircleShape), contentAlignment = Alignment.Center) { Icon(icon, null, Modifier.size(14.dp), tint = tint) }
                Text(
                    item.text, Modifier.weight(1f),
                    style = MaterialTheme.typography.bodyMedium.copy(fontWeight = if (item.state == AmbulanceReadiness.State.MISSING) FontWeight.SemiBold else FontWeight.Normal),
                    color = if (item.state == AmbulanceReadiness.State.MISSING) MaterialTheme.climesa.danger else MaterialTheme.colorScheme.onSurface,
                )
            }
        }
    }
}

/**
 * Lote 5 S8: the bitácora of a service as its visible progress, the same for Recepción, Médico, Enfermería and Paramédico:
 * a vertical timeline with the time, who records the step and a milestone marker (filled when done, ringed when next).
 */
@Composable
internal fun ServiceTimeline(steps: List<AmbulanceTimeline.Step>, modifier: Modifier = Modifier) {
    Column(modifier.fillMaxWidth()) {
        steps.forEachIndexed { index, step ->
            val color = when {
                step.done -> MaterialTheme.climesa.success
                step.current -> MaterialTheme.colorScheme.primary
                else -> MaterialTheme.climesa.controlLine
            }
            Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min).semantics(mergeDescendants = true) {}, horizontalArrangement = Arrangement.spacedBy(Spacing.sm + Spacing.xs)) {
                Column(Modifier.width(24.dp).fillMaxHeight(), horizontalAlignment = Alignment.CenterHorizontally) {
                    Box(
                        Modifier.size(20.dp).background(if (step.done) color else MaterialTheme.colorScheme.surface, CircleShape).border(2.dp, color, CircleShape),
                        contentAlignment = Alignment.Center,
                    ) { if (step.done) Icon(ClimesaIcons.Check, null, Modifier.size(12.dp), tint = MaterialTheme.colorScheme.surface) }
                    if (index < steps.lastIndex) Box(Modifier.width(2.dp).weight(1f).background(if (step.done) color.copy(alpha = .5f) else MaterialTheme.climesa.line))
                }
                Column(Modifier.weight(1f).padding(bottom = if (index < steps.lastIndex) Spacing.sm + Spacing.xs else 0.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                        Text(
                            step.label, Modifier.weight(1f),
                            style = MaterialTheme.typography.bodyLarge.copy(fontWeight = if (step.done || step.current) FontWeight.SemiBold else FontWeight.Normal),
                            color = if (step.done || step.current) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Text(step.at?.let(::clockTime) ?: if (step.current) stringResource(R.string.amb5_siguiente) else stringResource(R.string.amb_pendiente), style = MaterialTheme.typography.labelLarge.copy(fontFeatureSettings = "tnum"), color = if (step.current) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    Text(step.author, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}

/**
 * Lote 5 S8: a request to confirm reads who asks, where and why first, then the full-width «Por confirmar» strip and the two
 * actions on one line: «Confirmar y despachar» (main step) and «Descartar» (danger, at the right).
 */
@Composable
private fun PendingRequestCard(request: AmbulanceRequestRow, available: Boolean, busy: Boolean, model: AmbulanceViewModel, crewPool: List<sv.edu.catolica.climesa.domain.CrewCandidate>, primary: Boolean, error: String?, autoOpen: Boolean = false, onAutoOpened: () -> Unit = {}) {
    var dispatching by rememberSaveable(request.id) { mutableStateOf(false) }
    LaunchedEffect(autoOpen) { if (autoOpen) { if (available && !busy) dispatching = true; onAutoOpened() } }
    var discarding by rememberSaveable(request.id) { mutableStateOf(false) }
    val sent = remember(request.id) { mutableStateOf(false) }
    // G4: a failed dispatch keeps the dialog open with the crew, type and destination chosen, and says why inside it.
    CloseWhenDone(busy, sent, error) { dispatching = false; discarding = false }
    val waiting = remember(request.createdAt) { runCatching { java.time.Duration.between(java.time.Instant.parse(request.createdAt), java.time.Instant.now()).toMinutes().coerceAtLeast(0) }.getOrDefault(0L) }
    ActionCard(
        actions = listOf(
            CardAction(stringResource(R.string.amb_despachar), if (primary) ActionRole.Primary else ActionRole.Edit, { dispatching = true }, icon = ClimesaIcons.Ambulance, enabled = available && !busy),
            CardAction(stringResource(R.string.amb_descartar), ActionRole.Danger, { discarding = true }, enabled = !busy),
        ),
        status = {
            if (available) CardStatusStrip(stringResource(R.string.amb5_por_confirmar), StripTone.Warning, icon = ClimesaIcons.Clock, detail = AmbulanceRules.waiting(waiting))
            else CardStatusStrip(stringResource(R.string.amb5_no_despachable_ahora), StripTone.Danger, icon = ClimesaIcons.Alert, detail = AmbulanceRules.waiting(waiting))
        },
    ) {
        Text(stringResource(R.string.amb5_quien_llama).uppercase(), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.climesa.primaryText)
        Text(AmbulanceRules.requesterLabel(request), style = MaterialTheme.typography.titleMedium)
        LabeledValue(stringResource(R.string.amb_donde), request.address + if (request.municipality.isNotBlank()) ", ${request.municipality}" else "")
        LabeledValue(stringResource(R.string.amb_motivo), request.reason)
        LabeledValue(stringResource(R.string.amb_telefono), request.contactPhone)
        if (request.patientRecord.isNotBlank()) LabeledValue(stringResource(R.string.amb_expediente), request.patientRecord)
    }
    if (dispatching) DispatchDialog(busy, crewPool, error, onClose = { dispatching = false }) { type, priority, destination, crew -> sent.value = true; model.dispatch(request, type, priority, destination, crew) }
    if (discarding) ReasonDialog(stringResource(R.string.amb_descartar), stringResource(R.string.amb5_motivo_descarte), busy, error, onClose = { discarding = false }) { reason -> sent.value = true; model.discard(request, reason) }
}

@Composable
private fun DispatchDialog(busy: Boolean, crewPool: List<sv.edu.catolica.climesa.domain.CrewCandidate>, error: String?, onClose: () -> Unit, onConfirm: (String, String, String, List<String>) -> Unit) {
    // MA-AMB-02: the dispatcher picks the crew among the staff on duty; it comes proposed (paramedic with account + driver).
    var crew by rememberSaveable { mutableStateOf(AmbulanceRules.defaultCrew(crewPool)) }
    var type by rememberSaveable { mutableStateOf(AmbulanceLabels.types.first().first) }
    var priority by rememberSaveable { mutableStateOf("naranja") }
    var destination by rememberSaveable { mutableStateOf("Hospital CLIMESA, emergencia") }
    var tried by rememberSaveable { mutableStateOf(false) }
    val destinationError = AmbulanceForms.destinationError(destination).takeIf { tried }
    ConfirmDialog(
        title = stringResource(R.string.amb_despachar), confirmLabel = stringResource(R.string.amb_despachar),
        onConfirm = { tried = true; if (AmbulanceForms.destinationError(destination) == null) onConfirm(type, priority, destination, crew) }, onDismiss = onClose, busy = busy, error = error,
        confirmEnabled = AmbulanceRules.crewProblem(crewPool, crew) == null,
        message = stringResource(R.string.amb_confirmado_telefono),
        body = {
            Column(verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                RequiredLegend()
                RequiredLabel(stringResource(R.string.amb_tipo))
                Choices(AmbulanceLabels.types, type) { type = it }
                RequiredLabel(stringResource(R.string.amb_prioridad))
                Choices(AmbulanceLabels.priorities, priority, ::triageTone) { priority = it }
                FormField(stringResource(R.string.amb_destino), destination, { destination = it.take(300) }, singleLine = false, required = true, error = destinationError)
                RequiredLabel(stringResource(R.string.amb_tripulacion))
                if (crewPool.isEmpty()) Text(stringResource(R.string.amb_sin_tripulacion_turno), style = MaterialTheme.typography.bodySmall)
                crewPool.forEach { member ->
                    val label = AmbulanceLabels.crewRole(member.role) + if (member.role == "paramedico" && !member.hasAccount) " · " + stringResource(R.string.amb_sin_cuenta) else ""
                    ClimesaFilterChip(selected = member.staffId in crew, onClick = { crew = if (member.staffId in crew) crew - member.staffId else crew + member.staffId }, label = { Text("${member.name} · $label") })
                }
                AmbulanceRules.crewProblem(crewPool, crew)?.let { FieldError(it) }
            }
        },
    )
}

/** A group label with the red required mark (choices and chips, which have no field label of their own). */
@Composable
internal fun RequiredLabel(text: String) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(text, style = MaterialTheme.typography.titleSmall)
        RequiredMark()
    }
}

/** Reason of a destructive step: required, its error under the field (Lote 5 S3), checked before anything is sent. */
@Composable
private fun ReasonDialog(title: String, label: String, busy: Boolean, error: String?, onClose: () -> Unit, onConfirm: (String) -> Unit) {
    var reason by rememberSaveable { mutableStateOf("") }
    var tried by rememberSaveable { mutableStateOf(false) }
    ConfirmDialog(
        title = title, confirmLabel = title, onConfirm = { tried = true; if (AmbulanceForms.reasonError(reason) == null) onConfirm(reason) }, onDismiss = onClose, busy = busy, destructive = true, error = error,
        body = { FormField(label, reason, { reason = it.take(500) }, singleLine = false, required = true, error = AmbulanceForms.reasonError(reason).takeIf { tried }) },
    )
}

/**
 * Lote 5 S8: «Poner en mantenimiento» / «Quitar de mantenimiento» (edit role) with a required reason and a confirmation.
 * Leaving maintenance needs a paramedic and a driver on shift (RN-30); without them the button stays off and says why.
 */
@Composable
private fun MaintenanceControl(status: AmbulanceStatus, busy: Boolean, error: String?, model: AmbulanceViewModel) {
    val leaving = status.unit.state == "en_mantenimiento"
    val blocked = MaintenanceRules.leavingBlocked(status.unit.state, status.paramedicOnDuty, status.driverOnDuty)
    var open by rememberSaveable { mutableStateOf(false) }
    var reason by rememberSaveable { mutableStateOf("") }
    var tried by rememberSaveable { mutableStateOf(false) }
    val sent = remember { mutableStateOf(false) }
    CloseWhenDone(busy, sent, error) { open = false; reason = ""; tried = false }
    val title = stringResource(if (leaving) R.string.amb5_mant_quitar else R.string.amb5_mant_poner)
    Column(verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
        CardActionButton(CardAction(title, ActionRole.Edit, { model.clearMessages(); open = true }, icon = ClimesaIcons.Pencil, enabled = !blocked && !busy))
        if (blocked) BlockedReason(stringResource(R.string.amb5_mant_requiere))
    }
    if (open) ConfirmDialog(
        title = title, confirmLabel = title, busy = busy, error = error,
        message = stringResource(if (leaving) R.string.amb5_mant_efecto_quitar else R.string.amb5_mant_efecto_poner),
        onConfirm = { tried = true; if (MaintenanceRules.reasonError(reason) == null) { sent.value = true; model.setMaintenance(!leaving, reason) } },
        onDismiss = { open = false },
        body = {
            FormField(
                stringResource(R.string.amb5_mant_motivo), reason, { reason = it.take(MaintenanceRules.MAX_REASON) }, singleLine = false, required = true,
                hint = stringResource(R.string.amb5_mant_motivo_pista), error = MaintenanceRules.reasonError(reason).takeIf { tried },
            )
        },
    )
}

@Composable
internal fun Choices(options: List<Pair<String, String>>, selected: String, tone: (String) -> ChipTone? = { null }, onSelect: (String) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) { options.forEach { (value, label) -> StatusFilterChip(selected == value, { onSelect(value) }, label, tone(value)) } }
}

@Composable
private fun ServiceSummary(service: AmbulanceService) {
    SectionCard(
        AmbulanceLabels.type(service.type),
        eyebrow = stringResource(R.string.unidad_servicio_activo),
        action = { TriageBadge(service.priority) },
    ) {
        Text(stringResource(R.string.amb5_ruta, service.origin, service.destination), style = MaterialTheme.typography.bodyLarge)
        HorizontalDivider(color = MaterialTheme.climesa.line)
        Text(stringResource(R.string.amb5_bitacora_servicio), style = MaterialTheme.typography.titleSmall)
        ServiceTimeline(AmbulanceTimeline.of(service))
    }
}

@Composable
internal fun OpenMap(address: String) {
    val uri = LocalUriHandler.current
    SecondaryButton(stringResource(R.string.amb_abrir_mapa), { runCatching { uri.openUri("geo:0,0?q=" + URLEncoder.encode(address, "UTF-8")) } }, icon = Icons.Outlined.Map)
}

@Composable
internal fun NumberField(label: String, value: String, decimal: Boolean = false, onChange: (String) -> Unit) {
    FormField(label, value, { onChange(it.filter { c -> c.isDigit() || (decimal && (c == '.' || c == ',')) }.take(6)) }, keyboardOptions = KeyboardOptions(keyboardType = if (decimal) KeyboardType.Decimal else KeyboardType.Number))
}

/** A74: servicios con su historia en una frase; búsqueda compacta y filtros en un panel plegable con chips (obs. 8 y 16). */
private fun LazyListScope.logContent(state: AmbulanceUiState, model: AmbulanceViewModel, pastOpen: Boolean, showFilters: Boolean = true, togglePast: () -> Unit) {
    // Lote 5 S8: the crew reads its own few services; search stays, the filter panel does not.
    item { LogToolbar(state.logFilters, model, showFilters) }
    if (state.log.isEmpty()) { item { EmptyState(stringResource(if (state.logFilters.any) R.string.amb_bitacora_sin_resultados else R.string.amb_bitacora_vacia)) }; return }
    item { Text(stringResource(R.string.amb_servicios_n, state.log.size), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
    // Day-grouped: today open, the past days folded behind one toggle (open by itself when nothing happened today).
    val today = java.time.LocalDate.now(java.time.ZoneId.of("America/El_Salvador"))
    val days = AmbulanceRules.logDays(state.log)
    val current = days.firstOrNull { it.first == today }
    val past = days.filter { it.first != today }
    fun day(date: java.time.LocalDate, entries: List<AmbulanceLogEntry>) {
        item(key = "day-$date") { Text(sv.edu.catolica.climesa.domain.ShortDay.of(date, today), style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(top = Spacing.sm)) }
        items(entries, key = { it.id }) { entry -> LogCard(entry) }
    }
    current?.let { (date, entries) -> day(date, entries) }
    if (past.isEmpty()) return
    val showPast = pastOpen || current == null
    if (current != null) item(key = "past-toggle") {
        SecondaryButton(if (showPast) stringResource(R.string.amb_dias_anteriores_ocultar) else stringResource(R.string.amb_dias_anteriores, past.sumOf { it.second.size }), togglePast)
    }
    if (showPast) past.forEach { (date, entries) -> day(date, entries) }
}

@Composable
private fun LogCard(entry: AmbulanceLogEntry) {
    val final = entry.finalState ?: "en_curso"
    // BL-05: an administrative close is one «Cierre administrativo» tag, not «Cancelado» plus a neutral badge.
    SectionCard(AmbulanceLabels.type(entry.type), eyebrow = localTime(entry.dispatchedAt), action = {
        if (entry.administrativeClose) FamilyBadge(AmbulanceLabels.ADMINISTRATIVE_CLOSE, StatusFamily.CERRADO)
        else OperacionStatusTag(final, label = AmbulanceLabels.finalState(entry.finalState))
    }) {
        TriageBadge(entry.priority)
        Text(AmbulanceRules.narrate(entry), style = MaterialTheme.typography.bodyMedium)
        ServiceTimeline(AmbulanceTimeline.of(entry))
        Text(entry.responseMinutes?.let { stringResource(R.string.amb_respuesta_min, it) } ?: stringResource(R.string.amb_sin_llegada), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun LogToolbar(filters: LogFilters, model: AmbulanceViewModel, showFilters: Boolean = true) {
    var open by rememberSaveable { mutableStateOf(false) }
    var query by rememberSaveable { mutableStateOf(filters.query) }
    LaunchedEffect(query) { if (query.trim() != filters.query) { kotlinx.coroutines.delay(300); model.setLogFilters(filters.copy(query = query.trim())) } }
    Column(verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
        FormField(stringResource(R.string.amb_buscar), query, { query = it.take(80) }, hint = stringResource(R.string.amb_buscar_pista))
        if (showFilters) SecondaryButton(if (filters.activeCount > 0) stringResource(R.string.amb_filtros_n, filters.activeCount) else stringResource(R.string.amb_filtros), { open = !open }, icon = ClimesaIcons.Filter)
        if (showFilters && open) SectionCard(stringResource(R.string.amb_filtros)) {
            Text(stringResource(R.string.amb_prioridad), style = MaterialTheme.typography.labelLarge)
            Choices(listOf("" to stringResource(R.string.amb_todas)) + AmbulanceLabels.priorities, filters.priority, ::triageTone) { model.setLogFilters(filters.copy(priority = it)) }
            Text(stringResource(R.string.amb_estado_final), style = MaterialTheme.typography.labelLarge)
            Choices(listOf("" to stringResource(R.string.amb_todas), AmbulanceLabels.OPEN to stringResource(R.string.amb_en_curso_filtro), "completado" to StatusCatalog.label("completado")) + AmbulanceLabels.earlyFinalStates, filters.finalState, FilterTones::state) { model.setLogFilters(filters.copy(finalState = it)) }
            Text(stringResource(R.string.amb_tipo), style = MaterialTheme.typography.labelLarge)
            Choices(listOf("" to stringResource(R.string.amb_todas)) + AmbulanceLabels.types, filters.type) { model.setLogFilters(filters.copy(type = it)) }
        }
        if (showFilters && filters.any) {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                AmbulanceLabels.chips(filters).forEach { (key, label) ->
                    AssistChip(onClick = { model.setLogFilters(when (key) { "priority" -> filters.copy(priority = ""); "finalState" -> filters.copy(finalState = ""); else -> filters.copy(type = "") }) }, label = { Text(label) }, trailingIcon = { androidx.compose.material3.Icon(ClimesaIcons.Close, contentDescription = null) })
                }
                SecondaryButton(stringResource(R.string.amb_quitar_filtros), { query = ""; model.setLogFilters(LogFilters()) })
            }
        }
    }
}

/** A54 y A25: reporte prehospital en vivo; el contenido clínico solo si la API lo entrega. MA-AMB-04: marcar recibido. */
private fun LazyListScope.arrivalContent(state: AmbulanceUiState, model: AmbulanceViewModel) {
    // Lote 5 S10 ("recepcion de ambulancia no se entiende el flujo"): one line with the order of the flow before the data.
    item(key = "recepcion-flujo") { Text(stringResource(R.string.enf_recepcion_flujo), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
    // MA-AMB-04: a service that arrived without a handover stays listed while the unit is out on another one.
    if (state.arrivals.size > 1) item {
        SectionCard(stringResource(R.string.amb_por_recibir)) {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                state.arrivals.forEach { candidate ->
                    ClimesaFilterChip(
                        selected = candidate.serviceId == state.arrivalServiceId, onClick = { model.selectArrival(candidate.serviceId) },
                        label = { Text(stringResource(if (candidate.arrived) R.string.amb_llego_sin_entrega else R.string.amb_en_camino, localTime(candidate.dispatchedAt))) },
                    )
                }
            }
        }
    }
    val view = state.arrival
    if (view == null) { item { EmptyState(stringResource(R.string.amb_sin_reporte), icon = ClimesaIcons.Building) }; return }
    item { HandoverCard(view, state.busy, model, state.formError) }
    // Lote 5 S8: the same bitácora Despacho and the crew see, so reception knows where the ambulance is.
    state.status?.activeService?.takeIf { it.id == view.serviceId }?.let { service -> item(key = "timeline-${service.id}") { ServiceSummary(service) } }
    if (view.reports.isEmpty()) { item { EmptyState(stringResource(R.string.amb_sin_reporte), icon = ClimesaIcons.Building) }; return }
    if (!view.clinical) item { NoticeBanner(NoticeKind.INFO, stringResource(R.string.amb_sin_relacion)) }
    items(view.reports, key = { it.id }) { report ->
        SectionCard("${stringResource(R.string.amb_prioridad)} ${AmbulanceLabels.priority(report.priority)}", eyebrow = "${stringResource(R.string.amb_capturado)}: ${localTime(report.capturedAt)}") {
            LabeledValue(stringResource(R.string.amb_llegada_estimada), report.estimatedArrival?.let(::localTime) ?: stringResource(R.string.amb_sin_estimar))
            report.reason?.let { LabeledValue(stringResource(R.string.amb_motivo), it) }
            if (report.vitalSigns.isNotEmpty()) {
                HorizontalDivider()
                // G4: two signs per row, the value large with its unit, pressure as one reading.
                AmbulanceSigns.inFull(report.vitalSigns).chunked(2).forEach { pair ->
                    androidx.compose.foundation.layout.Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                        pair.forEach { (label, value) ->
                            Column(Modifier.weight(1f)) {
                                Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                Text(value, style = MaterialTheme.typography.titleLarge.copy(fontFeatureSettings = "tnum"))
                            }
                        }
                        if (pair.size == 1) androidx.compose.foundation.layout.Spacer(Modifier.weight(1f))
                    }
                }
            }
        }
    }
}

/** MA-AMB-04: who received the patient, or the single "Marcar recibido" action when the API allows it. */
@Composable
private fun HandoverCard(view: sv.edu.catolica.climesa.domain.PrehospitalView, busy: Boolean, model: AmbulanceViewModel, error: String?) {
    var confirming by rememberSaveable(view.serviceId) { mutableStateOf(false) }
    val sent = remember(view.serviceId) { mutableStateOf(false) }
    CloseWhenDone(busy, sent, error) { confirming = false }
    val handover = view.handover
    SectionCard(stringResource(R.string.amb_entrega_titulo), action = { if (handover != null) FamilyBadge(stringResource(R.string.amb_recibido), StatusFamily.LISTO) }) {
        when {
            handover != null -> {
                Text(stringResource(R.string.amb_recibido_por, handover.receivedByName.ifBlank { stringResource(R.string.amb_personal_clinico) }, localTime(handover.receivedAt)), style = MaterialTheme.typography.bodyMedium)
                // A54: the next step after the handover is the admission, which Recepción records with origin «Ambulancia».
                Text(stringResource(R.string.amb_siguiente_admision), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            view.canReceive -> PrimaryButton(stringResource(R.string.amb_marcar_recibido), { confirming = true }, icon = ClimesaIcons.Check, enabled = !busy, loading = busy)
            !view.arrived -> Text(stringResource(R.string.amb_entrega_espera), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            else -> Text(stringResource(R.string.amb_entrega_sin_permiso), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
    if (confirming) ConfirmDialog(
        title = stringResource(R.string.amb_marcar_recibido), confirmLabel = stringResource(R.string.amb_marcar_recibido), busy = busy, error = error,
        message = stringResource(R.string.amb_marcar_recibido_detalle),
        onConfirm = { sent.value = true; model.receivePatient() }, onDismiss = { confirming = false },
    )
}

private val timeFormat = java.time.format.DateTimeFormatter.ofPattern("d MMM HH:mm", java.util.Locale("es", "SV")).withZone(java.time.ZoneId.of("America/El_Salvador"))
internal fun localTime(iso: String) = runCatching { timeFormat.format(java.time.Instant.parse(iso)) }.getOrDefault(iso)
private val clockFormat = java.time.format.DateTimeFormatter.ofPattern("HH:mm").withZone(java.time.ZoneId.of("America/El_Salvador"))
/** Time of a bitácora step: only «14:05» today, the day too («3 nov 14:05») otherwise. */
internal fun clockTime(iso: String): String = runCatching {
    val at = java.time.Instant.parse(iso)
    val zone = java.time.ZoneId.of("America/El_Salvador")
    if (at.atZone(zone).toLocalDate() == java.time.LocalDate.now(zone)) clockFormat.format(at) else timeFormat.format(at)
}.getOrDefault(iso)
