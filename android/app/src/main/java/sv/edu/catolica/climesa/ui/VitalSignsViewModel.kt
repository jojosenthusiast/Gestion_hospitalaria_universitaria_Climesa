package sv.edu.catolica.climesa.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import java.net.URLEncoder
import javax.inject.Inject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import sv.edu.catolica.climesa.data.ApiGateway
import sv.edu.catolica.climesa.data.AuthRequestException
import sv.edu.catolica.climesa.data.SubmissionIntent
import sv.edu.catolica.climesa.data.realtime.LiveSubscription
import sv.edu.catolica.climesa.data.realtime.RealtimeRepository
import sv.edu.catolica.climesa.domain.AdmissionEvents
import sv.edu.catolica.climesa.domain.QueueEvents
import sv.edu.catolica.climesa.domain.RealtimeSignal
import sv.edu.catolica.climesa.domain.VitalMeasure
import sv.edu.catolica.climesa.domain.VitalsCandidate
import sv.edu.catolica.climesa.domain.VitalsEvents
import sv.edu.catolica.climesa.domain.VitalsForm
import sv.edu.catolica.climesa.domain.VitalsHistory
import sv.edu.catolica.climesa.domain.VitalsParser
import sv.edu.catolica.climesa.domain.VitalsRules

/** One list of candidate patients with its own loading and error, so a failing source never hides the others. */
data class CandidateList(val items: List<VitalsCandidate> = emptyList(), val loading: Boolean = false, val error: String? = null)

data class VitalSignsState(
    val ward: CandidateList = CandidateList(),
    val queue: CandidateList = CandidateList(),
    val query: String = "",
    val search: CandidateList = CandidateList(),
    val patientId: String? = null,
    val patientHint: VitalsCandidate? = null,
    val loading: Boolean = false,
    val history: VitalsHistory? = null,
    val error: String? = null,
    val form: VitalsForm = VitalsForm(),
    val formError: String? = null,
    val saving: Boolean = false,
    val notice: String? = null,
    val conflict: Boolean = false,
)

/**
 * A41 · Signos vitales. The user picks a patient (ward `GET /admisiones`, queue `GET /fila` or the autosuggest
 * `GET /pacientes/selector`), reads the history and takes new signs with `POST /pacientes/{id}/signos`. Each take is one
 * new row (nothing is edited), sent with the idempotency key of the form intent. A failed reload never clears what is shown.
 */
@HiltViewModel
class VitalSignsViewModel @Inject constructor(private val api: ApiGateway, realtime: RealtimeRepository, private val drafts: sv.edu.catolica.climesa.data.DraftStore = sv.edu.catolica.climesa.data.NoDraftStore) : ViewModel() {
    private var userId: String? = null

    /** Signed-in user: the unsaved measures of each patient are kept as that user's local draft. */
    fun bindUser(id: String) { if (userId != id) { userId = id; drafts.retainOnly(id) } }

    private fun keepDraft(form: VitalsForm) {
        val user = userId ?: return
        val patient = mutable.value.patientId ?: return
        if (sv.edu.catolica.climesa.domain.FormDrafts.isEmpty(form)) drafts.clear(user, sv.edu.catolica.climesa.domain.FormDrafts.vitalsKey(patient))
        else drafts.save(user, sv.edu.catolica.climesa.domain.FormDrafts.vitalsKey(patient), sv.edu.catolica.climesa.domain.FormDrafts.vitals(form))
    }

    private val mutable = MutableStateFlow(VitalSignsState())
    val state = mutable.asStateFlow()
    private val live = LiveSubscription(realtime)
    private val intent = SubmissionIntent()
    private var historyJob: Job? = null
    private var searchJob: Job? = null
    private var permissions: Collection<String> = emptyList()

    fun loadSources(permissions: Collection<String>, silent: Boolean = false) {
        this.permissions = permissions
        if ("admision.ver" in permissions) {
            mutable.value = mutable.value.copy(ward = begin(mutable.value.ward, silent))
            viewModelScope.launch { mutable.value = mutable.value.copy(ward = fetch(mutable.value.ward, "/admisiones", VitalsParser::ward)) }
        }
        if ("fila.ver" in permissions) {
            mutable.value = mutable.value.copy(queue = begin(mutable.value.queue, silent))
            viewModelScope.launch { mutable.value = mutable.value.copy(queue = fetch(mutable.value.queue, "/fila", VitalsParser::queue)) }
        }
    }

    /** A silent refresh over data already shown keeps it untouched; otherwise the list shows its loading state. */
    private fun begin(current: CandidateList, silent: Boolean) = if (silent && current.items.isNotEmpty()) current else current.copy(loading = true, error = null)

    private suspend fun fetch(base: CandidateList, path: String, parse: (Any?) -> List<VitalsCandidate>): CandidateList =
        try { CandidateList(parse(api.request(path))) }
        catch (e: CancellationException) { throw e }
        catch (e: Exception) { base.copy(loading = false, error = e.message ?: "No se pudo cargar la lista.") }

