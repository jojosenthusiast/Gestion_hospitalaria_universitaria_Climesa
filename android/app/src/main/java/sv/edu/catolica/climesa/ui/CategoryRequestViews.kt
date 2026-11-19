@file:OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
package sv.edu.catolica.climesa.ui

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AccessibilityNew
import androidx.compose.material.icons.outlined.Air
import androidx.compose.material.icons.outlined.ChildCare
import androidx.compose.material.icons.outlined.Healing
import androidx.compose.material.icons.outlined.Hearing
import androidx.compose.material.icons.outlined.Memory
import androidx.compose.material.icons.outlined.PregnantWoman
import androidx.compose.material.icons.outlined.Psychology
import androidx.compose.material.icons.outlined.Send
import sv.edu.catolica.climesa.ui.icons.ClimesaIcons
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.foundation.layout.heightIn
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.path
import androidx.compose.foundation.layout.Spacer
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import sv.edu.catolica.climesa.R
import sv.edu.catolica.climesa.domain.AppointmentAgenda
import sv.edu.catolica.climesa.domain.AppointmentRequestCards
import sv.edu.catolica.climesa.domain.AppointmentDoctor
import sv.edu.catolica.climesa.domain.CategoryRequest
import sv.edu.catolica.climesa.domain.CategoryRef
import sv.edu.catolica.climesa.domain.CategoryRequestRules
import sv.edu.catolica.climesa.domain.CategoryTone
import sv.edu.catolica.climesa.domain.RequestFranja
import sv.edu.catolica.climesa.domain.matchesQuery

/** Stable icon keys of `atencion.categoria_cita.icono` mapped to Material icons; unknown keys fall back to a generic one. */
internal fun categoryIcon(key: String): ImageVector = when (key) {
    "general" -> ClimesaIcons.Building
    "nino" -> Icons.Outlined.ChildCare
    "mujer" -> Icons.Outlined.PregnantWoman
    "corazon" -> ClimesaIcons.Heart
    "hueso" -> Icons.Outlined.AccessibilityNew
    "piel" -> ClimesaIcons.User
    "ojo" -> ClimesaIcons.Eye
    "oido" -> Icons.Outlined.Hearing
    "mente" -> Icons.Outlined.Psychology
    "neuro" -> Icons.Outlined.Memory
    // Lote 5 S6: the fork and knife read as "comida"; the stomach says "Estómago e intestinos".
    "digestivo" -> StomachIcon
    "rinon" -> ClimesaIcons.Drop
    "alergia" -> Icons.Outlined.Air
    "cirugia" -> Icons.Outlined.Healing
    else -> ClimesaIcons.Steth
}

/** Strong (icon) and soft (background) colours of a category tone, taken from the existing theme tokens. */
@Composable
internal fun categoryColors(tone: CategoryTone): Pair<Color, Color> {
    val c = MaterialTheme.climesa
    val s = MaterialTheme.system
    return when (tone) {
        CategoryTone.SLATE -> c.blocked to c.blockedSoft
        CategoryTone.AMBER, CategoryTone.ORANGE -> c.warning to c.warningSoft
        CategoryTone.MAGENTA -> s.areaEmg to s.areaEmgSoft
        CategoryTone.RED -> c.danger to c.dangerSoft
        CategoryTone.BLUE -> c.process to c.processSoft
        CategoryTone.TEAL -> s.areaCon to s.areaConSoft
        CategoryTone.PURPLE -> c.reserved to c.reservedSoft
        CategoryTone.INDIGO -> s.areaLab to s.areaLabSoft
        CategoryTone.GREEN -> c.success to c.successSoft
        CategoryTone.CYAN -> s.areaHos to s.areaHosSoft
    }
}

/**
 * Quiet body-part marks of an appointment that came from a request by reason, next to the patient's name. Each mark
 * carries the category name as its content description, so colour is never the only signal; [showNames] also writes it.
 * Draws nothing when the appointment has no categories (booked directly by reception).
 */
