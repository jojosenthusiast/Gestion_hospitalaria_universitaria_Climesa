@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class, androidx.compose.foundation.layout.ExperimentalLayoutApi::class)

package sv.edu.catolica.climesa.ui

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.location.LocationManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Map
import androidx.compose.material.icons.filled.MyLocation
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material.icons.filled.Send
import androidx.compose.material.icons.filled.Description
import androidx.compose.material3.FilterChip
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import java.net.URLEncoder
import java.time.Instant
import kotlinx.coroutines.delay
import sv.edu.catolica.climesa.R
import sv.edu.catolica.climesa.domain.AccessProfile
import sv.edu.catolica.climesa.domain.AmbulanceLabels
import sv.edu.catolica.climesa.domain.AmbulanceLogEntry
import sv.edu.catolica.climesa.domain.AmbulanceRules
import sv.edu.catolica.climesa.domain.AmbulanceService
import sv.edu.catolica.climesa.domain.AndroidSection
import sv.edu.catolica.climesa.domain.ParamedicRules

private enum class ParamedicSheet { NONE, PREHOSPITAL, UNIDENTIFIED }

/**
 * Inicio del paramédico (A70, A71, A72, A73): una sola pantalla con el estado de la unidad, el servicio en curso, UN botón
 * grande para el siguiente hito y accesos rápidos al reporte prehospital y al paciente sin identidad. Las secciones viejas
 * (Servicio, Reporte, Paciente) caen aquí y abren la hoja que les toca.
 */
@Composable
fun ParamedicScreen(section: AndroidSection, profile: AccessProfile, accountId: String, modifier: Modifier = Modifier) {
    val model: AmbulanceViewModel = viewModel(key = "ambulance-$accountId")
    val state by model.state.collectAsStateWithLifecycle()
    var sheet by rememberSaveable(section) {
        mutableStateOf(when (section) {
            AndroidSection.PREHOSPITAL_REPORT -> ParamedicSheet.PREHOSPITAL
            AndroidSection.UNIDENTIFIED_PATIENT -> ParamedicSheet.UNIDENTIFIED
            else -> ParamedicSheet.NONE
        }.name)
    }
    LaunchedEffect(Unit) { model.clearMessages(); model.open(AmbulanceMode.PARAMEDIC) }
    LaunchedEffect(profile.channels) { model.startLive(profile.channels) }
    // Solo repinta el «hace X min»; no consulta nada a la red.
    val now by produceState(Instant.now()) { while (true) { delay(30_000); value = Instant.now() } }
    val status = state.status
    val service = status?.activeService
    val canPlan = "turnos.planificar" in profile.permissions
    PageList(modifier) {
        item {
            SectionIntro(
                eyebrow = status?.let { stringResource(R.string.par_eyebrow, it.unit.plate) } ?: stringResource(R.string.amb_eyebrow),
                title = stringResource(if (service != null) R.string.par_titulo_activo else R.string.par_titulo_libre),
                detail = service?.let { stringResource(R.string.par_despachado) + " " + ParamedicRules.elapsed(ParamedicRules.elapsedMinutes(it.dispatchedAt, now)).replaceFirstChar { c -> c.lowercase() } },
            )
        }
        state.formError?.let { item { NoticeBanner(NoticeKind.ERROR, it) } }
        state.notice?.let { item { NoticeBanner(NoticeKind.SUCCESS, it) } }
        state.queued?.let { item { NoticeBanner(NoticeKind.WARNING, stringResource(R.string.amb_en_cola)) } }
        when {
            state.loading && status == null -> item { LoadingState() }
            state.error != null && status == null -> item { ErrorState(state.error, onRetry = { model.open(AmbulanceMode.PARAMEDIC) }) }
            status == null -> Unit
            else -> {
                unitCard(state, canPlan)
                if (service != null) activeService(service, state, model, now, sheetOpen = { sheet = it.name }, locationFix = model::sendLocation, locationFail = model::reportLocationUnavailable)
                else idle(state.log)
            }
        }
    }
    when (ParamedicSheet.valueOf(sheet)) {
        ParamedicSheet.PREHOSPITAL -> ModalBottomSheet(onDismissRequest = { sheet = ParamedicSheet.NONE.name }) { PrehospitalSheet(state, model, service, close = { sheet = ParamedicSheet.NONE.name }) }
        ParamedicSheet.UNIDENTIFIED -> ModalBottomSheet(onDismissRequest = { sheet = ParamedicSheet.NONE.name }) { UnidentifiedSheet(state, model, close = { sheet = ParamedicSheet.NONE.name }) }
        ParamedicSheet.NONE -> Unit
    }
}

