package sv.edu.catolica.climesa.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.json.JSONObject
import sv.edu.catolica.climesa.R
import sv.edu.catolica.climesa.data.ApiGateway
import sv.edu.catolica.climesa.domain.PatientGate
import sv.edu.catolica.climesa.domain.PickPurpose
import sv.edu.catolica.climesa.domain.PickerPatient
import sv.edu.catolica.climesa.domain.ReceptionScheduling
import java.net.URLEncoder

/** State of a patient search with `GET /pacientes/selector` (same search as booking an appointment). */
data class PatientSearchState(
    val query: String = "",
    val results: List<PickerPatient> = emptyList(),
    val hasMore: Boolean = false,
    val searching: Boolean = false,
    val patient: PickerPatient? = null,
    val error: String? = null,
    /** S1: why the patient handed in (from the record) cannot be chosen; calm, not an error. */
    val blocked: String? = null,
)

/**
 * Search while typing: waits [debounceMs], asks only from two characters and drops answers of old queries. [read] and
 * [write] reach the owner's state so the search lives inside its view model.
 */
internal class PatientSelectorSearch(
    private val api: ApiGateway,
    private val scope: CoroutineScope,
    private val read: () -> PatientSearchState,
    private val purpose: PickPurpose = PickPurpose.CARE,
    private val write: ((PatientSearchState) -> PatientSearchState) -> Unit,
) {
    var debounceMs: Long = ReceptionScheduling.DEBOUNCE_MS
    private var job: Job? = null

    fun query(text: String) {
        val q = text.take(100)
        job?.cancel()
        write { it.copy(query = q, error = null, blocked = null, results = if (ReceptionScheduling.canSearch(q)) it.results else emptyList(), hasMore = false, searching = false) }
        if (!ReceptionScheduling.canSearch(q)) return
        job = scope.launch { delay(debounceMs); fetch(q, 0) }
    }

    fun more() { val s = read(); if (!s.hasMore || s.searching) return; job = scope.launch { fetch(s.query.trim(), s.results.size) } }

    /** S1: a blocked row is never chosen; it shows its reason in the list instead. */
    fun pick(patient: PickerPatient?) {
        if (patient != null && PatientGate.blockedReason(patient, purpose) != null) return
        job?.cancel(); write { it.copy(patient = patient, blocked = null, query = "", results = emptyList(), hasMore = false, searching = false) }
    }

    fun cancel() { job?.cancel() }

    private suspend fun fetch(q: String, offset: Int) {
        write { it.copy(searching = true) }
        try {
            val page = ReceptionScheduling.pickerPage(api.request("/pacientes/selector?query=${URLEncoder.encode(q.trim(), "UTF-8")}&limit=10&offset=$offset") as JSONObject)
            if (read().query.trim() == q.trim()) write { it.copy(searching = false, results = if (offset == 0) page.items else it.results + page.items, hasMore = page.hasMore) }
        } catch (e: CancellationException) { throw e } catch (e: Exception) {
            write { it.copy(searching = false, error = userMessage(e, "No se pudo buscar.")) }
        }
    }
}

/** Patient chooser shared by booking an appointment and issuing a queue number: search, all matches (paged), pick one. */
@Composable
internal fun PatientSearchPicker(
    query: String, results: List<PickerPatient>, searching: Boolean, hasMore: Boolean, chosen: PickerPatient?,
    onQuery: (String) -> Unit, onPick: (PickerPatient?) -> Unit, onMore: () -> Unit, enabled: Boolean = true,
    purpose: PickPurpose = PickPurpose.CARE,
) {
    if (chosen != null) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Column(Modifier.weight(1f)) {
                Text(chosen.name, style = MaterialTheme.typography.titleMedium); Text(chosen.detail, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                chosen.appointmentToday?.let { Text(it.chip, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary) }
                chosen.ticketToday?.let { Text(stringResource(R.string.u5_ya_tiene_numero, it.code), style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant) }
            }
            TextButton(onClick = { onPick(null) }, enabled = enabled) { Text(stringResource(R.string.rec_agendar_cambiar)) }
        }
        return
    }
    FormField(stringResource(R.string.rec_agendar_buscar), query, onQuery, hint = stringResource(R.string.rec_agendar_buscar_ayuda))
    if (searching && results.isEmpty()) LoadingState()
    results.forEach { p ->
        val blocked = PatientGate.blockedReason(p, purpose)
        TextButton(onClick = { onPick(p) }, enabled = enabled && blocked == null, modifier = Modifier.fillMaxWidth()) {
            Column(Modifier.fillMaxWidth()) {
                Text(p.name, style = MaterialTheme.typography.titleSmall); Text(p.detail, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                // S1: shown but not choosable, with why and what to do, before the tap.
                blocked?.let { BlockedReason(it) }
                // B1: whether the person has an appointment today (time and doctor) decides the counter's primary action.
                p.appointmentToday?.let { Text(it.chip, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary) }
                p.ticketToday?.let { Text(stringResource(R.string.u5_ya_tiene_numero, it.code), style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant) }
            }
        }
    }
    if (hasMore) TextButton(onClick = onMore, enabled = !searching) { Text(stringResource(R.string.rec_agendar_mas)) }
    if (!searching && results.isEmpty() && ReceptionScheduling.canSearch(query)) Text(stringResource(R.string.rec_agendar_sin_resultados), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
}
