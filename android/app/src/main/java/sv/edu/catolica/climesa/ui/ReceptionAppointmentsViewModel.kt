package sv.edu.catolica.climesa.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
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
import sv.edu.catolica.climesa.domain.AppointmentEvents
import sv.edu.catolica.climesa.data.realtime.RealtimeRepository
import sv.edu.catolica.climesa.domain.DaySlot
import sv.edu.catolica.climesa.domain.PickerPatient
import sv.edu.catolica.climesa.domain.ReceptionAppointment
import sv.edu.catolica.climesa.domain.ReceptionScheduling
import sv.edu.catolica.climesa.domain.RealtimeSignal
import sv.edu.catolica.climesa.domain.SchedulingDoctor
import java.net.URLEncoder
import java.time.LocalDate

data class ReceptionAppointmentsState(
    val loading: Boolean = true,
    val appointments: List<ReceptionAppointment> = emptyList(),
    val scheduling: Boolean = false,
    val query: String = "",
    val results: List<PickerPatient> = emptyList(),
    val hasMore: Boolean = false,
    val searching: Boolean = false,
    val patient: PickerPatient? = null,
    val date: LocalDate = ReceptionScheduling.today(),
    val doctors: List<SchedulingDoctor> = emptyList(),
    val doctor: SchedulingDoctor? = null,
    val slots: List<DaySlot> = emptyList(),
    val loadingSlots: Boolean = false,
    val slot: DaySlot? = null,
    val reason: String = "",
    val saving: Boolean = false,
    val error: String? = null,
    val notice: String? = null,
) {
    val canConfirm get() = !saving && ReceptionScheduling.canConfirm(patient, doctor, slot)
}

/** A32: Recepción agenda citas buscando al paciente, viendo médicos con y sin turno y todas las franjas del día. */
@HiltViewModel
class ReceptionAppointmentsViewModel @Inject constructor(private val api: ApiGateway, realtime: RealtimeRepository) : ViewModel() {
    private val mutable = MutableStateFlow(ReceptionAppointmentsState())
    val state = mutable.asStateFlow()
    private val live = LiveSubscription(realtime)
    private var searchJob: Job? = null
    private var slotsJob: Job? = null
    private var doctorsJob: Job? = null
    /** Espera entre teclas; las pruebas lo ponen en cero. */
    internal var debounceMs: Long = ReceptionScheduling.DEBOUNCE_MS

    fun load() {
        viewModelScope.launch {
            mutable.update { it.copy(loading = true, error = null) }
            try {
                val rows = ReceptionScheduling.appointments(api.request("/citas") as? JSONArray ?: JSONArray())
                mutable.update { it.copy(loading = false, appointments = rows) }
            } catch (e: CancellationException) { throw e } catch (e: Exception) {
                mutable.update { it.copy(loading = false, error = e.message ?: "No se pudieron cargar las citas.") }
            }
        }
    }

    fun startLive(channels: List<String>) {
        live.start(viewModelScope, channels) { signal ->
            if (signal is RealtimeSignal.Event && AppointmentEvents.matches(signal.event) || signal is RealtimeSignal.Resync) {
                load()
                if (mutable.value.scheduling) { loadDoctors(); loadSlots() }
            }
        }
    }

    fun openScheduling() {
        mutable.update { ReceptionAppointmentsState(loading = it.loading, appointments = it.appointments, scheduling = true, date = it.date) }
        loadDoctors()
    }
    fun closeScheduling() { searchJob?.cancel(); slotsJob?.cancel(); doctorsJob?.cancel(); mutable.update { it.copy(scheduling = false, error = null) } }

    /** Búsqueda mientras se escribe: espera, pide solo desde dos caracteres y descarta respuestas de consultas viejas. */
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
            val page = ReceptionScheduling.pickerPage(api.request("/pacientes/selector?query=${URLEncoder.encode(q.trim(), "UTF-8")}&limit=10&offset=$offset") as JSONObject)
            if (mutable.value.query.trim() == q.trim()) mutable.update { it.copy(searching = false, results = if (offset == 0) page.items else it.results + page.items, hasMore = page.hasMore) }
        } catch (e: CancellationException) { throw e } catch (e: Exception) {
            mutable.update { it.copy(searching = false, error = e.message ?: "No se pudo buscar.") }
        }
    }

    fun pickPatient(p: PickerPatient?) { mutable.update { it.copy(patient = p, query = "", results = emptyList(), hasMore = false) } }

    fun selectDate(date: LocalDate) {
        mutable.update { it.copy(date = date, slot = null, slots = emptyList()) }
        loadDoctors(); loadSlots()
    }

    /** Un médico sin turno ese día no se puede elegir. */
    fun pickDoctor(d: SchedulingDoctor?) {
        if (d != null && !d.hasShift) return
        mutable.update { it.copy(doctor = d, slot = null, slots = emptyList()) }
        loadSlots()
    }
    fun pickSlot(s: DaySlot?) { if (s == null || s.selectable) mutable.update { it.copy(slot = s) } }
    fun reason(text: String) { mutable.update { it.copy(reason = text.take(500)) } }

    private fun loadDoctors() {
        doctorsJob?.cancel()
        val date = mutable.value.date
        doctorsJob = viewModelScope.launch {
            try {
                val doctors = ReceptionScheduling.doctors(api.request("/citas/catalogos?date=$date") as JSONObject)
                mutable.update { s -> s.copy(doctors = doctors, doctor = s.doctor?.let { d -> doctors.firstOrNull { it.id == d.id } }) }
            } catch (e: CancellationException) { throw e } catch (e: Exception) {
                mutable.update { it.copy(error = e.message ?: "No se pudieron cargar los médicos.") }
            }
        }
    }

    private fun loadSlots() {
        slotsJob?.cancel()
        val s = mutable.value
        val doctor = s.doctor ?: return
        mutable.update { it.copy(loadingSlots = true) }
        slotsJob = viewModelScope.launch {
            try {
                val slots = ReceptionScheduling.daySlots(api.request("/citas/disponibilidad?doctorId=${doctor.id}&date=${s.date}") as JSONObject)
                mutable.update { st -> st.copy(loadingSlots = false, slots = slots, slot = st.slot?.takeIf { chosen -> slots.any { it.start == chosen.start && it.selectable } }) }
            } catch (e: CancellationException) { throw e } catch (e: Exception) {
                mutable.update { it.copy(loadingSlots = false, slots = emptyList(), error = e.message ?: "No se pudo consultar el horario.") }
            }
        }
    }

    fun confirm() {
        val s = mutable.value
        val patient = s.patient; val doctor = s.doctor; val slot = s.slot
        if (!s.canConfirm || patient == null || doctor == null || slot == null) return
        mutable.update { it.copy(saving = true, error = null) }
        viewModelScope.launch {
            try {
                api.request("/citas", "POST", ReceptionScheduling.createBody(patient, doctor, slot, s.reason))
                mutable.update { it.copy(saving = false, scheduling = false, notice = "Cita agendada para ${patient.name}.") }
                load()
            } catch (e: CancellationException) { throw e } catch (e: Exception) {
                // El horario pudo ocuparse mientras se elegía: se vuelve a pedir el día para mostrar el estado real.
                mutable.update { it.copy(saving = false, slot = null, error = e.message ?: "No se pudo agendar la cita.") }
                loadSlots()
            }
        }
    }

    fun clearMessages() { mutable.update { it.copy(error = null, notice = null) } }
    override fun onCleared() { live.stop(); searchJob?.cancel(); slotsJob?.cancel(); doctorsJob?.cancel(); super.onCleared() }
}
