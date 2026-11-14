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
import androidx.compose.material.icons.filled.LocalHospital
import androidx.compose.material.icons.filled.Map
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Send
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
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
import sv.edu.catolica.climesa.domain.AndroidSection

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
    LazyColumn(modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        item { SectionIntro(stringResource(R.string.amb_eyebrow), section.label) }
        state.formError?.let { item { Text(it, color = MaterialTheme.colorScheme.error) } }
        state.notice?.let { item { InlineStatus(it, Icons.Default.Check) } }
        if (state.loading) item { CircularProgressIndicator() }
        else if (state.error != null) item { ClimesaActionGroup { Text(state.error!!, color = MaterialTheme.colorScheme.error); ClimesaButton(stringResource(R.string.camas_reintentar), Icons.Default.Refresh, { model.open(modeOf(section), readsStatus) }, outlined = true) } }
        else when (section) {
            AndroidSection.AMBULANCE_REQUEST -> requestContent(state, model)
            AndroidSection.DISPATCH -> dispatchContent(state, model)
            AndroidSection.SERVICE -> serviceContent(state, model)
            AndroidSection.PREHOSPITAL_REPORT -> prehospitalContent(state, model)
            AndroidSection.UNIDENTIFIED_PATIENT -> item { UnidentifiedForm(state, model) }
            AndroidSection.LOG -> logContent(state)
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
    item { ClimesaCard { Row(Modifier.padding(16.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) { androidx.compose.material3.Icon(Icons.Default.Warning, null, tint = MaterialTheme.colorScheme.error); Text(AmbulanceRules.NOTICE_911, style = MaterialTheme.typography.titleMedium) } } }
    val own = state.ownRequest
    if (own == null) item { RequestForm(state.busy, model) }
    else {
        item { ClimesaCard { Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(stringResource(R.string.amb_solicitud_enviada), style = MaterialTheme.typography.titleMedium)
            Text(stringResource(R.string.amb_por_confirmar), color = MaterialTheme.colorScheme.primary)
            Text(stringResource(R.string.amb_por_confirmar_detalle), style = MaterialTheme.typography.bodySmall)
        } } }
        items(own.updates.reversed()) { Text(it, style = MaterialTheme.typography.bodyMedium) }
    }
}

@Composable
private fun RequestForm(busy: Boolean, model: AmbulanceViewModel) {
    var address by rememberSaveable { mutableStateOf("") }
    var municipality by rememberSaveable { mutableStateOf("") }
    var reason by rememberSaveable { mutableStateOf("") }
    var phone by rememberSaveable { mutableStateOf("") }
    ClimesaActionGroup {
        OutlinedTextField(address, { address = it.take(300) }, label = { Text(stringResource(R.string.amb_direccion)) }, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(municipality, { municipality = it.take(80) }, label = { Text(stringResource(R.string.amb_municipio)) }, modifier = Modifier.fillMaxWidth(), singleLine = true)
        OutlinedTextField(reason, { reason = it.take(500) }, label = { Text(stringResource(R.string.amb_motivo)) }, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(phone, { phone = it.take(20) }, label = { Text(stringResource(R.string.amb_telefono)) }, modifier = Modifier.fillMaxWidth(), singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone))
        ClimesaButton(stringResource(if (busy) R.string.amb_enviando else R.string.amb_enviar_solicitud), Icons.Default.Send, { model.submitRequest(address, municipality, reason, phone) }, enabled = !busy)
    }
}

/** Estado grande de la unidad, común a despacho y tripulación. */
private fun LazyListScope.unitHeader(state: AmbulanceUiState) {
    val status = state.status ?: return
    item { ClimesaCard { Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(status.unit.plate, style = MaterialTheme.typography.labelLarge)
        Text(AmbulanceLabels.unitState(status.unit.state), style = MaterialTheme.typography.headlineSmall, color = MaterialTheme.colorScheme.primary)
        Text(stringResource(if (status.paramedicOnDuty) R.string.amb_paramedico_si else R.string.amb_paramedico_no), style = MaterialTheme.typography.bodySmall)
    } } }
}

/** A36: solicitudes por confirmar, confirmar y despachar o descartar. */
private fun LazyListScope.dispatchContent(state: AmbulanceUiState, model: AmbulanceViewModel) {
    unitHeader(state)
    val status = state.status ?: return
    status.activeService?.let { service -> item { ServiceSummary(service) } }
    item { Text(stringResource(R.string.amb_solicitudes_titulo, status.pendingRequests.size), style = MaterialTheme.typography.titleMedium) }
    if (status.pendingRequests.isEmpty()) item { Text(stringResource(R.string.amb_sin_solicitudes)) }
    items(status.pendingRequests, key = { it.id }) { request -> PendingRequestCard(request, status.unit.state == "disponible", state.busy, model) }
}

@Composable
private fun PendingRequestCard(request: AmbulanceRequestRow, available: Boolean, busy: Boolean, model: AmbulanceViewModel) {
    var dispatching by rememberSaveable(request.id) { mutableStateOf(false) }
    var discarding by rememberSaveable(request.id) { mutableStateOf(false) }
    ClimesaCard { Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(request.address + if (request.municipality.isNotBlank()) " · ${request.municipality}" else "", style = MaterialTheme.typography.titleMedium)
        Text(request.reason, style = MaterialTheme.typography.bodyMedium)
        Text("${stringResource(R.string.amb_telefono)}: ${request.contactPhone}", style = MaterialTheme.typography.bodySmall)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(onClick = { dispatching = true }, enabled = available && !busy) { Text(stringResource(R.string.amb_despachar)) }
            TextButton(onClick = { discarding = true }, enabled = !busy) { Text(stringResource(R.string.amb_descartar)) }
        }
        if (!available) Text(stringResource(R.string.amb_unidad_no_disponible), style = MaterialTheme.typography.bodySmall)
    } }
    if (dispatching) DispatchDialog(busy, onClose = { dispatching = false }) { type, priority, destination -> dispatching = false; model.dispatch(request, type, priority, destination) }
    if (discarding) ReasonDialog(stringResource(R.string.amb_descartar), busy, onClose = { discarding = false }) { reason -> discarding = false; model.discard(request, reason) }
}

