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
import sv.edu.catolica.climesa.domain.ConsultationRecord
import sv.edu.catolica.climesa.domain.ConsultationRecordRules
import sv.edu.catolica.climesa.domain.RecordedLabOrder
import sv.edu.catolica.climesa.domain.QueueConsultation
import sv.edu.catolica.climesa.data.realtime.LiveSubscription
import sv.edu.catolica.climesa.data.realtime.RealtimeRepository
import sv.edu.catolica.climesa.domain.DoctorDayEvents
import sv.edu.catolica.climesa.domain.LabExam
import sv.edu.catolica.climesa.domain.LabOrderRules
import sv.edu.catolica.climesa.data.AuthRequestException
import sv.edu.catolica.climesa.domain.MedicalAppointment
import sv.edu.catolica.climesa.domain.RealtimeSignal
import sv.edu.catolica.climesa.domain.ReceptionAppointment
import sv.edu.catolica.climesa.domain.ReceptionScheduling
import sv.edu.catolica.climesa.domain.UnsignedConsultation
import sv.edu.catolica.climesa.domain.NextProposal
import sv.edu.catolica.climesa.domain.QueueRules

data class ConsultationState(
    /** Why the consultation record (or its lab orders) could not be read; null when it is current. */
    val recordError: String? = null,
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
    /** m-22: own open consultations of any day (`GET /consultas/sin-firmar`). */
    val unsigned: List<UnsignedConsultation> = emptyList(),
    /** Own appointments with a patient's reschedule request the doctor can decide (`GET /citas`). */
    val reschedules: List<ReceptionAppointment> = emptyList(),
    /** S9: after signing, who goes next in the consultation's area (`nextProposal` of the signature). */
    val handoff: NextProposal? = null,
    /** B4: someone waits in general consultation (`GET /fila`), so a doctor who may call can call the first patient. */
    val waitingGeneral: Boolean = false,
    /** B4: what the open consultation already has (diagnoses, medications, lab orders), listed under each step. */
    val record: ConsultationRecord? = null,
    /** B4: the success of a step, shown under that step ([RecordSection]) instead of behind the page. */
    val stepNotice: Pair<RecordSection, String>? = null,
    /** Row 1: the queue number whose call, undo, absence or priority is being sent; only its buttons show progress. */
    val queueBusy: String? = null,
)

/** Steps of the consultation whose success shows in place. */
enum class RecordSection { SIGNS, DIAGNOSIS, PRESCRIPTION, LAB }

@HiltViewModel
class ConsultationViewModel @Inject constructor(private val api: ApiGateway, realtime: RealtimeRepository, private val drafts: DraftStore = NoDraftStore) : ViewModel() {
    private val mutable = MutableStateFlow(ConsultationState())
    val state = mutable.asStateFlow()
    private val live = LiveSubscription(realtime)
    private var loadJob: Job? = null
    private var userId: String? = null
    private var withQueue = false
    private var withUnsigned = false
    private var withReschedules = false

