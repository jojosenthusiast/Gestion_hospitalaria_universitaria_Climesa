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
import sv.edu.catolica.climesa.data.SubmissionIntent
import sv.edu.catolica.climesa.data.realtime.LiveSubscription
import sv.edu.catolica.climesa.data.realtime.RealtimeRepository
import sv.edu.catolica.climesa.domain.QueueEvents
import sv.edu.catolica.climesa.domain.QueueAction
import sv.edu.catolica.climesa.domain.NextProposal
import sv.edu.catolica.climesa.domain.QueueLabels
import sv.edu.catolica.climesa.domain.QueueMove
import sv.edu.catolica.climesa.domain.QueueMoves
import sv.edu.catolica.climesa.domain.QueueRules
import sv.edu.catolica.climesa.domain.QueueTicket
import sv.edu.catolica.climesa.domain.QueueOffice
import sv.edu.catolica.climesa.domain.PickerPatient
import sv.edu.catolica.climesa.domain.PatientQueue
import sv.edu.catolica.climesa.domain.PublicCall
import sv.edu.catolica.climesa.domain.RealtimeSignal
import sv.edu.catolica.climesa.domain.ReceptionScheduling

/** Last call, reversible with "Deshacer" (`POST /fila/{id}/deshacer-llamado` with the version the call returned). */
data class UndoableCall(val ticketId: String, val version: Int, val label: String)

/** B1: the number just issued, shown large where it was issued ("CON 12 · Ana Pérez · 3 antes"). */
data class IssuedTicket(val ticketId: String, val code: String, val patientName: String, val ahead: Int?,
    /** B-3: version and end of the void window (`voidableUntil`) the issue answered, for "Anular este número". */
    val version: Int = 1, val voidableUntilMillis: Long? = null)

/** D-1 from Citas: the arrival registered for [appointmentId] and the number it got, shown on that row. */
data class RegisteredArrival(val appointmentId: String, val text: String)

data class QueueState(
    val loading: Boolean = true, val tickets: List<QueueTicket> = emptyList(), val busy: Boolean = false, val error: String? = null, val notice: String? = null,
    /** Who goes next in the chosen area (`GET /fila/siguiente`), null until an area is chosen. */
    val next: NextProposal? = null,
    /** "Calculando…" while the proposal of the chosen area is being read, and its error (B6: three states, like the web). */
    val nextLoading: Boolean = false,
    val nextError: String? = null,
    val undo: UndoableCall? = null,
    /** Patient chosen for "Emitir número" (`patientId` is required for reception). */
    val issueSearch: PatientSearchState = PatientSearchState(),
    /** Active consulting rooms (`GET /espacios`), the optional destination of "Llamar siguiente". */
    val offices: List<QueueOffice> = emptyList(),
    /** B3: what is being sent (a ticket id, [QueueViewModel.ISSUE] or [QueueViewModel.NEXT]); only that control spins. */
    val busyKey: String? = null,
    /** B3: numbers this person called that are still called; each keeps its own "Deshacer", not only the last one. */
    val calledByMe: Set<String> = emptySet(),
    /** B1: last number issued from the counter, with how many wait before it. */
    val issued: IssuedTicket? = null,
    /** B1: the service of the last number issued, preselected for the next patient. */
    val lastService: String = QueueLabels.services.first().first,
    /** B3 / D-3: "No se presentó" waits 8 s with "Deshacer" before it is sent. */
    val pendingAbsence: PendingUndo? = null,
    /** Every "No se presentó" still in its window, one per ticket. */
    val pendingAbsences: List<PendingUndo> = emptyList(),
    /** A stored "No se presentó" whose last send failed and will be retried (it can be discarded). */
    val failedAbsence: String? = null,
    /** B5: called numbers of the patient's service, for "faltan N" and the room once called. */
    val publicCalls: List<PublicCall> = emptyList(),
    /** B3: service and room of the caller's shift (`GET /fila/mi-puesto`), preselected on the board; null until read. */
    val myPost: sv.edu.catolica.climesa.domain.MyPost? = null,
    /** Why the caller's post could not be read (the board still works, without preselection). */
    val myPostError: String? = null,
    /** B-3: the code of the number just voided ("Se anuló CON 12"), shown in the counter. */
    val voided: String? = null,
    /** D-1: the last arrival registered from an appointment row. */
    val arrival: RegisteredArrival? = null,
)

