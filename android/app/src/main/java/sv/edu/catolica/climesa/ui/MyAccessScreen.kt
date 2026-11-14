package sv.edu.catolica.climesa.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
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
            catch (e: Exception) { mutable.value = mutable.value.copy(loading = false, error = e.message ?: "No se pudo cargar quién vio tu expediente.") }
        }
    }
}

@Composable fun MyAccessScreen(modifier: Modifier = Modifier, model: MyAccessViewModel = viewModel()) {
    val state by model.state.collectAsStateWithLifecycle(); LaunchedEffect(Unit) { model.load() }
    LazyColumn(modifier, contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item { SectionIntro(stringResource(R.string.mis_accesos_eyebrow), stringResource(R.string.mis_accesos_titulo), stringResource(R.string.mis_accesos_descripcion)) }
        state.error?.let { item { ClimesaActionGroup { Text(it, color = MaterialTheme.colorScheme.error); ClimesaButton(stringResource(R.string.mis_accesos_reintentar), Icons.Default.Refresh, { model.load() }, outlined = true) } } }
        if (state.loading) item { CircularProgressIndicator() }
        else if (state.error == null && state.entries.isEmpty()) item { ClimesaCard { Text(stringResource(R.string.mis_accesos_vacio), Modifier.padding(18.dp)) } }
        else items(state.entries) { entry -> ClimesaCard { Column(Modifier.fillMaxWidth().padding(18.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(entry.role, style = MaterialTheme.typography.titleMedium)
            Text(MyAccessRules.displayDate(entry.at), color = MaterialTheme.colorScheme.primary)
            Text(stringResource(R.string.mis_accesos_detalle, entry.dataKind, entry.reason), style = MaterialTheme.typography.bodySmall)
            if (entry.exceptional) Text(stringResource(R.string.mis_accesos_excepcional), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.error)
        } } }
        if (!state.loading) item { ClimesaActionGroup { ClimesaButton(stringResource(R.string.mis_accesos_actualizar), Icons.Default.Refresh, { model.load() }, outlined = true) } }
    }
}
