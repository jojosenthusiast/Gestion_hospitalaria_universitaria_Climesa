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
import androidx.compose.ui.res.pluralStringResource
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
fun ParamedicScreen(section: AndroidSection, profile: AccessProfile, accountId: String, modifier: Modifier = Modifier, onOpenSection: ((AndroidSection) -> Unit)? = null) {
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
    LaunchedEffect(accountId) { model.bindUser(accountId) }
    // A milestone held or queued while the app was in the background goes out when it comes back.
    androidx.lifecycle.compose.LifecycleResumeEffect(Unit) { model.resume(); onPauseOrDispose { } }
    // Solo repinta el «hace X min»; no consulta nada a la red.
    val now by produceState(Instant.now()) { while (true) { delay(30_000); value = Instant.now() } }
    val status = state.status
    // MA-AMB-06: the service as the API will see it once the queued milestones arrive.
    val service = status?.activeService?.let(model::projected)
    val canPlan = "turnos.planificar" in profile.permissions
    PageList(modifier) {
        item {
            // The live "dispatched N min ago" line joins the breadcrumb: the compact header has no description (S1).
            CompactHeader(
                title = stringResource(if (service != null) R.string.par_titulo_activo else R.string.par_titulo_libre),
                breadcrumb = listOfNotNull(
                    status?.let { stringResource(R.string.par_eyebrow, it.unit.plate) } ?: stringResource(R.string.amb_eyebrow),
                    service?.let { stringResource(R.string.par_despachado) + " " + ParamedicRules.elapsed(ParamedicRules.elapsedMinutes(it.dispatchedAt, now)).replaceFirstChar { c -> c.lowercase() } },
                ).joinToString(" · "),
            )
        }
        // D8: with a service running, the messages live under the step button (see [ServiceMessages]) so a new message never
        // pushes the button away from the finger between two milestones.
        if (service == null) item(key = "messages") { ServiceMessages(state, model) }
        when {
            state.loading && status == null -> item { LoadingState() }
            state.error != null && status == null -> item { ErrorState(state.error, onRetry = { model.open(AmbulanceMode.PARAMEDIC) }) }
            status == null -> Unit
            else -> {
                // D118: with a service running, its step button and report actions come first; the unit card goes below.
                if (service != null) {
                    activeService(service, state, model, now, sheetOpen = { sheet = it.name }, locationFix = model::sendLocation, locationFail = model::reportLocationUnavailable)
                    unitCard(state, canPlan, idle = false, profile.permissions, accountId) { model.open(AmbulanceMode.PARAMEDIC) }
                } else {
                    unitCard(state, canPlan, idle = true, profile.permissions, accountId) { model.open(AmbulanceMode.PARAMEDIC) }
                    idle(state.log, onOpenLog = onOpenSection?.let { open -> { open(AndroidSection.LOG) } })
                }
            }
        }
    }
    // S5: the report sheets are crew-only; a deep link from another section opens nothing for the rest.
    // D18/D119: full-height sheets that keep their place with the keyboard open; back asks before dropping typed data.
    when (if (service?.canReport == false) ParamedicSheet.NONE else ParamedicSheet.valueOf(sheet)) {
        // The prehospital draft is kept on the phone, so closing that sheet never loses what was typed.
        ParamedicSheet.PREHOSPITAL -> FormSheet(onDismiss = { sheet = ParamedicSheet.NONE.name }) { PrehospitalSheet(state, model, service, close = { sheet = ParamedicSheet.NONE.name }) }
        ParamedicSheet.UNIDENTIFIED -> UnidentifiedSheetHost(state, model) { sheet = ParamedicSheet.NONE.name }
        ParamedicSheet.NONE -> Unit
    }
}

/** Success, error and queue messages of the paramedic screen, in one block. */
@Composable
private fun ServiceMessages(state: AmbulanceUiState, model: AmbulanceViewModel) {
    Column(verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
        state.formError?.let { NoticeBanner(NoticeKind.ERROR, it) }
        state.notice?.let { NoticeBanner(NoticeKind.SUCCESS, it) }
        state.queued?.let { NoticeBanner(NoticeKind.WARNING, stringResource(R.string.amb_en_cola)) }
        // The milestone in its undo window is not "waiting for signal": it has its own Deshacer row.
        val waiting = state.queuedMilestones.count { it.holdUntil == 0L }
        if (waiting > 0) {
            NoticeBanner(NoticeKind.WARNING, pluralStringResource(R.plurals.par_hitos_en_cola, waiting, waiting))
            SecondaryButton(stringResource(R.string.camas_reintentar), { model.retryMilestones() }, enabled = !state.busy)
        }
    }
}

