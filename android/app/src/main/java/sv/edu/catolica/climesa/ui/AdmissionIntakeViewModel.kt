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
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import sv.edu.catolica.climesa.data.ApiGateway
import sv.edu.catolica.climesa.domain.AdmissionDraft
import sv.edu.catolica.climesa.domain.AdmissionIntake
import sv.edu.catolica.climesa.domain.BedMap
import sv.edu.catolica.climesa.domain.Feasibility
import sv.edu.catolica.climesa.domain.IntakeBed
import sv.edu.catolica.climesa.domain.IntakeDoctor
import sv.edu.catolica.climesa.domain.IsolationType
import sv.edu.catolica.climesa.domain.OriginKind
import sv.edu.catolica.climesa.domain.OriginRecord
import sv.edu.catolica.climesa.domain.PickerPatient
import sv.edu.catolica.climesa.domain.ReceptionScheduling

data class AdmissionIntakeState(
    val open: Boolean = false,
    val step: Int = 0,
    val draft: AdmissionDraft = AdmissionDraft(),
    val query: String = "",
    val results: List<PickerPatient> = emptyList(),
    val hasMore: Boolean = false,
    val searching: Boolean = false,
    val origins: List<OriginRecord> = emptyList(),
    val doctors: List<IntakeDoctor> = emptyList(),
    val bedMap: BedMap? = null,
    val feasibility: Feasibility? = null,
    val loading: Boolean = false,
    val busy: Boolean = false,
    val error: String? = null,
    /** Raised after a successful confirmation so the list behind reloads; the screen clears it. */
    val finished: Boolean = false,
)

/** A34: guided admission in eight steps. Every step validates before moving on; the API repeats every check when confirming. */
@HiltViewModel
class AdmissionIntakeViewModel @Inject constructor(private val api: ApiGateway) : ViewModel() {
    private val mutable = MutableStateFlow(AdmissionIntakeState())
    val state = mutable.asStateFlow()
    var debounceMs = ReceptionScheduling.DEBOUNCE_MS
    private var searchJob: Job? = null
    private var stepJob: Job? = null
    private var doctorsJob: Job? = null

    fun open() { mutable.value = AdmissionIntakeState(open = true) }
    fun close() { searchJob?.cancel(); stepJob?.cancel(); doctorsJob?.cancel(); mutable.value = AdmissionIntakeState() }
    fun consumeFinished() = mutable.update { it.copy(finished = false) }

    fun error(canAssignBed: Boolean): String? = mutable.value.let { AdmissionIntake.stepError(it.step, it.draft, canAssignBed, it.feasibility?.feasible == true) }

    fun next(canAssignBed: Boolean) {
        val s = mutable.value
        if (s.busy || error(canAssignBed) != null || s.step >= AdmissionIntake.LAST_STEP) return
        goTo(s.step + 1, canAssignBed)
    }
    fun back(canAssignBed: Boolean) { val s = mutable.value; if (!s.busy && s.step > 0) goTo(s.step - 1, canAssignBed) }

    private fun goTo(step: Int, canAssignBed: Boolean) {
        stepJob?.cancel()
        mutable.update { it.copy(step = step, error = null, loading = false, feasibility = if (step == AdmissionIntake.LAST_STEP) null else it.feasibility) }
        val draft = mutable.value.draft
        when (step) {
            1 -> load { mutable.update { it.copy(origins = AdmissionIntake.origins(api.request("/admisiones/origenes?patientId=${enc(draft.patient!!.id)}") as JSONArray)) } }
            2 -> loadDoctors(immediately = true)
            3 -> load { mutable.update { it.copy(bedMap = AdmissionIntake.bedMap(api.request("/admisiones/mapa-camas?patientId=${enc(draft.patient!!.id)}") as JSONObject)) } }
            5 -> if (canAssignBed && AdmissionIntake.isImmediate(draft.at)) load {
                val map = AdmissionIntake.bedMap(api.request("/admisiones/mapa-camas?patientId=${enc(draft.patient!!.id)}&isolation=${draft.isolation}&category=${draft.category}") as JSONObject)
                // The suggestion arrives pre-selected; the person can pick another compatible bed.
                mutable.update { it.copy(bedMap = map, draft = if (it.draft.bed == null) it.draft.copy(bed = map.beds.firstOrNull { b -> b.suggested }) else it.draft) }
            }
            7 -> AdmissionIntake.feasibilityPath(draft, canAssignBed)?.let { path -> load { mutable.update { it.copy(feasibility = AdmissionIntake.feasibility(api.request(path) as JSONObject)) } } }
                ?: mutable.update { it.copy(error = AdmissionIntake.missing(draft)) }
        }
    }

    private fun load(block: suspend () -> Unit) {
        mutable.update { it.copy(loading = true, error = null) }
        stepJob = viewModelScope.launch {
            try { block(); mutable.update { it.copy(loading = false) } }
            catch (e: CancellationException) { throw e }
            catch (e: Exception) { mutable.update { it.copy(loading = false, error = e.message ?: "No se pudo consultar la información.") } }
        }
    }
    private fun enc(v: String) = URLEncoder.encode(v, "UTF-8")