    /** Debounced autosuggest: waits for a pause in typing and ignores queries under two characters. */
    fun onQuery(text: String) {
        mutable.value = mutable.value.copy(query = text)
        searchJob?.cancel()
        if (text.trim().length < 2) { mutable.value = mutable.value.copy(search = CandidateList()); return }
        searchJob = viewModelScope.launch {
            delay(SEARCH_DEBOUNCE_MS)
            mutable.value = mutable.value.copy(search = mutable.value.search.copy(loading = true, error = null))
            val result = fetch(mutable.value.search.copy(loading = true), "/pacientes/selector?query=${URLEncoder.encode(text.trim(), "UTF-8")}&limit=20", VitalsParser::search)
            mutable.value = mutable.value.copy(search = result)
        }
    }

    fun open(candidate: VitalsCandidate) {
        if (candidate.patientId != mutable.value.patientId) intent.reset()
        // Measures typed for this patient and not saved (app closed, screen left) come back from the local draft.
        val restored = userId?.let { sv.edu.catolica.climesa.domain.FormDrafts.vitals(drafts.load(it, sv.edu.catolica.climesa.domain.FormDrafts.vitalsKey(candidate.patientId))) }
        mutable.value = mutable.value.copy(patientId = candidate.patientId, patientHint = candidate, history = null, error = null, loading = true,
            form = restored ?: VitalsForm(), formError = null, notice = if (restored != null) "Recuperamos los signos que no habías guardado." else null, conflict = false)
        loadHistory(silent = false)
    }

    fun close() {
        historyJob?.cancel(); intent.reset()
        mutable.value = mutable.value.copy(patientId = null, patientHint = null, history = null, error = null, loading = false, form = VitalsForm(), formError = null, notice = null, conflict = false)
    }

    fun reload() = loadHistory(silent = false)

    private fun loadHistory(silent: Boolean) {
        val id = mutable.value.patientId ?: return
        historyJob?.cancel()
        historyJob = viewModelScope.launch {
            try {
                val history = VitalsParser.history(api.request("/pacientes/$id/signos?limit=60"))
                if (mutable.value.patientId == id) mutable.value = mutable.value.copy(loading = false, history = history, error = if (history == null) "Respuesta inesperada del servidor." else null)
            } catch (e: CancellationException) { throw e }
            catch (e: Exception) {
                // Keep the shown history on a failed silent reload (rule: keep data on API failure).
                if (mutable.value.patientId == id && (!silent || mutable.value.history == null)) mutable.value = mutable.value.copy(loading = false, error = e.message ?: "No se pudo cargar los signos.")
                else if (mutable.value.patientId == id) mutable.value = mutable.value.copy(loading = false)
            }
        }
    }

    fun edit(measure: VitalMeasure, text: String) {
        mutable.value = mutable.value.copy(form = mutable.value.form.with(measure, VitalsRules.sanitize(measure, text)), formError = null, notice = null)
        keepDraft(mutable.value.form)
    }

    fun editNote(text: String) { mutable.value = mutable.value.copy(form = mutable.value.form.copy(note = text.take(VitalsRules.NOTE_MAX)), formError = null, notice = null); keepDraft(mutable.value.form) }

    fun save() {
        val current = mutable.value
        val history = current.history ?: return
        if (current.saving) return
        VitalsRules.formError(current.form)?.let { mutable.value = current.copy(formError = it); return }
        mutable.value = current.copy(saving = true, formError = null, notice = null, conflict = false)
        viewModelScope.launch {
            try {
                intent.send { api.request("/pacientes/${history.patientId}/signos", "POST", VitalsRules.body(current.form, history.admissionId)) }
                userId?.let { drafts.clear(it, sv.edu.catolica.climesa.domain.FormDrafts.vitalsKey(history.patientId)) }
                mutable.value = mutable.value.copy(saving = false, form = VitalsForm(), notice = "Signos guardados.")
                loadHistory(silent = true)
            } catch (e: CancellationException) { throw e }
            catch (e: Exception) {
                val conflict = (e as? AuthRequestException)?.let { it.statusCode == 409 } == true
                mutable.value = mutable.value.copy(saving = false, conflict = conflict, formError = e.message ?: "No se pudo guardar. Intenta de nuevo; lo escrito se conserva.")
            }
        }
    }

    fun startLive(channels: List<String>) {
        live.start(viewModelScope, channels) { signal ->
            val relevant = signal is RealtimeSignal.Resync ||
                signal is RealtimeSignal.Event && (VitalsEvents.matches(signal.event) || AdmissionEvents.matches(signal.event) || QueueEvents.matches(signal.event))
            if (relevant) { loadSources(permissions, silent = true); loadHistory(silent = true) }
        }
    }

    private companion object { const val SEARCH_DEBOUNCE_MS = 300L }
}
