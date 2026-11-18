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

/**
 * A patient found by `GET /pacientes` (minimal fields) to open the A22 record. [careRelation] (preconditions S2): the doctor
 * has an appointment, consultation or hospitalization with the patient; an older API without the field means true.
 */
data class HistoryCandidate(val id: String, val fullName: String, val record: String, val careRelation: Boolean = true) {
    /** S2: why the record cannot be opened yet, or null. */
    val blockedReason: String? get() = if (careRelation) null else NO_RELATION

    companion object {
        const val NO_RELATION = "Se habilita cuando hay una cita, consulta u hospitalización a tu cargo."

        /** S2: patients the doctor attends first; the others keep the server order after them. */
        fun parse(rows: JSONArray): List<HistoryCandidate> = (0 until rows.length()).mapNotNull(rows::optJSONObject)
            .map { HistoryCandidate(it.optString("id"), it.optString("fullName"), it.optString("record"), it.optBoolean("careRelation", true)) }
            .sortedBy { if (it.careRelation) 0 else 1 }
    }
}
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
 * the API decides what each one sees (signed consultations only for the patient, relationship for
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
            try { api.request("/pacientes/$patientId/historial").let { r -> mutable.value = mutable.value.copy(loading = false, history = ClinicalHistoryParser.parse(r)) } }
            catch (e: CancellationException) { throw e }
            catch (e: Exception) { if (!silent || mutable.value.history == null) mutable.value = mutable.value.copy(loading = false, error = historyError(e)) }
        }
    }

    /** Row 23: a 403 reads the same on Android and iOS (`RecordAccess.deniedMessage`), never the raw API text. */
    private fun historyError(e: Exception): String =
        if ((e as? sv.edu.catolica.climesa.data.AuthRequestException)?.statusCode == 403) forbiddenText(e, DENIED) else userMessage(e, "No se pudo cargar el historial.")

    companion object {
        const val DENIED = "Solo el médico tratante puede ver este expediente. Se habilita cuando hay una cita, consulta u hospitalización a tu cargo."
    }

    fun close() { loadJob?.cancel(); mutable.value = mutable.value.copy(patientId = null, history = null, error = null, loading = false) }

    fun search(query: String) {
        if (query.trim().length < 2) return
        mutable.value = mutable.value.copy(searching = true, error = null)
        viewModelScope.launch {
            try {
                val rows = api.request("/pacientes?query=" + URLEncoder.encode(query.trim(), "UTF-8") + "&limit=50") as? JSONArray ?: JSONArray()
                val found = HistoryCandidate.parse(rows)
                mutable.value = mutable.value.copy(searching = false, candidates = found)
            } catch (e: CancellationException) { throw e }
            catch (e: Exception) { mutable.value = mutable.value.copy(searching = false, error = userMessage(e, "No se pudo buscar.")) }
        }
    }

    fun startLive(channels: List<String>) {
        live.start(viewModelScope, channels) { signal ->
            val relevant = signal is RealtimeSignal.Event && HistoryEvents.matches(signal.event) || signal is RealtimeSignal.Resync
            if (relevant) mutable.value.patientId?.let { open(it, silent = true) }
        }
    }
}
