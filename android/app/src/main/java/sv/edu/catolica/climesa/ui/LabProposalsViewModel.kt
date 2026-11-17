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
import sv.edu.catolica.climesa.data.realtime.LiveSubscription
import sv.edu.catolica.climesa.data.realtime.RealtimeRepository
import sv.edu.catolica.climesa.domain.AppointmentEvents
import sv.edu.catolica.climesa.domain.DaySlot
import sv.edu.catolica.climesa.domain.LabProposal
import sv.edu.catolica.climesa.domain.LabProposalRules
import sv.edu.catolica.climesa.domain.LaboratoryEvents
import sv.edu.catolica.climesa.domain.RealtimeSignal
import sv.edu.catolica.climesa.domain.ReceptionScheduling
import java.time.LocalDate

/** What the open proposal row is doing: scheduling a slot or writing the reason to discard it. */
enum class ProposalMode { SCHEDULE, DISCARD }

data class LabProposalsState(
    val loading: Boolean = true,
    val proposals: List<LabProposal> = emptyList(),
    val busy: Boolean = false,
    val error: String? = null,
    val notice: String? = null,
    /** Row being worked on and how. */
    val activeId: String? = null,
    val mode: ProposalMode? = null,
    /** Day and free slots of the proposal's doctor (`GET /citas/disponibilidad`). */
    val date: LocalDate = ReceptionScheduling.today().plusDays(7),
    val slots: List<DaySlot> = emptyList(),
    val loadingSlots: Boolean = false,
    /**
     * Appointment already created for a proposal whose link failed: a retry links that same appointment and never
     * posts `/citas` again (web `scheduled`).
     */
    val scheduled: Map<String, String> = emptyMap(),
)

/**
 * C1: reception's «Citas de seguimiento por confirmar», like the web panel. Scheduling uses the existing commands
 * (`POST /citas`, then `POST /laboratorio/seguimientos/{id}/confirmar`); discarding needs a reason. Every write is
 * guarded while busy and reloads the list after it.
 */
@HiltViewModel
class LabProposalsViewModel @Inject constructor(private val api: ApiGateway, realtime: RealtimeRepository) : ViewModel() {
    private val mutable = MutableStateFlow(LabProposalsState())
    val state = mutable.asStateFlow()
    private val live = LiveSubscription(realtime)
    private var loadJob: Job? = null
    private var slotsJob: Job? = null

    /** A [silent] reload (realtime, after a write) keeps the list and messages visible, also when it fails. */
    fun load(silent: Boolean = false) {
        if (!silent) mutable.update { it.copy(loading = true, error = null) }
        loadJob?.cancel()
        loadJob = viewModelScope.launch {
            try {
                val rows = LabProposalRules.parse(api.request(LabProposalRules.PATH))
                mutable.update { s -> s.copy(loading = false, proposals = rows, activeId = s.activeId?.takeIf { id -> rows.any { it.id == id } }) }
            } catch (e: CancellationException) { throw e } catch (e: Exception) {
                if (!silent) mutable.update { it.copy(loading = false, error = userMessage(e, "No se pudieron cargar las citas de seguimiento.")) }
            }
        }
    }

    /** Results arriving publish `laboratorio.*`; a new appointment can take the slot being chosen (`cita.*`, `turno`). */
    fun startLive(channels: List<String>) {
        live.start(viewModelScope, channels) { signal ->
            val event = (signal as? RealtimeSignal.Event)?.event
            if (event != null && LaboratoryEvents.matches(event) || signal is RealtimeSignal.Resync) load(silent = true)
            if (event != null && AppointmentEvents.matches(event) && mutable.value.mode == ProposalMode.SCHEDULE) loadSlots()
        }
    }

    fun openSchedule(proposal: LabProposal) {
        if (mutable.value.busy) return
        mutable.update { it.copy(activeId = proposal.id, mode = ProposalMode.SCHEDULE, error = null, notice = null, slots = emptyList(), date = ReceptionScheduling.today().plusDays(7)) }
        loadSlots()
    }

