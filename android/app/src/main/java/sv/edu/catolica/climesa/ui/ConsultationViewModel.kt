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
import org.json.JSONObject
import sv.edu.catolica.climesa.data.ApiGateway
import sv.edu.catolica.climesa.data.DraftStore
import sv.edu.catolica.climesa.data.NoDraftStore
import sv.edu.catolica.climesa.domain.ConsultationResume
import sv.edu.catolica.climesa.domain.QueueConsultation
import sv.edu.catolica.climesa.data.realtime.LiveSubscription
import sv.edu.catolica.climesa.data.realtime.RealtimeRepository
import sv.edu.catolica.climesa.domain.ConsultationEvents
import sv.edu.catolica.climesa.domain.LabExam
import sv.edu.catolica.climesa.domain.LabOrderRules
import sv.edu.catolica.climesa.data.AuthRequestException
import sv.edu.catolica.climesa.domain.MedicalAppointment
import sv.edu.catolica.climesa.domain.RealtimeSignal

data class ConsultationState(
    val loading: Boolean = true,
    val appointments: List<MedicalAppointment> = emptyList(),
    val saving: Boolean = false,
    val error: String? = null,
    val notice: String? = null,
    /** Active lab catalog, loaded once when a physician with `laboratorio.ordenar` opens a consultation. */
    val labCatalog: List<LabExam> = emptyList(),
    val labCatalogLoading: Boolean = false,
    /** Called and in-attention numbers of the day (only with `fila.ver`), to start or resume their consultation. */
    val queue: List<QueueConsultation> = emptyList(),
    /** Consultation opened by id (from the queue or restored after process death). */
    val resumed: MedicalAppointment? = null,
    /** Ticket whose consultation is being started or opened. */
    val opening: String? = null,
)

@HiltViewModel
class ConsultationViewModel @Inject constructor(private val api: ApiGateway, realtime: RealtimeRepository, private val drafts: DraftStore = NoDraftStore) : ViewModel() {
    private val mutable = MutableStateFlow(ConsultationState())
    val state = mutable.asStateFlow()
    private val live = LiveSubscription(realtime)
    private var loadJob: Job? = null
    private var userId: String? = null
    private var withQueue = false

    /** Signed-in user (drafts are kept per user) and whether the agenda also lists the day's queue. */
    fun configure(userId: String, withQueue: Boolean) {
        if (this.userId != userId) { this.userId = userId; drafts.retainOnly(userId) }
        this.withQueue = withQueue
    }

    fun draft(consultationId: String) = userId?.let { drafts.load(it, "consulta:$consultationId") }
    fun saveDraft(consultationId: String, value: JSONObject) = userId?.let { drafts.save(it, "consulta:$consultationId", value) } ?: false
    fun clearDraft(consultationId: String) { userId?.let { drafts.clear(it, "consulta:$consultationId") } }

    /**
     * Loads the agenda. A [silent] reload (realtime invalidation, or after an action) keeps the shown agenda and
     * messages, and keeps the agenda if it fails. A newer load replaces one still running.
     */
    fun load(silent: Boolean = false) {
        if (!silent) mutable.value = mutable.value.copy(loading = true, error = null, notice = null)
        loadJob?.cancel()
        loadJob = viewModelScope.launch {
            try {
                val rows = parse(api.request("/consultas/agenda"))
                val queue = if (withQueue) ConsultationResume.attendable(ConsultationResume.parseQueue(api.request("/fila"))) else emptyList()
                mutable.value = mutable.value.copy(loading = false, appointments = rows, queue = queue)
            } catch (e: CancellationException) { throw e
            } catch (e: Exception) { if (!silent) mutable.value = mutable.value.copy(loading = false, error = message(e)) }
        }
    }