/** Estado de la unidad con el porqué del bloqueo (RN-30) y qué hacer; D131: la tripulación pone o saca la unidad de mantenimiento. */
private fun LazyListScope.unitCard(state: AmbulanceUiState, canPlan: Boolean, idle: Boolean, permissions: Collection<String>, accountId: String, onSaved: () -> Unit) {
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
            status.dispatchBlock?.takeIf { ParamedicRules.showsDispatchBlock(it.code) }?.let { block ->
                NoticeBanner(NoticeKind.WARNING, stringResource(R.string.par_bloqueo_titulo) + ". " + block.message + " " + ParamedicRules.blockGuidance(block, canPlan))
            }
            if (idle && sv.edu.catolica.climesa.domain.MaintenanceRules.available(permissions, status.unit.state)) {
                val role: RoleViewModel = viewModel(key = "role-$accountId")
                MaintenanceControl(role, status.unit.state, status.unit.version, status.paramedicOnDuty, status.driverOnDuty, onSaved)
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
            AmbulanceLabels.type(service.type),
            eyebrow = stringResource(R.string.unidad_servicio_activo),
            action = { StatusTag("en_curso") },
        ) {
            TriageBadge(service.priority)
            LabeledValue(stringResource(R.string.par_origen), service.origin)
            LabeledValue(stringResource(R.string.par_destino), service.destination)
            LabeledValue(stringResource(R.string.par_paciente), ParamedicRules.patientLabel(state.provisional?.record, service.hasPrehospital, service.patient))
            LinearProgressIndicator(progress = { done / total.toFloat() }, modifier = Modifier.fillMaxWidth())
            Text(stringResource(R.string.par_avance, done.coerceAtMost(total), total), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(
                ParamedicRules.locationAge(service.lastLocation, now)?.let { stringResource(R.string.par_ubicacion_ultima, it.replaceFirstChar { c -> c.lowercase() }) } ?: stringResource(R.string.par_ubicacion_ninguna),
                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
    // S5: a paramedic outside this service's crew follows it read-only; the API would refuse every write.
    if (service.readOnly) item {
        Column(verticalArrangement = Arrangement.spacedBy(Spacing.xs)) {
            ReadOnlyBadge(who = stringResource(R.string.par_solo_lectura_quien), what = stringResource(R.string.par_solo_lectura_que))
            BlockedReason(AmbulanceService.NOT_CREW)
        }
    }
    // D7: a milestone held on the phone shows its Deshacer even before the API knows about it (canUndo is the server's).
    val holding = state.pendingMilestone?.key == service.id
    if (service.canAdvance || service.canUndo || holding) item(key = "next-step") { NextStepButton(service, state.busy, model, state.pendingMilestone, state.formError) }
    item(key = "messages") { ServiceMessages(state, model) }
    item(key = "actions") {
        SectionCard(stringResource(R.string.par_acciones)) {
            Column(verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                if (service.canReport) {
                    SecondaryButton(stringResource(R.string.par_reporte), { sheetOpen(ParamedicSheet.PREHOSPITAL) }, icon = Icons.Default.Description)
                    SecondaryButton(stringResource(R.string.par_sin_identidad), { sheetOpen(ParamedicSheet.UNIDENTIFIED) }, icon = Icons.Default.PersonAdd)
                }
                if (!service.readOnly) LocationButton(state.busy, locationFix, locationFail)
                // D22: the map searches the address with its municipality, so a common street name lands in the right city.
                OpenMap(AmbulanceRules.mapQuery(service.origin, service.municipality))
            }
        }
    }
}

/** El único botón grande: siguiente hito en orden, con confirmación; terminar sin traslado va aparte con motivo (RN-32). */
@Composable
private fun NextStepButton(service: AmbulanceService, busy: Boolean, model: AmbulanceViewModel, pending: PendingUndo?, error: String?) {
    val next = ParamedicRules.primaryStep(service)
    var finishing by rememberSaveable(service.id) { mutableStateOf(false) }
    val sent = remember(service.id) { mutableStateOf(false) }
    // R3 A-19: a rejected "terminar" keeps its dialog, with the chosen state and the reason typed.
    CloseWhenDone(busy, sent, error) { finishing = false }
    Column(verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
        // G4: one tap records the next milestone; for 10 s the button becomes "Deshacer" instead of a confirm dialog.
        // D7/D117: the held milestone is local, so Deshacer is offered for its whole window, large, with the seconds left.
        if (pending != null && pending.key == service.id) {
            val left by produceState(undoSecondsLeft(pending.until, System.currentTimeMillis()), pending) {
                while (value > 0) { delay(250); value = undoSecondsLeft(pending.until, System.currentTimeMillis()) }
            }
            Text(pending.label, style = MaterialTheme.typography.bodyMedium)
            SecondaryButton(
                if (pending.until > 0) stringResource(R.string.par_deshacer_segundos, left) else stringResource(R.string.fila_deshacer),
                { model.undoMilestone() }, Modifier.heightIn(min = 72.dp),
            )
        }
        else if (next != null && service.canAdvance) {
            val early = next == "finalizado" && AmbulanceRules.finishNeedsReason(service)
            PrimaryButton(
                ParamedicRules.stepLabel(next), { if (early) finishing = true else model.advance(service, next, notice = "Registrado: ${ParamedicRules.stepLabel(next)}.", undoable = true) },
                Modifier.heightIn(min = 72.dp), enabled = !busy, loading = busy,
            )
        }
        if (service.canAdvance && ParamedicRules.canFinishEarly(service)) SecondaryButton(stringResource(R.string.amb_terminar_sin_traslado), { finishing = true }, enabled = !busy && pending == null)
    }
    if (finishing) {
        // MA-AMB-03: only the final states the API accepts for the milestones recorded so far.
        val choices = AmbulanceRules.finishOptions(service)
        var finalState by rememberSaveable(service.id, choices.size) { mutableStateOf(choices.first().first) }
        var reason by rememberSaveable { mutableStateOf("") }
        ConfirmDialog(
            title = stringResource(R.string.amb_terminar_sin_traslado), confirmLabel = stringResource(R.string.amb_finalizar), destructive = true, busy = busy, error = error,
            onConfirm = { sent.value = true; model.advance(service, "finalizado", finalState, reason) }, onDismiss = { finishing = false },
            body = {
                Column(verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                    Choices(choices, finalState) { finalState = it }
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
private fun LazyListScope.idle(log: List<AmbulanceLogEntry>, onOpenLog: (() -> Unit)?) {
    item { EmptyState(stringResource(R.string.par_titulo_libre), detail = stringResource(R.string.par_libre_detalle), icon = Icons.Default.MyLocation) }
    item { Text(stringResource(R.string.par_ultimos), style = MaterialTheme.typography.titleMedium) }
    if (log.isEmpty()) item { Text(stringResource(R.string.par_sin_ultimos), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
    else {
        items(log.take(3), key = { it.id }) { entry ->
            SectionCard(AmbulanceLabels.type(entry.type), eyebrow = localTime(entry.dispatchedAt), action = {
                if (entry.administrativeClose) FamilyBadge(AmbulanceLabels.ADMINISTRATIVE_CLOSE, StatusFamily.CERRADO)
                else OperacionStatusTag(entry.finalState ?: "en_curso", label = AmbulanceLabels.finalState(entry.finalState))
            }) {
                TriageBadge(entry.priority)
                Text("${entry.origin} → ${entry.destination}", style = MaterialTheme.typography.bodyMedium)
            }
        }
        // The full log is one tap away (a link to «Bitácora»), not a sentence that names it.
        item { if (onOpenLog != null) SecondaryButton(stringResource(R.string.par_abrir_bitacora), onOpenLog) else Text(stringResource(R.string.par_ver_todos), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
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
    LaunchedEffect(service?.id) { service?.let { model.restorePrehospital(it.id, it.priority) } }
    // D19/D119: each vital sign says what is wrong under itself as soon as it is typed, with the API's range.
    val signErrors = AmbulanceRules.signErrors(form)
    var tried by rememberSaveable { mutableStateOf(false) }
    SheetColumn {
        Text(stringResource(R.string.par_reporte), style = MaterialTheme.typography.titleLarge)
        state.queued?.let { NoticeBanner(NoticeKind.WARNING, stringResource(R.string.amb_en_cola)); SecondaryButton(stringResource(R.string.camas_reintentar), { model.retryQueued() }, enabled = !state.busy) }
        state.provisional?.let { NoticeBanner(NoticeKind.INFO, stringResource(if (it.linked) R.string.amb_provisional_vinculado else R.string.amb_provisional_vinculara, it.record)) }
        if (service == null) { Text(stringResource(R.string.unidad_sin_servicio)); return@SheetColumn }
        FormField(
            stringResource(R.string.amb_motivo), form.reason, { model.updatePrehospital(form.copy(reason = it.take(500)), service?.id) }, singleLine = false,
            error = stringResource(R.string.par_motivo_corto).takeIf { tried && form.reason.trim().length < 5 },
        )
        Text(stringResource(R.string.amb_prioridad), style = MaterialTheme.typography.labelLarge)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
            AmbulanceLabels.priorities.forEach { (value, label) -> StatusFilterChip(form.priority == value, { model.updatePrehospital(form.copy(priority = value), service?.id) }, label, triageTone(value), Modifier.heightIn(min = 48.dp)) }
        }
        Text(stringResource(R.string.par_eta_titulo), style = MaterialTheme.typography.labelLarge)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
            ParamedicRules.etaChoices.forEach { minutes ->
                FilterChip(selected = form.etaMinutes == minutes.toString(), onClick = { model.updatePrehospital(form.copy(etaMinutes = if (form.etaMinutes == minutes.toString()) "" else minutes.toString()), service?.id) }, label = { Text(stringResource(R.string.par_eta_min, minutes)) }, modifier = Modifier.heightIn(min = 48.dp))
            }
        }
        Text(stringResource(R.string.par_signos), style = MaterialTheme.typography.labelLarge)
        NumberField(stringResource(R.string.amb_fc), form.heartRate, error = signErrors["heartRate"]) { model.updatePrehospital(form.copy(heartRate = it), service?.id) }
        NumberField(stringResource(R.string.amb_pas), form.systolic, error = signErrors["systolic"]) { model.updatePrehospital(form.copy(systolic = it), service?.id) }
        NumberField(stringResource(R.string.amb_pad), form.diastolic, error = signErrors["diastolic"]) { model.updatePrehospital(form.copy(diastolic = it), service?.id) }
        NumberField(stringResource(R.string.amb_spo2), form.oxygenSaturation, error = signErrors["oxygenSaturation"]) { model.updatePrehospital(form.copy(oxygenSaturation = it), service?.id) }
        NumberField(stringResource(R.string.amb_temperatura), form.temperature, decimal = true, error = signErrors["temperature"]) { model.updatePrehospital(form.copy(temperature = it), service?.id) }
        NumberField(stringResource(R.string.amb_glasgow), form.glasgow, error = signErrors["glasgow"]) { model.updatePrehospital(form.copy(glasgow = it), service?.id) }
        // S12: the error of the send sits right above its button, not at the top of the sheet out of view.
        state.formError?.let { NoticeBanner(NoticeKind.ERROR, it) }
        PrimaryButton(stringResource(R.string.amb_enviar_reporte), { tried = true; sending = true; model.sendPrehospital(service.id) }, icon = Icons.Default.Send, enabled = state.queued == null && signErrors.isEmpty(), loading = state.busy)
    }
}

/** A73 in a [FormSheet]: typed signs or age ask before being dropped. */
@Composable
private fun UnidentifiedSheetHost(state: AmbulanceUiState, model: AmbulanceViewModel, close: () -> Unit) {
    var sex by rememberSaveable { mutableStateOf("no_registrado") }
    var age by rememberSaveable { mutableStateOf("") }
    var description by rememberSaveable { mutableStateOf("") }
    val dirty = state.provisional == null && (age.isNotBlank() || description.isNotBlank() || sex != "no_registrado")
    FormSheet(onDismiss = close, dirty = dirty) {
        UnidentifiedSheet(state, model, sex, { sex = it }, age, { age = it }, description, { description = it }, close)
    }
}

/** Paciente sin identidad: sexo observado, edad estimada y señas; nunca se inventan nombre ni fecha (D-004). */
@Composable
private fun UnidentifiedSheet(
    state: AmbulanceUiState, model: AmbulanceViewModel,
    sex: String, setSex: (String) -> Unit, age: String, setAge: (String) -> Unit, description: String, setDescription: (String) -> Unit,
    close: () -> Unit,
) {
    SheetColumn {
        Text(stringResource(R.string.par_sin_identidad), style = MaterialTheme.typography.titleLarge)
        val provisional = state.provisional
        if (provisional != null) {
            NoticeBanner(NoticeKind.SUCCESS, stringResource(if (provisional.linked) R.string.amb_provisional_vinculado else R.string.amb_provisional_vinculara, provisional.record))
            PrimaryButton(stringResource(R.string.par_cerrar), close)
            return@SheetColumn
        }
        Text(stringResource(R.string.par_sexo), style = MaterialTheme.typography.labelLarge)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
            listOf("femenino" to stringResource(R.string.par_sexo_femenino), "masculino" to stringResource(R.string.par_sexo_masculino), "indeterminado" to stringResource(R.string.par_sexo_indeterminado), "no_registrado" to stringResource(R.string.rec_no_registrado)).forEach { (value, label) ->
                FilterChip(selected = sex == value, onClick = { setSex(value) }, label = { Text(label) }, modifier = Modifier.heightIn(min = 48.dp))
            }
        }
        val ageError = stringResource(R.string.par_edad_rango).takeIf { age.isNotBlank() && age.toIntOrNull()?.let { it in 0..120 } != true }
        NumberField(stringResource(R.string.amb_edad_estimada), age, error = ageError) { setAge(it.take(3)) }
        FormField(stringResource(R.string.amb_senas), description, { setDescription(it.take(500)) }, singleLine = false)
        state.formError?.let { NoticeBanner(NoticeKind.ERROR, it) }
        PrimaryButton(stringResource(R.string.amb_crear_provisional), { model.registerUnidentified(sex, age, description) }, icon = Icons.Default.PersonAdd, loading = state.busy)
    }
}
