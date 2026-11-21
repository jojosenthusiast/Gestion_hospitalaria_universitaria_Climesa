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
import sv.edu.catolica.climesa.data.realtime.LiveSubscription
import sv.edu.catolica.climesa.data.realtime.RealtimeRepository
import sv.edu.catolica.climesa.domain.AdmissionDraft
import sv.edu.catolica.climesa.domain.AdmissionIntake
import sv.edu.catolica.climesa.domain.BedMap
import sv.edu.catolica.climesa.domain.Feasibility
import sv.edu.catolica.climesa.domain.IntakeBed
import sv.edu.catolica.climesa.domain.IntakeDoctor
import sv.edu.catolica.climesa.domain.IsolationType
import sv.edu.catolica.climesa.domain.LiveEntities
import sv.edu.catolica.climesa.domain.OriginKind
import sv.edu.catolica.climesa.domain.OriginRecord
import sv.edu.catolica.climesa.domain.PickerPatient
import sv.edu.catolica.climesa.domain.RealtimeSignal
import sv.edu.catolica.climesa.domain.ReceptionScheduling

data class AdmissionIntakeState(
    val open: Boolean = false,
    /** Left with the back gesture on the first step; [AdmissionIntakeViewModel.open] resumes it. */
    val kept: Boolean = false,
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
    /** S13: fields the guide chose on its own (single possible answer), named in its notice. */
    val prefilled: List<sv.edu.catolica.climesa.domain.IntakeField> = emptyList(),
) {
    /** Lote 2: the patient of a kept draft, so the list offers «Continuar ingreso de X» or «Empezar de nuevo». */
    val resumeName: String? get() = if (kept && !open) draft.patient?.name else null
}

/** A34: guided admission in eight steps. Every step validates before moving on; the API repeats every check when confirming. */
@HiltViewModel
class AdmissionIntakeViewModel @Inject constructor(private val api: ApiGateway, realtime: RealtimeRepository) : ViewModel() {
    private val mutable = MutableStateFlow(AdmissionIntakeState())
    val state = mutable.asStateFlow()
    var debounceMs = ReceptionScheduling.DEBOUNCE_MS
    private var searchJob: Job? = null
    private var stepJob: Job? = null
    private var doctorsJob: Job? = null
    private var liveJob: Job? = null
    private val live = LiveSubscription(realtime)

    /**
     * While the guide is open other people admit patients, free beds or change shifts (on any platform). The step on
     * screen reloads in place: doctors on duty (step 2) and the bed map (steps 3 and 5). The API repeats every check on confirm.
     */
    fun startLive(channels: List<String>) {
        live.start(viewModelScope, channels) { signal ->
            if (signal is RealtimeSignal.Resync || signal is RealtimeSignal.Event && LiveEntities.matches(signal.event, "cama", "espacio", "admision", "turno")) refreshStep()
        }
    }

    private fun refreshStep() {
        val s = mutable.value
        if (!s.open || s.busy) return
        when (s.step) {
            2 -> loadDoctors(immediately = true)
            3, 5 -> {
                val path = bedMapPath(s.step, s.draft) ?: return
                liveJob?.cancel()
                liveJob = viewModelScope.launch {
                    try {
                        val map = AdmissionIntake.bedMap(api.request(path) as JSONObject)
                        mutable.update { if (it.open && it.step == s.step) it.copy(bedMap = map) else it }
                    } catch (e: CancellationException) { throw e } catch (_: Exception) { }
                }
            }
        }
    }

    private fun bedMapPath(step: Int, draft: AdmissionDraft): String? {
        val patient = draft.patient ?: return null
        return if (step == 5) "/admisiones/mapa-camas?patientId=${enc(patient.id)}&isolation=${draft.isolation}&category=${draft.category}"
        else "/admisiones/mapa-camas?patientId=${enc(patient.id)}"
    }

    fun open() {
        if (mutable.value.kept) { mutable.value = mutable.value.copy(open = true, kept = false); return }
        prefillTried.clear(); mutable.value = AdmissionIntakeState(open = true)
    }