    /**
     * Signed-in user (drafts are kept per user) and what the screen also lists: the day's queue, the own unsigned
     * consultations and the patients' reschedule requests of the own appointments.
     */
    fun configure(userId: String, withQueue: Boolean, withUnsigned: Boolean = false, withReschedules: Boolean = false) {
        if (this.userId != userId) { this.userId = userId; drafts.retainOnly(userId, sv.edu.catolica.climesa.data.SessionDrafts.PENDING_WRITES) }
        this.withQueue = withQueue
        this.withUnsigned = withUnsigned
        this.withReschedules = withReschedules
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
                val rows = ConsultationResume.parseAgenda(api.request("/consultas/agenda"))
                val day = if (withQueue) ConsultationResume.parseQueue(api.request("/fila")) else emptyList()
                val queue = ConsultationResume.attendable(day)
                // Secondary lists: a failure leaves them as they were instead of hiding the agenda.
                val unsigned = if (withUnsigned) optional { ConsultationResume.parseUnsigned(api.request("/consultas/sin-firmar")) } ?: mutable.value.unsigned else emptyList()
                val reschedules = if (withReschedules) optional { ReceptionScheduling.rescheduleDecisions(ReceptionScheduling.appointments(api.request("/citas") as? JSONArray ?: JSONArray())) } ?: mutable.value.reschedules else emptyList()
                mutable.value = mutable.value.copy(loading = false, appointments = rows, queue = queue, unsigned = unsigned, reschedules = reschedules, waitingGeneral = ConsultationResume.waitingInGeneral(day))
            } catch (e: CancellationException) { throw e
            } catch (e: Exception) { if (!silent) mutable.value = mutable.value.copy(loading = false, error = message(e)) }
        }
    }

    /** Idempotent per channel list: reloads when a consultation or appointment event arrives, or after a gap. */
    fun startLive(channels: List<String>) {
        live.start(viewModelScope, channels) { signal ->
            if (signal is RealtimeSignal.Event && DoctorDayEvents.matches(signal.event) || signal is RealtimeSignal.Resync) load(silent = true)
        }
    }

    fun start(item: MedicalAppointment, reason: String) {
        if (!item.canStart) { mutable.value = mutable.value.copy(error = item.startBlockedReason ?: "La consulta no se puede iniciar ahora."); return }
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

    /** "Reanudar" an unsigned consultation: opens it by id like the queue does. */
    fun resume(consultation: UnsignedConsultation) { open(consultation.id, null) }

    fun closeResumed() { mutable.value = mutable.value.copy(resumed = null, record = null, stepNotice = null) }

    private var withLabOrders = false
    /**
     * B4: reads what the consultation already has: diagnoses and prescriptions from its detail, and the lab orders of this
     * consultation from the physician's order list (needs `resultados.ver`). A failure keeps what was shown.
     */
    fun loadRecord(consultationId: String, withLabOrders: Boolean = this.withLabOrders) {
        this.withLabOrders = withLabOrders
        viewModelScope.launch {
            try {
                val detail = api.request("/consultas/$consultationId/detalle")
                // #6: an unreadable order list is never shown as "Exámenes (0)": it is said, and ordering waits for it.
                var ordersError: Exception? = null
                val read = if (withLabOrders) try { ConsultationRecordRules.labOrders(api.request("/laboratorio/ordenes"), consultationId) } catch (e: CancellationException) { throw e } catch (e: Exception) { ordersError = e; null } else emptyList()
                val previous = mutable.value.record?.takeIf { it.consultationId == consultationId }
                val orders = read ?: previous?.labOrders.orEmpty()
                val ordered = previous?.orderedIds.orEmpty() + storedOrdered(consultationId)
                mutable.value = mutable.value.copy(
                    record = ConsultationRecord(consultationId, ConsultationRecordRules.diagnoses(detail), ConsultationRecordRules.medications(detail), orders, ordered, labOrdersKnown = read != null, vitals = ConsultationRecordRules.vitals(detail)),
                    recordError = ordersError?.let { userMessage(it, "No se pudieron leer las órdenes de laboratorio de esta consulta.") },
                )
            } catch (e: CancellationException) { throw e
            } catch (e: Exception) { mutable.value = mutable.value.copy(recordError = userMessage(e, "No se pudo leer lo registrado en esta consulta.")) }
        }
    }

    private fun stepDone(item: MedicalAppointment, section: RecordSection, text: String) {
        mutable.value = mutable.value.copy(saving = false, stepNotice = section to text)
        item.consultationId?.let { loadRecord(it) }
    }

    fun save(item: MedicalAppointment, reason: String, physicalExam: String, plan: String, onDone: () -> Unit = {}) {
        if (mutable.value.saving) return
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

    /** Saves the notes, then signs at the version the save returned; `saving` spans both writes so a second tap sends nothing. */
    fun sign(item: MedicalAppointment, reason: String, physicalExam: String, plan: String, onDone: () -> Unit = {}) {
        if (mutable.value.saving) return
        sv.edu.catolica.climesa.domain.ConsultationRecordRules.signBlocker(reason.trim(), plan.trim())?.let { mutable.value = mutable.value.copy(error = it); return }
        mutable.value = mutable.value.copy(saving = true, error = null, notice = null)
        viewModelScope.launch {
            try {
                val draft = api.request("/consultas/${item.consultationId}", "PATCH", JSONObject().put("version", item.version).put("reason", reason.trim()).put("physicalExam", physicalExam.trim()).put("plan", plan.trim())) as JSONObject
                val nextVersion = draft.optInt("version", item.version + 1)
                // The draft is already saved: keep its new version so a failed signature can be retried without a 409.
                keepDraft(item, reason, physicalExam, plan, nextVersion)
                val signed = api.request("/consultas/${item.consultationId}/firmar", "POST", JSONObject().put("version", nextVersion))
                item.consultationId?.let(::clearDraft)
                val handoff = (signed as? JSONObject)?.opt("nextProposal")?.let(QueueRules::parseNext)
                // D35: only a consultation that came from an appointment marks one as attended.
                mutable.value = mutable.value.copy(saving = false, notice = sv.edu.catolica.climesa.domain.ConsultationRecordRules.signedNotice(item.appointmentId.isNotBlank()), handoff = handoff)
                load(silent = true); onDone()
            } catch (e: CancellationException) { throw e
            } catch (e: Exception) { mutable.value = mutable.value.copy(saving = false, error = message(e)) }
        }
    }

    /** Calls the proposed number (`POST /fila/{id}/llamar` with its version); the handoff closes when it is called. */
    fun callProposed() {
        val proposal = mutable.value.handoff?.proposal ?: return
        if (mutable.value.saving) return
        mutable.value = mutable.value.copy(saving = true, error = null)
        viewModelScope.launch {
            try {
                api.request("/fila/${proposal.id}/llamar", "POST", JSONObject().put("version", proposal.version))
                mutable.value = mutable.value.copy(saving = false, handoff = null, notice = "Llamaste ${proposal.code}.")
                load(silent = true)
            } catch (e: CancellationException) { throw e
            } catch (e: Exception) { mutable.value = mutable.value.copy(saving = false, error = message(e)) }
        }
    }

    /**
     * B4: the first patient of the day. The API picks who waits in general consultation by its rule
     * (`POST /fila/llamar-siguiente`); the reload then shows the number as called by this doctor (`calledByMe`).
     */
    fun callWaiting() {
        if (mutable.value.saving) return
        mutable.value = mutable.value.copy(saving = true, error = null, notice = null)
        viewModelScope.launch {
            try {
                val called = api.request("/fila/llamar-siguiente", "POST", QueueRules.callNextBody("consulta_general")) as? JSONObject
                val number = called?.optInt("numero", 0)?.takeIf { it > 0 }
                mutable.value = mutable.value.copy(saving = false, notice = number?.let { "Llamaste CON $it." } ?: "Número llamado.")
                load(silent = true)
            } catch (e: CancellationException) { throw e
            } catch (e: Exception) { mutable.value = mutable.value.copy(saving = false, error = message(e)) }
        }
    }

    /** Row 1: "Volver a llamar" a called number (`POST /fila/{id}/llamar` at its version). */
    fun callAgain(ticket: QueueConsultation) = queueWrite(ticket, "/fila/${ticket.ticketId}/llamar", JSONObject().put("version", ticket.version), "Llamaste ${ticket.code} de nuevo.")

    /** Row 1: undo the doctor's own call while the number is still called. */
    fun undoCall(ticket: QueueConsultation) = queueWrite(ticket, "/fila/${ticket.ticketId}/deshacer-llamado", QueueRules.undoBody(ticket.version), "Llamado de ${ticket.code} deshecho.")

    /** Row 1: "No se presentó", sent after the screen's confirmation (there is no inverse endpoint). */
    fun markAbsent(ticket: QueueConsultation) = queueWrite(ticket, "/fila/${ticket.ticketId}/no-se-presento", JSONObject().put("version", ticket.version), "${ticket.code} se marcó como no presentado.")

    /** Row 1: clinical priority of the number (`fila.gestionar`). */
    fun changePriority(ticket: QueueConsultation, priority: String) = queueWrite(ticket, "/fila/${ticket.ticketId}/prioridad", QueueRules.priorityBody(ticket.version, priority), "Prioridad de ${ticket.code}: ${sv.edu.catolica.climesa.domain.QueueLabels.priority(priority)}.")

    private fun queueWrite(ticket: QueueConsultation, path: String, body: JSONObject, notice: String) {
        if (mutable.value.queueBusy != null || mutable.value.saving) return
        mutable.value = mutable.value.copy(queueBusy = ticket.ticketId, error = null, notice = null)
        viewModelScope.launch {
            try {
                api.request(path, "POST", body)
                mutable.value = mutable.value.copy(queueBusy = null, notice = notice)
                load(silent = true)
            } catch (e: CancellationException) { throw e
            } catch (e: Exception) { mutable.value = mutable.value.copy(queueBusy = null, error = message(e)) }
        }
    }

    fun dismissHandoff() { mutable.value = mutable.value.copy(handoff = null) }

    fun signs(item: MedicalAppointment, systolic: String, diastolic: String, heartRate: String, temperature: String, oxygenSaturation: String, onDone: () -> Unit = {}) {
        if (item.consultationId == null) return
        val body = JSONObject().apply {
            number(systolic)?.let { put("systolic", it) }
            number(diastolic)?.let { put("diastolic", it) }
            number(heartRate)?.let { put("heartRate", it) }
            number(temperature)?.let { put("temperature", it) }
            number(oxygenSaturation)?.let { put("oxygenSaturation", it) }
        }
        if (body.length() == 0) { mutable.value = mutable.value.copy(error = "Escribe al menos un signo vital."); return }
        if (mutable.value.saving) return
        mutable.value = mutable.value.copy(saving = true, error = null, notice = null, stepNotice = null)
        viewModelScope.launch {
            try { api.request("/consultas/${item.consultationId}/signos", "POST", body); stepDone(item, RecordSection.SIGNS, "Signos vitales registrados."); onDone() }
            catch (e: CancellationException) { throw e }
            catch (e: Exception) { mutable.value = mutable.value.copy(saving = false, error = message(e)) }
        }
    }

    /** [onDone] runs only after the API accepts the diagnosis, so the form keeps what was typed on failure. */
    fun diagnosis(item: MedicalAppointment, code: String, note: String, principal: Boolean, onDone: () -> Unit = {}) {
        if (item.consultationId == null || code.trim().isBlank()) return
        if (mutable.value.saving) return
        val body = JSONObject().put("code", code.trim().uppercase()).put("principal", principal).apply { if (note.trim().isNotBlank()) put("note", note.trim()) }
        mutable.value = mutable.value.copy(saving = true, error = null, notice = null, stepNotice = null)
        viewModelScope.launch {
            try { api.request("/consultas/${item.consultationId}/diagnosticos", "POST", body); stepDone(item, RecordSection.DIAGNOSIS, "Diagnóstico ${code.trim().uppercase()} registrado."); onDone() }
            catch (e: CancellationException) { throw e }
            catch (e: Exception) { mutable.value = mutable.value.copy(saving = false, error = message(e)) }
        }
    }

    /** [onDone] runs only after the API accepts the prescription, so the form keeps what was typed on failure. */
    fun prescription(item: MedicalAppointment, medication: String, dose: String, route: String, frequency: String, duration: String, instructions: String, onDone: () -> Unit = {}) {
        if (item.consultationId == null || listOf(medication, dose, route, frequency, duration).any { it.trim().isBlank() }) { mutable.value = mutable.value.copy(error = "Completa medicamento, dosis, vía, frecuencia y duración."); return }
        val itemBody = JSONObject().put("medication", medication.trim()).put("dose", dose.trim()).put("route", route.trim()).put("frequency", frequency.trim()).put("duration", duration.trim()).apply { if (instructions.trim().isNotBlank()) put("instructions", instructions.trim()) }
        val body = JSONObject().put("items", JSONArray().put(itemBody))
        if (mutable.value.saving) return
        mutable.value = mutable.value.copy(saving = true, error = null, notice = null, stepNotice = null)
        viewModelScope.launch {
            try { api.request("/consultas/${item.consultationId}/receta", "POST", body); stepDone(item, RecordSection.PRESCRIPTION, "Receta de ${medication.trim()} emitida."); onDone() }
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
        if (mutable.value.saving) return
        // B4: an exam already ordered in this consultation is never sent twice.
        val record = mutable.value.record?.takeIf { it.consultationId == consultationId }
        labOrderBlocker(consultationId)?.let { reason -> mutable.value = mutable.value.copy(error = reason); return }
        val repeated = record?.let { r -> mutable.value.labCatalog.filter { it.id in exams && r.alreadyOrdered(it) } }.orEmpty()
        if (repeated.isNotEmpty()) { mutable.value = mutable.value.copy(error = "Ya ordenaste ${repeated.joinToString { it.name }} en esta consulta."); return }
        mutable.value = mutable.value.copy(saving = true, error = null, notice = null, stepNotice = null)
        viewModelScope.launch {
            try {
                api.request("/laboratorio/ordenes", "POST", LabOrderRules.body(consultationId, exams, urgent))
                val names = mutable.value.labCatalog.filter { it.id in exams }.map { it.name }
                // The order list may lag or be unreadable: what was just ordered is counted right away.
                val local = RecordedLabOrder("local-${System.nanoTime()}", "pendiente", names.ifEmpty { exams.toList() }, exams.toSet(), mutable.value.labCatalog.filter { it.id in exams }.map { it.code }.toSet())
                mutable.value.record?.takeIf { it.consultationId == consultationId }?.let { r -> mutable.value = mutable.value.copy(record = r.copy(labOrders = r.labOrders + local, orderedIds = r.orderedIds + exams)) }
                    ?: run { mutable.value = mutable.value.copy(record = ConsultationRecord(consultationId, labOrders = listOf(local), orderedIds = exams.toSet())) }
                rememberOrdered(consultationId, mutable.value.record?.orderedIds.orEmpty())
                mutable.value = mutable.value.copy(saving = false, stepNotice = RecordSection.LAB to "Orden emitida: ${names.ifEmpty { exams.toList() }.joinToString()}.")
                onDone()
                if (withLabOrders) loadRecordKeepingLocal(consultationId, local)
            }
            catch (e: CancellationException) { throw e }
            catch (e: Exception) { mutable.value = mutable.value.copy(saving = false, error = message(e)) }
        }
    }

    /** #6: why "Emitir orden" is off for [consultationId] (its order list is not known), said next to the button; null when it can order. */
    fun labOrderBlocker(consultationId: String): String? {
        val record = mutable.value.record?.takeIf { it.consultationId == consultationId }
        return if (withLabOrders && record?.labOrdersKnown != true) "No se pudieron leer las órdenes de esta consulta; vuelve a cargarlas antes de ordenar." else null
    }

    /** Exams ordered from this device for [consultationId], kept for the session so leaving and coming back still blocks a repeat. */
    private fun storedOrdered(consultationId: String): Set<String> = userId?.let { drafts.load(it, sv.edu.catolica.climesa.domain.FormDrafts.orderedExamsKey(consultationId)) }
        ?.optJSONArray("ids")?.let { a -> (0 until a.length()).map { a.optString(it) }.filter { it.isNotBlank() }.toSet() }.orEmpty()

    private fun rememberOrdered(consultationId: String, ids: Set<String>) {
        userId?.let { drafts.save(it, sv.edu.catolica.climesa.domain.FormDrafts.orderedExamsKey(consultationId), JSONObject().put("ids", org.json.JSONArray(ids.toList()))) }
    }

    /** Reloads the record; an order just placed stays counted until the server list shows it. */
    private fun loadRecordKeepingLocal(consultationId: String, local: RecordedLabOrder) {
        viewModelScope.launch {
            try {
                val detail = api.request("/consultas/$consultationId/detalle")
                val orders = ConsultationRecordRules.labOrders(api.request("/laboratorio/ordenes"), consultationId)
                val before = mutable.value.record?.labOrders.orEmpty().count { !it.id.startsWith("local-") }
                // A panel is listed by its component exams, so "seen" is a new order in the list, not the same ids.
                val seen = orders.size > before || orders.any { o -> local.examIds.any { it in o.examIds } || local.examCodes.any { it in o.examCodes } }
                val kept = mutable.value.record?.labOrders.orEmpty().filter { it.id.startsWith("local-") && it.id != local.id }
                val ordered = mutable.value.record?.orderedIds.orEmpty()
                mutable.value = mutable.value.copy(record = ConsultationRecord(consultationId, ConsultationRecordRules.diagnoses(detail), ConsultationRecordRules.medications(detail), orders + kept + if (seen) emptyList() else listOf(local), ordered, vitals = ConsultationRecordRules.vitals(detail)))
            } catch (e: CancellationException) { throw e
            } catch (_: Exception) { }
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

    private suspend fun <T> optional(block: suspend () -> T): T? = try { block() } catch (e: CancellationException) { throw e } catch (_: Exception) { null }

    private fun message(error: Exception) = businessMessage(error, "No se pudo completar la operación.")
    private fun number(value: String): Double? = value.trim().toDoubleOrNull()
}
