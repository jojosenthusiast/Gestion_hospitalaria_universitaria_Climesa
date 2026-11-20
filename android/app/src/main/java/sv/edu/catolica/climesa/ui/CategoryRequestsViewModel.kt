package sv.edu.catolica.climesa.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import org.json.JSONObject
import sv.edu.catolica.climesa.data.ApiGateway
import sv.edu.catolica.climesa.data.SubmissionIntent
import sv.edu.catolica.climesa.data.realtime.LiveSubscription
import sv.edu.catolica.climesa.data.realtime.RealtimeRepository
import sv.edu.catolica.climesa.domain.AppointmentCategory
import sv.edu.catolica.climesa.domain.AppointmentEvents
import sv.edu.catolica.climesa.domain.CategoryRequest
import sv.edu.catolica.climesa.domain.CategoryRequestRules
import sv.edu.catolica.climesa.domain.DaySlot
import sv.edu.catolica.climesa.domain.RealtimeSignal
import sv.edu.catolica.climesa.domain.ReceptionScheduling
import sv.edu.catolica.climesa.domain.RequestFranja
import sv.edu.catolica.climesa.domain.SchedulingDoctor
import java.time.LocalDate

data class CategoryRequestsState(
    val loading: Boolean = true,
    val categories: List<AppointmentCategory> = emptyList(),
    val requests: List<CategoryRequest> = emptyList(),
    // Patient form.
    val formOpen: Boolean = false,
    val query: String = "",
    val picked: List<String> = emptyList(),
    val franja: RequestFranja = RequestFranja.ANY,
    val note: String = "",
    val preferredDoctorId: String? = null,
    // Reception assignment.
    val assigning: CategoryRequest? = null,
    val date: LocalDate = ReceptionScheduling.today(),
    val doctors: List<SchedulingDoctor> = emptyList(),
    val doctor: SchedulingDoctor? = null,
    val slots: List<DaySlot> = emptyList(),
    val slot: DaySlot? = null,
    val wholeDay: Boolean = false,
    val loadingSlots: Boolean = false,
    val saving: Boolean = false,
    val error: String? = null,
    /** A2: opening "Asignar" looks for the first of the next 7 days with a free slot in the requested time of day. */
    val searchingDay: Boolean = false,
    /** The patient left "Pedir cita" with the back gesture; reopening resumes this draft. */
    val draftKept: Boolean = false,
    val notice: String? = null,
    /** D128: the server's request limit, read when the form opens; null until it answers or from an older API. */
    val limit: sv.edu.catolica.climesa.domain.RequestLimit? = null,
) {
    val visibleCategories get() = CategoryRequestRules.filter(categories, query, picked)
    /** D128: the limit is reached, so the form is closed before the patient fills it (S12). */
    val blockedByLimit get() = limit?.canRequest == false
    val canSend get() = !saving && !blockedByLimit && CategoryRequestRules.canSend(picked, note)
    /** Pending-assignment inbox: pending rows this reader may assign or reject (the server decides). */
    val inbox get() = requests.filter { it.pending && (it.allows(CategoryRequestRules.ASSIGN) || it.allows(CategoryRequestRules.REJECT)) }
    val visibleSlots get() = assigning?.let { CategoryRequestRules.slotsFor(slots, it.franja, wholeDay) } ?: emptyList()
    val orderedDoctors get() = assigning?.let { CategoryRequestRules.orderDoctors(it, doctors) } ?: doctors
    val canAssign get() = !saving && doctor?.hasShift == true && slot?.selectable == true
}

/**
 * Fase 2, flow A (S8): the patient asks for an appointment by reason (one to three categories, a time of day and a
 * note, the doctor only as an optional preference) and reception assigns doctor and slot from the pending inbox.
 * Actions follow `allowedActions`; every write goes through its own [SubmissionIntent] (Idempotency-Key).
 */
@HiltViewModel
class CategoryRequestsViewModel @Inject constructor(private val api: ApiGateway, realtime: RealtimeRepository) : ViewModel() {
    private val mutable = MutableStateFlow(CategoryRequestsState())
    val state = mutable.asStateFlow()
    private val live = LiveSubscription(realtime)
    private val createIntent = SubmissionIntent()
    private val resolveIntent = SubmissionIntent()
    private var slotsJob: Job? = null
    private var doctorsJob: Job? = null

    fun load(withCategories: Boolean = false) {
        viewModelScope.launch {
            mutable.update { it.copy(loading = true) }
            try {
                val categories = if (withCategories || mutable.value.categories.isNotEmpty()) CategoryRequestRules.categories(api.request(CategoryRequestRules.CATEGORIES_PATH)) else emptyList()
                val requests = CategoryRequestRules.requests(api.request(CategoryRequestRules.PATH))
                mutable.update { s -> s.copy(loading = false, categories = categories.ifEmpty { s.categories }, requests = requests,
                    assigning = s.assigning?.let { a -> requests.firstOrNull { it.id == a.id && it.pending } }) }
            } catch (e: CancellationException) { throw e } catch (e: Exception) {
                mutable.update { it.copy(loading = false, error = message(e)) }
            }
        }
    }