    /** R3 A-1: system back goes to the previous step; on the first step it returns to the list keeping the draft. */
    fun backPressed(canAssignBed: Boolean) {
        val s = mutable.value
        if (s.busy) return
        if (s.step > 0) back(canAssignBed) else mutable.value = s.copy(open = false, kept = true)
    }
    /**
     * Lote 2: «Cancelar ingreso» keeps what was chosen. With a patient picked the draft stays in this ViewModel and the list
     * offers to continue it; with nothing picked there is nothing to keep and the guide just closes.
     */
    fun leave() {
        val s = mutable.value
        if (s.busy) return
        if (s.draft.patient == null) close() else { searchJob?.cancel(); stepJob?.cancel(); doctorsJob?.cancel(); liveJob?.cancel(); mutable.value = s.copy(open = false, kept = true, error = null) }
    }

    /** «Empezar de nuevo»: drops the kept draft and opens an empty guide. */
    fun restart() { close(); open() }

    fun close() { searchJob?.cancel(); stepJob?.cancel(); doctorsJob?.cancel(); liveJob?.cancel(); prefillTried.clear(); mutable.value = AdmissionIntakeState() }

    /** Each automatic choice runs once per guide: a field the person cleared or changed is not filled again. */
    private val prefillTried = mutableSetOf<sv.edu.catolica.climesa.domain.IntakeField>()

    private fun prefill(field: sv.edu.catolica.climesa.domain.IntakeField, rule: (AdmissionDraft) -> Pair<AdmissionDraft, List<sv.edu.catolica.climesa.domain.IntakeField>>) {
        if (!prefillTried.add(field)) return
        mutable.update { s ->
            val (draft, filled) = rule(s.draft)
            if (filled.isEmpty()) s else s.copy(draft = draft, prefilled = (s.prefilled + filled).distinct())
        }
    }
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
            1 -> load {
                mutable.update { it.copy(origins = AdmissionIntake.origins(api.request("/admisiones/origenes?patientId=${enc(draft.patient!!.id)}") as JSONArray)) }
                prefill(sv.edu.catolica.climesa.domain.IntakeField.ORIGIN) { sv.edu.catolica.climesa.domain.IntakePrefill.origin(it, mutable.value.origins) }
            }
            2 -> loadDoctors(immediately = true)
            3 -> load {
                mutable.update { it.copy(bedMap = AdmissionIntake.bedMap(api.request("/admisiones/mapa-camas?patientId=${enc(draft.patient!!.id)}") as JSONObject)) }
                prefill(sv.edu.catolica.climesa.domain.IntakeField.CATEGORY) { d ->
                    val (next, filled) = sv.edu.catolica.climesa.domain.IntakePrefill.category(d, mutable.value.bedMap)
                    // Same visitor limit as choosing the category by hand.
                    (if (filled.isEmpty()) next else next.copy(visitorsMax = minOf(next.visitorsMax, AdmissionIntake.VISITOR_LIMIT[next.category] ?: 4))) to filled
                }
            }
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
            catch (e: Exception) { mutable.update { it.copy(loading = false, error = userMessage(e, "No se pudo consultar la información.")) } }
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
        } catch (e: CancellationException) { throw e } catch (e: Exception) { mutable.update { it.copy(searching = false, error = userMessage(e, "No se pudo buscar.")) } }
    }
    /** Changing the patient drops whatever depended on them (source record and bed). */
    fun pickPatient(p: PickerPatient?) {
        // S1: inactive or already admitted patients are listed with the reason but never chosen.
        if (p != null && sv.edu.catolica.climesa.domain.PatientGate.blockedReason(p, sv.edu.catolica.climesa.domain.PickPurpose.ADMISSION) != null) return
        mutable.update { it.copy(draft = it.draft.copy(patient = p, origin = null, originRecord = null, bed = null), query = "", results = emptyList(), hasMore = false, origins = emptyList()) }
    }

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
                if (immediately) prefill(sv.edu.catolica.climesa.domain.IntakeField.DOCTOR) { sv.edu.catolica.climesa.domain.IntakePrefill.doctor(it, rows) }
            } catch (e: CancellationException) { throw e } catch (e: Exception) { mutable.update { it.copy(error = userMessage(e, "No se pudieron consultar los médicos.")) } }
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
            } catch (e: CancellationException) { throw e } catch (e: Exception) {
                val message = userMessage(e, "No se pudo crear el ingreso.")
                if ((e as? sv.edu.catolica.climesa.data.AuthRequestException)?.code == "cama_ocupada") {
                    // The bed was taken meanwhile: back to the bed step with a fresh map, saying why.
                    mutable.update { it.copy(busy = false, draft = it.draft.copy(bed = null)) }
                    goTo(5, canAssignBed)
                    mutable.update { it.copy(error = message) }
                } else mutable.update { it.copy(busy = false, error = message) }
            }
        }
    }
}
