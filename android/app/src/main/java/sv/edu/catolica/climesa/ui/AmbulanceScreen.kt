@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
package sv.edu.catolica.climesa.ui

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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.FilterList
import androidx.compose.material.icons.filled.LocalHospital
import androidx.compose.material.icons.filled.Map
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Send
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.AssistChip
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
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

/** Secciones de Android de la spec 109 que resuelve [AmbulanceScreen]. A70 (Unidad) sigue en [RolePortal]. */
val ambulanceSections = setOf(
    AndroidSection.AMBULANCE_REQUEST, AndroidSection.DISPATCH, AndroidSection.SERVICE, AndroidSection.PREHOSPITAL_REPORT,
    AndroidSection.UNIDENTIFIED_PATIENT, AndroidSection.LOG, AndroidSection.AMBULANCE_RECEPTION, AndroidSection.AMBULANCE_ARRIVAL,
)

/**
 * A09, A36, A71, A72, A73, A74, A54 y A25. Un solo ViewModel por cuenta para que el paciente provisional (A73) llegue al
 * reporte prehospital (A72) y el reporte en cola sobreviva al cambio de sección y al giro.
 */
@Composable
fun AmbulanceScreen(section: AndroidSection, profile: AccessProfile, accountId: String, modifier: Modifier = Modifier, onOpenSection: ((AndroidSection) -> Unit)? = null) {
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
    // Past days of the log stay folded until opened; the choice survives rotation.
    var pastOpen by rememberSaveable { mutableStateOf(false) }
    PageList(modifier) {
        // G4: the request form and the dispatch dialogs show their own error next to their button.
        if (section != AndroidSection.AMBULANCE_REQUEST && section != AndroidSection.DISPATCH) state.formError?.let { item { NoticeBanner(NoticeKind.ERROR, it) } }
        state.notice?.let { item { NoticeBanner(NoticeKind.SUCCESS, it) } }
        if (state.loading) item { LoadingState() }
        else if (state.error != null) item { ErrorState(state.error, onRetry = { model.open(modeOf(section), readsStatus) }) }
        else when (section) {
            AndroidSection.AMBULANCE_REQUEST -> requestContent(state, model)
            AndroidSection.DISPATCH -> dispatchContent(state, model)
            AndroidSection.LOG -> logContent(state, model, pastOpen) { pastOpen = !pastOpen }
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
    SectionCard(stringResource(R.string.amb_enviar_solicitud)) {
        if (names.isNotEmpty()) NoticeBanner(NoticeKind.INFO, stringResource(R.string.amb_prefill_aviso, names.map { stringResource(it.label()) }.joinToString(stringResource(R.string.ui_y))))
        FormField(stringResource(R.string.amb_motivo), reason, { reason = it.take(500) }, singleLine = false)
        FormField(stringResource(R.string.amb_direccion), address, { address = it.take(300) }, singleLine = false)
        FormField(stringResource(R.string.amb_municipio), municipality, { municipality = it.take(80) })
        FormField(stringResource(R.string.amb_telefono), phone, { phone = it.take(20) }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone))
        error?.let { NoticeBanner(NoticeKind.ERROR, it) }
        // G4: "Enviar" only once the reason says something; what is still missing is said next to the button.
        if (reason.trim().length < AmbulanceRules.REASON_MIN) Text(stringResource(R.string.rec7_amb_falta_motivo), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        PrimaryButton(stringResource(R.string.amb_enviar_solicitud), { model.submitRequest(address, municipality, reason, phone) }, icon = Icons.Default.Send, loading = busy, enabled = reason.trim().length >= AmbulanceRules.REASON_MIN && !busy)
    }
}

private fun RequestField.label(): Int = when (this) {
    RequestField.ADDRESS -> R.string.amb_campo_direccion
    RequestField.PHONE -> R.string.amb_campo_telefono
}

/** Estado grande de la unidad, común a despacho y tripulación. */
private fun LazyListScope.unitHeader(state: AmbulanceUiState) {
    val status = state.status ?: return
    item {
        SectionCard(status.unit.plate, eyebrow = stringResource(R.string.op_amb_unidad), action = { OperacionStatusTag(status.unit.state, label = AmbulanceLabels.unitState(status.unit.state)) }) {
            Text(stringResource(if (status.paramedicOnDuty) R.string.amb_paramedico_si else R.string.amb_paramedico_no), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(stringResource(if (status.driverOnDuty) R.string.amb_motorista_si else R.string.amb_motorista_no), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            if (status.unit.state == "en_mantenimiento") {
                if (status.unit.stateSince.isNotBlank()) Text(stringResource(R.string.amb_estado_desde, localTime(status.unit.stateSince)), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                if (status.unit.stateReason.isNotBlank()) Text(stringResource(R.string.amb_estado_motivo, status.unit.stateReason), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

/** A36: solicitudes por confirmar, confirmar y despachar o descartar. */
private fun LazyListScope.dispatchContent(state: AmbulanceUiState, model: AmbulanceViewModel) {
    unitHeader(state)
    val status = state.status ?: return
    status.activeService?.let { service -> item { ServiceSummary(service) } }
    status.dispatchBlock?.let { block -> item { NoticeBanner(NoticeKind.WARNING, stringResource(R.string.amb_no_despachable) + ". " + block.message + " " + block.action) } }
    item { Text(stringResource(R.string.amb_solicitudes_titulo, status.pendingRequests.size), style = MaterialTheme.typography.titleMedium) }
    if (status.pendingRequests.isEmpty()) item { EmptyState(stringResource(R.string.amb_sin_solicitudes)) }
    // One primary per screen: only the oldest request (the one the unit serves next) gets the filled "Despachar".
    val first = status.pendingRequests.firstOrNull()?.id
    state.formError?.let { item { NoticeBanner(NoticeKind.ERROR, it) } }
    items(status.pendingRequests, key = { it.id }) { request -> PendingRequestCard(request, status.unit.state == "disponible" && status.dispatchBlock == null, status.dispatchBlock != null, state.busy, model, status.availableCrew, primary = request.id == first, error = state.formError) }
}

@Composable
private fun PendingRequestCard(request: AmbulanceRequestRow, available: Boolean, hasBlock: Boolean, busy: Boolean, model: AmbulanceViewModel, crewPool: List<sv.edu.catolica.climesa.domain.CrewCandidate>, primary: Boolean, error: String?) {
    var dispatching by rememberSaveable(request.id) { mutableStateOf(false) }
    var discarding by rememberSaveable(request.id) { mutableStateOf(false) }
    val sent = remember(request.id) { mutableStateOf(false) }
    // G4: a failed dispatch keeps the dialog open with the crew, type and destination chosen, and says why inside it.
    CloseWhenDone(busy, sent, error) { dispatching = false; discarding = false }
    val waiting = remember(request.createdAt) { runCatching { java.time.Duration.between(java.time.Instant.parse(request.createdAt), java.time.Instant.now()).toMinutes().coerceAtLeast(0) }.getOrDefault(0L) }
    SectionCard(AmbulanceRules.requesterLabel(request), eyebrow = AmbulanceRules.waiting(waiting), action = { FamilyBadge(stringResource(R.string.amb_por_confirmar), StatusFamily.ESPERA) }) {
        Text(request.reason, style = MaterialTheme.typography.bodyMedium)
        LabeledValue(stringResource(R.string.amb_donde), request.address + if (request.municipality.isNotBlank()) " · ${request.municipality}" else "")
        LabeledValue(stringResource(R.string.amb_telefono), request.contactPhone)
        if (request.patientRecord.isNotBlank()) LabeledValue(stringResource(R.string.amb_expediente), request.patientRecord)
        if (primary) PrimaryButton(stringResource(R.string.amb_despachar), { dispatching = true }, enabled = available && !busy)
        else SecondaryButton(stringResource(R.string.amb_despachar), { dispatching = true }, enabled = available && !busy)
        SecondaryButton(stringResource(R.string.amb_descartar), { discarding = true }, enabled = !busy)
        if (!available && !hasBlock) NoticeBanner(NoticeKind.WARNING, stringResource(R.string.amb_unidad_no_disponible))
    }
    if (dispatching) DispatchDialog(busy, crewPool, error, onClose = { dispatching = false }) { type, priority, destination, crew -> sent.value = true; model.dispatch(request, type, priority, destination, crew) }
    if (discarding) ReasonDialog(stringResource(R.string.amb_descartar), busy, error, onClose = { discarding = false }) { reason -> sent.value = true; model.discard(request, reason) }
}

@Composable
private fun DispatchDialog(busy: Boolean, crewPool: List<sv.edu.catolica.climesa.domain.CrewCandidate>, error: String?, onClose: () -> Unit, onConfirm: (String, String, String, List<String>) -> Unit) {
    // MA-AMB-02: the dispatcher picks the crew among the staff on duty; it comes proposed (paramedic with account + driver).
    var crew by rememberSaveable { mutableStateOf(AmbulanceRules.defaultCrew(crewPool)) }
    var type by rememberSaveable { mutableStateOf(AmbulanceLabels.types.first().first) }
    var priority by rememberSaveable { mutableStateOf("naranja") }
    var destination by rememberSaveable { mutableStateOf("Hospital CLIMESA, emergencia") }
    ConfirmDialog(
        title = stringResource(R.string.amb_despachar), confirmLabel = stringResource(R.string.amb_despachar), onConfirm = { onConfirm(type, priority, destination, crew) }, onDismiss = onClose, busy = busy, error = error,
        confirmEnabled = AmbulanceRules.crewProblem(crewPool, crew) == null,
        message = stringResource(R.string.amb_confirmado_telefono),
        body = {
            Column(verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                Choices(AmbulanceLabels.types, type) { type = it }
                Choices(AmbulanceLabels.priorities, priority, ::triageTone) { priority = it }
                FormField(stringResource(R.string.amb_destino), destination, { destination = it.take(300) }, singleLine = false)
                Text(stringResource(R.string.amb_tripulacion), style = MaterialTheme.typography.titleSmall)
                if (crewPool.isEmpty()) Text(stringResource(R.string.amb_sin_tripulacion_turno), style = MaterialTheme.typography.bodySmall)
                crewPool.forEach { member ->
                    val label = AmbulanceLabels.crewRole(member.role) + if (member.role == "paramedico" && !member.hasAccount) " · " + stringResource(R.string.amb_sin_cuenta) else ""
                    FilterChip(selected = member.staffId in crew, onClick = { crew = if (member.staffId in crew) crew - member.staffId else crew + member.staffId }, label = { Text("${member.name} · $label") })
                }
                AmbulanceRules.crewProblem(crewPool, crew)?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error) }
            }
        },
    )
}

@Composable
private fun ReasonDialog(title: String, busy: Boolean, error: String?, onClose: () -> Unit, onConfirm: (String) -> Unit) {
    var reason by rememberSaveable { mutableStateOf("") }
    ConfirmDialog(
        title = title, confirmLabel = title, onConfirm = { onConfirm(reason) }, onDismiss = onClose, busy = busy, destructive = true, error = error,
        body = { FormField(stringResource(R.string.amb_motivo), reason, { reason = it.take(500) }, singleLine = false) },
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
        action = { StatusTag("en_curso") },
    ) {
        TriageBadge(service.priority)
        Text("${service.origin} → ${service.destination}", style = MaterialTheme.typography.bodyMedium)
        HorizontalDivider()
        listOf("salida", "en_escena", "trasladando", "en_hospital", "finalizado").forEach { type ->
            val done = service.milestones.firstOrNull { it.type == type }
            Text("${AmbulanceLabels.milestone(type)}: ${done?.occurredAt?.let(::localTime) ?: stringResource(R.string.amb_pendiente)}", style = MaterialTheme.typography.bodyMedium, color = if (done != null) MaterialTheme.climesa.success else MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
internal fun OpenMap(address: String) {
    val uri = LocalUriHandler.current
    SecondaryButton(stringResource(R.string.amb_abrir_mapa), { runCatching { uri.openUri("geo:0,0?q=" + URLEncoder.encode(address, "UTF-8")) } }, icon = Icons.Default.Map)
}

@Composable
internal fun NumberField(label: String, value: String, decimal: Boolean = false, onChange: (String) -> Unit) {
    FormField(label, value, { onChange(it.filter { c -> c.isDigit() || (decimal && (c == '.' || c == ',')) }.take(6)) }, keyboardOptions = KeyboardOptions(keyboardType = if (decimal) KeyboardType.Decimal else KeyboardType.Number))
}

/** A74: servicios con su historia en una frase; búsqueda compacta y filtros en un panel plegable con chips (obs. 8 y 16). */
private fun LazyListScope.logContent(state: AmbulanceUiState, model: AmbulanceViewModel, pastOpen: Boolean, togglePast: () -> Unit) {
    item { LogToolbar(state.logFilters, model) }
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
        entry.milestones.forEach { Text("${AmbulanceLabels.milestone(it.type)}: ${localTime(it.occurredAt)}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.climesa.success) }
        Text(entry.responseMinutes?.let { stringResource(R.string.amb_respuesta_min, it) } ?: stringResource(R.string.amb_sin_llegada), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun LogToolbar(filters: LogFilters, model: AmbulanceViewModel) {
    var open by rememberSaveable { mutableStateOf(false) }
    var query by rememberSaveable { mutableStateOf(filters.query) }
    LaunchedEffect(query) { if (query.trim() != filters.query) { kotlinx.coroutines.delay(300); model.setLogFilters(filters.copy(query = query.trim())) } }
    Column(verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
        FormField(stringResource(R.string.amb_buscar), query, { query = it.take(80) }, hint = stringResource(R.string.amb_buscar_pista))
        SecondaryButton(if (filters.activeCount > 0) stringResource(R.string.amb_filtros_n, filters.activeCount) else stringResource(R.string.amb_filtros), { open = !open }, icon = Icons.Default.FilterList)
        if (open) SectionCard(stringResource(R.string.amb_filtros)) {
            Text(stringResource(R.string.amb_prioridad), style = MaterialTheme.typography.labelLarge)
            Choices(listOf("" to stringResource(R.string.amb_todas)) + AmbulanceLabels.priorities, filters.priority, ::triageTone) { model.setLogFilters(filters.copy(priority = it)) }
            Text(stringResource(R.string.amb_estado_final), style = MaterialTheme.typography.labelLarge)
            Choices(listOf("" to stringResource(R.string.amb_todas), AmbulanceLabels.OPEN to stringResource(R.string.amb_en_curso_filtro), "completado" to StatusCatalog.label("completado")) + AmbulanceLabels.earlyFinalStates, filters.finalState, FilterTones::state) { model.setLogFilters(filters.copy(finalState = it)) }
            Text(stringResource(R.string.amb_tipo), style = MaterialTheme.typography.labelLarge)
            Choices(listOf("" to stringResource(R.string.amb_todas)) + AmbulanceLabels.types, filters.type) { model.setLogFilters(filters.copy(type = it)) }
        }
        if (filters.any) {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                AmbulanceLabels.chips(filters).forEach { (key, label) ->
                    AssistChip(onClick = { model.setLogFilters(when (key) { "priority" -> filters.copy(priority = ""); "finalState" -> filters.copy(finalState = ""); else -> filters.copy(type = "") }) }, label = { Text(label) }, trailingIcon = { androidx.compose.material3.Icon(Icons.Default.Close, contentDescription = null) })
                }
                SecondaryButton(stringResource(R.string.amb_quitar_filtros), { query = ""; model.setLogFilters(LogFilters()) })
            }
        }
    }
}

/** A54 y A25: reporte prehospital en vivo; el contenido clínico solo si la API lo entrega. MA-AMB-04: marcar recibido. */
private fun LazyListScope.arrivalContent(state: AmbulanceUiState, model: AmbulanceViewModel) {
    // MA-AMB-04: a service that arrived without a handover stays listed while the unit is out on another one.
    if (state.arrivals.size > 1) item {
        SectionCard(stringResource(R.string.amb_por_recibir)) {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                state.arrivals.forEach { candidate ->
                    FilterChip(
                        selected = candidate.serviceId == state.arrivalServiceId, onClick = { model.selectArrival(candidate.serviceId) },
                        label = { Text(stringResource(if (candidate.arrived) R.string.amb_llego_sin_entrega else R.string.amb_en_camino, localTime(candidate.dispatchedAt))) },
                    )
                }
            }
        }
    }
    val view = state.arrival
    if (view == null) { item { EmptyState(stringResource(R.string.amb_sin_reporte), icon = Icons.Default.LocalHospital) }; return }
    item { HandoverCard(view, state.busy, model, state.formError) }
    if (view.reports.isEmpty()) { item { EmptyState(stringResource(R.string.amb_sin_reporte), icon = Icons.Default.LocalHospital) }; return }
    if (!view.clinical) item { NoticeBanner(NoticeKind.INFO, stringResource(R.string.amb_sin_relacion)) }
    items(view.reports, key = { it.id }) { report ->
        SectionCard("${stringResource(R.string.amb_prioridad)} ${AmbulanceLabels.priority(report.priority)}", eyebrow = "${stringResource(R.string.amb_capturado)}: ${localTime(report.capturedAt)}") {
            LabeledValue(stringResource(R.string.amb_llegada_estimada), report.estimatedArrival?.let(::localTime) ?: stringResource(R.string.amb_sin_estimar))
            report.reason?.let { LabeledValue(stringResource(R.string.amb_motivo), it) }
            if (report.vitalSigns.isNotEmpty()) {
                HorizontalDivider()
                // G4: two signs per row, the value large with its unit, pressure as one reading.
                AmbulanceLabels.readableSigns(report.vitalSigns).chunked(2).forEach { pair ->
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
            view.canReceive -> PrimaryButton(stringResource(R.string.amb_marcar_recibido), { confirming = true }, icon = Icons.Default.Check, enabled = !busy, loading = busy)
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