    fun openDiscard(proposal: LabProposal) {
        if (mutable.value.busy) return
        mutable.update { it.copy(activeId = proposal.id, mode = ProposalMode.DISCARD, error = null, notice = null) }
    }

    fun close() { if (!mutable.value.busy) { slotsJob?.cancel(); mutable.update { it.copy(activeId = null, mode = null, error = null, slots = emptyList()) } } }

    fun selectDate(date: LocalDate) { mutable.update { it.copy(date = date, slots = emptyList()) }; loadSlots() }

    private fun loadSlots() {
        val s = mutable.value
        val proposal = s.proposals.firstOrNull { it.id == s.activeId } ?: return
        slotsJob?.cancel()
        mutable.update { it.copy(loadingSlots = true) }
        slotsJob = viewModelScope.launch {
            try {
                val slots = ReceptionScheduling.daySlots(api.request("/citas/disponibilidad?doctorId=${proposal.doctorId}&date=${s.date}") as JSONObject)
                mutable.update { it.copy(loadingSlots = false, slots = slots) }
            } catch (e: CancellationException) { throw e } catch (e: Exception) {
                mutable.update { it.copy(loadingSlots = false, slots = emptyList(), error = userMessage(e, "No se pudo consultar el horario del médico.")) }
            }
        }
    }

    /**
     * Schedules [slot] with `POST /citas` and links it to the proposal. When the link fails after the appointment exists,
     * the appointment is remembered and the next call (with or without a slot) only retries the link.
     */
    fun confirm(proposal: LabProposal, slot: DaySlot?) {
        val s = mutable.value
        if (s.busy) return
        val existing = s.scheduled[proposal.id]
        if (existing == null && (slot == null || !slot.selectable)) { mutable.update { it.copy(error = "Elige una hora libre.") }; return }
        mutable.update { it.copy(busy = true, error = null, notice = null) }
        viewModelScope.launch {
            var created = existing
            try {
                if (created == null) {
                    created = (api.request("/citas", "POST", LabProposalRules.appointmentBody(proposal, slot!!)) as JSONObject).getString("id")
                    mutable.update { it.copy(scheduled = it.scheduled + (proposal.id to created)) }
                }
                api.request(LabProposalRules.confirmPath(proposal.id), "POST", LabProposalRules.confirmBody(proposal.version, created))
                mutable.update { it.copy(busy = false, activeId = null, mode = null, slots = emptyList(), scheduled = it.scheduled - proposal.id, notice = "Cita de seguimiento agendada para ${proposal.patientName}.") }
                load(silent = true)
            } catch (e: CancellationException) { throw e } catch (e: Exception) {
                val linkPending = created != null
                mutable.update { it.copy(busy = false, error = userMessage(e, if (linkPending) "La cita quedó agendada, pero no se enlazó. Vuelve a intentar." else "No se pudo agendar la cita.")) }
                // The slot may have been taken meanwhile: show the doctor's day as it is now.
                if (!linkPending) loadSlots()
                load(silent = true)
            }
        }
    }

    /** Discards the proposal with a reason of 10 to 500 characters. */
    fun discard(proposal: LabProposal, reason: String) {
        if (mutable.value.busy) return
        LabProposalRules.discardError(reason)?.let { error -> mutable.update { it.copy(error = error) }; return }
        mutable.update { it.copy(busy = true, error = null, notice = null) }
        viewModelScope.launch {
            try {
                api.request(LabProposalRules.discardPath(proposal.id), "POST", LabProposalRules.discardBody(proposal.version, reason))
                mutable.update { it.copy(busy = false, activeId = null, mode = null, notice = "Propuesta de ${proposal.patientName} descartada.") }
                load(silent = true)
            } catch (e: CancellationException) { throw e } catch (e: Exception) {
                mutable.update { it.copy(busy = false, error = userMessage(e, "No se pudo descartar la propuesta.")) }
                load(silent = true)
            }
        }
    }

    fun clearMessages() { mutable.update { it.copy(error = null, notice = null) } }

    override fun onCleared() { live.stop(); slotsJob?.cancel(); super.onCleared() }
}