@HiltViewModel
class QueueViewModel @Inject constructor(private val api: ApiGateway, realtime: RealtimeRepository, private val drafts: sv.edu.catolica.climesa.data.DraftStore = sv.edu.catolica.climesa.data.NoDraftStore) : ViewModel() {
    private val mutable = MutableStateFlow(QueueState())
    val state = mutable.asStateFlow()
    private val live = LiveSubscription(realtime)
    private var loadJob: Job? = null
    /** One user intent per command path: a retry of the same command reuses its Idempotency-Key. */
    private val intents = mutableMapOf<String, SubmissionIntent>()
    /** Clock of the undo window (tests move it to after a restart). */
    var clock: () -> Long = { System.currentTimeMillis() }
    /**
     * D-3: "No se presentó" is stored at the tap and sent when its window ends, or on the next sign-in, resume or signal
     * if the app died first. The version is the one of the ticket when it is sent, so a call in between gives no 409.
     */
    private val absence = UndoWindow(
        viewModelScope, api, sv.edu.catolica.climesa.domain.FormDrafts.DEFERRED_ABSENCE, drafts, now = { clock() },
        onSent = { item, _ -> mutable.value = mutable.value.copy(notice = "${item.label.substringBefore(" se marcará")} marcado como no presentado.", error = null, failedAbsence = null); load(silent = true) },
        onFailed = { item, e, kept ->
            val code = item.label.substringBefore(" se marcará")
            mutable.value = if ((e as? sv.edu.catolica.climesa.data.AuthRequestException)?.code == "version_conflicto") mutable.value.copy(error = "El número cambió mientras esperaba; no se marcó.", failedAbsence = null).also { load(silent = true) }
            else if (kept) mutable.value.copy(error = "$code: ${message(e)} Queda guardado y se reintentará.", failedAbsence = item.id)
            else mutable.value.copy(error = "$code no se marcó como no presentado: ${message(e)}", failedAbsence = null).also { load(silent = true) }
        },
        onExpired = { gone -> mutable.value = mutable.value.copy(error = "${gone.size} «No se presentó» de hace más de 24 h no se enviaron.") },
        // #3: the ticket changed version while the absence waited: re-read it and, if it still allows it, send a new body.
        rebase = { item ->
            QueueRules.parse(api.request("/fila")).firstOrNull { it.id == item.key }
                ?.takeIf { QueueAction.ABSENT in it.allowedActions }
                ?.let { JSONObject().put("version", it.version) }
        },
    ) { pending -> mutable.value = mutable.value.copy(pendingAbsence = pending.lastOrNull(), pendingAbsences = pending) }

    /** Signed-in user: a "No se presentó" stored before the app closed is sent now if its window ended. */
    fun bindUser(id: String) = absence.bind(id)

    /** Screen back on top: sends what is due, failed ones again. */
    fun resume() = absence.resume()

    /** The person drops a "No se presentó" that keeps failing, after reading why. */
    fun discardFailedAbsence() {
        val id = mutable.value.failedAbsence ?: return
        absence.discard(id)
        mutable.value = mutable.value.copy(failedAbsence = null, error = null)
    }
    /** B5: a patient account also reads the public board of its own service. */
    private var patientMode = false
    fun followOwnTicket() { patientMode = true }

    /**
     * Loads the queue. A [silent] reload (realtime invalidation) keeps the current list and messages visible and
     * keeps the shown tickets if it fails. A newer load replaces one still running.
     */
    fun load(silent: Boolean = false) {
        if (!silent) mutable.value = mutable.value.copy(loading = true, error = null)
        loadJob?.cancel()
        loadJob = viewModelScope.launch {
            try {
                val tickets = QueueRules.parse(api.request("/fila"))
                val issued = mutable.value.issued?.let { shown -> tickets.firstOrNull { it.id == shown.ticketId }?.let { shown.copy(ahead = QueueRules.ahead(tickets, it)) } ?: shown }
                // The server says whose last call each number has (`calledByMe`), so "Deshacer" survives a restart.
                val stillCalled = mutable.value.calledByMe.filter { id -> tickets.any { it.id == id && it.state == "llamado" } }.toSet() + QueueRules.calledByMe(tickets)
                mutable.value = mutable.value.copy(loading = false, tickets = tickets, issued = issued, calledByMe = stillCalled)
                if (patientMode) loadPublic(tickets)
                loadNext()
            }
            catch (e: CancellationException) { throw e }
            catch (e: Exception) {
                // Without a proposal the panel would keep saying "Calculando…": it shows why instead.
                if (nextService != null && mutable.value.next == null) mutable.value = mutable.value.copy(nextLoading = false, nextError = userMessage(e, "No se pudo calcular quién pasa después."))
                else mutable.value = mutable.value.copy(nextLoading = false)
                // A silent reload (area chosen, realtime event) may have cancelled the first load: with nothing on screen yet, its
                // failure must still end "Cargando…" and say why, or the board spins forever.
                if (!silent || mutable.value.loading) mutable.value = mutable.value.copy(loading = false, error = message(e))
            }
        }
    }