@Composable
internal fun CategoryMarks(categories: List<CategoryRef>, modifier: Modifier = Modifier, showNames: Boolean = false) {
    if (categories.isEmpty()) return
    FlowRow(modifier, horizontalArrangement = Arrangement.spacedBy(4.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        categories.forEach { category ->
            val (strong, soft) = categoryColors(CategoryRequestRules.tone(category.icon))
            Row(Modifier.clip(CircleShape).background(soft).padding(horizontal = if (showNames) 8.dp else 4.dp, vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                Icon(categoryIcon(category.icon), contentDescription = if (showNames) null else category.name, Modifier.size(14.dp), tint = strong)
                if (showNames) Text(category.name, style = MaterialTheme.typography.labelSmall, color = strong)
            }
        }
    }
}

/** A1: the web pairs (pendiente waits, asignada is called, rechazada and cancelada are closed) through the shared table. */
@Composable
private fun RequestStateTag(state: String) {
    val (value, label) = CategoryRequestRules.status(state)
    StatusTag(value, label = label)
}

/** A06 Android: the patient asks by reason (one to three categories with icon and search), time of day and note; the doctor is optional. */
@Composable
internal fun CategoryRequestForm(state: CategoryRequestsState, model: CategoryRequestsViewModel, doctors: List<AppointmentDoctor>, modifier: Modifier = Modifier) {
    var doctorOpen by rememberSaveable { mutableStateOf(state.preferredDoctorId != null) }
    var doctorQuery by rememberSaveable { mutableStateOf("") }
    PageList(modifier) {
        item { SectionIntro("Paciente / Atención", stringResource(R.string.cat_pedir_cita), stringResource(R.string.cat_form_detalle)) }
        state.error?.let { item { NoticeBanner(NoticeKind.ERROR, it) } }
        item {
            SectionCard(stringResource(R.string.cat_motivo_titulo)) {
                Text(stringResource(R.string.cat_motivo_ayuda, state.picked.size), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                LiveSearchField(state.query, model::search, stringResource(R.string.cat_buscar))
                val visible = state.visibleCategories
                if (visible.isEmpty()) Text(stringResource(R.string.cat_sin_coincidencias), style = MaterialTheme.typography.bodySmall)
                // Lote 5 S16: the reasons grouped by body, internal, mind, senses and general, each section with its title.
                sv.edu.catolica.climesa.domain.CategoryGroups.sections(visible).forEach { section ->
                    Text(section.group.title, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.climesa.primaryText, modifier = Modifier.padding(top = Spacing.xs).semantics { heading() })
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                        section.categories.forEach { category ->
                            val selected = category.code in state.picked
                            val full = !selected && state.picked.size >= CategoryRequestRules.MAX_CATEGORIES
                            ClimesaFilterChip(
                                selected = selected, onClick = { model.toggle(category.code) }, enabled = !full,
                                label = { Text(category.name) },
                                leadingIcon = { Icon(categoryIcon(category.icon), contentDescription = null, modifier = Modifier.size(FilterChipDefaults.IconSize)) },
                                modifier = Modifier.semantics { contentDescription = "${category.name}: ${category.description}" },
                            )
                        }
                    }
                }
            }
        }
        item {
            SectionCard(stringResource(R.string.cat_franja)) {
                ChipRow(RequestFranja.entries.map { Triple(it, it.label, null) }, state.franja, model::franja)
            }
        }
        item { FormField(stringResource(R.string.cat_nota), state.note, model::note, singleLine = false, hint = stringResource(R.string.cat_nota_contador, state.note.length)) }
        item {
            SectionCard(stringResource(R.string.cat_ya_tengo_medico)) {
                val chosen = doctors.firstOrNull { it.id == state.preferredDoctorId }
                when {
                    chosen != null -> Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) { Text(chosen.name, style = MaterialTheme.typography.titleSmall); chosen.specialty?.let { Text(it, style = MaterialTheme.typography.bodySmall) } }
                        TextButton(shape = ButtonShape, onClick = { model.preferredDoctor(null) }) { Text(stringResource(R.string.cat_medico_quitar)) }
                    }
                    !doctorOpen -> TextButton(shape = ButtonShape, onClick = { doctorOpen = true }) { Text(stringResource(R.string.cat_ya_tengo_medico)) }
                    else -> {
                        LiveSearchField(doctorQuery, { doctorQuery = it.take(80) }, stringResource(R.string.cat_medico_preferido))
                        if (doctorQuery.isNotBlank()) doctors.filter { matchesQuery(doctorQuery, it.name, it.specialty) }.take(6).forEach { d ->
                            TextButton(shape = ButtonShape, onClick = { model.preferredDoctor(d.id); doctorQuery = "" }, modifier = Modifier.fillMaxWidth()) {
                                Column(Modifier.fillMaxWidth()) { Text(d.name, style = MaterialTheme.typography.titleSmall); Text(d.specialty ?: "Medicina general", style = MaterialTheme.typography.bodySmall) }
                            }
                        }
                    }
                }
            }
        }
        item { PrimaryButton(stringResource(R.string.cat_enviar), model::send, icon = Icons.Outlined.Send, enabled = state.canSend, loading = state.saving) }
        item { SecondaryButton(stringResource(R.string.ui_cancelar), model::closeForm, icon = ClimesaIcons.Close, enabled = !state.saving) }
    }
}