    fun startLive(channels: List<String>) {
        live.start(viewModelScope, channels) { signal ->
            if (signal is RealtimeSignal.Event && AppointmentEvents.matches(signal.event) || signal is RealtimeSignal.Resync) {
                load()
                if (mutable.value.assigning != null) loadSlots(keepSlot = true)
            }
        }
    }

    fun clearMessages() { mutable.update { it.copy(error = null, notice = null) } }

    // --- Patient ---

    /** Opens "Pedir cita"; after a system back ([leaveForm]) it resumes the same draft instead of starting over. */
    fun openForm() {
        loadLimit()
        if (mutable.value.draftKept) { mutable.update { it.copy(formOpen = true, draftKept = false, error = null, notice = null) }; return }
        createIntent.reset()
        mutable.update { it.copy(formOpen = true, query = "", picked = emptyList(), franja = RequestFranja.ANY, note = "", preferredDoctorId = null, error = null, notice = null) }
    }
    /** D128: asks the server whether a new request would be accepted; a failure (older API) leaves the form open as before. */
    private fun loadLimit() {
        viewModelScope.launch {
            val limit = try { CategoryRequestRules.limit(api.request(CategoryRequestRules.LIMIT_PATH)) } catch (e: CancellationException) { throw e } catch (e: Exception) { null }
            mutable.update { it.copy(limit = limit) }
        }
    }
    fun closeForm() { if (!mutable.value.saving) mutable.update { it.copy(formOpen = false, draftKept = false, error = null) } }

    /** R3 A-1: the system back leaves the form for the list and keeps what was typed; "Cancelar" ([closeForm]) discards it. */
    fun leaveForm() { if (!mutable.value.saving) mutable.update { it.copy(formOpen = false, draftKept = true, error = null) } }
    fun search(text: String) { mutable.update { it.copy(query = text.take(80)) } }
    fun toggle(code: String) { mutable.update { it.copy(picked = CategoryRequestRules.toggle(it.picked, code)) } }
    fun franja(value: RequestFranja) { mutable.update { it.copy(franja = value) } }
    fun note(text: String) { mutable.update { it.copy(note = text.take(CategoryRequestRules.NOTE_MAX)) } }
    fun preferredDoctor(id: String?) { mutable.update { it.copy(preferredDoctorId = id?.takeIf(String::isNotBlank)) } }

    fun send() {
        val s = mutable.value
        if (!s.canSend) return
        mutable.update { it.copy(saving = true, error = null, notice = null) }
        viewModelScope.launch {
            try {
                createIntent.send { api.request(CategoryRequestRules.PATH, "POST", CategoryRequestRules.createBody(s.picked, s.franja, s.note, s.preferredDoctorId)) }
                mutable.update { it.copy(saving = false, formOpen = false, notice = "Solicitud enviada. Recepción te asignará médico y hora.") }
                load()
            } catch (e: CancellationException) { throw e } catch (e: Exception) {
                mutable.update { it.copy(saving = false, error = message(e)) }
            }
        }
    }

    fun withdraw(request: CategoryRequest) {
        if (!request.allows(CategoryRequestRules.CANCEL)) return
        resolve(CategoryRequestRules.cancelPath(request), CategoryRequestRules.cancelBody(request), "Solicitud retirada.")
    }

    // --- Reception ---

    /**
     * Opens the inline assign panel. A-1, like the web: it first asks the server for its suggestion (`.../sugerencia`, the
     * first day with a gap in the requested time of day and that doctor); without one it falls back to the suggested
     * doctor and the first free slot, trying the next days.
     */
    fun openAssign(request: CategoryRequest, date: LocalDate = ReceptionScheduling.today()) {
        if (!request.allows(CategoryRequestRules.ASSIGN)) return
        resolveIntent.reset()
        suggestion = null
        mutable.update { it.copy(assigning = request, date = date, doctor = null, slots = emptyList(), slot = null, wholeDay = false, error = null, notice = null, searchingDay = true) }
        doctorsJob?.cancel()
        doctorsJob = viewModelScope.launch {
            val found = try { CategoryRequestRules.suggestion(api.request(CategoryRequestRules.suggestionPath(request))) }
                catch (e: CancellationException) { throw e } catch (_: Exception) { null }
            if (mutable.value.assigning?.id != request.id) return@launch
            suggestion = found
            if (found != null) { daysLeft = 0; mutable.update { it.copy(date = found.date) } } else daysLeft = SEARCH_DAYS - 1
            loadDoctors(prefill = true)
        }
    }

    /** The server's suggestion for the open request; used only on its own day, until the person picks another. */
    private var suggestion: sv.edu.catolica.climesa.domain.RequestSuggestion? = null

    /** Days still to try while looking for the first free one (A2; no API returns it, see gap A-1). */
    private var daysLeft = 0
    fun closeAssign() { if (!mutable.value.saving) { slotsJob?.cancel(); doctorsJob?.cancel(); mutable.update { it.copy(assigning = null, slots = emptyList(), slot = null) } } }

    fun selectDate(date: LocalDate) { daysLeft = 0; mutable.update { it.copy(date = date, slots = emptyList(), slot = null, searchingDay = false) }; loadDoctors(prefill = mutable.value.doctor == null) }