    /** Idempotent per channel list: reloads when a queue event arrives or after a reconnection gap. */
    fun startLive(channels: List<String>) {
        live.start(viewModelScope, channels) { signal ->
            if (signal is RealtimeSignal.Resync) absence.resume()
            if (signal is RealtimeSignal.Event && QueueEvents.matches(signal.event) || signal is RealtimeSignal.Resync) load(silent = true)
        }
    }

    /** B5: the public board of the patient's active ticket; a failure keeps the last board (the number still shows). */
    private suspend fun loadPublic(tickets: List<QueueTicket>) {
        val mine = PatientQueue.current(tickets) ?: return
        try { api.request("/publico/fila/${mine.service}").let { r -> mutable.value = mutable.value.copy(publicCalls = PatientQueue.parsePublic(r)) } }
        catch (e: CancellationException) { throw e }
        catch (_: Exception) { }
    }

    /** The proposal of the chosen area; a failure is shown in the panel instead of reading as "nobody waiting". */
    private suspend fun loadNext() {
        val service = nextService ?: return
        // Only the first answer shows "Calculando…"; a refresh keeps the current panel until it arrives.
        if (mutable.value.next == null) mutable.value = mutable.value.copy(nextLoading = true)
        try {
            val next = QueueRules.parseNext(api.request("/fila/siguiente?service=$service"))
            if (service == nextService) mutable.value = mutable.value.copy(next = next, nextLoading = false, nextError = null)
        } catch (e: CancellationException) { throw e }
        catch (e: Exception) { if (service == nextService) mutable.value = mutable.value.copy(next = null, nextLoading = false, nextError = userMessage(e, "No se pudo calcular quién pasa después.")) }
    }

    private var nextService: String? = null
    /** Chooses the area whose "who goes next" proposal is shown; null hides it. */
    fun chooseArea(service: String?) {
        if (service == nextService) return
        nextService = service
        mutable.value = mutable.value.copy(next = null, nextError = null, nextLoading = service != null)
        if (service != null) load(silent = true)
    }

    private val patients = PatientSelectorSearch(api, viewModelScope, { mutable.value.issueSearch }) { change -> mutable.value = mutable.value.copy(issueSearch = change(mutable.value.issueSearch)) }
    /** Wait between keystrokes of the patient search; tests set it to zero. */
    internal var debounceMs: Long
        get() = patients.debounceMs
        set(value) { patients.debounceMs = value }
    fun issueQuery(text: String) = patients.query(text)
    fun moreIssuePatients() = patients.more()
    fun pickIssuePatient(patient: PickerPatient?) = patients.pick(patient)
    /** Clears the chosen patient when the dialog closes, so the next number starts with a new search. */
    fun resetIssue() { patients.cancel(); mutable.value = mutable.value.copy(issueSearch = PatientSearchState()) }
    /** Leaving the counter panel forgets its last result. */
    fun closeIssue() { resetIssue(); mutable.value = mutable.value.copy(issued = null, voided = null) }

    /**
     * R7 U1 (G2): the patient record opens the counter with that patient already chosen. The selector row is read by the
     * record number, so the appointment and number of today come with it; without it the bare patient is chosen.
     */
    fun preselectIssuePatient(id: String, record: String, name: String) {
        viewModelScope.launch {
            val found = try {
                ReceptionScheduling.pickerPage(api.request("/pacientes/selector?query=${java.net.URLEncoder.encode(record, "UTF-8")}&limit=10&offset=0") as JSONObject).items.firstOrNull { it.id == id }
            } catch (e: CancellationException) { throw e } catch (_: Exception) { null }
            // S1: an inactive patient is not chosen; the counter says why instead of letting the API refuse the number.
            val blocked = found?.let { sv.edu.catolica.climesa.domain.PatientGate.blockedReason(it, sv.edu.catolica.climesa.domain.PickPurpose.CARE) }
            if (blocked != null) mutable.value = mutable.value.copy(issueSearch = mutable.value.issueSearch.copy(blocked = blocked))
            else patients.pick(found ?: PickerPatient(id, record, name, null))
        }
    }

