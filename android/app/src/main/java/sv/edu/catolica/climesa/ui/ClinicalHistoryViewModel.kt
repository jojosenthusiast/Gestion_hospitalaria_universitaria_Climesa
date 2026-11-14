package sv.edu.catolica.climesa.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import org.json.JSONArray
import sv.edu.catolica.climesa.data.ApiGateway
import sv.edu.catolica.climesa.data.realtime.LiveSubscription
import sv.edu.catolica.climesa.data.realtime.RealtimeRepository
import sv.edu.catolica.climesa.domain.ClinicalHistory
import sv.edu.catolica.climesa.domain.ClinicalHistoryParser
import sv.edu.catolica.climesa.domain.HistoryEvents
import sv.edu.catolica.climesa.domain.RealtimeSignal
import java.net.URLEncoder

/** A patient found by `GET /pacientes` (minimal fields) to open the A22 record. */
data class HistoryCandidate(val id: String, val fullName: String, val record: String)
data class ClinicalHistoryState(
    val patientId: String? = null,
    val loading: Boolean = false,
    val history: ClinicalHistory? = null,
    val error: String? = null,
    val searching: Boolean = false,
    val candidates: List<HistoryCandidate> = emptyList(),
)

/**
 * A08 · Mi historial (patient, own record) and A22 · Expediente (clinician). Both read `GET /pacientes/{id}/historial`;
 * the API decides what each one sees (signed consultations only for the patient, relationship or exceptional access for
 * staff) and audits every read. Realtime events only trigger a refetch.
 */
@HiltViewModel
class ClinicalHistoryViewModel @Inject constructor(private val api: ApiGateway, realtime: RealtimeRepository) : ViewModel() {
    private val mutable = MutableStateFlow(ClinicalHistoryState())
    val state = mutable.asStateFlow()
    private val live = LiveSubscription(realtime)
    private var loadJob: Job? = null

    fun open(patientId: String?, silent: Boolean = false) {
        if (patientId.isNullOrBlank()) { mutable.value = mutable.value.copy(patientId = null, history = null, loading = false); return }
        val changed = patientId != mutable.value.patientId
        if (!silent) mutable.value = mutable.value.copy(patientId = patientId, loading = true, error = null, history = if (changed) null else mutable.value.history)
        loadJob?.cancel()
        loadJob = viewModelScope.launch {
            try { mutable.value = mutable.value.copy(loading = false, history = ClinicalHistoryParser.parse(api.request("/pacientes/$patientId/historial"))) }
            catch (e: CancellationException) { throw e }
            catch (e: Exception) { if (!silent || mutable.value.history == null) mutable.value = mutable.value.copy(loading = false, error = e.message ?: "No se pudo cargar el historial.") }
        }
    }

    fun close() { loadJob?.cancel(); mutable.value = mutable.value.copy(patientId = null, history = null, error = null, loading = false) }

    fun search(query: String) {
        if (query.trim().length < 2) return
        mutable.value = mutable.value.copy(searching = true, error = null)
        viewModelScope.launch {
            try {
                val rows = api.request("/pacientes?query=" + URLEncoder.encode(query.trim(), "UTF-8") + "&limit=50") as? JSONArray ?: JSONArray()
                val found = (0 until rows.length()).mapNotNull(rows::optJSONObject).map { HistoryCandidate(it.optString("id"), it.optString("fullName"), it.optString("record")) }
                mutable.value = mutable.value.copy(searching = false, candidates = found)
            } catch (e: CancellationException) { throw e }
            catch (e: Exception) { mutable.value = mutable.value.copy(searching = false, error = e.message ?: "No se pudo buscar.") }
        }
    }

    fun startLive(channels: List<String>) {
        live.start(viewModelScope, channels) { signal ->
            val relevant = signal is RealtimeSignal.Event && HistoryEvents.matches(signal.event) || signal is RealtimeSignal.Resync
            if (relevant) mutable.value.patientId?.let { open(it, silent = true) }
        }
    }
}