    /** Idempotent per channel list: reloads when a consultation or appointment event arrives, or after a gap. */
    fun startLive(channels: List<String>) {
        live.start(viewModelScope, channels) { signal ->
            if (signal is RealtimeSignal.Event && ConsultationEvents.matches(signal.event) || signal is RealtimeSignal.Resync) load(silent = true)
        }
    }

    fun start(item: MedicalAppointment, reason: String) {
        mutable.value = mutable.value.copy(saving = true, error = null, notice = null)
        viewModelScope.launch {
            try {
                api.request("/consultas", "POST", JSONObject().put("appointmentId", item.appointmentId).apply { if (reason.isNotBlank()) put("reason", reason.trim()) })
                mutable.value = mutable.value.copy(saving = false, notice = "Consulta iniciada.")
                load(silent = true)
            } catch (e: CancellationException) { throw e
            } catch (e: Exception) { mutable.value = mutable.value.copy(saving = false, error = message(e)) }
        }
    }

    /**
     * Starts the consultation of a called number, or resumes the doctor's own one: the id listed by `GET /fila`, or the
     * `consultaId` of a 409 `consulta_ya_iniciada`. Another doctor's consultation answers 409 without the id: shown as error.
     */
    fun attend(ticket: QueueConsultation) {
        ticket.consultationId?.let { open(it, ticket.number); return }
        mutable.value = mutable.value.copy(opening = ticket.ticketId, error = null, notice = null)
        viewModelScope.launch {
            try {
                val started = api.request("/consultas", "POST", JSONObject().put("ticketId", ticket.ticketId)) as JSONObject
                mutable.value = mutable.value.copy(opening = null)
                open(started.getString("id"), ticket.number)
                load(silent = true)
            } catch (e: CancellationException) { throw e
            } catch (e: AuthRequestException) {
                val own = ConsultationResume.resumableId(e.code, e.body)
                mutable.value = mutable.value.copy(opening = null, error = if (own == null) message(e) else null)
                own?.let { open(it, ticket.number) }
            } catch (e: Exception) { mutable.value = mutable.value.copy(opening = null, error = message(e)) }
        }
    }

    /** Loads a consultation by id (`GET /consultas/{id}/detalle`) into [ConsultationState.resumed]. */
    fun open(consultationId: String, number: Int?) {
        if (mutable.value.resumed?.consultationId == consultationId) return
        viewModelScope.launch {
            try {
                val item = ConsultationResume.fromDetail(api.request("/consultas/$consultationId/detalle"), number) ?: error("No se pudo abrir la consulta.")
                mutable.value = mutable.value.copy(resumed = item)
            } catch (e: CancellationException) { throw e
            } catch (e: Exception) { mutable.value = mutable.value.copy(error = message(e)) }
        }
    }

    fun closeResumed() { mutable.value = mutable.value.copy(resumed = null) }

    fun save(item: MedicalAppointment, reason: String, physicalExam: String, plan: String, onDone: () -> Unit = {}) {
        if (reason.trim().isBlank()) { mutable.value = mutable.value.copy(error = "Escribe el motivo de consulta."); return }
        mutable.value = mutable.value.copy(saving = true, error = null, notice = null)
        viewModelScope.launch {
            try {
                val result = api.request("/consultas/${item.consultationId}", "PATCH", JSONObject().put("version", item.version).put("reason", reason.trim()).put("physicalExam", physicalExam.trim()).put("plan", plan.trim())) as JSONObject
                val version = result.optInt("version", item.version + 1)
                replace(item, reason, physicalExam, plan, version, "Borrador guardado.")
                onDone()
            } catch (e: CancellationException) { throw e
            } catch (e: Exception) { mutable.value = mutable.value.copy(saving = false, error = message(e)) }
        }
    }