    /** B-3: the issuer voids the number just issued, while the server allows it; the counter is ready for another. */
    fun voidIssued() {
        val issued = mutable.value.issued ?: return
        if (!QueueRules.voidable(issued.voidableUntilMillis, "en_espera", clock())) return
        mutate("/fila/${issued.ticketId}/anular", JSONObject().put("version", issued.version), "Se anuló ${issued.code}. Puedes emitir otro número.", key = ISSUE,
            intentKey = "/fila/${issued.ticketId}/anular", onDone = { mutable.value = mutable.value.copy(issued = null, voided = issued.code) })
    }

    /** B-3 on the board: the issuer voids a number issued by mistake while the server window is open. */
    fun voidTicket(ticket: QueueTicket) {
        if (!QueueRules.voidable(ticket.voidableUntilMillis, ticket.state, clock())) return
        mutate("/fila/${ticket.id}/anular", JSONObject().put("version", ticket.version), "Se anuló ${QueueLabels.code(ticket)}.", key = ticket.id)
    }

    /**
     * D-1 from an appointment row ("Registrar llegada"), like the web: the number is issued in Consulta general linked to
     * the appointment; the row then says "Llegó · CON N". One intent per appointment.
     */
    fun registerArrivalFor(appointmentId: String, patientId: String, patientName: String) {
        mutate("/fila", QueueRules.issueBody(ARRIVAL_SERVICE, "rutina", patientId, appointmentId), "Llegada registrada para $patientName.", key = "$ARRIVAL:$appointmentId",
            intentKey = "/fila:$patientId:$ARRIVAL_SERVICE:$appointmentId", onDone = { result ->
                val json = result as? JSONObject
                val code = "${json?.let { ServerText.of(it, "area") } ?: QueueLabels.areaOf(ARRIVAL_SERVICE)} ${json?.optInt("numero", 0) ?: 0}"
                val ahead = json?.takeIf { it.has("ahead") && !it.isNull("ahead") }?.optInt("ahead")
                val tail = when (ahead) { null -> ""; 0 -> ", nadie antes"; else -> ", $ahead antes" }
                mutable.value = mutable.value.copy(arrival = RegisteredArrival(appointmentId, "Llegada registrada: $patientName tiene el número $code$tail."))
            })
    }

    /**
     * Reception issues the number for the chosen patient; without one nothing is sent. B1: the result stays where it was
     * issued, large ("CON 12 · Ana · 3 antes"), and the search is cleared for the next patient. One intent per patient and
     * service, so a retry never collides with the number of another patient.
     */
    fun issue(service: String, priority: String = "rutina") {
        val patient = mutable.value.issueSearch.patient ?: run { mutable.value = mutable.value.copy(error = "Elige al paciente que recibe el número."); return }
        sendIssue(patient, service, priority, null, "Número emitido para ${patient.name}.")
    }

    /**
     * B1 / D-1 "Registrar llegada": the patient has a confirmed appointment today, so the number is issued in Consulta
     * general linked to it (`appointmentId`); the signature then closes both. One intent per appointment.
     */
    fun registerArrival(priority: String = "rutina") {
        val patient = mutable.value.issueSearch.patient ?: run { mutable.value = mutable.value.copy(error = "Elige al paciente que recibe el número."); return }
        val appointment = patient.appointmentToday?.takeIf { patient.canRegisterArrival }
            ?: run { mutable.value = mutable.value.copy(error = "${patient.name} no tiene cita confirmada hoy."); return }
        sendIssue(patient, ARRIVAL_SERVICE, priority, appointment.id, "Llegada registrada para ${patient.name}.")
    }

