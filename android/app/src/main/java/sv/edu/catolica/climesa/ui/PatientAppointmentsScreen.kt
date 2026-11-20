@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
package sv.edu.catolica.climesa.ui

import androidx.activity.compose.BackHandler

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.heightIn
import sv.edu.catolica.climesa.domain.PatientAppointmentRules
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Cancel
import androidx.compose.material.icons.filled.Send
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import androidx.compose.ui.res.stringResource
import sv.edu.catolica.climesa.R
import sv.edu.catolica.climesa.domain.AppointmentAction
import sv.edu.catolica.climesa.domain.AppointmentActions
import sv.edu.catolica.climesa.domain.AppointmentReasons
import sv.edu.catolica.climesa.domain.PatientAppointment
import sv.edu.catolica.climesa.domain.QuickAction

private val sanSalvador = ZoneId.of("America/El_Salvador")

@Composable
fun PatientAppointmentsScreen(
    permissions: List<String>,
    channels: List<String>,
    modifier: Modifier = Modifier,
    quickAction: QuickAction? = null,
    onQuickActionHandled: () -> Unit = {},
    /** Account linked to its record (`patientId`); without it the API refuses every appointment read and request. */
    linked: Boolean = true,
    model: PatientAppointmentsViewModel = viewModel(),
    requests: CategoryRequestsViewModel = viewModel(),
) {
    val state by model.state.collectAsStateWithLifecycle()
    val requestState by requests.state.collectAsStateWithLifecycle()
    var cancelTarget by rememberSaveable { mutableStateOf<String?>(null) }
    var pastOpen by rememberSaveable { mutableStateOf(false) }
    // "Pedir cita" only for a linked account: unlinked, the API answers 403 "La cuenta no está vinculada".
    val canRequest = linked && "citas.solicitar" in permissions
    if (!linked) {
        PageList(modifier) { item { EmptyState(stringResource(R.string.pac_citas_sin_vincular), detail = stringResource(R.string.pac_citas_sin_vincular_detalle), icon = Icons.Default.CalendarMonth) } }
        return
    }
    LaunchedEffect(Unit) { model.load(); model.startLive(channels); requests.load(withCategories = canRequest); requests.startLive(channels) }
    LaunchedEffect(quickAction) {
        if (quickAction == null) return@LaunchedEffect
        if (quickAction == QuickAction.REQUEST_APPOINTMENT && canRequest) requests.openForm()
        onQuickActionHandled()
    }
    // Fase 2, flow A: the patient asks by reason instead of picking one of every doctor; reception assigns doctor and time.
    BackHandler(enabled = requestState.formOpen) { requests.leaveForm() }
    // A1: "Solicitud enviada" goes away by itself after 5 s (it also goes when leaving the screen).
    LaunchedEffect(requestState.notice) { if (requestState.notice != null) { kotlinx.coroutines.delay(5_000); requests.clearMessages() } }
    LaunchedEffect(requestState.formOpen) { if (requestState.formOpen) model.loadRequestDoctors() }
    if (requestState.formOpen) { CategoryRequestForm(requestState, requests, state.requestDoctors.ifEmpty { state.doctors }, modifier); return }
    val cancelAppointment = state.appointments.firstOrNull { it.id == cancelTarget }

    if (cancelAppointment != null) {
        CancelAppointmentDialog(cancelAppointment, state.saving, state.error, model, onClose = { cancelTarget = null })
    }
    state.rescheduleTarget?.let { RescheduleRequestDialog(it, state, model) }

    PageList(modifier) {
        // S8: «Reintentar» only after the list itself failed to load, through the shared ErrorState (a 403 there is an info
        // state without it). A failed command (cancel, reschedule, doctor list) is a plain notice: reloading would not fix it.
        state.loadError?.let { error -> item { ErrorState(error, onRetry = { model.clearMessages(); model.load() }) } }
        state.error?.let { error -> item { NoticeBanner(NoticeKind.ERROR, error) } }
        state.notice?.let { notice -> item { InlineStatus(notice, Icons.Default.Send) } }
        requestState.error?.let { error -> item { NoticeBanner(NoticeKind.ERROR, error) } }
        requestState.notice?.let { notice -> item { InlineStatus(notice, Icons.Default.Send) } }
        if (canRequest) item {
            CompactHeader("", actions = { PrimaryButton(stringResource(R.string.cat_pedir_cita), { model.clearMessages(); requests.openForm() }, icon = Icons.Default.CalendarMonth, fill = false) })
        }
        if (requestState.requests.isNotEmpty()) item { MyCategoryRequests(requestState.requests, requestState.saving, requests::withdraw, requestState.error) }
        // R3 A-23: the skeleton only stands in for an empty list; a reload keeps the appointments on screen.
        if (state.loading && state.appointments.isEmpty()) {
            item { LoadingState() }
        } else if (state.appointments.isEmpty()) {
            if (state.loadError == null) item { EmptyState("Todavía no tienes citas registradas.") }
        } else {
            if (state.loading) item { RefreshHint() }
            // R3 A-7: upcoming first (soonest on top); past and closed ones folded below with their count.
            val split = PatientAppointmentRules.split(state.appointments, java.time.Instant.now())
            if (split.upcoming.isEmpty()) item { Text(stringResource(R.string.cita_sin_proximas), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
            else item { Text(stringResource(R.string.cita_proximas), style = MaterialTheme.typography.titleSmall) }
            // A5: the next appointment is large on top, with its actions; the rest follow in ascending order.
            split.upcoming.firstOrNull()?.let { next -> item(key = "proxima-${next.id}") { NextAppointmentCard(next, onCancel = { cancelTarget = next.id }, onReschedule = { model.clearMessages(); model.openReschedule(next) }) } }
            // The rest grouped by day ("Mañana · jue 19 nov", "Jue 26 nov"), each card with only its time.
            sv.edu.catolica.climesa.domain.AppointmentAgenda.groupByDay(split.upcoming.drop(1)) { it.start }.forEach { (day, list) ->
                item(key = "dia-$day") { Text(sv.edu.catolica.climesa.domain.AppointmentAgenda.shortDay(day), style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(top = Spacing.sm)) }
                items(list, key = { it.id }) { appointment ->
                    AppointmentCard(appointment, showDay = false, onCancel = { cancelTarget = appointment.id }, onReschedule = { model.clearMessages(); model.openReschedule(appointment) })
                }
            }
            if (split.past.isNotEmpty()) item(key = "pasadas") {
                TextButton(onClick = { pastOpen = !pastOpen }, modifier = Modifier.heightIn(min = Spacing.touch)) {
                    Text(stringResource(if (pastOpen) R.string.cita_ocultar_anteriores else R.string.cita_ver_anteriores, split.past.size))
                }
            }
            if (pastOpen) items(split.past, key = { it.id }) { appointment ->
                AppointmentCard(appointment, onCancel = { cancelTarget = appointment.id }, onReschedule = { model.clearMessages(); model.openReschedule(appointment) })
            }
        }
    }
}

/** A5: "Tu próxima cita", large: day and time, doctor, reason and its actions. */
@Composable
private fun NextAppointmentCard(appointment: PatientAppointment, onCancel: () -> Unit, onReschedule: () -> Unit) {
    Column(Modifier.fillMaxWidth().areaSurface("CON").padding(Spacing.md), verticalArrangement = Arrangement.spacedBy(Spacing.xs)) {
        Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
            Text(stringResource(R.string.rec7_proxima_cita), Modifier.weight(1f), style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
            PatientAppointmentTag(appointment.state)
        }
        Text(sv.edu.catolica.climesa.domain.AppointmentAgenda.shortDay(sv.edu.catolica.climesa.domain.AppointmentAgenda.dayKey(appointment.start)), style = MaterialTheme.typography.titleLarge)
        Text(sv.edu.catolica.climesa.domain.AppointmentAgenda.timeRange(appointment.start, appointment.end), style = MaterialTheme.typography.headlineSmall)
        Text(appointment.doctorName.ifBlank { "Médico asignado" }, style = MaterialTheme.typography.bodyLarge)
        CategoryMarks(appointment.categories, showNames = true)
        appointment.reason?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2) }
        AppointmentDetails(appointment, onCancel, onReschedule)
    }
}