    fun sign(item: MedicalAppointment, reason: String, physicalExam: String, plan: String, onDone: () -> Unit = {}) {
        if (reason.trim().isBlank() || plan.trim().isBlank()) { mutable.value = mutable.value.copy(error = "Completa el motivo y el plan antes de firmar."); return }
        mutable.value = mutable.value.copy(saving = true, error = null, notice = null)
        viewModelScope.launch {
            try {
                val draft = api.request("/consultas/${item.consultationId}", "PATCH", JSONObject().put("version", item.version).put("reason", reason.trim()).put("physicalExam", physicalExam.trim()).put("plan", plan.trim())) as JSONObject
                val nextVersion = draft.optInt("version", item.version + 1)
                // The draft is already saved: keep its new version so a failed signature can be retried without a 409.
                keepDraft(item, reason, physicalExam, plan, nextVersion)
                api.request("/consultas/${item.consultationId}/firmar", "POST", JSONObject().put("version", nextVersion))
                item.consultationId?.let(::clearDraft)
                mutable.value = mutable.value.copy(saving = false, notice = "Consulta firmada y cita marcada como atendida.")
                load(silent = true); onDone()
            } catch (e: CancellationException) { throw e
            } catch (e: Exception) { mutable.value = mutable.value.copy(saving = false, error = message(e)) }
        }
    }

    fun signs(item: MedicalAppointment, systolic: String, diastolic: String, heartRate: String, temperature: String, oxygenSaturation: String) {
        if (item.consultationId == null) return
        val body = JSONObject().apply {
            number(systolic)?.let { put("systolic", it) }
            number(diastolic)?.let { put("diastolic", it) }
            number(heartRate)?.let { put("heartRate", it) }
            number(temperature)?.let { put("temperature", it) }
            number(oxygenSaturation)?.let { put("oxygenSaturation", it) }
        }
        if (body.length() == 0) { mutable.value = mutable.value.copy(error = "Escribe al menos un signo vital."); return }
        mutable.value = mutable.value.copy(saving = true, error = null, notice = null)
        viewModelScope.launch {
            try { api.request("/consultas/${item.consultationId}/signos", "POST", body); mutable.value = mutable.value.copy(saving = false, notice = "Signos vitales registrados.") }
            catch (e: CancellationException) { throw e }
            catch (e: Exception) { mutable.value = mutable.value.copy(saving = false, error = message(e)) }
        }
    }

    /** [onDone] runs only after the API accepts the diagnosis, so the form keeps what was typed on failure. */
    fun diagnosis(item: MedicalAppointment, code: String, note: String, principal: Boolean, onDone: () -> Unit = {}) {
        if (item.consultationId == null || code.trim().isBlank()) return
        val body = JSONObject().put("code", code.trim().uppercase()).put("principal", principal).apply { if (note.trim().isNotBlank()) put("note", note.trim()) }
        mutable.value = mutable.value.copy(saving = true, error = null, notice = null)
        viewModelScope.launch {
            try { api.request("/consultas/${item.consultationId}/diagnosticos", "POST", body); mutable.value = mutable.value.copy(saving = false, notice = "Diagnóstico registrado."); onDone() }
            catch (e: CancellationException) { throw e }
            catch (e: Exception) { mutable.value = mutable.value.copy(saving = false, error = message(e)) }
        }
    }

    /** [onDone] runs only after the API accepts the prescription, so the form keeps what was typed on failure. */
    fun prescription(item: MedicalAppointment, medication: String, dose: String, route: String, frequency: String, duration: String, instructions: String, onDone: () -> Unit = {}) {
        if (item.consultationId == null || listOf(medication, dose, route, frequency, duration).any { it.trim().isBlank() }) { mutable.value = mutable.value.copy(error = "Completa medicamento, dosis, vía, frecuencia y duración."); return }
        val itemBody = JSONObject().put("medication", medication.trim()).put("dose", dose.trim()).put("route", route.trim()).put("frequency", frequency.trim()).put("duration", duration.trim()).apply { if (instructions.trim().isNotBlank()) put("instructions", instructions.trim()) }
        val body = JSONObject().put("items", JSONArray().put(itemBody))
        mutable.value = mutable.value.copy(saving = true, error = null, notice = null)
        viewModelScope.launch {
            try { api.request("/consultas/${item.consultationId}/receta", "POST", body); mutable.value = mutable.value.copy(saving = false, notice = "Receta emitida."); onDone() }
            catch (e: CancellationException) { throw e }
            catch (e: Exception) { mutable.value = mutable.value.copy(saving = false, error = message(e)) }
        }
    }