    private fun sendIssue(patient: PickerPatient, service: String, priority: String, appointmentId: String?, notice: String) {
        val intentKey = "/fila:${patient.id}:$service" + (appointmentId?.let { ":$it" } ?: "")
        mutate("/fila", QueueRules.issueBody(service, priority, patient.id, appointmentId), notice, key = ISSUE, intentKey = intentKey, onDone = { result ->
            val json = result as? JSONObject
            val number = json?.optInt("numero", 0) ?: 0
            val area = json?.let { ServerText.of(it, "area") } ?: QueueLabels.areaOf(service)
            // The API counts who waits before it (`ahead`); the reload after issuing refreshes it from the board.
            val ahead = json?.takeIf { it.has("ahead") && !it.isNull("ahead") }?.optInt("ahead")
            val until = json?.let { ServerText.of(it, "voidableUntil") }?.let { sv.edu.catolica.climesa.domain.parseMillis(it) }
            mutable.value = mutable.value.copy(lastService = service, voided = null, issued = json?.optString("id")?.takeIf { it.isNotBlank() && number > 0 }?.let { IssuedTicket(it, "$area $number", patient.name, ahead, json?.optInt("version", 1) ?: 1, until) })
            resetIssue()
        })
    }

    /** B3: reads the caller's post once so the board and "Llamar siguiente" open on its service and room. */
    fun loadMyPost() {
        viewModelScope.launch {
            try { api.request("/fila/mi-puesto").let { r -> mutable.value = mutable.value.copy(myPost = QueueRules.myPost(r), myPostError = null) } }
            catch (e: CancellationException) { throw e }
            catch (e: Exception) { mutable.value = mutable.value.copy(myPostError = userMessage(e, "No se pudo leer tu puesto de turno.")) }
        }
    }

    /** Consulting rooms for "Llamar siguiente" (only for accounts with `espacios.ver`); a failure leaves the call without room. */
    fun loadOffices() {
        viewModelScope.launch {
            try { api.request("/espacios").let { r -> mutable.value = mutable.value.copy(offices = QueueRules.offices(r)) } }
            catch (e: CancellationException) { throw e }
            catch (_: Exception) { mutable.value = mutable.value.copy(offices = emptyList()) }
        }
    }
    fun call(ticket: QueueTicket) = mutate("/fila/${ticket.id}/llamar", JSONObject().put("version", ticket.version), "Llamaste ${QueueLabels.code(ticket)}.", key = ticket.id, undoOf = { result -> undoable(result, ticket.id, QueueLabels.code(ticket)) })
    /** Card menu (keyboard and touch alternative to dragging): the move is one server action the API already allows. */
    fun move(ticket: QueueTicket, move: QueueMove) {
        if (move == QueueMove.CALL) { call(ticket); return }
        val body = if (move == QueueMove.UNDO_CALL || move == QueueMove.REMOVE_CALL) QueueRules.undoBody(ticket.version) else JSONObject().put("version", ticket.version)
        if (move == QueueMove.ABSENT) { absent(ticket); return }
        mutate(QueueMoves.path(ticket, move), body, "${QueueLabels.code(ticket)}: ${move.label.lowercase()}.", key = ticket.id)
    }
    fun undoLastCall() {
        val undo = mutable.value.undo ?: return
        mutate("/fila/${undo.ticketId}/deshacer-llamado", QueueRules.undoBody(undo.version), "Llamado deshecho.", key = undo.ticketId, onDone = { forgetCall(undo.ticketId) })
    }
    /** B3: undo the call of any number this person called while it is still called, at its current version. */
    fun undoCall(ticket: QueueTicket) {
        if (ticket.id !in mutable.value.calledByMe) return
        mutate("/fila/${ticket.id}/deshacer-llamado", QueueRules.undoBody(ticket.version), "Llamado de ${QueueLabels.code(ticket)} deshecho.", key = ticket.id, onDone = { forgetCall(ticket.id) })
    }
    private fun forgetCall(id: String) {
        mutable.value = mutable.value.copy(calledByMe = mutable.value.calledByMe - id, undo = mutable.value.undo?.takeIf { it.ticketId != id })
    }
    fun changePriority(ticket: QueueTicket, priority: String) = mutate("/fila/${ticket.id}/prioridad", QueueRules.priorityBody(ticket.version, priority), "Prioridad de ${QueueLabels.code(ticket)}: ${QueueLabels.priority(priority)}.", key = ticket.id)
    fun attend(ticket: QueueTicket) = mutate("/fila/${ticket.id}/atender", JSONObject().put("version", ticket.version), "Atención iniciada.", key = ticket.id)
    fun complete(ticket: QueueTicket) = mutate("/fila/${ticket.id}/completar", JSONObject().put("version", ticket.version), "Atención completada.", key = ticket.id)

