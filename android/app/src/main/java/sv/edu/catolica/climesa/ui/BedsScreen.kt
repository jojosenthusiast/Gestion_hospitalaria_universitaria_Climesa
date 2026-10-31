package sv.edu.catolica.climesa.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
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
    LazyColumn(modifier.fillMaxSize(), contentPadding = PaddingValues(22.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        item {
            Text(stringResource(R.string.camas_titulo), style = MaterialTheme.typography.displaySmall)
            Spacer(Modifier.height(6.dp))
            ConnectionBadge(state.connection)
            if (state.partialLive) Text(stringResource(R.string.tiempo_real_parcial), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.error)
        }
        state.message?.let { item { Text(it, color = MaterialTheme.colorScheme.primary) } }
        when {
            state.loading -> item { Box(Modifier.fillMaxWidth().height(160.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator() } }
            state.error != null -> item {
                Text(state.error!!, color = MaterialTheme.colorScheme.error)
                Button(onClick = model::reload) { Text(stringResource(R.string.camas_reintentar)) }
            }
            state.beds.isEmpty() -> item { Text(stringResource(R.string.camas_vacio)) }
            else -> items(state.beds, key = { it.id }) { bed ->
                Surface(color = MaterialTheme.colorScheme.surface, shape = RoundedCornerShape(0.dp)) {
                    Column(Modifier.fillMaxWidth().padding(18.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(bed.code, style = MaterialTheme.typography.titleMedium)
                        Text(bed.room, style = MaterialTheme.typography.bodySmall)
                        Text(BedRules.stateLabel(bed.state), color = MaterialTheme.colorScheme.primary)
                        bed.occupant?.let { Text(it) }
                        BedRules.availableActions(bed, state.permissions).forEach { action ->
                            OutlinedButton(onClick = { model.select(bed, action) }, modifier = Modifier.fillMaxWidth()) { Text(stringResource(action.labelRes())) }
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