    /** Loads the lab catalog once; a failure is shown and the next call retries. */
    fun loadLabCatalog() {
        val current = mutable.value
        if (current.labCatalog.isNotEmpty() || current.labCatalogLoading) return
        mutable.value = current.copy(labCatalogLoading = true)
        viewModelScope.launch {
            try { val exams = LabOrderRules.parseCatalog(api.request("/laboratorio/catalogo")); mutable.value = mutable.value.copy(labCatalogLoading = false, labCatalog = exams) }
            catch (e: CancellationException) { throw e }
            catch (e: Exception) { mutable.value = mutable.value.copy(labCatalogLoading = false, error = message(e)) }
        }
    }

    /** `POST /laboratorio/ordenes` for this consultation; [onDone] runs only after the API accepts the order. */
    fun orderLab(item: MedicalAppointment, exams: Collection<String>, urgent: Boolean, onDone: () -> Unit = {}) {
        LabOrderRules.error(item.consultationId, exams)?.let { mutable.value = mutable.value.copy(error = it); return }
        val consultationId = item.consultationId ?: return
        mutable.value = mutable.value.copy(saving = true, error = null, notice = null)
        viewModelScope.launch {
            try { api.request("/laboratorio/ordenes", "POST", LabOrderRules.body(consultationId, exams, urgent)); mutable.value = mutable.value.copy(saving = false, notice = "Orden de laboratorio emitida."); onDone() }
            catch (e: CancellationException) { throw e }
            catch (e: Exception) { mutable.value = mutable.value.copy(saving = false, error = message(e)) }
        }
    }

    fun clearMessages() { mutable.value = mutable.value.copy(error = null, notice = null) }

    private fun replace(item: MedicalAppointment, reason: String, physicalExam: String, plan: String, version: Int, notice: String) {
        keepDraft(item, reason, physicalExam, plan, version)
        mutable.value = mutable.value.copy(saving = false, notice = notice)
    }

    /** Stores the saved draft and its server version locally, without touching the saving flag or messages. */
    private fun keepDraft(item: MedicalAppointment, reason: String, physicalExam: String, plan: String, version: Int) {
        val update = { current: MedicalAppointment -> if (current.consultationId == item.consultationId) current.copy(consultationReason = reason, physicalExam = physicalExam, plan = plan, version = version) else current }
        mutable.value = mutable.value.copy(appointments = mutable.value.appointments.map(update), resumed = mutable.value.resumed?.let(update))
    }

    private fun parse(value: Any): List<MedicalAppointment> {
        val rows = value as? JSONArray ?: return emptyList()
        return (0 until rows.length()).mapNotNull { i -> rows.optJSONObject(i)?.let { row ->
            MedicalAppointment(row.optString("appointmentId"), row.optString("patientId"), row.optString("patientName"), row.optString("start"), row.optString("end"), row.optString("appointmentState"), row.optString("reason").takeIf(String::isNotBlank), row.optString("consultationId").takeIf(String::isNotBlank), row.optString("consultationState").takeIf(String::isNotBlank), row.optString("consultationReason").takeIf(String::isNotBlank), row.optString("physicalExam").takeIf(String::isNotBlank), row.optString("plan").takeIf(String::isNotBlank), row.optInt("version", 1))
        } }
    }

    private fun message(error: Exception) = when (error) { is AuthRequestException -> error.message ?: "No se pudo completar la operación."; else -> error.message ?: "No se pudo completar la operación." }
    private fun number(value: String): Double? = value.trim().toDoubleOrNull()
}
