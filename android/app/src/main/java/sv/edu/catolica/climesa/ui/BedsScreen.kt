package sv.edu.catolica.climesa.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Bed
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
@Composable
fun BedsScreen(profile: AccessProfile, modifier: Modifier = Modifier, model: BedsViewModel = viewModel()) {
    val state by model.state.collectAsStateWithLifecycle()
    LaunchedEffect(profile.channels, profile.permissions) { model.start(profile.channels, profile.permissions.toSet()) }
    PageList(modifier) {
        item {
            Column(verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                SectionIntro("Hospital / CLIMESA", stringResource(R.string.camas_titulo), stringResource(R.string.op_camas_detalle))
                if (state.connection != ConnectionState.LIVE) NoticeBanner(NoticeKind.WARNING, stringResource(if (state.connection == ConnectionState.RECONNECTING) R.string.camas_reconectando else R.string.camas_sin_conexion))
                if (state.partialLive) NoticeBanner(NoticeKind.WARNING, stringResource(R.string.tiempo_real_parcial))
            }
        }
        state.message?.let { item { NoticeBanner(NoticeKind.SUCCESS, it) } }
        when {
            state.loading -> item { LoadingState() }
            state.error != null -> item { ErrorState(state.error, onRetry = model::reload) }
            state.beds.isEmpty() -> item { EmptyState(stringResource(R.string.camas_vacio), icon = Icons.Default.Bed) }
            else -> {
                item {
                    Row(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                        StatTile(state.beds.count { it.state == "libre" }.toString(), stringResource(R.string.op_camas_libres), Modifier.weight(1f))
                        StatTile(state.beds.count { it.state == "ocupada" }.toString(), stringResource(R.string.op_camas_ocupadas), Modifier.weight(1f))
                        StatTile(state.beds.size.toString(), stringResource(R.string.op_camas_total), Modifier.weight(1f))
                    }
                }
                items(state.beds, key = { it.id }) { bed ->
                    val actions = BedRules.availableActions(bed, state.permissions)
                    SectionCard(bed.code, eyebrow = bed.room, action = { OperacionStatusTag(bed.state, label = BedRules.stateLabel(bed.state)) }) {
                        bed.occupant?.let { Text(it, style = MaterialTheme.typography.bodyMedium) }
                        actions.forEach { action -> SecondaryButton(stringResource(action.labelRes()), { model.select(bed, action) }) }
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
