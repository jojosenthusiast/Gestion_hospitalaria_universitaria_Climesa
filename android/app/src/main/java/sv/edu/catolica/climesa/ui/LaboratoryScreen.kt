@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
package sv.edu.catolica.climesa.ui

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
    LaunchedEffect(ownResults) { model.path = if (ownResults) "/me/laboratorio" else "/laboratorio/ordenes"; model.load() }
    LaunchedEffect(profile.channels) { model.startLive(profile.channels) }
    val retry = { model.clearMessages(); model.load() }
    PageList(modifier) {
        item { SectionIntro("Atención / Diagnóstico", "Laboratorio", stringResource(if (ownResults) R.string.lab_ayuda_paciente else R.string.lab_ayuda)) }
        state.notice?.let { notice -> item { NoticeBanner(NoticeKind.SUCCESS, notice) } }
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
                items(visible, key = { it.id }) { order -> LaboratoryOrderCard(order, profile, ownResults, state.busy, model, now) }
            }
        }
    }
}

@Composable
private fun LaboratoryOrderCard(order: LaboratoryOrder, profile: AccessProfile, ownView: Boolean, busy: Boolean, model: LaboratoryViewModel, now: Long) {
    val canReview = "laboratorio.revisar" in profile.permissions
    val inReview = order.state == "completado" && !order.reviewed
    SectionCard(
        title = order.patientName,
        eyebrow = stringResource(if (order.priority == "urgente") R.string.lab_prioridad_urgente else R.string.lab_prioridad_rutina),
        action = { LabStagePill(LabWorklist.stage(order)) },
    ) {
        if (!ownView) LabWorkSummary(order, now)
        LabStepper(order, ownView)
        order.items.forEach { item ->
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Spacing.sm), verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                Text("${item.code} · ${item.name}", Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
                val result = item.result
                if (result != null) LabMarkTag(result.mark, LaboratoryLabels.valueAndMark(result))
                else Text(if (inReview) stringResource(R.string.lab_valor_en_revision) else stringResource(R.string.clin_lab_pendiente), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        if (canReview && inReview) PrimaryButton("Revisar", { model.review(order) }, enabled = !busy, loading = busy)
    }
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

/** One tone per stage, the same as the web list: pending amber, in process blue, to review purple, released green. */
@Composable
private fun LabStagePill(stage: LabStage) = StatusPill(
    stage.label,
    when (stage) { LabStage.PENDING -> StatusTone.WARNING; LabStage.IN_PROCESS -> StatusTone.PROCESS; LabStage.TO_REVIEW -> StatusTone.RESERVED; LabStage.RELEASED -> StatusTone.SUCCESS; LabStage.CANCELLED -> StatusTone.BLOCKED },
)

/** Identity (record, age, sex), ordering doctor, elapsed time with its goal colour and the critical-value flag. */
@Composable
private fun LabWorkSummary(order: LaboratoryOrder, now: Long) {
    Column(verticalArrangement = Arrangement.spacedBy(Spacing.xs)) {
        Text(LabWorklist.identityLine(order).ifBlank { stringResource(R.string.lab_sin_datos_expediente) }, style = MaterialTheme.typography.bodyMedium)
        order.doctorName?.let { Text(stringResource(R.string.lab_pidio, it), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        Row(horizontalArrangement = Arrangement.spacedBy(Spacing.sm), verticalAlignment = Alignment.CenterVertically) {
            if (LabWorklist.isUrgent(order)) { Icon(Icons.Default.Warning, null, Modifier.size(18.dp), tint = MaterialTheme.climesa.danger); Text(stringResource(R.string.lab_prioridad_urgente), style = MaterialTheme.typography.labelLarge, color = MaterialTheme.climesa.danger) }
            LabWorklist.elapsedMinutes(order, now)?.let { minutes ->
                Text(stringResource(R.string.lab_espera, elapsedText(minutes)), style = MaterialTheme.typography.labelLarge, color = slaColor(LabWorklist.sla(order, now)))
            }
            if (LabWorklist.isCritical(order)) StatusPill(stringResource(R.string.lab_critico), StatusTone.DANGER)
        }
    }
}