    /**
     * D-3 on the board: "No se presentó" is held 8 s with "Deshacer" and only then sent (no inverse endpoint exists). The
     * version is the one of the ticket when the window ends, so a call in between does not produce a 409.
     */
    fun absent(ticket: QueueTicket) {
        if (QueueAction.ABSENT !in ticket.allowedActions) return
        absence.start(ticket.id, "${QueueLabels.code(ticket)} se marcará como no presentado.", "/fila/${ticket.id}/no-se-presento", JSONObject().put("version", ticket.version))
    }
    fun undoAbsence(ticketId: String? = null) { if (absence.undo(ticketId)) mutable.value = mutable.value.copy(notice = "Se mantiene en la fila.", error = null) }

    /**
     * The API picks who goes next in [service] by RN-FILA-SIGUIENTE (priority, appointments in their window, then arrival)
     * with `POST /fila/llamar-siguiente`, optionally to [officeId]; 409 `fila_sin_espera` when nobody waits.
     */
    fun callNext(service: String, officeId: String? = null, onDone: () -> Unit = {}) = mutate("/fila/llamar-siguiente", QueueRules.callNextBody(service, officeId?.takeIf { it.isNotBlank() }), "Número llamado.", key = NEXT, onDone = { onDone() }, describe = { result ->
        (result as? JSONObject)?.optInt("numero", 0)?.takeIf { it > 0 }?.let { "Se llamó al N.º $it de ${QueueLabels.service(service)}." }
    }, undoOf = { result -> (result as? JSONObject)?.let { undoable(it, it.optString("id"), "${QueueLabels.areaOf(service)} ${it.optInt("numero")}") } })

    private fun undoable(result: Any, ticketId: String, code: String): UndoableCall? =
        (result as? JSONObject)?.optInt("version", 0)?.takeIf { it > 0 && ticketId.isNotBlank() }?.let { UndoableCall(ticketId, it, "Llamaste $code.") }

    private fun mutate(path: String, body: JSONObject, notice: String, key: String, intentKey: String = path, describe: (Any) -> String? = { null }, undoOf: (Any) -> UndoableCall? = { null }, onDone: (Any) -> Unit = {}) {
        if (mutable.value.busy) return
        // Another action waits until a pending "No se presentó" got its answer, so it never overtakes it.
        // #4: only this ticket's waiting absence goes first; the others keep their undo.
        viewModelScope.launch { absence.settle(key); send(path, body, notice, key, intentKey, describe, undoOf, onDone) }
    }

    private suspend fun send(path: String, body: JSONObject, notice: String, key: String, intentKey: String = path, describe: (Any) -> String? = { null }, undoOf: (Any) -> UndoableCall? = { null }, onDone: (Any) -> Unit = {}) {
        if (mutable.value.busy) return
        mutable.value = mutable.value.copy(busy = true, busyKey = key, error = null, notice = null)
        val intent = intents.getOrPut(intentKey) { SubmissionIntent() }
        try {
            val result = intent.send { api.request(path, "POST", body) }
            val undo = undoOf(result)
            mutable.value = mutable.value.copy(busy = false, busyKey = null, notice = describe(result) ?: notice, undo = undo ?: mutable.value.undo,
                calledByMe = undo?.let { mutable.value.calledByMe + it.ticketId } ?: mutable.value.calledByMe)
            onDone(result); load()
        }
        catch (e: CancellationException) { throw e }
        catch (e: Exception) {
            mutable.value = mutable.value.copy(busy = false, busyKey = null, error = message(e))
            // A 409 means the board moved under this person (version conflict, someone else called it): read it again so
            // the card shows its real state instead of offering the same stale action.
            if ((e as? sv.edu.catolica.climesa.data.AuthRequestException)?.statusCode == 409) load(silent = true)
        }
    }

    fun clearMessages() { mutable.value = mutable.value.copy(error = null, notice = null) }

    private fun message(error: Exception) = businessMessage(error, "No se pudo completar la operación.")

    companion object {
        const val ISSUE = "emitir"
        const val NEXT = "siguiente"
        const val ARRIVAL = "llegada"
        /** The API registers an appointment's arrival only in Consulta general. */
        const val ARRIVAL_SERVICE = "consulta_general"
    }
}

/** Optional non-blank text of a JSON answer. */
private object ServerText { fun of(json: JSONObject, key: String) = if (json.isNull(key)) null else json.optString(key).takeIf { it.isNotBlank() } }
