package sv.edu.catolica.climesa.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Bed
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.ui.Alignment
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import sv.edu.catolica.climesa.R
import sv.edu.catolica.climesa.domain.*

private fun BedAction.labelRes() = when (this) {
    BedAction.BLOCK -> R.string.camas_bloquear
    BedAction.UNBLOCK -> R.string.camas_desbloquear
    BedAction.REQUEST_CLEANING -> R.string.camas_solicitar_limpieza
    BedAction.COMPLETE_CLEANING -> R.string.camas_completar_limpieza
    BedAction.VERIFY_CLEANING -> R.string.camas_verificar_limpieza
}

/** Tablero de camas: el estado vive en [BedsViewModel]; esta vista solo lo muestra y le manda eventos. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun BedsScreen(profile: AccessProfile, modifier: Modifier = Modifier, model: BedsViewModel = viewModel()) {
    val state by model.state.collectAsStateWithLifecycle()
    LaunchedEffect(profile.channels, profile.permissions) { model.start(profile.channels, profile.permissions.toSet()) }
    var stateFilter by androidx.compose.runtime.saveable.rememberSaveable { mutableStateOf<String?>(null) }
    PageList(modifier) {
        item {
            Column(verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                if (state.connection != ConnectionState.LIVE) NoticeBanner(NoticeKind.WARNING, stringResource(if (state.connection == ConnectionState.RECONNECTING) R.string.camas_reconectando else R.string.camas_sin_conexion))
                if (state.partialLive) NoticeBanner(NoticeKind.WARNING, stringResource(R.string.tiempo_real_parcial))
            }
        }
        state.message?.let { item { NoticeBanner(NoticeKind.SUCCESS, it) } }
        when {
            state.loading && state.beds.isEmpty() -> item { LoadingState() }
            // ENF/AST audit #3: a failed reload keeps the board on screen; the full error only when there is nothing to show.
            state.error != null && state.beds.isEmpty() -> item { ErrorState(state.error, onRetry = model::reload) }
            state.beds.isEmpty() -> item { EmptyState(stringResource(R.string.camas_vacio), icon = Icons.Default.Bed) }
            else -> {
                state.error?.let { error -> item { NoticeBanner(NoticeKind.WARNING, error) } }
                // ENF/AST audit #4: beds to verify, then to finish cleaning, stay on top as cards with their action.
                val (actionable, _) = BedRules.boardGroups(state.beds, state.permissions)
                if (actionable.isNotEmpty()) {
                    item { Text(stringResource(R.string.camas_por_atender, actionable.size), style = MaterialTheme.typography.titleMedium) }
                    items(actionable, key = { "a-" + it.id }) { bed ->
                        SectionCard(bed.code, eyebrow = bed.room, action = { OperacionStatusTag(bed.state, label = BedRules.stateLabel(bed.state)) }) {
                            bed.occupant?.let { Text(it, style = MaterialTheme.typography.bodyMedium) }
                            BedRules.availableActions(bed, state.permissions).forEach { action -> SecondaryButton(stringResource(action.labelRes()), { model.select(bed, action) }) }
                        }
                    }
                }
                // Obs 7/17: one chip per state with its count, then the board as a map: floor › room › bed tiles.
                item {
                    ChipRow(BedBoard.chips(state.beds, stateFilter).map { (st, n) -> Triple(st, st?.let(BedRules::stateLabel) ?: stringResource(R.string.camas_todas), n as Int?) }, stateFilter, { st -> st?.let { ChipTone.of(it, OperacionStatus.tone(it)) } }) { stateFilter = it }
                }
                val floors = BedBoard.group(state.beds, stateFilter)
                if (floors.isEmpty()) item { EmptyState(stringResource(R.string.listas_sin_coincidencias), detail = stringResource(R.string.listas_sin_coincidencias_detalle)) }
                floors.forEach { floor ->
                    item(key = "f-${floor.level}") {
                        SectionCard(floor.level?.let { stringResource(R.string.ing_cama_planta, it) } ?: stringResource(R.string.ing_cama_sin_planta)) {
                            floor.rooms.forEach { room ->
                                Text(stringResource(R.string.ing_cama_habitacion, room.room, room.beds.size), style = MaterialTheme.typography.titleSmall)
                                FlowRow(horizontalArrangement = Arrangement.spacedBy(Spacing.sm), verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                                    room.beds.forEach { bed -> BedTile(bed, BedRules.availableActions(bed, state.permissions)) { action -> model.select(bed, action) } }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    state.pending?.let { pending ->
        ConfirmDialog(
            title = stringResource(pending.action.labelRes()),
            confirmLabel = stringResource(R.string.camas_confirmar),
            onConfirm = model::confirm,
            onDismiss = model::cancel,
            destructive = pending.action == BedAction.BLOCK,
            busy = state.submitting,
            body = {
                Column(verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                    FormField(stringResource(R.string.camas_motivo), state.reason, model::onReason, error = state.reasonError, hint = stringResource(R.string.op_camas_motivo_ayuda), enabled = !state.submitting, singleLine = false)
                    state.actionError?.let { NoticeBanner(NoticeKind.ERROR, it) }
                }
            },
        )
    }
}

/**
 * One bed of the map, coloured by its state family (the same colours as its status tag) with the code, the state and the
 * occupant. A bed with actions opens them from the tile; the rest is read-only.
 */
@Composable
private fun BedTile(bed: Bed, actions: List<BedAction>, onAction: (BedAction) -> Unit) {
    val family = StatusFamily.resolve(bed.state, OperacionStatus.tone(bed.state))
    val (strong, soft) = family?.let { MaterialTheme.system.status(it) } ?: (MaterialTheme.climesa.line to MaterialTheme.colorScheme.surface)
    var open by remember { mutableStateOf(false) }
    val shape = androidx.compose.foundation.shape.RoundedCornerShape(12.dp)
    Box {
        Column(
            Modifier.width(148.dp).heightIn(min = Spacing.touch)
                .background(soft, shape).border(androidx.compose.foundation.BorderStroke(1.dp, strong), shape)
                .then(if (actions.isEmpty()) Modifier else Modifier.clickable { open = true })
                .padding(Spacing.sm),
            verticalArrangement = Arrangement.spacedBy(Spacing.xs),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Spacing.xs)) {
                Icon(Icons.Default.Bed, null, Modifier.size(18.dp), tint = strong)
                Text(bed.code, style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                if (actions.isNotEmpty()) Icon(Icons.Default.MoreVert, stringResource(R.string.camas_acciones_de, bed.code), Modifier.size(18.dp))
            }
            OperacionStatusTag(bed.state, label = BedRules.stateLabel(bed.state))
            bed.occupant?.let { Text(it, style = MaterialTheme.typography.bodySmall, maxLines = 2, overflow = TextOverflow.Ellipsis) }
        }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            actions.forEach { action -> DropdownMenuItem(text = { Text(stringResource(action.labelRes())) }, onClick = { open = false; onAction(action) }) }
        }
    }
}
