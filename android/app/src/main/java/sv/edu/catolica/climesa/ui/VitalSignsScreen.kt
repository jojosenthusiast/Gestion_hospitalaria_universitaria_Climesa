package sv.edu.catolica.climesa.ui

import androidx.activity.compose.BackHandler
import androidx.annotation.StringRes
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Bed
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.ConfirmationNumber
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material.icons.filled.MonitorHeart
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Save
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.SwapHoriz
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import sv.edu.catolica.climesa.R
import sv.edu.catolica.climesa.domain.AccessProfile
import sv.edu.catolica.climesa.domain.VitalLevel
import sv.edu.catolica.climesa.domain.VitalMeasure
import sv.edu.catolica.climesa.domain.VitalReading
import sv.edu.catolica.climesa.domain.VitalsCandidate
import sv.edu.catolica.climesa.domain.VitalsFormat
import sv.edu.catolica.climesa.domain.VitalsHistory
import sv.edu.catolica.climesa.domain.VitalsRules

/** Labels short enough for a half-width field. */
private fun compact(m: VitalMeasure) = when (m) {
    VitalMeasure.HEART_RATE -> "Frec. cardiaca"
    VitalMeasure.RESPIRATORY_RATE -> "Frec. respiratoria"
    VitalMeasure.SYSTOLIC -> "Sistólica"
    VitalMeasure.DIASTOLIC -> "Diastólica"
    VitalMeasure.OXYGEN -> "SpO2"
    VitalMeasure.PAIN -> "Dolor"
    else -> m.label
}

/** Form rows: two fields per row so the whole capture fits a phone without long scrolling. */
private val formRows = listOf(
    listOf(VitalMeasure.TEMPERATURE, VitalMeasure.HEART_RATE),
    listOf(VitalMeasure.RESPIRATORY_RATE, VitalMeasure.OXYGEN),
    listOf(VitalMeasure.SYSTOLIC, VitalMeasure.DIASTOLIC),
    listOf(VitalMeasure.PAIN, VitalMeasure.GLUCOSE),
    listOf(VitalMeasure.WEIGHT, VitalMeasure.HEIGHT),
)

@Composable
private fun levelColor(level: VitalLevel?): Color = when (level) {
    VitalLevel.CRITICAL -> MaterialTheme.climesa.danger
    VitalLevel.ABNORMAL -> MaterialTheme.climesa.warning
    VitalLevel.NORMAL -> MaterialTheme.climesa.success
    else -> MaterialTheme.colorScheme.onSurfaceVariant
}

private fun levelIcon(level: VitalLevel?): ImageVector = when (level) {
    VitalLevel.CRITICAL -> Icons.Default.ErrorOutline
    VitalLevel.ABNORMAL -> Icons.Default.Warning
    else -> Icons.Default.CheckCircle
}

@Composable
private fun levelWord(level: VitalLevel?): String = stringResource(when (level) {
    VitalLevel.CRITICAL -> R.string.signos_nivel_critico
    VitalLevel.ABNORMAL -> R.string.signos_nivel_alterado
    else -> R.string.signos_nivel_normal
})

private fun levelTone(level: VitalLevel) = when (level) {
    VitalLevel.CRITICAL -> StatusTone.DANGER
    VitalLevel.ABNORMAL -> StatusTone.WARNING
    else -> StatusTone.SUCCESS
}

/**
 * A41 · Signos vitales. Step 1 chooses the patient (ward, queue or search); step 2 shows the patient header, the alerts of the
 * latest take, the capture form (hidden when [readOnly]), the trend per measure and the history.
 */
@Composable
fun VitalSignsScreen(profile: AccessProfile, modifier: Modifier = Modifier, readOnly: Boolean = false, userId: String? = null, model: VitalSignsViewModel = viewModel()) {
    val state by model.state.collectAsStateWithLifecycle()
    LaunchedEffect(userId) { userId?.let(model::bindUser) }
    LaunchedEffect(profile.permissions) { model.loadSources(profile.permissions) }
    LaunchedEffect(profile.channels) { model.startLive(profile.channels) }
    BackHandler(enabled = state.patientId != null) { model.close() }
    PageList(modifier) {
        if (state.patientId == null) {
            item { SectionIntro(stringResource(R.string.signos_eyebrow), stringResource(R.string.signos_titulo_elegir), stringResource(R.string.signos_detalle_elegir)) }
            pickerItems(state, profile, model)
        } else {
            patientItems(state, readOnly, model)
        }
    }
}

