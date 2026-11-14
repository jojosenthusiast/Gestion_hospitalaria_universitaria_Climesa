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
fun AmbulanceScreen(section: AndroidSection, profile: AccessProfile, accountId: String, modifier: Modifier = Modifier) {
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
    PageList(modifier) {
        item { SectionIntro(stringResource(R.string.amb_eyebrow), section.label) }
        state.formError?.let { item { NoticeBanner(NoticeKind.ERROR, it) } }
        state.notice?.let { item { NoticeBanner(NoticeKind.SUCCESS, it) } }
        if (state.loading) item { LoadingState() }
        else if (state.error != null) item { ErrorState(state.error, onRetry = { model.open(modeOf(section), readsStatus) }) }
        else when (section) {
            AndroidSection.AMBULANCE_REQUEST -> requestContent(state, model)
            AndroidSection.DISPATCH -> dispatchContent(state, model)
            AndroidSection.SERVICE -> serviceContent(state, model)
            AndroidSection.PREHOSPITAL_REPORT -> prehospitalContent(state, model)
            AndroidSection.UNIDENTIFIED_PATIENT -> item { UnidentifiedForm(state, model) }
            AndroidSection.LOG -> logContent(state, model)
            else -> arrivalContent(state)
        }
    }
}

private fun modeOf(section: AndroidSection) = when (section) {
    AndroidSection.AMBULANCE_REQUEST -> AmbulanceMode.REQUEST
    AndroidSection.LOG -> AmbulanceMode.LOG
    AndroidSection.AMBULANCE_RECEPTION, AndroidSection.AMBULANCE_ARRIVAL -> AmbulanceMode.ARRIVAL
    else -> AmbulanceMode.STATUS
}