@Composable
private fun DispatchDialog(busy: Boolean, onClose: () -> Unit, onConfirm: (String, String, String) -> Unit) {
    var type by rememberSaveable { mutableStateOf(AmbulanceLabels.types.first().first) }
    var priority by rememberSaveable { mutableStateOf("naranja") }
    var destination by rememberSaveable { mutableStateOf("Hospital CLIMESA, emergencia") }
    AlertDialog(onDismissRequest = { if (!busy) onClose() }, title = { Text(stringResource(R.string.amb_despachar)) }, text = { Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(stringResource(R.string.amb_confirmado_telefono), style = MaterialTheme.typography.bodySmall)
        Choices(AmbulanceLabels.types, type) { type = it }
        Choices(AmbulanceLabels.priorities, priority) { priority = it }
        OutlinedTextField(destination, { destination = it.take(300) }, label = { Text(stringResource(R.string.amb_destino)) }, modifier = Modifier.fillMaxWidth())
    } }, confirmButton = { Button(onClick = { onConfirm(type, priority, destination) }, enabled = !busy) { Text(stringResource(R.string.amb_despachar)) } }, dismissButton = { TextButton(onClick = onClose, enabled = !busy) { Text(stringResource(R.string.mantenimiento_cancelar)) } })
}

@Composable
private fun ReasonDialog(title: String, busy: Boolean, onClose: () -> Unit, onConfirm: (String) -> Unit) {
    var reason by rememberSaveable { mutableStateOf("") }
    AlertDialog(onDismissRequest = { if (!busy) onClose() }, title = { Text(title) }, text = { OutlinedTextField(reason, { reason = it.take(500) }, label = { Text(stringResource(R.string.amb_motivo)) }, modifier = Modifier.fillMaxWidth()) },
        confirmButton = { Button(onClick = { onConfirm(reason) }, enabled = !busy) { Text(title) } }, dismissButton = { TextButton(onClick = onClose, enabled = !busy) { Text(stringResource(R.string.mantenimiento_cancelar)) } })
}

@Composable
private fun Choices(options: List<Pair<String, String>>, selected: String, onSelect: (String) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) { options.forEach { (value, label) -> FilterChip(selected = selected == value, onClick = { onSelect(value) }, label = { Text(label) }) } }
}

@Composable
private fun ServiceSummary(service: AmbulanceService) {
    ClimesaCard { Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(stringResource(R.string.unidad_servicio_activo), style = MaterialTheme.typography.labelSmall)
        Text("${AmbulanceLabels.type(service.type)} · ${stringResource(R.string.amb_prioridad)} ${AmbulanceLabels.priority(service.priority)}", style = MaterialTheme.typography.titleMedium)
        Text("${service.origin} → ${service.destination}")
        HorizontalDivider()
        listOf("salida", "en_escena", "trasladando", "en_hospital", "finalizado").forEach { type ->
            val done = service.milestones.firstOrNull { it.type == type }
            Text("${AmbulanceLabels.milestone(type)}: ${done?.occurredAt?.let(::localTime) ?: stringResource(R.string.amb_pendiente)}", color = if (done != null) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant)
        }
    } }
}

