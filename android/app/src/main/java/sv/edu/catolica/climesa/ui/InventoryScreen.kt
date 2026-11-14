@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
package sv.edu.catolica.climesa.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Inventory2
import androidx.compose.material.icons.filled.MedicalServices
import androidx.compose.material.icons.filled.Science
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import sv.edu.catolica.climesa.R
import sv.edu.catolica.climesa.domain.AccessProfile
import sv.edu.catolica.climesa.domain.ArticleCategory
import sv.edu.catolica.climesa.domain.ArticleDetail
import sv.edu.catolica.climesa.domain.ArticleSummary
import sv.edu.catolica.climesa.domain.MovementKind
import sv.edu.catolica.climesa.domain.StockStatus
import sv.edu.catolica.climesa.domain.canConfigureInventory
import sv.edu.catolica.climesa.domain.gaugeFraction
import sv.edu.catolica.climesa.domain.trimNumber

private fun categoryIcon(category: ArticleCategory): ImageVector = when (category) {
    ArticleCategory.SUPPLY -> Icons.Default.Inventory2
    ArticleCategory.REAGENT -> Icons.Default.Science
    ArticleCategory.MINOR_EQUIPMENT -> Icons.Default.MedicalServices
}
private fun tone(status: StockStatus) = when (status) {
    StockStatus.OUT, StockStatus.LOW -> StatusTone.DANGER
    StockStatus.EXPIRING -> StatusTone.WARNING
    StockStatus.OK -> StatusTone.SUCCESS
    StockStatus.INACTIVE -> StatusTone.BLOCKED
}
@Composable private fun statusColor(status: StockStatus): Color = when (tone(status)) {
    StatusTone.DANGER -> MaterialTheme.colorScheme.error
    StatusTone.WARNING -> MaterialTheme.climesa.warning
    StatusTone.SUCCESS -> MaterialTheme.climesa.success
    else -> MaterialTheme.climesa.controlLine
}

/** Inventory as master-detail: the article list (search, filters, status) and, once one is chosen, its lots, warehouses and history. */
@Composable fun InventoryScreen(modifier: Modifier = Modifier, profile: AccessProfile? = null, model: InventoryViewModel = viewModel()) {
    val state by model.state.collectAsStateWithLifecycle(); LaunchedEffect(Unit) { model.load() }
    LaunchedEffect(profile?.channels) { profile?.let { model.startLive(it.channels) } }
    val kinds = state.detail?.allowedMovements.orEmpty(); val configure = canConfigureInventory(profile?.permissions.orEmpty())
    BackHandler(enabled = state.selectedId != null) { model.back() }
    state.movement?.let { MovementDialog(state, kinds, model) }
    state.article?.let { ArticleDialog(it, state.busy, state.dialogError, model) }
    state.lot?.let { LotDialog(it, state.busy, state.dialogError, model) }
    PageList(modifier) {
        item { SectionIntro(stringResource(R.string.inv_eyebrow), stringResource(R.string.inv_titulo), stringResource(R.string.inv_descripcion)) }
        if (state.error != null && state.articles.isNotEmpty()) item { NoticeBanner(NoticeKind.ERROR, state.error!!) }
        state.notice?.let { item { NoticeBanner(NoticeKind.SUCCESS, it) } }
        val detail = state.detail
        when {
            state.selectedId != null -> detailItems(state, detail, kinds, configure, model)
            state.loading -> item { LoadingState() }
            state.error != null && state.articles.isEmpty() -> item { ErrorState(state.error, onRetry = { model.clearMessages(); model.load() }) }
            else -> listItems(state, configure, model)
        }
    }
}

private fun androidx.compose.foundation.lazy.LazyListScope.listItems(state: InventoryState, configure: Boolean, model: InventoryViewModel) {
    item {
        Column(verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
            Row(horizontalArrangement = Arrangement.spacedBy(Spacing.sm), modifier = Modifier.fillMaxWidth()) {
                listOf(StockStatus.OUT, StockStatus.LOW, StockStatus.EXPIRING, StockStatus.OK).forEach { status ->
                    SummaryCell(status, state.count(status), selected = status in state.filter.statuses, Modifier.weight(1f)) { model.toggleStatus(status) }
                }
            }
            FormField(stringResource(R.string.inv_buscar), state.filter.query, model::setQuery, hint = stringResource(R.string.inv_buscar_hint))
            FlowRow(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                ArticleCategory.entries.forEach { c -> FilterChip(c in state.filter.categories, { model.toggleCategory(c) }, { Text(c.label) }, leadingIcon = { Icon(categoryIcon(c), null, Modifier.size(18.dp)) }) }
                if (state.filter.active) FilterChip(false, { model.clearFilters() }, { Text(stringResource(R.string.inv_quitar_filtros)) })
            }
            if (configure) SecondaryButton(stringResource(R.string.inv_nuevo_articulo), { model.openArticle(null) }, icon = Icons.Default.Add)
        }
    }
    val shown = state.shown
    if (shown.isEmpty()) item { EmptyState(if (state.articles.isEmpty()) stringResource(R.string.inv_sin_articulos) else stringResource(R.string.inv_sin_coincidencias), detail = if (state.articles.isEmpty()) null else stringResource(R.string.inv_prueba_otra)) }
    else items(shown, key = { it.id }) { ArticleRow(it) { model.select(it.id) } }
}