private fun androidx.compose.foundation.lazy.LazyListScope.pickerItems(state: VitalSignsState, profile: AccessProfile, model: VitalSignsViewModel) {
    item {
        FormField(stringResource(R.string.signos_buscar), state.query, { model.onQuery(it.take(100)) }, hint = stringResource(R.string.signos_buscar_hint))
    }
    if (state.query.trim().length >= 2) {
        item { Text(stringResource(R.string.signos_resultados), style = MaterialTheme.typography.titleLarge) }
        candidateSection(state.search, model, R.string.signos_buscar_vacio, R.string.signos_buscar_vacio_detalle, Icons.Default.Search, Icons.Default.Person) { model.onQuery(state.query) }
        return
    }
    val hasWard = "admision.ver" in profile.permissions
    val hasQueue = "fila.ver" in profile.permissions
    if (hasWard) {
        item { Text(stringResource(R.string.signos_mi_planta), style = MaterialTheme.typography.titleLarge) }
        candidateSection(state.ward, model, R.string.signos_mi_planta_vacio, R.string.signos_mi_planta_vacio_detalle, Icons.Default.Bed, Icons.Default.Bed) { model.loadSources(profile.permissions) }
    }
    if (hasQueue) {
        item { Text(stringResource(R.string.signos_fila), style = MaterialTheme.typography.titleLarge) }
        candidateSection(state.queue, model, R.string.signos_fila_vacio, R.string.signos_fila_vacio_detalle, Icons.Default.ConfirmationNumber, Icons.Default.ConfirmationNumber) { model.loadSources(profile.permissions) }
    }
    if (!hasWard && !hasQueue) item { EmptyState(stringResource(R.string.signos_sin_fuentes), icon = Icons.Default.Search) }
}

private fun androidx.compose.foundation.lazy.LazyListScope.candidateSection(
    list: CandidateList,
    model: VitalSignsViewModel,
    @StringRes emptyTitle: Int,
    @StringRes emptyDetail: Int,
    emptyIcon: ImageVector,
    rowIcon: ImageVector,
    retry: () -> Unit,
) {
    when {
        list.loading && list.items.isEmpty() -> item { LoadingState() }
        list.error != null && list.items.isEmpty() -> item { ErrorState(list.error, retry) }
        list.items.isEmpty() -> item { EmptyState(stringResource(emptyTitle), detail = stringResource(emptyDetail), icon = emptyIcon) }
        else -> {
            if (list.error != null) item { NoticeBanner(NoticeKind.WARNING, list.error) }
            items(list.items, key = { it.patientId }) { c -> DataRow(c.name, subtitle = c.detail, leadingIcon = rowIcon, onClick = { model.open(c) }) }
        }
    }
}