/** A71: hitos con botones grandes; finalizar antes del hospital pide estado final y motivo. */
private fun LazyListScope.serviceContent(state: AmbulanceUiState, model: AmbulanceViewModel) {
    unitHeader(state)
    val service = state.status?.activeService
    if (service == null) { item { Text(stringResource(R.string.unidad_sin_servicio)) }; return }
    item { ServiceSummary(service) }
    item { OpenMap(service.origin) }
    items(service.nextMilestones) { next -> MilestoneButton(service, next, state.busy, model) }
}

@Composable
private fun OpenMap(address: String) {
    val uri = LocalUriHandler.current
    ClimesaButton(stringResource(R.string.amb_abrir_mapa), Icons.Default.Map, { runCatching { uri.openUri("geo:0,0?q=" + URLEncoder.encode(address, "UTF-8")) } }, outlined = true)
}

@Composable
private fun MilestoneButton(service: AmbulanceService, next: String, busy: Boolean, model: AmbulanceViewModel) {
    var finishing by rememberSaveable(service.id, next) { mutableStateOf(false) }
    val early = next == "finalizado" && AmbulanceRules.finishNeedsReason(service)
    Button(onClick = { if (early) finishing = true else model.advance(service, next) }, enabled = !busy, modifier = Modifier.fillMaxWidth().heightIn(min = 64.dp)) {
        Text(if (early) stringResource(R.string.amb_terminar_sin_traslado) else AmbulanceLabels.milestone(next), style = MaterialTheme.typography.titleMedium)
    }
    if (finishing) {
        var finalState by rememberSaveable { mutableStateOf(AmbulanceLabels.earlyFinalStates.first().first) }
        var reason by rememberSaveable { mutableStateOf("") }
        AlertDialog(onDismissRequest = { if (!busy) finishing = false }, title = { Text(stringResource(R.string.amb_terminar_sin_traslado)) }, text = { Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Choices(AmbulanceLabels.earlyFinalStates, finalState) { finalState = it }
            OutlinedTextField(reason, { reason = it.take(500) }, label = { Text(stringResource(R.string.amb_motivo)) }, modifier = Modifier.fillMaxWidth())
        } }, confirmButton = { Button(onClick = { finishing = false; model.advance(service, "finalizado", finalState, reason) }, enabled = !busy) { Text(stringResource(R.string.amb_finalizar)) } },
            dismissButton = { TextButton(onClick = { finishing = false }, enabled = !busy) { Text(stringResource(R.string.mantenimiento_cancelar)) } })
    }
}

/** A72: motivo, signos, prioridad y hora estimada; muestra si quedó en cola sin señal. */
private fun LazyListScope.prehospitalContent(state: AmbulanceUiState, model: AmbulanceViewModel) {
    val service = state.status?.activeService
    state.queued?.let { item { ClimesaActionGroup { Text(stringResource(R.string.amb_en_cola), color = MaterialTheme.colorScheme.error); ClimesaButton(stringResource(R.string.camas_reintentar), Icons.Default.Refresh, { model.retryQueued() }, enabled = !state.busy, outlined = true) } } }
    if (service == null) { item { Text(stringResource(R.string.unidad_sin_servicio)) }; return }
    state.provisional?.let { item { InlineStatus(stringResource(R.string.amb_provisional_vinculara, it.record), Icons.Default.PersonAdd) } }
    item { PrehospitalFormView(state, model, service.id) }
}

@Composable
private fun PrehospitalFormView(state: AmbulanceUiState, model: AmbulanceViewModel, serviceId: String) {
    val form = state.prehospital
    ClimesaActionGroup {
        OutlinedTextField(form.reason, { model.updatePrehospital(form.copy(reason = it.take(500))) }, label = { Text(stringResource(R.string.amb_motivo)) }, modifier = Modifier.fillMaxWidth())
        Choices(AmbulanceLabels.priorities, form.priority) { model.updatePrehospital(form.copy(priority = it)) }
        NumberField(stringResource(R.string.amb_eta), form.etaMinutes) { model.updatePrehospital(form.copy(etaMinutes = it)) }
        NumberField(stringResource(R.string.amb_fc), form.heartRate) { model.updatePrehospital(form.copy(heartRate = it)) }
        NumberField(stringResource(R.string.amb_pas), form.systolic) { model.updatePrehospital(form.copy(systolic = it)) }
        NumberField(stringResource(R.string.amb_pad), form.diastolic) { model.updatePrehospital(form.copy(diastolic = it)) }
        NumberField(stringResource(R.string.amb_spo2), form.oxygenSaturation) { model.updatePrehospital(form.copy(oxygenSaturation = it)) }
        NumberField(stringResource(R.string.amb_temperatura), form.temperature, decimal = true) { model.updatePrehospital(form.copy(temperature = it)) }
        NumberField(stringResource(R.string.amb_glasgow), form.glasgow) { model.updatePrehospital(form.copy(glasgow = it)) }
        ClimesaButton(stringResource(if (state.busy) R.string.amb_enviando else R.string.amb_enviar_reporte), Icons.Default.Send, { model.sendPrehospital(serviceId) }, enabled = !state.busy && state.queued == null)
    }
}

