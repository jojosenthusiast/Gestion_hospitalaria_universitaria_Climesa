@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
package sv.edu.catolica.climesa.ui

import androidx.activity.compose.BackHandler

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import sv.edu.catolica.climesa.R
import sv.edu.catolica.climesa.domain.AppointmentAction
import sv.edu.catolica.climesa.domain.AppointmentReasons
import sv.edu.catolica.climesa.domain.AppointmentActions
import sv.edu.catolica.climesa.domain.PickerPatient
import sv.edu.catolica.climesa.domain.QuickAction
import sv.edu.catolica.climesa.domain.ReceptionAppointment
import sv.edu.catolica.climesa.domain.SchedulingDoctor
import sv.edu.catolica.climesa.domain.DoctorShiftFilter
import sv.edu.catolica.climesa.domain.DoctorShifts
import java.time.Instant
import java.time.ZoneId

private val zone = ZoneId.of("America/El_Salvador")

/** A32 Citas de Recepción: lista de citas y flujo para agendar con búsqueda de paciente, médicos con/sin turno y franjas del día. */
@Composable
fun ReceptionAppointmentsScreen(channels: List<String>, canSchedule: Boolean, modifier: Modifier = Modifier, userId: String? = null, quickAction: QuickAction? = null, onQuickActionHandled: () -> Unit = {}, permissions: Collection<String> = emptyList(), subject: sv.edu.catolica.climesa.domain.QuickSubject? = null, model: ReceptionAppointmentsViewModel = viewModel(), queue: QueueViewModel = viewModel(), actions: AppointmentActionViewModel = viewModel(), requests: CategoryRequestsViewModel = viewModel(), followUps: LabProposalsViewModel = viewModel()) {
    val state by model.state.collectAsStateWithLifecycle()
    val requestState by requests.state.collectAsStateWithLifecycle()
    val followUpState by followUps.state.collectAsStateWithLifecycle()
    // C1: a confirmed follow-up is a new appointment, so the list reloads with it.
    LaunchedEffect(followUpState.notice) { if (followUpState.notice != null) model.load() }
    // Fase 2, flow A: an assigned category request becomes a confirmed appointment, so the list reloads with it.
    LaunchedEffect(requestState.notice) { if (requestState.notice != null) model.load() }
    val actionState by actions.state.collectAsStateWithLifecycle()
    LaunchedEffect(actionState.done) { if (actionState.done != null) model.load() }
    // D-3: a stored "No asistió" (app killed, signal lost) is sent on sign-in and every time the screen comes back.
    LaunchedEffect(userId) { userId?.let(actions::bindUser) }
    androidx.lifecycle.compose.LifecycleResumeEffect(Unit) { actions.resume(); onPauseOrDispose { } }
    AppointmentActionDialog(actionState, actions)
    var query by rememberSaveable { mutableStateOf("") }
    var showPast by rememberSaveable { mutableStateOf(false) }
    // State chips like the web filter, each with the tone of its state badge; "solicitada" keeps the requests filter.
    var stateFilter by rememberSaveable { mutableStateOf<String?>(null) }
    val queueState by queue.state.collectAsStateWithLifecycle()
    val canArrive = "fila.emitir" in permissions
    LaunchedEffect(queueState.arrival) { if (queueState.arrival != null) model.load() }
    // The queue model is shared with Fila: its old messages do not belong here.
    LaunchedEffect(Unit) { queue.clearMessages() }
    LaunchedEffect(Unit) { model.load(); model.startLive(channels); if (canSchedule) { requests.load(); requests.startLive(channels); followUps.load(); followUps.startLive(channels) } }
    LaunchedEffect(quickAction) {
        if (quickAction == null) return@LaunchedEffect
        if (quickAction == QuickAction.SCHEDULE_APPOINTMENT && canSchedule) {
            model.openScheduling()
            // R7 U1 (G2): from the patient record the booking starts with that patient chosen.
            subject?.let { model.pickPatient(sv.edu.catolica.climesa.domain.PickerPatient(it.id, it.detail.orEmpty(), it.name, null)) }
        }
        if (quickAction == QuickAction.REVIEW_REQUESTS) model.showRequests(true)
        onQuickActionHandled()
    }
    BackHandler(enabled = state.scheduling) { model.leaveScheduling() }
    if (state.scheduling) { SchedulingForm(state, model, modifier); return }
    PageList(modifier) {
        state.error?.let { error -> item { ClimesaActionGroup { NoticeBanner(NoticeKind.ERROR, error); SecondaryButton("Reintentar", { model.clearMessages(); model.load() }, icon = Icons.Default.Refresh) } } }
        (actionState.done ?: state.notice)?.let { notice -> item { NoticeBanner(NoticeKind.SUCCESS, notice) } }
        actionState.error?.takeIf { actionState.target == null }?.let { error -> item {
            Column(verticalArrangement = Arrangement.spacedBy(Spacing.xs)) {
                NoticeBanner(NoticeKind.ERROR, error)
                if (actionState.failedNoShow != null) androidx.compose.foundation.layout.Row(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                    RowAction(stringResource(R.string.camas_reintentar), { actions.resume() })
                    RowAction(stringResource(R.string.rec7_descartar), { actions.discardFailedNoShow() })
                }
            }
        } }
        if (canSchedule) item { CompactHeader("", actions = { PrimaryButton(stringResource(R.string.rec_citas_agendar), { model.clearMessages(); model.openScheduling() }, icon = Icons.Default.Add, fill = false) }) }
        if (canSchedule) {
            requestState.error?.let { error -> item { NoticeBanner(NoticeKind.ERROR, error) } }
            requestState.notice?.let { notice -> item { NoticeBanner(NoticeKind.SUCCESS, notice) } }
            // Empty inboxes collapse into one line so the appointment list starts on the first screen.
            val inboxEmpty = requestState.inbox.isEmpty() && !requestState.loading
            val followUpsEmpty = followUpState.proposals.isEmpty() && !followUpState.loading && followUpState.error == null && followUpState.notice == null
            if (!inboxEmpty) item { CategoryRequestInbox(requestState, requests) }
            if (!followUpsEmpty) item { LabProposalInbox(followUpState, followUps) }
            if (inboxEmpty && followUpsEmpty) item { Text(stringResource(R.string.citas_bandejas_al_dia), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        }
        when {
            state.loading && state.appointments.isEmpty() -> item { LoadingState() }
            state.appointments.isEmpty() -> item { EmptyState(stringResource(R.string.rec_citas_vacio), detail = stringResource(R.string.rec_citas_vacio_detalle), icon = Icons.Default.CalendarMonth) }
            else -> {
                val chosen = if (state.requestsOnly) "solicitada" else stateFilter
                val visible = state.appointments.filter { (chosen == null || it.state == chosen) && sv.edu.catolica.climesa.domain.matchesQuery(query, it.patientName, it.doctorName) }
                item { LiveSearchField(query, { query = it }, stringResource(R.string.rec_citas_buscar)) }
                val present = APPOINTMENT_STATES.filter { st -> st == chosen || state.appointments.any { it.state == st } }
                item { ChipRow(listOf(Triple<String?, String, Int?>(null, stringResource(R.string.cita_todas), state.appointments.size)) + present.map { st -> Triple<String?, String, Int?>(st, sv.edu.catolica.climesa.domain.ReceptionAppointmentLabels.state(st) { StatusCatalog.label(it) }, state.appointments.count { it.state == st }) },
                    chosen, { it?.let { st -> ChipTone.of(st) } }) { picked -> stateFilter = picked; model.showRequests(picked == "solicitada") } }
                if (canArrive) queueState.error?.takeIf { queueState.notice == null }?.let { error -> item { NoticeBanner(NoticeKind.ERROR, error) } }
                if (visible.isEmpty()) item { EmptyState(stringResource(R.string.listas_sin_coincidencias), detail = stringResource(R.string.listas_sin_coincidencias_detalle)) }
                // Por día y, dentro del día, por hora: cada cita en una sola línea con su rango "08:00 – 08:20".
                // Past days stay folded behind one button: the list opens on today, where reception works.
                val groups = sv.edu.catolica.climesa.domain.AppointmentAgenda.groupByDay(visible) { it.start }
                val today = sv.edu.catolica.climesa.domain.AppointmentAgenda.dayKey(java.time.Instant.now().toString())
                val pastDays = groups.count { it.first < today }
                val foldPast = !showPast && query.isBlank() && pastDays in 1 until groups.size
                if (foldPast) item { RowAction(stringResource(R.string.citas_ver_dias_anteriores, pastDays), { showPast = true }) }
                groups.filter { !foldPast || it.first >= today }.forEach { (day, rows) ->
                    item(key = "d-$day") { Text(sv.edu.catolica.climesa.domain.AppointmentAgenda.dayLabel(day), style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(top = Spacing.sm)) }
                    items(rows, key = { it.id }) { row ->
                        // D-3: "No asistió" is one tap; the row offers "Deshacer" for 8 s before anything is sent.
                        val pending = actionState.pendingNoShows.firstOrNull { it.key == row.id }
                        if (pending != null) PendingUndoRow(pending.label) { actions.undoNoShow(row.id) }
                        else AppointmentRow(row, arrival = if (canArrive) ArrivalControl(today, queueState, { queue.clearMessages(); queue.registerArrivalFor(row.id, row.patientId, row.patientName.ifBlank { "Paciente" }) }) else null) { action -> if (action == AppointmentAction.NO_SHOW) { actions.markNoShow(row) } else actions.open(row, action) }
                    }
                }
            }
        }
    }
}

/** States offered as chips, in the web order (Próximas/Vencidas/Atendidas first, then the rest). */
private val APPOINTMENT_STATES = listOf("solicitada", "confirmada", "vencida", "atendida", "no_asistio", "reprogramada", "cancelada", "rechazada")

/** D-1 from the row: today's key, the queue counter state and the command that registers the arrival. */
private class ArrivalControl(val today: String, val queue: QueueState, val register: () -> Unit)

/** One appointment: its state, a pending reschedule request, and one button per action the API accepts now (CITA-04). */
@Composable private fun AppointmentRow(a: ReceptionAppointment, arrival: ArrivalControl? = null, onAction: (AppointmentAction) -> Unit) {
    Column {
        DataRow(a.patientName.ifBlank { "Paciente" }, subtitle = "${sv.edu.catolica.climesa.domain.AppointmentAgenda.timeRange(a.start, a.end)} · ${a.doctorName}",
            status = { AppointmentStateTag(a.state) }, titleTrailing = if (a.categories.isEmpty()) null else ({ CategoryMarks(a.categories) }))
        a.pendingReschedule?.let { Text(stringResource(R.string.cita_pide_cambiar, formatShort(it.start)), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary) }
        if (a.state == AppointmentActions.EXPIRED) Text(stringResource(R.string.cita_vencida_detalle), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        if (a.state == AppointmentActions.RESCHEDULED) Text(stringResource(R.string.cita_reprogramada_a), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        // D-1, like the web: "Llegó · CON N" once the arrival issued its number; else "Registrar llegada" on today's confirmed one.
        a.arrival?.let { Text(stringResource(R.string.cita_llego, it.code), style = MaterialTheme.typography.labelLarge, color = MaterialTheme.climesa.success) }
        if (arrival != null && a.canRegisterArrival(arrival.today)) {
            val key = "${QueueViewModel.ARRIVAL}:${a.id}"
            RowAction(stringResource(R.string.u5_registrar_llegada), arrival.register, enabled = !arrival.queue.busy, loading = arrival.queue.busyKey == key)
        }
        arrival?.queue?.arrival?.takeIf { it.appointmentId == a.id }?.let { NoticeBanner(NoticeKind.SUCCESS, it.text) }
        AppointmentActionButtons(AppointmentActions.available(a), AppointmentActions.blocked(a), onAction)
    }
}

/** A change held in its undo window, in the row it changes: what will happen and "Deshacer". */
@Composable internal fun PendingUndoRow(label: String, onUndo: () -> Unit) {
    androidx.compose.foundation.layout.Row(Modifier.fillMaxWidth().padding(vertical = Spacing.xs), verticalAlignment = androidx.compose.ui.Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
        Text(label, Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
        RowAction(stringResource(R.string.fila_deshacer), onUndo)
    }
}

/** Every appointment state, `vencida` (closed) and `reprogramada` (called) included, uses the shared table like the web. */
@Composable internal fun AppointmentStateTag(state: String) = StatusTag(state, label = sv.edu.catolica.climesa.domain.ReceptionAppointmentLabels.state(state) { StatusCatalog.label(it) })

/** Allowed actions as buttons, two per line; blocked ones disabled with the server's reason under them. */
/**
 * Row actions of an appointment (R3 A-15, A-31, A-38): only what the server allows, as compact text actions in one line,
 * never a full-width filled button per row nor a red one. A blocked action is hidden instead of printing the server reason;
 * destructive ones confirm in their dialog, where the red belongs.
 */
@OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable internal fun AppointmentActionButtons(allowed: List<AppointmentAction>, @Suppress("UNUSED_PARAMETER") blocked: List<Pair<AppointmentAction, String>>, onAction: (AppointmentAction) -> Unit) {
    if (allowed.isEmpty()) return
    androidx.compose.foundation.layout.FlowRow(horizontalArrangement = Arrangement.spacedBy(Spacing.xs)) {
        allowed.forEach { action -> RowAction(action.label, { onAction(action) }) }
    }
}

/** Dialog of one appointment command: reason with live counter, or the slot grid of the same doctor for a reschedule. */
@Composable
internal fun AppointmentActionDialog(state: AppointmentActionState, model: AppointmentActionViewModel) {
    val target = state.target ?: return
    val action = state.action ?: return
    // A4/A-5: rescheduling is a bottom sheet with day chips and free slots, never a date picker on top of a dialog.
    if (action == AppointmentAction.RESCHEDULE) {
        RescheduleSheet(
            title = stringResource(R.string.cita_reprogramar_titulo), summary = "${target.patientName.ifBlank { "Paciente" }} · ${formatInstant(target.start)} · ${target.doctorName}",
            date = state.date, onDate = model::selectDate, loading = state.loadingSlots, slots = state.slots, slot = state.slot, onSlot = model::pickSlot,
            error = state.error, busy = state.busy, confirmLabel = action.label, onConfirm = model::submit, onDismiss = model::close,
        )
        return
    }
    val title = when (action) {
        AppointmentAction.CONFIRM -> stringResource(R.string.rec_cita_confirmar_titulo)
        AppointmentAction.REJECT -> stringResource(R.string.rec_cita_rechazar_titulo)
        AppointmentAction.CANCEL -> stringResource(R.string.rec_cita_cancelar_titulo)
        AppointmentAction.RESCHEDULE -> stringResource(R.string.cita_reprogramar_titulo)
        AppointmentAction.NO_SHOW -> stringResource(R.string.cita_no_asistio_titulo)
        AppointmentAction.ACCEPT_RESCHEDULE -> stringResource(R.string.cita_aceptar_reprog_titulo)
        AppointmentAction.REJECT_RESCHEDULE -> stringResource(R.string.cita_rechazar_reprog_titulo)
        AppointmentAction.START_CONSULTATION -> action.label
    }
    val requested = target.reschedule?.takeIf { action == AppointmentAction.ACCEPT_RESCHEDULE || action == AppointmentAction.REJECT_RESCHEDULE }
    ConfirmDialog(
        title = title,
        confirmLabel = action.label,
        onConfirm = model::submit,
        onDismiss = model::close,
        message = "${target.patientName.ifBlank { "Paciente" }} · ${formatInstant(target.start)} · ${target.doctorName}" + (requested?.let { " → " + formatInstant(it.start) } ?: ""),
        dismissLabel = stringResource(R.string.rec_cita_volver),
        destructive = action.needsReason || action == AppointmentAction.CANCEL || action == AppointmentAction.NO_SHOW,
        busy = state.busy,
        confirmEnabled = state.canSubmit,
    ) {
        state.error?.let { NoticeBanner(NoticeKind.ERROR, it) }
        if (action.needsReason) {
            // A4: frequent reasons are one tap; "Otro" opens the text.
            val quick = AppointmentReasons.reception(action)
            var other by rememberSaveable(target.id, action) { mutableStateOf(false) }
            if (quick.isNotEmpty()) ReasonChips(quick, if (other) AppointmentReasons.OTHER else state.reason.takeIf { it in quick }, { picked ->
                other = picked == AppointmentReasons.OTHER
                model.quickReason(if (other) "" else picked)
            }, enabled = !state.busy, other = AppointmentReasons.OTHER)
            if (quick.isEmpty() || other) FormField(stringResource(R.string.rec_cita_motivo), state.reason, model::reason, singleLine = false, enabled = !state.busy, error = state.reasonError, hint = AppointmentActions.counter(state.reason))
        } else if (action == AppointmentAction.NO_SHOW) {
            FormField(stringResource(R.string.cita_comentario), state.reason, model::reason, singleLine = false, enabled = !state.busy, error = state.reasonError, hint = AppointmentActions.counter(state.reason, required = false))
        }
    }
}

@Composable
private fun SchedulingForm(state: ReceptionAppointmentsState, model: ReceptionAppointmentsViewModel, modifier: Modifier) {
    var datePicker by rememberSaveable { mutableStateOf(false) }
    PageList(modifier) {
        item { SectionIntro(stringResource(R.string.rec_citas_eyebrow), stringResource(R.string.rec_citas_agendar), stringResource(R.string.rec_citas_detalle)) }
        state.error?.let { item { NoticeBanner(NoticeKind.ERROR, it) } }
        item { PatientPicker(state, model) }
        item { OutlinedButton(onClick = { datePicker = true }, modifier = Modifier.fillMaxWidth()) { androidx.compose.material3.Icon(Icons.Default.CalendarMonth, null); Spacer(Modifier.padding(4.dp)); Text(stringResource(R.string.rec_agendar_fecha, sv.edu.catolica.climesa.domain.ShortDay.of(state.date, sv.edu.catolica.climesa.domain.ReceptionScheduling.today()))) } }
        item { DoctorPicker(state, model) }
        item { SlotSection(state, model) }
        item { FormField(stringResource(R.string.rec_agendar_motivo), state.reason, model::reason, singleLine = false) }
        item { PrimaryButton(stringResource(R.string.rec_agendar_confirmar), model::confirm, icon = Icons.Default.Check, enabled = state.canConfirm, loading = state.saving) }
        item { SecondaryButton(stringResource(R.string.ui_cancelar), model::closeScheduling, icon = Icons.Default.Close, enabled = !state.saving) }
    }
    if (datePicker) {
        // Material 3 date pickers speak UTC midnight; reading them in El Salvador time picked the day before.
        val picker = rememberDatePickerState(initialSelectedDateMillis = state.date.atStartOfDay(java.time.ZoneOffset.UTC).toInstant().toEpochMilli())
        DatePickerDialog(onDismissRequest = { datePicker = false },
            confirmButton = { TextButton(onClick = { picker.selectedDateMillis?.let { model.selectDate(Instant.ofEpochMilli(it).atZone(java.time.ZoneOffset.UTC).toLocalDate()) }; datePicker = false }) { Text("Aceptar") } },
            dismissButton = { TextButton(onClick = { datePicker = false }) { Text(stringResource(R.string.ui_cancelar)) } }) { DatePicker(state = picker) }
    }
}

/** Búsqueda con espera entre teclas; muestra todas las coincidencias (paginadas) y deja elegir una. */
@Composable
private fun PatientPicker(state: ReceptionAppointmentsState, model: ReceptionAppointmentsViewModel) {
    SectionCard(stringResource(R.string.rec_agendar_paciente)) {
        PatientSearchPicker(state.query, state.results, state.searching, state.hasMore, state.patient, model::query, model::pickPatient, model::moreResults)
    }
}

/** Médicos del día (R1-R3): primero los que tienen turno, cada uno con su etiqueta; «Con turno» oculta a los demás. */
@Composable
private fun DoctorPicker(state: ReceptionAppointmentsState, model: ReceptionAppointmentsViewModel) {
    var filter by rememberSaveable { mutableStateOf(DoctorShiftFilter.WITH_SHIFT) }
    val hasShift: (SchedulingDoctor) -> Boolean = { it.hasShift }
    SectionCard(stringResource(R.string.rec_agendar_medico)) {
        Text(stringResource(R.string.rec_agendar_medico_ayuda), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        if (state.doctors.isNotEmpty()) DoctorShiftChips(DoctorShifts.effective(filter, state.doctors, hasShift), state.doctors.size, DoctorShifts.withShift(state.doctors, hasShift)) { filter = it }
        DoctorShifts.visible(state.doctors, filter, hasShift) { it.id == state.doctor?.id }.forEach { d ->
            DoctorShiftRow(d.name, d.detail, d.hasShift, d.reason, selected = state.doctor?.id == d.id, onPick = { model.pickDoctor(d) })
        }
    }
}

@Composable
private fun SlotSection(state: ReceptionAppointmentsState, model: ReceptionAppointmentsViewModel) {
    SectionCard(stringResource(R.string.rec_agendar_horario)) {
        when {
            state.doctor == null -> Text(stringResource(R.string.rec_agendar_elige_medico), style = MaterialTheme.typography.bodySmall)
            state.loadingSlots -> LoadingState()
            state.slots.isEmpty() -> Text(stringResource(R.string.rec_agendar_sin_franjas), style = MaterialTheme.typography.bodySmall)
            else -> {
                DaySlotGrid(state.slots, state.slot, model::pickSlot)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    FamilyBadge(stringResource(R.string.rec_leyenda_libre), StatusFamily.LISTO); FamilyBadge(stringResource(R.string.rec_leyenda_ocupado), null)
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    FamilyBadge(stringResource(R.string.rec_leyenda_sin_turno), StatusFamily.CERRADO); FamilyBadge(stringResource(R.string.rec_leyenda_pasado), null)
                }
                if (state.slots.none { it.selectable }) NoticeBanner(NoticeKind.INFO, stringResource(R.string.rec_agendar_sin_libres))
            }
        }
    }
}

/** R4: "Mañana 09:00", "Jue 26 nov, 09:00" instead of "26/11 09:00". */
internal fun formatShort(value: String) = runCatching { sv.edu.catolica.climesa.domain.MyShifts.relative(Instant.parse(value), Instant.now()) }.getOrDefault(value)
/** R4: "Hoy 09:00", "Jueves 09:00", "Jue 26 nov, 09:00"; never the year. */
private fun formatInstant(value: String) = runCatching { sv.edu.catolica.climesa.domain.MyShifts.relative(Instant.parse(value), Instant.now()) }.getOrDefault(value)