/** A09: aviso del 911, solicitud y seguimiento en vivo por el canal propio del paciente. */
private fun LazyListScope.requestContent(state: AmbulanceUiState, model: AmbulanceViewModel) {
    item { NoticeBanner(NoticeKind.WARNING, AmbulanceRules.NOTICE_911) }
    val own = state.ownRequest
    if (own == null) item { RequestForm(state.busy, model) }
    else {
        item {
            SectionCard(stringResource(R.string.amb_solicitud_enviada), action = { StatusPill(stringResource(R.string.amb_por_confirmar), StatusTone.RESERVED) }) {
                Text(stringResource(R.string.amb_por_confirmar_detalle), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        items(own.updates.reversed()) { DataRow(it) }
    }
}

@Composable
private fun RequestForm(busy: Boolean, model: AmbulanceViewModel) {
    var address by rememberSaveable { mutableStateOf("") }
    var municipality by rememberSaveable { mutableStateOf("") }
    var reason by rememberSaveable { mutableStateOf("") }
    var phone by rememberSaveable { mutableStateOf("") }
    SectionCard(stringResource(R.string.amb_enviar_solicitud)) {
        FormField(stringResource(R.string.amb_direccion), address, { address = it.take(300) }, singleLine = false)
        FormField(stringResource(R.string.amb_municipio), municipality, { municipality = it.take(80) })
        FormField(stringResource(R.string.amb_motivo), reason, { reason = it.take(500) }, singleLine = false)
        FormField(stringResource(R.string.amb_telefono), phone, { phone = it.take(20) }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone))
        PrimaryButton(stringResource(R.string.amb_enviar_solicitud), { model.submitRequest(address, municipality, reason, phone) }, icon = Icons.Default.Send, loading = busy)
    }
}

/** Estado grande de la unidad, común a despacho y tripulación. */
private fun LazyListScope.unitHeader(state: AmbulanceUiState) {
    val status = state.status ?: return
    item {
        SectionCard(status.unit.plate, eyebrow = stringResource(R.string.op_amb_unidad), action = { OperacionStatusTag(status.unit.state, label = AmbulanceLabels.unitState(status.unit.state)) }) {
            Text(stringResource(if (status.paramedicOnDuty) R.string.amb_paramedico_si else R.string.amb_paramedico_no), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
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
    items(status.pendingRequests, key = { it.id }) { request -> PendingRequestCard(request, status.unit.state == "disponible" && status.dispatchBlock == null, status.dispatchBlock != null, state.busy, model) }
}

@Composable
private fun PendingRequestCard(request: AmbulanceRequestRow, available: Boolean, hasBlock: Boolean, busy: Boolean, model: AmbulanceViewModel) {
    var dispatching by rememberSaveable(request.id) { mutableStateOf(false) }
    var discarding by rememberSaveable(request.id) { mutableStateOf(false) }
    val waiting = remember(request.createdAt) { runCatching { java.time.Duration.between(java.time.Instant.parse(request.createdAt), java.time.Instant.now()).toMinutes().coerceAtLeast(0) }.getOrDefault(0L) }
    SectionCard(AmbulanceRules.requesterLabel(request), eyebrow = AmbulanceRules.waiting(waiting), action = { StatusPill(stringResource(R.string.amb_por_confirmar), StatusTone.RESERVED) }) {
        Text(request.reason, style = MaterialTheme.typography.bodyMedium)
        LabeledValue(stringResource(R.string.amb_donde), request.address + if (request.municipality.isNotBlank()) " · ${request.municipality}" else "")
        LabeledValue(stringResource(R.string.amb_telefono), request.contactPhone)
        if (request.patientRecord.isNotBlank()) LabeledValue(stringResource(R.string.amb_expediente), request.patientRecord)
        PrimaryButton(stringResource(R.string.amb_despachar), { dispatching = true }, enabled = available && !busy)
        SecondaryButton(stringResource(R.string.amb_descartar), { discarding = true }, enabled = !busy)
        if (!available && !hasBlock) NoticeBanner(NoticeKind.WARNING, stringResource(R.string.amb_unidad_no_disponible))
    }
    if (dispatching) DispatchDialog(busy, onClose = { dispatching = false }) { type, priority, destination -> dispatching = false; model.dispatch(request, type, priority, destination) }
    if (discarding) ReasonDialog(stringResource(R.string.amb_descartar), busy, onClose = { discarding = false }) { reason -> discarding = false; model.discard(request, reason) }
}

@Composable
private fun DispatchDialog(busy: Boolean, onClose: () -> Unit, onConfirm: (String, String, String) -> Unit) {
    var type by rememberSaveable { mutableStateOf(AmbulanceLabels.types.first().first) }
    var priority by rememberSaveable { mutableStateOf("naranja") }
    var destination by rememberSaveable { mutableStateOf("Hospital CLIMESA, emergencia") }
    ConfirmDialog(
        title = stringResource(R.string.amb_despachar), confirmLabel = stringResource(R.string.amb_despachar), onConfirm = { onConfirm(type, priority, destination) }, onDismiss = onClose, busy = busy,
        message = stringResource(R.string.amb_confirmado_telefono),
        body = {
            Column(verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                Choices(AmbulanceLabels.types, type) { type = it }
                Choices(AmbulanceLabels.priorities, priority) { priority = it }
                FormField(stringResource(R.string.amb_destino), destination, { destination = it.take(300) }, singleLine = false)
            }
        },
    )
}

@Composable
private fun ReasonDialog(title: String, busy: Boolean, onClose: () -> Unit, onConfirm: (String) -> Unit) {
    var reason by rememberSaveable { mutableStateOf("") }
    ConfirmDialog(
        title = title, confirmLabel = title, onConfirm = { onConfirm(reason) }, onDismiss = onClose, busy = busy, destructive = true,
        body = { FormField(stringResource(R.string.amb_motivo), reason, { reason = it.take(500) }, singleLine = false) },
    )
}

@Composable
private fun Choices(options: List<Pair<String, String>>, selected: String, onSelect: (String) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) { options.forEach { (value, label) -> FilterChip(selected = selected == value, onClick = { onSelect(value) }, label = { Text(label) }) } }
}

@Composable
private fun ServiceSummary(service: AmbulanceService) {
    SectionCard(
        "${AmbulanceLabels.type(service.type)} · ${stringResource(R.string.amb_prioridad)} ${AmbulanceLabels.priority(service.priority)}",
        eyebrow = stringResource(R.string.unidad_servicio_activo),
        action = { StatusTag("en_curso") },
    ) {
        Text("${service.origin} → ${service.destination}", style = MaterialTheme.typography.bodyMedium)
        HorizontalDivider()
        listOf("salida", "en_escena", "trasladando", "en_hospital", "finalizado").forEach { type ->
            val done = service.milestones.firstOrNull { it.type == type }
            Text("${AmbulanceLabels.milestone(type)}: ${done?.occurredAt?.let(::localTime) ?: stringResource(R.string.amb_pendiente)}", style = MaterialTheme.typography.bodyMedium, color = if (done != null) MaterialTheme.climesa.success else MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

/** A71: hitos con botones grandes; finalizar antes del hospital pide estado final y motivo. */
private fun LazyListScope.serviceContent(state: AmbulanceUiState, model: AmbulanceViewModel) {
    unitHeader(state)
    val service = state.status?.activeService
    if (service == null) { item { EmptyState(stringResource(R.string.unidad_sin_servicio)) }; return }
    item { ServiceSummary(service) }
    item { OpenMap(service.origin) }
    items(service.nextMilestones) { next -> MilestoneButton(service, next, state.busy, model) }
}

@Composable
private fun OpenMap(address: String) {
    val uri = LocalUriHandler.current
    SecondaryButton(stringResource(R.string.amb_abrir_mapa), { runCatching { uri.openUri("geo:0,0?q=" + URLEncoder.encode(address, "UTF-8")) } }, icon = Icons.Default.Map)
}

@Composable
private fun MilestoneButton(service: AmbulanceService, next: String, busy: Boolean, model: AmbulanceViewModel) {
    var finishing by rememberSaveable(service.id, next) { mutableStateOf(false) }
    val early = next == "finalizado" && AmbulanceRules.finishNeedsReason(service)
    PrimaryButton(if (early) stringResource(R.string.amb_terminar_sin_traslado) else AmbulanceLabels.milestone(next), { if (early) finishing = true else model.advance(service, next) }, Modifier.heightIn(min = 64.dp), enabled = !busy)
    if (finishing) {
        var finalState by rememberSaveable { mutableStateOf(AmbulanceLabels.earlyFinalStates.first().first) }
        var reason by rememberSaveable { mutableStateOf("") }
        ConfirmDialog(
            title = stringResource(R.string.amb_terminar_sin_traslado), confirmLabel = stringResource(R.string.amb_finalizar), onConfirm = { finishing = false; model.advance(service, "finalizado", finalState, reason) }, onDismiss = { finishing = false }, busy = busy, destructive = true,
            body = {
                Column(verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                    Choices(AmbulanceLabels.earlyFinalStates, finalState) { finalState = it }
                    FormField(stringResource(R.string.amb_motivo), reason, { reason = it.take(500) }, singleLine = false)
                }
            },
        )
    }
}

/** A72: motivo, signos, prioridad y hora estimada; muestra si quedó en cola sin señal. */
private fun LazyListScope.prehospitalContent(state: AmbulanceUiState, model: AmbulanceViewModel) {
    val service = state.status?.activeService
    state.queued?.let { item { Column(verticalArrangement = Arrangement.spacedBy(Spacing.sm)) { NoticeBanner(NoticeKind.WARNING, stringResource(R.string.amb_en_cola)); SecondaryButton(stringResource(R.string.camas_reintentar), { model.retryQueued() }, icon = Icons.Default.Refresh, enabled = !state.busy) } } }
    if (service == null) { item { EmptyState(stringResource(R.string.unidad_sin_servicio)) }; return }
    state.provisional?.let { item { NoticeBanner(NoticeKind.INFO, stringResource(R.string.amb_provisional_vinculara, it.record)) } }
    item { PrehospitalFormView(state, model, service.id) }
}

@Composable
private fun PrehospitalFormView(state: AmbulanceUiState, model: AmbulanceViewModel, serviceId: String) {
    val form = state.prehospital
    SectionCard(stringResource(R.string.amb_enviar_reporte)) {
        FormField(stringResource(R.string.amb_motivo), form.reason, { model.updatePrehospital(form.copy(reason = it.take(500))) }, singleLine = false)
        Choices(AmbulanceLabels.priorities, form.priority) { model.updatePrehospital(form.copy(priority = it)) }
        NumberField(stringResource(R.string.amb_eta), form.etaMinutes) { model.updatePrehospital(form.copy(etaMinutes = it)) }
        NumberField(stringResource(R.string.amb_fc), form.heartRate) { model.updatePrehospital(form.copy(heartRate = it)) }
        NumberField(stringResource(R.string.amb_pas), form.systolic) { model.updatePrehospital(form.copy(systolic = it)) }
        NumberField(stringResource(R.string.amb_pad), form.diastolic) { model.updatePrehospital(form.copy(diastolic = it)) }
        NumberField(stringResource(R.string.amb_spo2), form.oxygenSaturation) { model.updatePrehospital(form.copy(oxygenSaturation = it)) }
        NumberField(stringResource(R.string.amb_temperatura), form.temperature, decimal = true) { model.updatePrehospital(form.copy(temperature = it)) }
        NumberField(stringResource(R.string.amb_glasgow), form.glasgow) { model.updatePrehospital(form.copy(glasgow = it)) }
        PrimaryButton(stringResource(R.string.amb_enviar_reporte), { model.sendPrehospital(serviceId) }, icon = Icons.Default.Send, enabled = state.queued == null, loading = state.busy)
    }
}

@Composable
private fun NumberField(label: String, value: String, decimal: Boolean = false, onChange: (String) -> Unit) {
    FormField(label, value, { onChange(it.filter { c -> c.isDigit() || (decimal && (c == '.' || c == ',')) }.take(6)) }, keyboardOptions = KeyboardOptions(keyboardType = if (decimal) KeyboardType.Decimal else KeyboardType.Number))
}

/** A73: sexo, edad estimada y señas; no inventa nombre ni fecha de nacimiento. */
@Composable
private fun UnidentifiedForm(state: AmbulanceUiState, model: AmbulanceViewModel) {
    var sex by rememberSaveable { mutableStateOf("no_registrado") }
    var age by rememberSaveable { mutableStateOf("") }
    var description by rememberSaveable { mutableStateOf("") }
    val provisional = state.provisional
    if (provisional != null) {
        SectionCard(stringResource(R.string.amb_provisional_creado), action = { StatusTag("provisional") }) {
            Text(stringResource(R.string.amb_provisional_vinculara, provisional.record), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        return
    }
    SectionCard(stringResource(R.string.amb_crear_provisional)) {
        Choices(listOf("femenino" to "Femenino", "masculino" to "Masculino", "indeterminado" to "Indeterminado", "no_registrado" to "No registrado"), sex) { sex = it }
        NumberField(stringResource(R.string.amb_edad_estimada), age) { age = it.take(3) }
        FormField(stringResource(R.string.amb_senas), description, { description = it.take(500) }, singleLine = false)
        PrimaryButton(stringResource(R.string.amb_crear_provisional), { model.registerUnidentified(sex, age, description) }, icon = Icons.Default.PersonAdd, loading = state.busy)
    }
}

/** A74: servicios con su historia en una frase; búsqueda compacta y filtros en un panel plegable con chips (obs. 8 y 16). */
private fun LazyListScope.logContent(state: AmbulanceUiState, model: AmbulanceViewModel) {
    item { LogToolbar(state.logFilters, model) }
    if (state.log.isEmpty()) { item { EmptyState(stringResource(if (state.logFilters.any) R.string.amb_bitacora_sin_resultados else R.string.amb_bitacora_vacia)) }; return }
    item { Text(stringResource(R.string.amb_servicios_n, state.log.size), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
    items(state.log, key = { it.id }) { entry -> LogCard(entry) }
}

@Composable
private fun LogCard(entry: AmbulanceLogEntry) {
    val final = entry.finalState ?: "en_curso"
    SectionCard("${AmbulanceLabels.type(entry.type)} · ${AmbulanceLabels.priority(entry.priority)}", eyebrow = localTime(entry.dispatchedAt), action = { OperacionStatusTag(final, label = AmbulanceLabels.finalState(entry.finalState)) }) {
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
            Choices(listOf("" to stringResource(R.string.amb_todas)) + AmbulanceLabels.priorities, filters.priority) { model.setLogFilters(filters.copy(priority = it)) }
            Text(stringResource(R.string.amb_estado_final), style = MaterialTheme.typography.labelLarge)
            Choices(listOf("" to stringResource(R.string.amb_todas), "completado" to "Completado") + AmbulanceLabels.earlyFinalStates, filters.finalState) { model.setLogFilters(filters.copy(finalState = it)) }
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

/** A54 y A25: reporte prehospital en vivo; el contenido clínico solo si la API lo entrega. */
private fun LazyListScope.arrivalContent(state: AmbulanceUiState) {
    val view = state.arrival
    if (view == null || view.reports.isEmpty()) { item { EmptyState(stringResource(R.string.amb_sin_reporte), icon = Icons.Default.LocalHospital) }; return }
    if (!view.clinical) item { NoticeBanner(NoticeKind.INFO, stringResource(R.string.amb_sin_relacion)) }
    items(view.reports, key = { it.id }) { report ->
        SectionCard("${stringResource(R.string.amb_prioridad)} ${AmbulanceLabels.priority(report.priority)}", eyebrow = "${stringResource(R.string.amb_capturado)}: ${localTime(report.capturedAt)}") {
            LabeledValue(stringResource(R.string.amb_llegada_estimada), report.estimatedArrival?.let(::localTime) ?: stringResource(R.string.amb_sin_estimar))
            report.reason?.let { LabeledValue(stringResource(R.string.amb_motivo), it) }
            if (report.vitalSigns.isNotEmpty()) {
                HorizontalDivider()
                report.vitalSigns.forEach { (code, value) -> LabeledValue(AmbulanceLabels.sign(code), value) }
            }
        }
    }
}

private val timeFormat = java.time.format.DateTimeFormatter.ofPattern("d MMM HH:mm", java.util.Locale("es", "SV")).withZone(java.time.ZoneId.of("America/El_Salvador"))
private fun localTime(iso: String) = runCatching { timeFormat.format(java.time.Instant.parse(iso)) }.getOrDefault(iso)