private fun androidx.compose.foundation.lazy.LazyListScope.patientItems(state: VitalSignsState, readOnly: Boolean, model: VitalSignsViewModel) {
    item { SecondaryButton(stringResource(R.string.signos_cambiar_paciente), model::close, icon = Icons.Default.SwapHoriz) }
    val history = state.history
    if (history == null) {
        val hint = state.patientHint
        item {
            when {
                state.loading -> Column(verticalArrangement = Arrangement.spacedBy(Spacing.block)) {
                    hint?.let { SectionCard(it.name, eyebrow = it.record?.let { r -> stringResource(R.string.signos_expediente, r) }) { it.detail?.let { d -> Text(d, style = MaterialTheme.typography.bodyMedium) } } }
                    LoadingState()
                }
                else -> ErrorState(state.error ?: stringResource(R.string.signos_error_historial), model::reload)
            }
        }
        return
    }
    if (state.loading) item { RefreshHint() }
    state.error?.let { item { NoticeBanner(NoticeKind.ERROR, it) } }
    item { PatientHeader(history) }
    val alerts = history.alerts()
    if (alerts.isNotEmpty()) item {
        Column(verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
            alerts.forEach { a ->
                val value = "${a.measure.format(a.value)} ${a.measure.unit}"
                val text = stringResource(if (a.level == VitalLevel.CRITICAL) R.string.signos_alerta_critico else R.string.signos_alerta_alterado, compact(a.measure), value) +
                    (a.measure.referenceText()?.let { " · " + stringResource(R.string.signos_normal_ref, it) } ?: "")
                NoticeBanner(if (a.level == VitalLevel.CRITICAL) NoticeKind.ERROR else NoticeKind.WARNING, text)
            }
        }
    }
    if (readOnly) item { NoticeBanner(NoticeKind.INFO, stringResource(R.string.signos_solo_lectura)) } else item { CaptureForm(state, model) }
    val measures = history.trendMeasures()
    if (measures.isNotEmpty()) item {
        SectionCard(stringResource(R.string.signos_tendencia)) {
            Text(stringResource(R.string.signos_tendencia_detalle), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            measures.forEachIndexed { index, m ->
                if (index > 0) HorizontalDivider(color = MaterialTheme.climesa.line)
                TrendRow(history, m)
            }
        }
    }
    item { Text(stringResource(R.string.signos_historial), style = MaterialTheme.typography.titleLarge) }
    if (history.readings.isEmpty()) item { EmptyState(stringResource(R.string.signos_historial_vacio), detail = stringResource(R.string.signos_historial_vacio_detalle), icon = Icons.Default.MonitorHeart) }
    else items(history.readings, key = { it.id }) { ReadingCard(it) }
}

@Composable
private fun PatientHeader(history: VitalsHistory) {
    val location = when {
        history.bed != null -> stringResource(R.string.signos_ubicacion_cama, history.bed)
        history.admissionId != null -> stringResource(R.string.signos_ubicacion_sin_cama)
        else -> stringResource(R.string.signos_ubicacion_ambulatorio)
    }
    SectionCard(history.patientName, eyebrow = stringResource(R.string.signos_expediente, history.record)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Spacing.md)) {
            history.age?.let { LabeledValue(stringResource(R.string.signos_edad), stringResource(R.string.signos_edad_anios, it), Modifier.weight(1f)) }
            LabeledValue(stringResource(R.string.signos_ubicacion), location, Modifier.weight(1.4f))
            LabeledValue(stringResource(R.string.signos_ultima_toma), history.latest?.let { VitalsFormat.hour(it.takenAt) } ?: stringResource(R.string.signos_sin_tomas_aun), Modifier.weight(1f))
        }
    }
}

@Composable
private fun CaptureForm(state: VitalSignsState, model: VitalSignsViewModel) {
    SectionCard(stringResource(R.string.signos_nueva_toma)) {
        Text(stringResource(R.string.signos_nueva_toma_detalle), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        formRows.forEach { row ->
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Spacing.sm), verticalAlignment = Alignment.Top) {
                row.forEach { m -> VitalField(m, state.form.value(m), { model.edit(m, it) }, Modifier.weight(1f)) }
            }
        }
        FormField(stringResource(R.string.signos_nota), state.form.note, model::editNote, singleLine = false,
            hint = stringResource(R.string.signos_nota_contador, state.form.note.length, VitalsRules.NOTE_MAX))
        state.formError?.let { if (state.conflict) ConflictBanner(model::reload, message = it) else NoticeBanner(NoticeKind.ERROR, it) }
        state.notice?.let { NoticeBanner(NoticeKind.SUCCESS, it) }
        PrimaryButton(stringResource(R.string.signos_guardar), model::save, icon = Icons.Default.Save, loading = state.saving)
    }
}

/** Numeric field that colours itself by level: warning for altered, danger for critical, each with an icon and a word (never colour alone). */
@Composable
private fun VitalField(measure: VitalMeasure, text: String, onChange: (String) -> Unit, modifier: Modifier = Modifier) {
    val error = VitalsRules.fieldError(measure, text)
    val level = if (error == null && text.isNotBlank()) VitalsRules.level(measure, text) else null
    val tone = if (level == VitalLevel.ABNORMAL || level == VitalLevel.CRITICAL) levelColor(level) else null
    val colors = if (tone == null) OutlinedTextFieldDefaults.colors()
    else OutlinedTextFieldDefaults.colors(focusedBorderColor = tone, unfocusedBorderColor = tone, focusedLabelColor = tone, unfocusedLabelColor = tone, cursorColor = tone)
    val reference = measure.referenceText()
    OutlinedTextField(
        value = text,
        onValueChange = onChange,
        modifier = modifier,
        label = { Text(compact(measure)) },
        suffix = { Text(measure.unit, style = MaterialTheme.typography.bodySmall) },
        singleLine = true,
        isError = error != null,
        keyboardOptions = KeyboardOptions(keyboardType = if (measure.decimals) KeyboardType.Decimal else KeyboardType.Number),
        shape = MaterialTheme.shapes.small,
        colors = colors,
        supportingText = when {
            error != null -> ({ Text(error) })
            tone != null -> ({
                val bound = measure.normalLow
                val word = if (level == VitalLevel.CRITICAL) stringResource(R.string.signos_nivel_critico)
                else if (bound != null && (VitalsRules.parse(text) ?: bound) < bound) stringResource(R.string.signos_bajo) else stringResource(R.string.signos_alto)
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Spacing.xs)) {
                    Icon(levelIcon(level), null, Modifier.size(14.dp), tint = tone)
                    Text(word, color = tone, style = MaterialTheme.typography.labelMedium)
                }
            })
            reference != null -> ({ Text(stringResource(R.string.signos_normal_ref, reference)) })
            else -> null
        },
    )
}

