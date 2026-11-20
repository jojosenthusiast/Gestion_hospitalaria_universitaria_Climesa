package sv.edu.catolica.climesa.ui

import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.TextButton
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import sv.edu.catolica.climesa.R
import sv.edu.catolica.climesa.data.ApiGateway
import sv.edu.catolica.climesa.domain.AccessEntry
import sv.edu.catolica.climesa.domain.MyAccessRules
import sv.edu.catolica.climesa.domain.ShortDay

data class MyAccessState(val loading: Boolean = true, val entries: List<AccessEntry> = emptyList(), val error: String? = null)

/** A11: the patient's own access log. No realtime event exists for audit rows, so it loads on open and on demand. */
@HiltViewModel
class MyAccessViewModel @Inject constructor(private val api: ApiGateway) : ViewModel() {
    private val mutable = MutableStateFlow(MyAccessState()); val state = mutable.asStateFlow()
    private var loadJob: Job? = null
    fun load() {
        mutable.value = mutable.value.copy(loading = true, error = null)
        loadJob?.cancel()
        loadJob = viewModelScope.launch {
            try { mutable.value = MyAccessState(loading = false, entries = MyAccessRules.parse(api.request("/me/accesos"))) }
            catch (e: CancellationException) { throw e }
            catch (e: Exception) { mutable.value = mutable.value.copy(loading = false, error = userMessage(e, "No se pudo cargar quién vio tu expediente.")) }
        }
    }
}

@Composable fun MyAccessScreen(modifier: Modifier = Modifier, model: MyAccessViewModel = viewModel()) {
    val state by model.state.collectAsStateWithLifecycle(); LaunchedEffect(Unit) { model.load() }
    var olderOpen by rememberSaveable { mutableStateOf(false) }
    PageList(modifier) {
        when {
            state.loading -> item { LoadingState() }
            state.error != null -> item { ErrorState(state.error, onRetry = { model.load() }) }
            state.entries.isEmpty() -> item { EmptyState(stringResource(R.string.mis_accesos_vacio)) }
            else -> {
                // Grouped by day ("Hoy · mié 18 nov"); the last week stays open and older days fold under one line.
                val today = java.time.LocalDate.now(java.time.ZoneId.of("America/El_Salvador"))
                val days = MyAccessRules.byDay(state.entries, today)
                val olderCount = days.filter { it.older }.sumOf { it.entries.size }
                for ((index, day) in days.withIndex()) {
                    if (day.older && days.getOrNull(index - 1)?.older != true) item(key = "anteriores") {
                        TextButton(onClick = { olderOpen = !olderOpen }, modifier = Modifier.heightIn(min = Spacing.touch)) {
                            Text(stringResource(if (olderOpen) R.string.pac_accesos_ocultar_anteriores else R.string.pac_accesos_ver_anteriores, olderCount))
                        }
                    }
                    if (day.older && !olderOpen) continue
                    item(key = "dia-${day.date}") { Text(ShortDay.of(day.date, today), style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(top = Spacing.sm)) }
                    items(MyAccessRules.collapse(day.entries)) { group -> AccessCard(group) }
                }
            }
        }
        if (!state.loading) item { SecondaryButton(stringResource(R.string.mis_accesos_actualizar), { model.load() }, icon = Icons.Default.Refresh) }
    }
}

@Composable private fun AccessCard(group: sv.edu.catolica.climesa.domain.AccessGroup) {
    val entry = group.entry
    // D130: who (name when the API gives it), what and why in plain words, and one row for a burst of the same access.
    val time = if (group.count > 1) stringResource(R.string.mis_accesos_rango, MyAccessRules.time(group.earliest), MyAccessRules.time(group.latest)) else MyAccessRules.time(entry.at)
    SectionCard(entry.name?.let { "$it · ${entry.role}" } ?: entry.role, action = { Text(time, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.climesa.primaryText) }) {
        // D120: an urgent read (ambulance reception) carries the red "Urgente" tag.
        if (entry.urgent) PriorityBadge(Priority.URGENTE, label = stringResource(R.string.mis_accesos_urgente))
        Text(listOf(MyAccessRules.dataText(entry.dataKind), MyAccessRules.reasonText(entry.reason)).filter { it.isNotBlank() }.joinToString(" "), style = MaterialTheme.typography.bodySmall)
        if (group.count > 1) Text(stringResource(R.string.mis_accesos_veces, group.count), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}