@Composable
private fun AppointmentCard(appointment: PatientAppointment, onCancel: () -> Unit, onReschedule: () -> Unit, showDay: Boolean = true) {
    // R3 A-41: one compact block per appointment (when, who, why) with its state on the right; no labels in capitals.
    SectionCard(appointment.doctorName.ifBlank { "Médico asignado" }, action = { PatientAppointmentTag(appointment.state) }) {
        val time = sv.edu.catolica.climesa.domain.AppointmentAgenda.timeRange(appointment.start, appointment.end)
        Text(if (showDay) "${sv.edu.catolica.climesa.domain.AppointmentAgenda.shortDay(sv.edu.catolica.climesa.domain.AppointmentAgenda.dayKey(appointment.start))} · $time" else time, style = MaterialTheme.typography.bodyLarge)
        CategoryMarks(appointment.categories, showNames = true)
        appointment.reason?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis) }
        AppointmentDetails(appointment, onCancel, onReschedule)
    }
}

/** Deadline, pending change and the actions the server allows, shared by both cards. */
@Composable
private fun AppointmentDetails(appointment: PatientAppointment, onCancel: () -> Unit, onReschedule: () -> Unit) {
    run {
        // CITA-01: the deadline the API gives for cancelling or rescheduling.
        if (appointment.allows(AppointmentAction.CANCEL) || appointment.allows(AppointmentAction.RESCHEDULE)) appointment.cancelableUntil?.let {
            Text(stringResource(R.string.cita_plazo, sv.edu.catolica.climesa.domain.AppointmentAgenda.deadline(it, appointment.start)), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        appointment.reschedule?.let { r ->
            when (r.state) {
                "pendiente" -> NoticeBanner(NoticeKind.INFO, stringResource(R.string.cita_reprog_pendiente, formatAppointmentDateTime(r.start)))
                "rechazada" -> NoticeBanner(NoticeKind.WARNING, r.rejectionReason?.let { stringResource(R.string.cita_reprog_rechazada, it) } ?: stringResource(R.string.cita_reprog_rechazada_sin_motivo))
                else -> Unit
            }
        }
        if (appointment.state == AppointmentActions.RESCHEDULED) Text(stringResource(R.string.cita_reprogramada_a), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Row(horizontalArrangement = Arrangement.spacedBy(Spacing.xs)) {
            PatientActionButton(appointment, AppointmentAction.RESCHEDULE, stringResource(R.string.cita_paciente_reprogramar), onReschedule)
            PatientActionButton(appointment, AppointmentAction.CANCEL, "Cancelar", onCancel)
        }
    }
}

/** R3 A-31: only an action the server allows is shown, as a compact row action; a blocked one is hidden. */
@Composable
private fun PatientActionButton(appointment: PatientAppointment, action: AppointmentAction, label: String, onClick: () -> Unit) {
    if (appointment.allows(action)) RowAction(label, onClick)
}

/** CITA-01 / A4: the patient asks for another free slot of the same doctor in a bottom sheet with day chips. */
@Composable
private fun RescheduleRequestDialog(appointment: PatientAppointment, state: PatientAppointmentsState, model: PatientAppointmentsViewModel) {
    RescheduleSheet(
        title = stringResource(R.string.rec7_reprogramar_titulo), summary = "${appointment.doctorName} · ${formatAppointmentDateTime(appointment.start)}",
        date = state.rescheduleDate, onDate = model::selectRescheduleDate, loading = state.loadingRescheduleSlots, slots = state.rescheduleSlots,
        slot = state.rescheduleSlot, onSlot = model::pickRescheduleSlot, error = state.error, busy = state.saving,
        confirmLabel = stringResource(R.string.rec7_enviar_solicitud), onConfirm = model::reschedule, onDismiss = model::closeReschedule,
        ownStart = appointment.start,
    )
}

@Composable
private fun CancelAppointmentDialog(appointment: PatientAppointment, busy: Boolean, error: String?, model: PatientAppointmentsViewModel, onClose: () -> Unit) {
    // D-8: a quick reason is one tap and needs no typing; only "Otro" asks for text.
    var reason by rememberSaveable(appointment.id) { mutableStateOf("") }
    var other by rememberSaveable(appointment.id) { mutableStateOf(false) }
    ConfirmDialog(
        title = "Cancelar cita",
        confirmLabel = "Confirmar",
        onConfirm = { model.cancel(appointment, reason, other) },
        onDismiss = onClose,
        error = error,
        onDone = onClose,
        message = "${appointment.doctorName} · ${formatAppointmentDateTime(appointment.start)}",
        destructive = true,
        busy = busy,
        confirmEnabled = if (other) reason.trim().length >= AppointmentReasons.OTHER_MIN else reason in AppointmentReasons.patientCancel,
        body = {
            ReasonChips(AppointmentReasons.patientCancel, if (other) AppointmentReasons.OTHER else reason.takeIf { it in AppointmentReasons.patientCancel }, { picked ->
                other = picked == AppointmentReasons.OTHER
                reason = if (other) "" else picked
            }, enabled = !busy, other = AppointmentReasons.OTHER)
            if (other) FormField("Motivo", reason, { reason = it.take(AppointmentActions.REASON_MAX) }, singleLine = false, hint = stringResource(R.string.u5_otro_minimo))
        },
    )
}

/** R4: "Mañana 09:00", "Jue 26 nov, 09:00"; never the year. */
private fun formatAppointmentDateTime(value: String) = runCatching { sv.edu.catolica.climesa.domain.MyShifts.relative(Instant.parse(value), Instant.now()) }.getOrDefault("—")