@Composable
private fun TrendRow(history: VitalsHistory, measure: VitalMeasure) {
    val reading = history.latestReadingWith(measure) ?: return
    val value = reading.values.getValue(measure)
    val level = measure.level(value)
    val tone = levelColor(level)
    val points = history.trend(measure)
    val summary = stringResource(R.string.signos_grafica_desc, measure.label, points.size, "${measure.format(value)} ${measure.unit}")
    Column(Modifier.fillMaxWidth().semantics(mergeDescendants = true) { contentDescription = summary }, verticalArrangement = Arrangement.spacedBy(Spacing.xs)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
            Column(Modifier.weight(1f)) {
                Text(measure.label, style = MaterialTheme.typography.titleMedium)
                Text(VitalsFormat.time(reading.takenAt), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Icon(levelIcon(level), null, Modifier.size(18.dp), tint = tone)
            Text("${measure.format(value)} ${measure.unit}", style = MaterialTheme.typography.titleLarge, color = tone)
        }
        VitalSparkline(points, measure)
    }
}

/** Small trend chart: the normal range is a soft band, the line joins the readings and the last one is a filled dot. */
@Composable
private fun VitalSparkline(values: List<Double>, measure: VitalMeasure, modifier: Modifier = Modifier) {
    val band = MaterialTheme.climesa.success.copy(alpha = .16f)
    val line = MaterialTheme.colorScheme.primary
    val last = levelColor(measure.level(values.last()))
    Canvas(modifier.fillMaxWidth().height(56.dp)) {
        val pad = 8.dp.toPx()
        var lo = minOf(values.min(), measure.normalLow ?: values.min())
        var hi = maxOf(values.max(), measure.normalHigh ?: values.max())
        if (hi - lo < 1e-6) { lo -= 1; hi += 1 }
        val usable = size.height - 2 * pad
        fun y(v: Double) = pad + usable - ((v - lo) / (hi - lo)).toFloat() * usable
        fun x(i: Int) = if (values.size == 1) size.width / 2 else pad + i * (size.width - 2 * pad) / (values.size - 1)
        if (measure.normalLow != null || measure.normalHigh != null) {
            val top = y(measure.normalHigh ?: hi)
            val bottom = y(measure.normalLow ?: lo)
            drawRect(band, topLeft = Offset(0f, top), size = Size(size.width, bottom - top))
        }
        if (values.size > 1) {
            val path = Path().apply { values.forEachIndexed { i, v -> if (i == 0) moveTo(x(i), y(v)) else lineTo(x(i), y(v)) } }
            drawPath(path, line, style = Stroke(width = 2.dp.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round))
        }
        values.forEachIndexed { i, v -> if (i < values.lastIndex) drawCircle(line, 3.dp.toPx(), Offset(x(i), y(v))) }
        drawCircle(last, 5.dp.toPx(), Offset(x(values.lastIndex), y(values.last())))
    }
}

@Composable
private fun ReadingCard(reading: VitalReading) {
    val level = reading.worst
    val author = reading.takenByName?.let { stringResource(R.string.signos_tomado_por, it) }
    val meta = listOfNotNull(author, if (reading.fromConsultation) stringResource(R.string.signos_de_consulta) else null, reading.note).joinToString(" · ").ifBlank { null }
    DataRow(
        VitalsFormat.time(reading.takenAt),
        subtitle = reading.summary(),
        meta = meta,
        leadingIcon = Icons.Default.MonitorHeart,
        status = { StatusPill(levelWord(level), levelTone(level)) },
    )
}