    fun pickDoctor(d: SchedulingDoctor) {
        if (!d.hasShift) return
        mutable.update { it.copy(doctor = d, slots = emptyList(), slot = null) }
        loadSlots(keepSlot = false)
    }
    fun pickSlot(slot: DaySlot) { if (slot.selectable) mutable.update { it.copy(slot = slot) } }
    fun wholeDay(value: Boolean) { mutable.update { s -> s.copy(wholeDay = value, slot = s.slot?.takeIf { value || s.assigning == null || CategoryRequestRules.inFranja(it.start, s.assigning.franja) }) } }

    fun assign() {
        val s = mutable.value
        val request = s.assigning ?: return
        val doctor = s.doctor ?: return
        val slot = s.slot ?: return
        if (!s.canAssign) return
        resolve(CategoryRequestRules.assignPath(request), CategoryRequestRules.assignBody(request, doctor.id, slot), "Cita asignada a ${request.patientName}.")
    }

    fun reject(request: CategoryRequest, reason: String) {
        if (!request.allows(CategoryRequestRules.REJECT)) return
        CategoryRequestRules.rejectError(reason)?.let { error -> mutable.update { it.copy(error = error) }; return }
        resolveIntent.reset()
        resolve(CategoryRequestRules.rejectPath(request), CategoryRequestRules.rejectBody(request, reason), "Solicitud rechazada.")
    }

    private fun resolve(path: String, body: JSONObject, done: String) {
        if (mutable.value.saving) return
        mutable.update { it.copy(saving = true, error = null, notice = null) }
        viewModelScope.launch {
            try {
                resolveIntent.send { api.request(path, "POST", body) }
                resolveIntent.reset()
                mutable.update { it.copy(saving = false, assigning = null, slots = emptyList(), slot = null, notice = done) }
                load()
            } catch (e: CancellationException) { throw e } catch (e: Exception) {
                mutable.update { it.copy(saving = false, error = message(e)) }
                if (mutable.value.assigning != null) loadSlots(keepSlot = false)
            }
        }
    }

    private fun loadDoctors(prefill: Boolean) {
        doctorsJob?.cancel()
        val date = mutable.value.date
        doctorsJob = viewModelScope.launch {
            try {
                val doctors = ReceptionScheduling.doctors(api.request("/citas/catalogos?date=$date") as JSONObject)
                mutable.update { s ->
                    val kept = s.doctor?.let { d -> doctors.firstOrNull { it.id == d.id && it.hasShift } }
                    val suggested = suggestion?.takeIf { it.date == date }?.let { sug -> doctors.firstOrNull { it.id == sug.doctorId && it.hasShift } }
                    s.copy(doctors = doctors, doctor = kept ?: if (prefill) suggested ?: s.assigning?.let { CategoryRequestRules.suggestedDoctor(it, doctors) } else null)
                }
                if (mutable.value.doctor != null) loadSlots(keepSlot = false) else advanceIfFull()
            } catch (e: CancellationException) { throw e } catch (e: Exception) {
                daysLeft = 0
                mutable.update { it.copy(error = message(e), searchingDay = false) }
            }
        }
    }

    private fun loadSlots(keepSlot: Boolean) {
        val s = mutable.value
        val doctor = s.doctor ?: return
        slotsJob?.cancel()
        mutable.update { it.copy(loadingSlots = true) }
        slotsJob = viewModelScope.launch {
            try {
                val slots = ReceptionScheduling.daySlots(api.request("/citas/disponibilidad?doctorId=${doctor.id}&date=${s.date}") as JSONObject)
                mutable.update { st ->
                    val kept = if (keepSlot) st.slot?.let { picked -> slots.firstOrNull { it.start == picked.start && it.selectable } } else null
                    val start = suggestion?.takeIf { it.date == s.date && it.doctorId == doctor.id }?.start
                    st.copy(loadingSlots = false, slots = slots, slot = kept ?: st.assigning?.let { CategoryRequestRules.suggestedSlot(slots, start, it.franja, st.wholeDay) })
                }
                advanceIfFull()
            } catch (e: CancellationException) { throw e } catch (e: Exception) {
                daysLeft = 0
                mutable.update { it.copy(loadingSlots = false, slots = emptyList(), slot = null, error = message(e), searchingDay = false) }
            }
        }
    }

    /** While searching, a day with no free slot in the requested time of day moves on to the next one. */
    private fun advanceIfFull() {
        val s = mutable.value
        if (!s.searchingDay) return
        if (s.slot != null || daysLeft <= 0 || s.assigning == null) { daysLeft = 0; mutable.update { it.copy(searchingDay = false) }; return }
        daysLeft--
        mutable.update { it.copy(date = it.date.plusDays(1), slots = emptyList(), slot = null) }
        loadDoctors(prefill = true)
    }

    private fun message(error: Exception) = businessMessage(error, "No se pudo completar la operación.")

    private companion object { const val SEARCH_DAYS = 7 }

    override fun onCleared() { live.stop(); slotsJob?.cancel(); doctorsJob?.cancel(); super.onCleared() }
}