@Composable private fun SummaryCell(status: StockStatus, count: Int, selected: Boolean, modifier: Modifier, onClick: () -> Unit) {
    val color = statusColor(status)
    Column(modifier.clickable(onClick = onClick).background(if (selected) MaterialTheme.climesa.soft else MaterialTheme.colorScheme.surface, RoundedCornerShape(12.dp)).padding(Spacing.sm), horizontalAlignment = Alignment.CenterHorizontally) {
        Text(count.toString(), style = MaterialTheme.typography.titleLarge, color = color)
        Text(status.label, style = MaterialTheme.typography.labelSmall, maxLines = 1)
    }
}

@Composable private fun Gauge(available: Double, minimum: Double, status: StockStatus) {
    Box(Modifier.fillMaxWidth().height(8.dp).background(MaterialTheme.climesa.disabled, RoundedCornerShape(50))) {
        Box(Modifier.fillMaxWidth(gaugeFraction(available, minimum)).height(8.dp).background(statusColor(status), RoundedCornerShape(50)))
    }
}

@Composable private fun ArticleRow(article: ArticleSummary, onClick: () -> Unit) {
    SectionCard(article.name, eyebrow = "${article.code} · ${article.category.label}", modifier = Modifier.clickable(onClick = onClick), action = {
        Icon(categoryIcon(article.category), article.category.label, tint = MaterialTheme.climesa.primaryText)
        StatusPill(article.status.label, tone(article.status))
    }) {
        Gauge(article.available, article.minimum, article.status)
        Text("${trimNumber(article.available)} ${article.unit} · mínimo ${trimNumber(article.minimum)}" + (article.nextExpiry?.let { " · vence $it" } ?: ""), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

private fun androidx.compose.foundation.lazy.LazyListScope.detailItems(state: InventoryState, detail: ArticleDetail?, kinds: List<MovementKind>, configure: Boolean, model: InventoryViewModel) {
    item { SecondaryButton(stringResource(R.string.inv_volver), { model.back() }, icon = Icons.AutoMirrored.Filled.ArrowBack) }
    if (detail == null) { item { if (state.detailLoading) LoadingState() else ErrorState(state.error, onRetry = { model.clearMessages(); state.selectedId?.let(model::select) }) }; return }
    val article = detail.summary
    item {
        SectionCard(article.name, eyebrow = "${article.code} · ${article.category.label} · ${article.unit}", action = { StatusPill(article.status.label, tone(article.status)) }) {
            Gauge(article.available, article.minimum, article.status)
            Row(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                StatTile(trimNumber(article.available), stringResource(R.string.inv_existencia), Modifier.weight(1f), suffix = article.unit)
                StatTile(trimNumber(article.minimum), stringResource(R.string.inv_minimo), Modifier.weight(1f), suffix = article.unit)
            }
            Row(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                StatTile(trimNumber(article.expiringSoon), stringResource(R.string.inv_por_vencer_30), Modifier.weight(1f))
                StatTile(trimNumber(article.expired), stringResource(R.string.inv_vencida), Modifier.weight(1f))
            }
            if (kinds.isNotEmpty() && article.active) PrimaryButton(stringResource(R.string.inv_registrar_movimiento), { model.openMovement(kinds.first()) }, icon = Icons.Default.Add, enabled = !state.busy)
            if (configure) {
                SecondaryButton(stringResource(R.string.inv_editar_articulo), { model.openArticle(article) })
                SecondaryButton(stringResource(R.string.inv_nuevo_lote), { model.openLot(null) })
                if (detail.lots.isEmpty() && detail.movements.isEmpty()) SecondaryButton(stringResource(R.string.inv_eliminar), { model.deleteArticle(article.id) }, enabled = !state.busy)
            }
        }
    }
    item {
        SectionCard(stringResource(R.string.inv_existencia_bodega)) {
            if (detail.warehouses.isEmpty()) Text(stringResource(R.string.inv_sin_existencia_bodegas), style = MaterialTheme.typography.bodySmall)
            detail.warehouses.forEach { Text("${it.name} (${it.code}): ${trimNumber(it.quantity)} ${article.unit}", style = MaterialTheme.typography.bodyMedium) }
        }
    }
    item {
        SectionCard(stringResource(R.string.inv_lotes_titulo)) {
            if (detail.lots.isEmpty()) Text(stringResource(R.string.inv_sin_lotes), style = MaterialTheme.typography.bodySmall)
            detail.lots.forEach { lot ->
                Column(Modifier.fillMaxWidth().clickable(enabled = configure) { model.openLot(lot) }.padding(vertical = Spacing.xs)) {
                    Text("Lote ${lot.number}" + if (lot.active) "" else " · dado de baja", style = MaterialTheme.typography.titleSmall)
                    Text(
                        (lot.expiresAt?.let { "Vence $it" + if (lot.expired) " (vencido)" else "" } ?: "No vence") + " · ${trimNumber(lot.total)} ${article.unit}" + (if (lot.warehouses.isEmpty()) "" else " · " + lot.warehouses.joinToString(" · ") { "${it.code}: ${trimNumber(it.quantity)}" }),
                        style = MaterialTheme.typography.bodySmall, color = if (lot.expired) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
    item {
        SectionCard(stringResource(R.string.inv_historial)) {
            if (detail.movements.isEmpty()) Text(stringResource(R.string.inv_sin_movimientos), style = MaterialTheme.typography.bodySmall)
            detail.movements.take(30).forEach { m ->
                Column(Modifier.padding(vertical = Spacing.xs)) {
                    Text("${MovementKind.entries.firstOrNull { it.code == m.type }?.label ?: m.type.replaceFirstChar { c -> c.uppercase() }} · lote ${m.lotNumber} · ${trimNumber(m.quantity)} ${article.unit}", style = MaterialTheme.typography.titleSmall)
                    Text(listOfNotNull(m.origin, m.destination).joinToString(" → ").ifBlank { "—" } + " · ${m.reason} · ${m.author} · ${m.at.take(16).replace('T', ' ')}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}

@Composable private fun KindChips(current: MovementKind, kinds: List<MovementKind>, onPick: (MovementKind) -> Unit) {
    FlowRow(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) { kinds.forEach { FilterChip(it == current, { onPick(it) }, { Text(it.label) }) } }
}
@Composable private fun <T> ChoiceChips(label: String, items: List<T>, selectedId: String, id: (T) -> String, text: (T) -> String, error: String?, onPick: (String) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(Spacing.xs)) {
        Text(label, style = MaterialTheme.typography.labelLarge)
        if (items.isEmpty()) Text(stringResource(R.string.inv_sin_opciones), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) { items.forEach { FilterChip(id(it) == selectedId, { onPick(id(it)) }, { Text(text(it)) }) } }
        error?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error) }
    }
}

/** Guided movement: pick the type first; only that type's fields appear. The lot list is filtered by article and origin, FEFO first. */
@Composable private fun MovementDialog(state: InventoryState, kinds: List<MovementKind>, model: InventoryViewModel) {
    val draft = state.movement ?: return; val article = state.detail?.summary ?: return
    val errors = state.movementErrors; fun err(key: String) = if (state.movementSubmitted) errors[key] else null
    val origins = if (draft.kind == MovementKind.ADJUSTMENT) state.warehouses.map { it.id to it.name } else state.detail?.warehouses.orEmpty().filter { it.quantity > 0 }.map { it.id to it.name }
    ConfirmDialog(
        title = stringResource(R.string.inv_registrar_movimiento), confirmLabel = stringResource(R.string.inv_guardar), onConfirm = { model.submitMovement() }, onDismiss = { model.closeMovement() }, busy = state.busy,
        message = "${article.code} · ${article.name}",
        body = {
            Column(verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                KindChips(draft.kind, kinds, model::changeKind)
                Text(draft.kind.help, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                if (draft.kind.needsOrigin) ChoiceChips(if (draft.kind == MovementKind.ADJUSTMENT) stringResource(R.string.inv_bodega_contaste) else stringResource(R.string.inv_bodega_origen), origins, draft.originId, { it.first }, { it.second }, err("origin")) { id -> model.editMovement { it.copy(originId = id) } }
                if (draft.kind.needsDestination) ChoiceChips(if (draft.kind == MovementKind.ENTRY) stringResource(R.string.inv_llega_a_bodega) else stringResource(R.string.inv_va_a_bodega), state.warehouses.filter { it.id != draft.originId }, draft.destinationId, { it.id }, { it.name }, err("destination")) { id -> model.editMovement { it.copy(destinationId = id) } }
                if (draft.kind.needsExistingLot && draft.originId.isNotBlank()) ChoiceChips(stringResource(R.string.inv_lote_sugerido), state.lotChoices, draft.lotId, { it.first.id }, { (lot, qty) -> "${lot.number} · ${trimNumber(qty)} ${article.unit}" + (lot.expiresAt?.let { " · vence $it" } ?: "") }, err("lot")) { id -> model.editMovement { it.copy(lotId = id) } }
                if (draft.kind.needsNewLot) {
                    FormField(stringResource(R.string.inv_numero_lote), draft.lotNumber, { v -> model.editMovement { it.copy(lotNumber = v) } }, error = err("lotNumber"), hint = stringResource(R.string.inv_lote_existente), enabled = !state.busy)
                    FormField(stringResource(R.string.inv_vencimiento), draft.expiresAt, { v -> model.editMovement { it.copy(expiresAt = v) } }, error = err("expiresAt"), hint = stringResource(R.string.inv_vacio_no_vence), enabled = !state.busy, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number))
                }
                FormField(stringResource(R.string.inv_cantidad), draft.quantity, { v -> model.editMovement { it.copy(quantity = v) } }, error = err("quantity"), enabled = !state.busy, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    hint = state.chosenLotQuantity?.let { "Disponible en el lote: ${trimNumber(it)}" } ?: if (draft.kind == MovementKind.ADJUSTMENT) "Negativo resta un faltante; positivo suma un sobrante." else null)
                FormField(stringResource(R.string.inv_motivo), draft.reason, { v -> model.editMovement { it.copy(reason = v) } }, error = err("reason"), enabled = !state.busy, singleLine = false)
                state.dialogError?.let { NoticeBanner(NoticeKind.ERROR, it) }
            }
        },
    )
}

@Composable private fun ArticleDialog(draft: ArticleDraft, busy: Boolean, error: String?, model: InventoryViewModel) {
    ConfirmDialog(title = if (draft.id == null) stringResource(R.string.inv_nuevo_articulo) else stringResource(R.string.inv_editar_articulo), confirmLabel = stringResource(R.string.inv_guardar), onConfirm = { model.saveArticle() }, onDismiss = { model.closeArticle() }, busy = busy, confirmEnabled = draft.valid) {
        Column(verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
            FormField(stringResource(R.string.inv_codigo), draft.code, { v -> model.editArticle { it.copy(code = v) } }, enabled = !busy)
            FormField(stringResource(R.string.inv_nombre), draft.name, { v -> model.editArticle { it.copy(name = v) } }, enabled = !busy)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) { ArticleCategory.entries.forEach { c -> FilterChip(c == draft.category, { model.editArticle { it.copy(category = c) } }, { Text(c.label) }) } }
            FormField(stringResource(R.string.inv_unidad), draft.unit, { v -> model.editArticle { it.copy(unit = v) } }, enabled = !busy)
            FormField(stringResource(R.string.inv_existencia_minima), draft.minimum, { v -> model.editArticle { it.copy(minimum = v) } }, enabled = !busy, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal))
            if (draft.id != null) {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) { FilterChip(draft.active, { model.editArticle { it.copy(active = true) } }, { Text(stringResource(R.string.inv_activo)) }); FilterChip(!draft.active, { model.editArticle { it.copy(active = false) } }, { Text(stringResource(R.string.inv_inactivo)) }) }
                FormField(stringResource(R.string.inv_motivo_cambio), draft.reason, { v -> model.editArticle { it.copy(reason = v) } }, enabled = !busy, hint = stringResource(R.string.inv_motivo_hint_auditoria), singleLine = false)
            }
            error?.let { NoticeBanner(NoticeKind.ERROR, it) }
        }
    }
}

@Composable private fun LotDialog(draft: LotDraft, busy: Boolean, error: String?, model: InventoryViewModel) {
    ConfirmDialog(title = if (draft.id == null) stringResource(R.string.inv_nuevo_lote) else stringResource(R.string.inv_editar_lote), confirmLabel = stringResource(R.string.inv_guardar), onConfirm = { model.saveLot() }, onDismiss = { model.closeLot() }, busy = busy, confirmEnabled = draft.valid) {
        Column(verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
            FormField(stringResource(R.string.inv_numero_lote), draft.number, { v -> model.editLot { it.copy(number = v) } }, enabled = !busy)
            FormField(stringResource(R.string.inv_vencimiento), draft.expiresAt, { v -> model.editLot { it.copy(expiresAt = v) } }, enabled = !busy, hint = stringResource(R.string.inv_vacio_no_vence))
            if (draft.id != null) {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) { FilterChip(draft.active, { model.editLot { it.copy(active = true) } }, { Text(stringResource(R.string.inv_activo)) }); FilterChip(!draft.active, { model.editLot { it.copy(active = false) } }, { Text(stringResource(R.string.inv_dado_de_baja)) }) }
                FormField(stringResource(R.string.inv_motivo_cambio), draft.reason, { v -> model.editLot { it.copy(reason = v) } }, enabled = !busy, hint = stringResource(R.string.inv_motivo_hint), singleLine = false)
            }
            error?.let { NoticeBanner(NoticeKind.ERROR, it) }
        }
    }
}