/** The patient's own requests with their state; "Retirar solicitud" only when the server allows it. */
@Composable
internal fun MyCategoryRequests(requests: List<CategoryRequest>, busy: Boolean, onWithdraw: (CategoryRequest) -> Unit, error: String? = null) {
    var confirm by rememberSaveable { mutableStateOf<String?>(null) }
    var resolvedOpen by rememberSaveable { mutableStateOf(false) }
    // Pending requests stay in view; assigned, rejected or withdrawn ones fold under one line.
    val (pending, resolved) = requests.partition { it.pending }
    SectionCard(stringResource(R.string.cat_mis_solicitudes)) {
        @Composable fun RequestRow(r: CategoryRequest) {
            Column {
                DataRow(r.categoryNames, subtitle = listOfNotNull(r.franja.label, r.note).joinToString(" · "), leadingIcon = categoryIcon(r.categories.firstOrNull()?.icon.orEmpty()), status = { RequestStateTag(r.state) }, container = false)
                r.appointment?.let { Text(stringResource(R.string.cat_asignada_detalle, it.doctorName, formatShort(it.start)), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary) }
                r.rejectionReason?.takeIf { it.isNotBlank() }?.let { Text(stringResource(R.string.pac_motivo_rechazo, it), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                if (r.allows(CategoryRequestRules.CANCEL)) CrudButton(CrudKind.Deactivate, stringResource(R.string.cat_retirar), { confirm = r.id }, enabled = !busy, fill = false)
            }
        }
        pending.forEach { RequestRow(it) }
        if (resolved.isNotEmpty()) {
            TextButton(shape = ButtonShape, onClick = { resolvedOpen = !resolvedOpen }, modifier = Modifier.heightIn(min = Spacing.touch)) {
                Text(stringResource(if (resolvedOpen) R.string.pac_solicitudes_ocultar_resueltas else R.string.pac_solicitudes_ver_resueltas, resolved.size))
            }
            if (resolvedOpen) resolved.forEach { RequestRow(it) }
        }
    }
    requests.firstOrNull { it.id == confirm }?.let { r ->
        ConfirmDialog(stringResource(R.string.cat_retirar), stringResource(R.string.cat_retirar), { onWithdraw(r) }, { confirm = null },
            message = stringResource(R.string.cat_retirar_mensaje), destructive = true, busy = busy, error = error, onDone = { confirm = null })
    }
}

/**
 * W28 on Android, owner batch 5 (S6): the pending-assignment inbox as a vertical list of request cards. Each card reads in
 * order of importance: the patient's name, the reasons (icon and name), the note, «Para» (the time of day asked for) and
 * «Pedida» (how long ago), and the record number last. The state is a full-width strip right above the buttons, with
 * «Asignar» (solid primary) at the bottom left and «Rechazar» (red outline) at the bottom right. Two columns from 600dp.
 */
@Composable
internal fun CategoryRequestInbox(state: CategoryRequestsState, model: CategoryRequestsViewModel, columns: Int = 1) {
    var rejecting by rememberSaveable { mutableStateOf<String?>(null) }
    Column(verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
            Text(stringResource(R.string.cat_bandeja_titulo), Modifier.weight(1f, fill = false), style = MaterialTheme.typography.titleMedium)
            StatusTag("en_espera", label = state.inbox.size.toString())
        }
        Text(stringResource(R.string.cat_bandeja_detalle), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        if (state.inbox.isEmpty()) Text(stringResource(R.string.cat_bandeja_vacia), style = MaterialTheme.typography.bodyMedium)
        // A4: how long each request has waited, read when the inbox is drawn (every realtime reload redraws it; no timers).
        val now = System.currentTimeMillis()
        // The open assign panel takes the whole width; the other cards keep the grid.
        state.inbox.chunked(columns.coerceAtLeast(1)).forEach { row ->
            if (row.any { state.assigning?.id == it.id } && row.size > 1) row.forEach { r -> RequestCard(r, state, model, now, { rejecting = it }) }
            else Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                row.forEach { r -> RequestCard(r, state, model, now, { rejecting = it }, Modifier.weight(1f)) }
                repeat(columns - row.size) { Spacer(Modifier.weight(1f)) }
            }
        }
    }
    state.inbox.firstOrNull { it.id == rejecting }?.let { r ->
        var reason by rememberSaveable(r.id) { mutableStateOf("") }
        var other by rememberSaveable(r.id) { mutableStateOf(false) }
        val templates = sv.edu.catolica.climesa.domain.AppointmentReasons.requestReject
        ConfirmDialog(stringResource(R.string.cat_rechazar_titulo), stringResource(R.string.cat_rechazar_titulo), { model.reject(r, reason) }, { rejecting = null },
            message = "${r.patientName} · ${r.categoryNames}", destructive = true, busy = state.saving, error = state.error, onDone = { rejecting = null },
            confirmEnabled = CategoryRequestRules.rejectError(reason) == null,
            body = {
                // A2: the frequent reasons are templates; "Otro" opens the text.
                ReasonChips(templates, if (other) sv.edu.catolica.climesa.domain.AppointmentReasons.OTHER else reason.takeIf { it in templates }, { picked ->
                    other = picked == sv.edu.catolica.climesa.domain.AppointmentReasons.OTHER
                    reason = if (other) "" else picked
                }, enabled = !state.saving, other = sv.edu.catolica.climesa.domain.AppointmentReasons.OTHER)
                if (other) FormField(stringResource(R.string.cat_rechazar_motivo), reason, { reason = it.take(500) }, singleLine = false)
            })
    }
}

/** One request of the inbox (S6), see [CategoryRequestInbox]. While it is being assigned, the panel replaces its buttons. */
@Composable
private fun RequestCard(r: CategoryRequest, state: CategoryRequestsState, model: CategoryRequestsViewModel, now: Long, onReject: (String) -> Unit, modifier: Modifier = Modifier) {
    val assigning = state.assigning?.id == r.id
    val noStaff = r.id in state.noStaff
    val actions = if (assigning) emptyList() else buildList {
        // S6 / "never offer what the server refuses": without staff for this reason only "Rechazar" is offered.
        if (r.allows(CategoryRequestRules.ASSIGN) && !noStaff) add(CardAction(stringResource(R.string.cat_asignar), ActionRole.Primary, { model.clearMessages(); model.openAssign(r) }, enabled = !state.saving))
        if (r.allows(CategoryRequestRules.REJECT)) add(CardAction(stringResource(R.string.cat_rechazar), ActionRole.Danger, { model.clearMessages(); onReject(r.id) }, enabled = !state.saving))
    }
    ActionCard(
        actions, modifier,
        status = if (assigning) null else ({ CardStatusStrip(AppointmentRequestCards.stateLabel(r.state), StripTone.Warning, icon = ClimesaIcons.Clock) }),
        footer = if (assigning) ({ AssignPanel(state, model) }) else null,
    ) {
        Text(r.patientName, style = MaterialTheme.typography.titleMedium.copy(fontWeight = androidx.compose.ui.text.font.FontWeight.Bold), maxLines = 2, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis)
        // Lote 5: «34 años · Femenino» right after the name; absent when the API does not send it.
        r.patientSummary?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        // The reason is the icon and its name together, so the picture never has to be guessed.
        CategoryMarks(r.categories, showNames = true)
        r.note?.let { Text("«$it»", style = MaterialTheme.typography.bodyMedium) }
        r.preferredDoctorName?.let { Text(stringResource(R.string.cat_prefiere, it), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
            Icon(ClimesaIcons.Calendar, null, Modifier.size(16.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(AppointmentRequestCards.requestedFor(r.franja), Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
        }
        AppointmentRequestCards.askedAt(r.createdAt, now)?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        AppointmentRequestCards.record(r.record)?.let { Text(it, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        if (noStaff) NoticeBanner(NoticeKind.WARNING, NO_STAFF_TEXT)
        state.error?.takeIf { state.errorRequestId == r.id }?.let { NoticeBanner(NoticeKind.ERROR, it) }
    }
}

@Composable
private fun AssignPanel(state: CategoryRequestsState, model: CategoryRequestsViewModel) {
    val request = state.assigning ?: return
    Column(verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
        Text(stringResource(R.string.cat_asignar_titulo, request.patientName), style = MaterialTheme.typography.titleSmall)
        // A2 (break #6): reception can assign any of the next 7 days, not only today.
        Text(AppointmentAgenda.dayLabel(state.date.toString()), style = MaterialTheme.typography.bodySmall)
        DayChips(state.date, model::selectDate, enabled = !state.saving)
        if (state.searchingDay) Text(stringResource(R.string.rec7_buscando_dia), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        var doctorQuery by rememberSaveable(request.id) { mutableStateOf("") }
        var allDoctors by rememberSaveable(request.id) { mutableStateOf(false) }
        LiveSearchField(doctorQuery, { doctorQuery = it.take(60) }, stringResource(R.string.cat_buscar_medico))
        // R1/R3: doctors with a shift first (suggested ones lead each group), each row with its tag.
        val byShift = sv.edu.catolica.climesa.domain.DoctorShifts.ordered(state.orderedDoctors) { it.hasShift }
        val shown = sv.edu.catolica.climesa.domain.DoctorChoices.visible(byShift, doctorQuery, allDoctors, state.doctor?.id)
        if (shown.isEmpty()) Text(stringResource(R.string.listas_sin_coincidencias), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        shown.forEach { d ->
            DoctorShiftRow(d.name, d.detail, d.hasShift, d.reason, selected = state.doctor?.id == d.id, onPick = { model.pickDoctor(d) },
                extra = if (CategoryRequestRules.isSuggested(request, d)) ({ FamilyBadge(stringResource(R.string.cat_sugerido), null) }) else null)
        }
        val more = sv.edu.catolica.climesa.domain.DoctorChoices.hidden(byShift, doctorQuery, allDoctors)
        if (more > 0) TextButton(shape = ButtonShape, onClick = { allDoctors = true }, modifier = Modifier.heightIn(min = Spacing.touch)) { Text(stringResource(R.string.cat_ver_todos_medicos, more)) }
        when {
            state.doctor == null -> Text(stringResource(R.string.rec_agendar_elige_medico), style = MaterialTheme.typography.bodySmall)
            state.loadingSlots -> LoadingState()
            else -> {
                if (state.visibleSlots.isNotEmpty()) DaySlotGrid(state.visibleSlots, state.slot, model::pickSlot)
                if (state.visibleSlots.none { it.selectable }) NoticeBanner(NoticeKind.INFO, stringResource(R.string.cat_sin_libres_franja))
                if (request.franja != RequestFranja.ANY) TextButton(shape = ButtonShape, onClick = { model.wholeDay(!state.wholeDay) }) {
                    Text(stringResource(if (state.wholeDay) R.string.cat_solo_franja else R.string.cat_ver_todo_dia))
                }
            }
        }
        PrimaryButton(stringResource(R.string.cat_confirmar_cita), model::assign, icon = ClimesaIcons.Check, enabled = state.canAssign, loading = state.saving)
        SecondaryButton(stringResource(R.string.ui_cancelar), model::closeAssign, icon = ClimesaIcons.Close, enabled = !state.saving)
    }
}

/**
 * Stomach outline for the digestive category (Lote 5 S6), drawn like the other outlined icons (24dp grid, 1.8 stroke):
 * the gullet from the top, the J-shaped body and the exit to the intestine at the bottom left.
 */
internal val StomachIcon: ImageVector by lazy {
    ImageVector.Builder("Stomach", 24.dp, 24.dp, 24f, 24f).apply {
        path(
            stroke = androidx.compose.ui.graphics.SolidColor(Color.Black), strokeLineWidth = 1.8f,
            strokeLineCap = androidx.compose.ui.graphics.StrokeCap.Round, strokeLineJoin = androidx.compose.ui.graphics.StrokeJoin.Round,
        ) {
            moveTo(10f, 2f); lineTo(10f, 6f)
            curveTo(10f, 7.6f, 8.6f, 8.4f, 7.4f, 9.4f)
            curveTo(5.4f, 11.1f, 4.9f, 14.2f, 6.4f, 16.5f)
            curveTo(8.1f, 19.1f, 11.6f, 19.9f, 14.6f, 18.9f)
            curveTo(18.4f, 17.6f, 20.4f, 13.8f, 19.6f, 10.2f)
            curveTo(19f, 7.4f, 16.6f, 5.6f, 14.2f, 6f)
            curveTo(12.8f, 6.2f, 12.1f, 7.4f, 12.6f, 8.6f)
            curveTo(13.1f, 9.8f, 14.6f, 10.2f, 15.2f, 11.4f)
            moveTo(6.4f, 16.5f)
            curveTo(5.4f, 17.6f, 4.6f, 19f, 4.2f, 21f)
        }
    }.build()
}