/** Estado de la unidad con el porqué del bloqueo (RN-30) y qué hacer. */
private fun LazyListScope.unitCard(state: AmbulanceUiState, canPlan: Boolean) {
    val status = state.status ?: return
    item {
        SectionCard(status.unit.plate, eyebrow = stringResource(R.string.op_amb_unidad), action = { OperacionStatusTag(status.unit.state, label = AmbulanceLabels.unitState(status.unit.state)) }) {
            Text(
                stringResource(if (status.paramedicOnDuty) R.string.par_turno_si else R.string.par_turno_no),
                style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(
                stringResource(if (status.driverOnDuty) R.string.par_motorista_si else R.string.par_motorista_no),
                style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            status.dispatchBlock?.let { block ->
                NoticeBanner(NoticeKind.WARNING, stringResource(R.string.par_bloqueo_titulo) + ". " + block.message + " " + ParamedicRules.blockGuidance(block.code, canPlan))
            }
        }
    }
}

private fun LazyListScope.activeService(
    service: AmbulanceService, state: AmbulanceUiState, model: AmbulanceViewModel, now: Instant,
    sheetOpen: (ParamedicSheet) -> Unit, locationFix: (Double, Double) -> Unit, locationFail: () -> Unit,
) {
    item {
        val (done, total) = ParamedicRules.progress(service)
        SectionCard(
            "${AmbulanceLabels.type(service.type)} · ${stringResource(R.string.amb_prioridad)} ${AmbulanceLabels.priority(service.priority)}",
            eyebrow = stringResource(R.string.unidad_servicio_activo),
            action = { StatusTag("en_curso") },
        ) {
            LabeledValue(stringResource(R.string.par_origen), service.origin)
            LabeledValue(stringResource(R.string.par_destino), service.destination)
            LabeledValue(stringResource(R.string.par_paciente), ParamedicRules.patientLabel(state.provisional?.record, service.hasPrehospital))
            LinearProgressIndicator(progress = { done / total.toFloat() }, modifier = Modifier.fillMaxWidth())
            Text(stringResource(R.string.par_avance, done.coerceAtMost(total), total), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(
                ParamedicRules.locationAge(service.lastLocation, now)?.let { stringResource(R.string.par_ubicacion_ultima, it.replaceFirstChar { c -> c.lowercase() }) } ?: stringResource(R.string.par_ubicacion_ninguna),
                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
    item { NextStepButton(service, state.busy, model) }
    item {
        SectionCard(stringResource(R.string.par_acciones)) {
            Column(verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                SecondaryButton(stringResource(R.string.par_reporte), { sheetOpen(ParamedicSheet.PREHOSPITAL) }, icon = Icons.Default.Description)
                SecondaryButton(stringResource(R.string.par_sin_identidad), { sheetOpen(ParamedicSheet.UNIDENTIFIED) }, icon = Icons.Default.PersonAdd)
                LocationButton(state.busy, locationFix, locationFail)
                OpenMap(service.origin)
            }
        }
    }
}

/** El único botón grande: siguiente hito en orden, con confirmación; terminar sin traslado va aparte con motivo (RN-32). */
@Composable
private fun NextStepButton(service: AmbulanceService, busy: Boolean, model: AmbulanceViewModel) {
    val next = ParamedicRules.primaryStep(service)
    var confirming by rememberSaveable(service.id, next) { mutableStateOf(false) }
    var finishing by rememberSaveable(service.id) { mutableStateOf(false) }
    Column(verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
        if (next != null) {
            val early = next == "finalizado" && AmbulanceRules.finishNeedsReason(service)
            PrimaryButton(
                ParamedicRules.stepLabel(next), { if (early) finishing = true else confirming = true },
                Modifier.heightIn(min = 72.dp), enabled = !busy, loading = busy,
            )
        }
        if (ParamedicRules.canFinishEarly(service)) SecondaryButton(stringResource(R.string.amb_terminar_sin_traslado), { finishing = true }, enabled = !busy)
    }
    if (confirming && next != null) {
        ConfirmDialog(
            title = ParamedicRules.stepLabel(next), confirmLabel = stringResource(R.string.par_confirmar), busy = busy,
            message = ParamedicRules.confirmMessage(next),
            onConfirm = { confirming = false; model.advance(service, next, notice = "Registrado: ${ParamedicRules.stepLabel(next)}.") },
            onDismiss = { confirming = false },
        )
    }
    if (finishing) {
        var finalState by rememberSaveable { mutableStateOf(AmbulanceLabels.earlyFinalStates.first().first) }
        var reason by rememberSaveable { mutableStateOf("") }
        ConfirmDialog(
            title = stringResource(R.string.amb_terminar_sin_traslado), confirmLabel = stringResource(R.string.amb_finalizar), destructive = true, busy = busy,
            onConfirm = { finishing = false; model.advance(service, "finalizado", finalState, reason) }, onDismiss = { finishing = false },
            body = {
                Column(verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                    Choices(AmbulanceLabels.earlyFinalStates, finalState) { finalState = it }
                    FormField(stringResource(R.string.amb_motivo), reason, { reason = it.take(500) }, singleLine = false)
                }
            },
        )
    }
}

/** Un punto GPS del teléfono; pide el permiso la primera vez. Sin GPS lo dice, no falla en silencio. */
@SuppressLint("MissingPermission")
@Composable
private fun LocationButton(busy: Boolean, onFix: (Double, Double) -> Unit, onFail: () -> Unit) {
    val context = LocalContext.current
    fun send() {
        val manager = context.getSystemService(Context.LOCATION_SERVICE) as? LocationManager
        val point = runCatching { manager?.getProviders(true).orEmpty().mapNotNull { manager?.getLastKnownLocation(it) }.maxByOrNull { it.time } }.getOrNull()
        if (point == null) onFail() else onFix(point.latitude, point.longitude)
    }
    val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted -> if (granted) send() else onFail() }
    SecondaryButton(stringResource(R.string.par_ubicacion), {
        if (context.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) send() else permission.launch(Manifest.permission.ACCESS_FINE_LOCATION)
    }, icon = Icons.Default.MyLocation, enabled = !busy)
}

/** Sin servicio: la unidad ya está arriba; aquí van los últimos servicios. */
private fun LazyListScope.idle(log: List<AmbulanceLogEntry>) {
    item { EmptyState(stringResource(R.string.par_titulo_libre), detail = stringResource(R.string.par_libre_detalle), icon = Icons.Default.MyLocation) }
    item { Text(stringResource(R.string.par_ultimos), style = MaterialTheme.typography.titleMedium) }
    if (log.isEmpty()) item { Text(stringResource(R.string.par_sin_ultimos), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
    else {
        items(log.take(3), key = { it.id }) { entry ->
            SectionCard("${AmbulanceLabels.type(entry.type)} · ${AmbulanceLabels.priority(entry.priority)}", eyebrow = localTime(entry.dispatchedAt), action = { OperacionStatusTag(entry.finalState ?: "en_curso", label = AmbulanceLabels.finalState(entry.finalState)) }) {
                Text("${entry.origin} → ${entry.destination}", style = MaterialTheme.typography.bodyMedium)
            }
        }
        item { Text(stringResource(R.string.par_ver_todos), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
    }
}

@Composable
private fun SheetColumn(content: @Composable () -> Unit) {
    Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(horizontal = Spacing.page).padding(bottom = Spacing.xl), verticalArrangement = Arrangement.spacedBy(Spacing.sm + Spacing.xs)) { content() }
}

/** Reporte estructurado: motivo, prioridad, minutos con un toque y signos opcionales. Sin señal queda en cola en el teléfono. */
@Composable
private fun PrehospitalSheet(state: AmbulanceUiState, model: AmbulanceViewModel, service: AmbulanceService?, close: () -> Unit) {
    val form = state.prehospital
    var sending by remember { mutableStateOf(false) }
    LaunchedEffect(state.busy, state.formError, state.queued, sending) {
        if (sending && !state.busy) { sending = false; if (state.formError == null) close() }
    }
    SheetColumn {
        Text(stringResource(R.string.par_reporte), style = MaterialTheme.typography.titleLarge)
        state.formError?.let { NoticeBanner(NoticeKind.ERROR, it) }
        state.queued?.let { NoticeBanner(NoticeKind.WARNING, stringResource(R.string.amb_en_cola)); SecondaryButton(stringResource(R.string.camas_reintentar), { model.retryQueued() }, enabled = !state.busy) }
        state.provisional?.let { NoticeBanner(NoticeKind.INFO, stringResource(R.string.amb_provisional_vinculara, it.record)) }
        if (service == null) { Text(stringResource(R.string.unidad_sin_servicio)); return@SheetColumn }
        FormField(stringResource(R.string.amb_motivo), form.reason, { model.updatePrehospital(form.copy(reason = it.take(500))) }, singleLine = false)
        Text(stringResource(R.string.amb_prioridad), style = MaterialTheme.typography.labelLarge)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
            AmbulanceLabels.priorities.forEach { (value, label) -> FilterChip(selected = form.priority == value, onClick = { model.updatePrehospital(form.copy(priority = value)) }, label = { Text(label) }, modifier = Modifier.heightIn(min = 48.dp)) }
        }
        Text(stringResource(R.string.par_eta_titulo), style = MaterialTheme.typography.labelLarge)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
            ParamedicRules.etaChoices.forEach { minutes ->
                FilterChip(selected = form.etaMinutes == minutes.toString(), onClick = { model.updatePrehospital(form.copy(etaMinutes = if (form.etaMinutes == minutes.toString()) "" else minutes.toString())) }, label = { Text(stringResource(R.string.par_eta_min, minutes)) }, modifier = Modifier.heightIn(min = 48.dp))
            }
        }
        Text(stringResource(R.string.par_signos), style = MaterialTheme.typography.labelLarge)
        NumberField(stringResource(R.string.amb_fc), form.heartRate) { model.updatePrehospital(form.copy(heartRate = it)) }
        NumberField(stringResource(R.string.amb_pas), form.systolic) { model.updatePrehospital(form.copy(systolic = it)) }
        NumberField(stringResource(R.string.amb_pad), form.diastolic) { model.updatePrehospital(form.copy(diastolic = it)) }
        NumberField(stringResource(R.string.amb_spo2), form.oxygenSaturation) { model.updatePrehospital(form.copy(oxygenSaturation = it)) }
        NumberField(stringResource(R.string.amb_temperatura), form.temperature, decimal = true) { model.updatePrehospital(form.copy(temperature = it)) }
        NumberField(stringResource(R.string.amb_glasgow), form.glasgow) { model.updatePrehospital(form.copy(glasgow = it)) }
        PrimaryButton(stringResource(R.string.amb_enviar_reporte), { sending = true; model.sendPrehospital(service.id) }, icon = Icons.Default.Send, enabled = state.queued == null, loading = state.busy)
    }
}

/** Paciente sin identidad: sexo observado, edad estimada y señas; nunca se inventan nombre ni fecha (D-004). */
@Composable
private fun UnidentifiedSheet(state: AmbulanceUiState, model: AmbulanceViewModel, close: () -> Unit) {
    var sex by rememberSaveable { mutableStateOf("no_registrado") }
    var age by rememberSaveable { mutableStateOf("") }
    var description by rememberSaveable { mutableStateOf("") }
    SheetColumn {
        Text(stringResource(R.string.par_sin_identidad), style = MaterialTheme.typography.titleLarge)
        val provisional = state.provisional
        if (provisional != null) {
            NoticeBanner(NoticeKind.SUCCESS, stringResource(R.string.amb_provisional_vinculara, provisional.record))
            PrimaryButton(stringResource(R.string.par_cerrar), close)
            return@SheetColumn
        }
        state.formError?.let { NoticeBanner(NoticeKind.ERROR, it) }
        Text(stringResource(R.string.par_sexo), style = MaterialTheme.typography.labelLarge)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
            listOf("femenino" to "Femenino", "masculino" to "Masculino", "indeterminado" to "Indeterminado", "no_registrado" to "No registrado").forEach { (value, label) ->
                FilterChip(selected = sex == value, onClick = { sex = value }, label = { Text(label) }, modifier = Modifier.heightIn(min = 48.dp))
            }
        }
        NumberField(stringResource(R.string.amb_edad_estimada), age) { age = it.take(3) }
        FormField(stringResource(R.string.amb_senas), description, { description = it.take(500) }, singleLine = false)
        PrimaryButton(stringResource(R.string.amb_crear_provisional), { model.registerUnidentified(sex, age, description) }, icon = Icons.Default.PersonAdd, loading = state.busy)
    }
}