@Composable
private fun NumberField(label: String, value: String, decimal: Boolean = false, onChange: (String) -> Unit) {
    OutlinedTextField(value, { onChange(it.filter { c -> c.isDigit() || (decimal && (c == '.' || c == ',')) }.take(6)) }, label = { Text(label) }, modifier = Modifier.fillMaxWidth(), singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = if (decimal) KeyboardType.Decimal else KeyboardType.Number))
}

/** A73: sexo, edad estimada y señas; no inventa nombre ni fecha de nacimiento. */
@Composable
private fun UnidentifiedForm(state: AmbulanceUiState, model: AmbulanceViewModel) {
    var sex by rememberSaveable { mutableStateOf("no_registrado") }
    var age by rememberSaveable { mutableStateOf("") }
    var description by rememberSaveable { mutableStateOf("") }
    val provisional = state.provisional
    if (provisional != null) {
        ClimesaCard { Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(stringResource(R.string.amb_provisional_creado), style = MaterialTheme.typography.titleMedium)
            Text(stringResource(R.string.amb_provisional_vinculara, provisional.record), style = MaterialTheme.typography.bodySmall)
        } }
        return
    }
    ClimesaActionGroup {
        Choices(listOf("femenino" to "Femenino", "masculino" to "Masculino", "indeterminado" to "Indeterminado", "no_registrado" to "No registrado"), sex) { sex = it }
        NumberField(stringResource(R.string.amb_edad_estimada), age) { age = it.take(3) }
        OutlinedTextField(description, { description = it.take(500) }, label = { Text(stringResource(R.string.amb_senas)) }, modifier = Modifier.fillMaxWidth())
        ClimesaButton(stringResource(if (state.busy) R.string.amb_enviando else R.string.amb_crear_provisional), Icons.Default.PersonAdd, { model.registerUnidentified(sex, age, description) }, enabled = !state.busy)
    }
}

/** A74: servicios propios con tiempos (la API filtra por la tripulación de la cuenta). */
private fun LazyListScope.logContent(state: AmbulanceUiState) {
    if (state.log.isEmpty()) { item { Text(stringResource(R.string.amb_bitacora_vacia)) }; return }
    items(state.log, key = { it.id }) { entry -> ClimesaCard { Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text("${AmbulanceLabels.type(entry.type)} · ${AmbulanceLabels.priority(entry.priority)}", style = MaterialTheme.typography.titleMedium)
        Text("${entry.origin} → ${entry.destination}", style = MaterialTheme.typography.bodyMedium)
        Text("${localTime(entry.dispatchedAt)} · ${entry.responseMinutes?.let { stringResource(R.string.amb_respuesta_min, it) } ?: stringResource(R.string.amb_sin_llegada)}", style = MaterialTheme.typography.bodySmall)
        Text(AmbulanceLabels.finalState(entry.finalState), color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.labelLarge)
    } } }
}

/** A54 y A25: reporte prehospital en vivo; el contenido clínico solo si la API lo entrega. */
private fun LazyListScope.arrivalContent(state: AmbulanceUiState) {
    val view = state.arrival
    if (view == null || view.reports.isEmpty()) { item { ClimesaCard { Text(stringResource(R.string.amb_sin_reporte), Modifier.padding(16.dp)) } }; return }
    if (!view.clinical) item { InlineStatus(stringResource(R.string.amb_sin_relacion), Icons.Default.LocalHospital) }
    items(view.reports, key = { it.id }) { report -> ClimesaCard { Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text("${stringResource(R.string.amb_prioridad)} ${AmbulanceLabels.priority(report.priority)}", style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.primary)
        Text("${stringResource(R.string.amb_llegada_estimada)}: ${report.estimatedArrival?.let(::localTime) ?: stringResource(R.string.amb_sin_estimar)}")
        report.reason?.let { Text("${stringResource(R.string.amb_motivo)}: $it") }
        report.vitalSigns.forEach { (code, value) -> Text("${AmbulanceLabels.sign(code)}: $value", style = MaterialTheme.typography.bodySmall) }
        Text("${stringResource(R.string.amb_capturado)}: ${localTime(report.capturedAt)}", style = MaterialTheme.typography.labelSmall)
    } } }
}

private val timeFormat = java.time.format.DateTimeFormatter.ofPattern("d MMM HH:mm", java.util.Locale("es", "SV")).withZone(java.time.ZoneId.of("America/El_Salvador"))
private fun localTime(iso: String) = runCatching { timeFormat.format(java.time.Instant.parse(iso)) }.getOrDefault(iso)