    // 1. Patient
    fun query(text: String) {
        val q = text.take(100)
        searchJob?.cancel()
        mutable.update { it.copy(query = q, error = null, results = if (ReceptionScheduling.canSearch(q)) it.results else emptyList(), hasMore = false, searching = false) }
        if (!ReceptionScheduling.canSearch(q)) return
        searchJob = viewModelScope.launch { delay(debounceMs); fetchPatients(q, 0) }
    }
    fun moreResults() { val s = mutable.value; if (!s.hasMore || s.searching) return; searchJob = viewModelScope.launch { fetchPatients(s.query.trim(), s.results.size) } }
    private suspend fun fetchPatients(q: String, offset: Int) {
        mutable.update { it.copy(searching = true) }
        try {
            val page = ReceptionScheduling.pickerPage(api.request("/pacientes/selector?query=${enc(q.trim())}&limit=10&offset=$offset") as JSONObject)
            if (mutable.value.query.trim() == q.trim()) mutable.update { it.copy(searching = false, results = if (offset == 0) page.items else it.results + page.items, hasMore = page.hasMore) }
        } catch (e: CancellationException) { throw e } catch (e: Exception) { mutable.update { it.copy(searching = false, error = e.message ?: "No se pudo buscar.") } }
    }
    /** Changing the patient drops whatever depended on them (source record and bed). */
    fun pickPatient(p: PickerPatient?) = mutable.update { it.copy(draft = it.draft.copy(patient = p, origin = null, originRecord = null, bed = null), query = "", results = emptyList(), hasMore = false, origins = emptyList()) }

    // 2. Origin and motive
    fun pickOrigin(kind: OriginKind) = update { it.copy(origin = kind, originRecord = null) }
    fun pickRecord(record: OriginRecord) = update { it.copy(originRecord = record) }
    fun motive(text: String) = update { it.copy(motive = text.take(AdmissionIntake.MOTIVE_MAX)) }

    // 3. Date and doctor
    fun at(text: String) { update { it.copy(at = text.take(16), bed = null) }; loadDoctors(immediately = false) }
    private fun loadDoctors(immediately: Boolean) {
        doctorsJob?.cancel()
        val instant = AdmissionIntake.instantOf(mutable.value.draft.at) ?: return
        doctorsJob = viewModelScope.launch {
            if (!immediately) delay(debounceMs)
            try {
                val rows = AdmissionIntake.doctors(api.request("/admisiones/medicos-disponibles?at=${enc(instant.toString())}") as JSONArray)
                // The chosen doctor is re-evaluated for the new time: no shift turns it grey and validation explains why.
                mutable.update { s -> s.copy(doctors = rows, draft = s.draft.copy(doctor = s.draft.doctor?.let { chosen -> rows.firstOrNull { it.id == chosen.id } })) }
            } catch (e: CancellationException) { throw e } catch (e: Exception) { mutable.update { it.copy(error = e.message ?: "No se pudieron consultar los médicos.") } }
        }
    }
    /** A doctor without a shift at that time is shown grey and cannot be chosen. */
    fun pickDoctor(d: IntakeDoctor) { if (d.available) update { it.copy(doctor = d) } }

    // 4. Category
    fun pickCategory(category: String) {
        if (mutable.value.bedMap?.categories?.firstOrNull { it.category == category }?.selectable == false) return
        update { it.copy(category = category, bed = null, visitorsMax = minOf(it.visitorsMax, AdmissionIntake.VISITOR_LIMIT[category] ?: 4)) }
    }

    // 5. Clinical requirements
    fun isolation(on: Boolean) = update { it.copy(isolation = on, isolationType = if (on) it.isolationType else null, bed = null) }
    fun isolationType(type: IsolationType?) = update { it.copy(isolationType = type) }
    fun unstable(on: Boolean) = update { it.copy(unstable = on) }
    fun postSurgical(on: Boolean) = update { it.copy(postSurgical = on) }

    // 6. Bed
    fun pickBed(bed: IntakeBed) { if (bed.compatible) update { it.copy(bed = bed) } }

    // 7. Visitors
    fun visitorsAllowed(on: Boolean) = update { it.copy(visitorsAllowed = on, visitorsMax = if (on) 1 else 0) }
    fun visitorsMax(value: Int) = update { it.copy(visitorsMax = value.coerceIn(0, 4)) }

    private fun update(change: (AdmissionDraft) -> AdmissionDraft) = mutable.update { it.copy(draft = change(it.draft), error = null) }

    /** Step 8: sends the admission (and the bed, in the same command, for an immediate admission). */
    fun confirm(canAssignBed: Boolean) {
        val s = mutable.value
        if (s.busy || s.step != AdmissionIntake.LAST_STEP || error(canAssignBed) != null) return
        val body = AdmissionIntake.body(s.draft, canAssignBed) ?: run { mutable.update { it.copy(error = AdmissionIntake.missing(s.draft)) }; return }
        mutable.update { it.copy(busy = true, error = null) }
        viewModelScope.launch {
            try {
                api.request("/admisiones", "POST", body)
                mutable.value = AdmissionIntakeState(finished = true)
            } catch (e: CancellationException) { throw e } catch (e: Exception) { mutable.update { it.copy(busy = false, error = e.message ?: "No se pudo crear el ingreso.") } }
        }
    }
}
