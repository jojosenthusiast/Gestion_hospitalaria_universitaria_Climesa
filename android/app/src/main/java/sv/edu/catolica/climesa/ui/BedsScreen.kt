package sv.edu.catolica.climesa.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Bed
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.WifiOff
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
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

@Composable
fun ConnectionBadge(state: ConnectionState) {
    Text(
        stringResource(
            when (state) {
                ConnectionState.LIVE -> R.string.camas_en_vivo
                ConnectionState.RECONNECTING -> R.string.camas_reconectando
                ConnectionState.OFFLINE -> R.string.camas_sin_conexion
            },
        ),
        style = MaterialTheme.typography.labelSmall,
        color = if (state == ConnectionState.LIVE) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error,
    )
}

/** Tablero de camas: el estado vive en [BedsViewModel]; esta vista solo lo muestra y le manda eventos. */
@Composable
fun BedsScreen(profile: AccessProfile, modifier: Modifier = Modifier, model: BedsViewModel = viewModel()) {
    val state by model.state.collectAsStateWithLifecycle()
    LaunchedEffect(profile.channels, profile.permissions) { model.start(profile.channels, profile.permissions.toSet()) }
    LazyColumn(modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        item {
            SectionIntro("Hospital / CLIMESA", stringResource(R.string.camas_titulo), "Estado de camas en tiempo real.")
            Spacer(Modifier.height(10.dp))
            InlineStatus(stringResource(when (state.connection) { ConnectionState.LIVE -> R.string.camas_en_vivo; ConnectionState.RECONNECTING -> R.string.camas_reconectando; ConnectionState.OFFLINE -> R.string.camas_sin_conexion }), if (state.connection == ConnectionState.LIVE) Icons.Default.CheckCircle else Icons.Default.WifiOff)
            if (state.partialLive) Text(stringResource(R.string.tiempo_real_parcial), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.error)
        }
        state.message?.let { item { Text(it, color = MaterialTheme.colorScheme.primary) } }
        when {
            state.loading -> item { Box(Modifier.fillMaxWidth().height(160.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator() } }
            state.error != null -> item {
                ClimesaActionGroup {
                    Text(state.error!!, color = MaterialTheme.colorScheme.error)
                    ClimesaButton(stringResource(R.string.camas_reintentar), Icons.Default.Refresh, model::reload)
                }
            }
            state.beds.isEmpty() -> item { Text(stringResource(R.string.camas_vacio)) }
            else -> items(state.beds, key = { it.id }) { bed ->
                ClimesaCard {
                    Column(Modifier.fillMaxWidth().padding(18.dp), verticalArrangement = Arrangement.spacedBy(9.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            Icon(Icons.Default.Bed, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                            Column(Modifier.weight(1f)) { Text(bed.code, style = MaterialTheme.typography.titleMedium); Text(bed.room, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                            Text(BedRules.stateLabel(bed.state), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
                        }
                        bed.occupant?.let { Text(it) }
                        val actions = BedRules.availableActions(bed, state.permissions)
                        if (actions.isNotEmpty()) {
                            HorizontalDivider()
                            ClimesaActionGroup {
                                actions.forEach { action -> ClimesaButton(stringResource(action.labelRes()), Icons.Default.Bed, { model.select(bed, action) }, outlined = true) }
                            }
                        }
                    }
                }
            }
        }
    }
    state.pending?.let { pending ->
        AlertDialog(
            onDismissRequest = { if (!state.submitting) model.cancel() },
            title = { Text(stringResource(pending.action.labelRes())) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    OutlinedTextField(
                        value = state.reason,
                        onValueChange = model::onReason,
                        label = { Text(stringResource(R.string.camas_motivo)) },
                        isError = state.reasonError != null,
                        supportingText = { state.reasonError?.let { Text(it) } },
                        enabled = !state.submitting,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    state.actionError?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                }
            },
            confirmButton = { Button(onClick = model::confirm, enabled = !state.submitting) { Text(stringResource(if (state.submitting) R.string.camas_enviando else R.string.camas_confirmar)) } },
            dismissButton = { TextButton(onClick = model::cancel, enabled = !state.submitting) { Text(stringResource(R.string.camas_cancelar)) } },
        )
    }
}
