@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
package sv.edu.catolica.climesa.ui

import androidx.activity.compose.BackHandler

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Notes
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Bed
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.SwapHoriz
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import org.json.JSONObject
import sv.edu.catolica.climesa.R
import sv.edu.catolica.climesa.data.ApiGateway
import sv.edu.catolica.climesa.data.AuthRequestException
import sv.edu.catolica.climesa.data.realtime.LiveSubscription
import sv.edu.catolica.climesa.data.realtime.RealtimeRepository
import sv.edu.catolica.climesa.domain.AccessProfile
import sv.edu.catolica.climesa.domain.AdmissionAction
import sv.edu.catolica.climesa.domain.AdmissionEvents
import sv.edu.catolica.climesa.domain.AdmissionIntake
import sv.edu.catolica.climesa.domain.AdmissionParser
import sv.edu.catolica.climesa.domain.ChangeReason
import sv.edu.catolica.climesa.domain.DischargePending
import sv.edu.catolica.climesa.domain.DischargeType
import sv.edu.catolica.climesa.domain.HospitalAdmission
import sv.edu.catolica.climesa.domain.HospitalBedSuggestion
import sv.edu.catolica.climesa.domain.HospitalizationRules
import sv.edu.catolica.climesa.domain.NursingNote
import sv.edu.catolica.climesa.domain.QuickAction
import sv.edu.catolica.climesa.domain.QuickActions
import sv.edu.catolica.climesa.domain.RealtimeSignal
import sv.edu.catolica.climesa.domain.TransferBed

/** Discharge form typed by the physician; it lives in the ViewModel so rotating the phone keeps it. */
data class DischargeForm(
    val admissionId: String,
    val type: DischargeType = DischargeType.MEDICAL,
    val summary: String = "",
    val pending: List<DischargePending> = emptyList(),
    val voluntaryConsent: Boolean = false,
)

/** Cancel admission, request discharge or revoke discharge: one text (reason or optional note) and the confirmation. */
data class ReasonDialog(val admissionId: String, val action: AdmissionAction, val text: String = "")

/** MA-HOS-01: free beds of the same category, the chosen one and the reason. */
data class TransferForm(
    val admissionId: String,
    val loading: Boolean = true,
    val beds: List<TransferBed> = emptyList(),
    val loadError: String? = null,
    val bedId: String? = null,
    val reason: String = "",
)

/** MA-HOS-05 (A51): nursing notes of one admission and the note being written. */
data class NotesPanel(
    val admissionId: String,
    val loading: Boolean = true,
    val notes: List<NursingNote> = emptyList(),
    val loadError: String? = null,
    val text: String = "",
    /** ENF/AST audit #17: "Nota guardada" shows inside the dialog, not behind it. */
    val saved: String? = null,
)

data class HospitalizationState(
    val loading: Boolean = true,
    val busy: Boolean = false,
    val admissions: List<HospitalAdmission> = emptyList(),
    val suggestions: List<HospitalBedSuggestion> = emptyList(),
    /** R3 A-25: true while the compatible beds are read, so "none free" is told apart from "still searching". */
    val loadingSuggestions: Boolean = false,
    val selectedId: String? = null,
    val assignReason: String = "",
    val discharge: DischargeForm? = null,
    val exitId: String? = null,
    val exitReason: String = "",
    val reasonDialog: ReasonDialog? = null,
    val transfer: TransferForm? = null,
    val notes: NotesPanel? = null,
    /** Validation or API error of the open dialog; the dialog stays open and keeps what was typed. */
    val formError: String? = null,
    val error: String? = null,
    val notice: String? = null,
    /** G3: "Ingresos indicados", each with the first suggested bed; one tap admits there. */
    val tray: List<IndicatedAdmission> = emptyList(),
    /** D86: alerts of the latest signs per admission id; missing while unread or when the read failed. */
    val signAlerts: Map<String, List<sv.edu.catolica.climesa.domain.VitalAlert>> = emptyMap(),
)

/** G3: one indicated admission of the tray; [error] stays on its row (a failed read is never shown as "no beds"). */
data class IndicatedAdmission(
    val admission: HospitalAdmission, val bed: HospitalBedSuggestion? = null, val loading: Boolean = true, val error: String? = null, val busy: Boolean = false,
) {
    val noBeds get() = !loading && error == null && bed == null
}

@HiltViewModel
class HospitalizationViewModel @Inject constructor(private val api: ApiGateway, realtime: RealtimeRepository) : ViewModel() {
    private val mutable = MutableStateFlow(HospitalizationState())
    val state = mutable.asStateFlow()
    private val live = LiveSubscription(realtime)
    private var loadJob: Job? = null
    private var notesJob: Job? = null

    /** A [silent] reload (realtime invalidation) keeps the open dialog, messages and shown admissions, even if it fails. */
    fun load(silent: Boolean = false) {
        if (!silent) mutable.value = mutable.value.copy(loading = true, error = null)
        loadJob?.cancel()
        loadJob = viewModelScope.launch {
            try { val admissions = AdmissionParser.admissions(api.request("/admisiones")); mutable.value = mutable.value.copy(loading = false, admissions = admissions); syncTray(admissions); readSigns(admissions) }
            catch (e: CancellationException) { throw e }
            catch (e: Exception) { if (!silent) mutable.value = mutable.value.copy(loading = false, error = readable(e, "No se pudieron cargar las admisiones.")) }
        }
    }

    /**
     * D86: the latest signs of each patient in a bed, so the card shows a critical value just recorded and the discharge
     * warns about it. Best effort: a failed read leaves that card as it was.
     */
    private fun readSigns(admissions: List<HospitalAdmission>) {
        admissions.filter(HospitalizationRules::watchesSigns).forEach { row ->
            viewModelScope.launch {
                val alerts = try { sv.edu.catolica.climesa.domain.VitalsParser.history(api.request("/pacientes/${row.patientId}/signos?limit=5"))?.alerts() }
                catch (e: CancellationException) { throw e } catch (e: Exception) { null }
                if (alerts != null) mutable.update { it.copy(signAlerts = it.signAlerts + (row.id to alerts)) }
            }
        }
    }

    /** G3: keeps a row per indicated admission; a row whose admission changed (new version) reads its suggested bed again. */
    private fun syncTray(admissions: List<HospitalAdmission>) {
        val previous = mutable.value.tray.associateBy { it.admission.id }
        val rows = admissions.filter { it.indicated }.map { a -> previous[a.id]?.takeIf { it.admission.version == a.version && !it.loading }?.copy(admission = a) ?: IndicatedAdmission(a) }
        mutable.update { it.copy(tray = rows) }
        rows.filter { it.loading }.forEach { suggestBed(it.admission) }
    }

    private fun suggestBed(admission: HospitalAdmission) {
        viewModelScope.launch {
            val result = try { Result.success(AdmissionParser.suggestions(api.request("/admisiones/${admission.id}/sugerencias-cama")).firstOrNull()) }
            catch (e: CancellationException) { throw e } catch (e: Exception) { Result.failure(e) }
            updateTray(admission.id) { row ->
                result.fold({ row.copy(bed = it, loading = false, error = null) }, { row.copy(bed = null, loading = false, error = readable(it as Exception, "No se pudieron consultar las camas.")) })
            }
        }
    }

    private fun updateTray(id: String, change: (IndicatedAdmission) -> IndicatedAdmission) =
        mutable.update { s -> s.copy(tray = s.tray.map { if (it.admission.id == id) change(it) else it }) }

    /** "Ingresar" in the tray: assigns the suggested bed with no reason (it is the suggestion), and says where the patient went. */
    fun admitIndicated(row: IndicatedAdmission) {
        val bed = row.bed ?: return
        if (row.busy || mutable.value.tray.any { it.busy }) return
        updateTray(row.admission.id) { it.copy(busy = true, error = null) }
        mutable.update { it.copy(notice = null) }
        viewModelScope.launch {
            try {
                api.request("/admisiones/${row.admission.id}/cama", "POST", HospitalizationRules.assignBody(bed.id, bed.version, ""))
                mutable.update { s -> s.copy(tray = s.tray.filterNot { it.admission.id == row.admission.id }, notice = "${row.admission.patientName}: ingresada · Cama ${bed.code}.") }
                load(silent = true)
            } catch (e: CancellationException) { throw e } catch (e: Exception) {
                val stale = HospitalizationRules.staleCode((e as? AuthRequestException)?.code)
                updateTray(row.admission.id) { it.copy(busy = false, error = failure(e)) }
                // The bed was taken or the admission changed: read the suggestion again, keeping the error on the row.
                if (stale) suggestBedKeepingError(row.admission)
            }
        }
    }

    private fun suggestBedKeepingError(admission: HospitalAdmission) {
        viewModelScope.launch {
            try { val bed = AdmissionParser.suggestions(api.request("/admisiones/${admission.id}/sugerencias-cama")).firstOrNull(); updateTray(admission.id) { it.copy(bed = bed) } }
            catch (e: CancellationException) { throw e } catch (_: Exception) { /* The row already shows the admit error. */ }
        }
    }
    /** Idempotent per channel list: reloads when an admission event (`admision.actualizada`) arrives or after a reconnection gap. */
    fun startLive(channels: List<String>) {
        live.start(viewModelScope, channels) { signal ->
            if (signal is RealtimeSignal.Event && sv.edu.catolica.climesa.domain.WardEvents.matches(signal.event) || signal is RealtimeSignal.Resync) {
                load(silent = true)
                mutable.value.notes?.let { loadNotes(it.admissionId, silent = true) }
            }
        }
    }

    fun open(admission: HospitalAdmission) {
        mutable.update { it.copy(selectedId = admission.id, suggestions = emptyList(), loadingSuggestions = true, assignReason = "", formError = null, error = null) }
        viewModelScope.launch {
            try { val suggestions = AdmissionParser.suggestions(api.request("/admisiones/${admission.id}/sugerencias-cama")); mutable.update { it.copy(suggestions = suggestions, loadingSuggestions = false) } }
            catch (e: CancellationException) { throw e }
            catch (e: Exception) { mutable.update { it.copy(loadingSuggestions = false, formError = readable(e, "No se pudieron consultar las camas.")) } }
        }
    }
    fun close() = mutable.update { it.copy(selectedId = null, suggestions = emptyList(), assignReason = "", formError = null) }
    fun onAssignReason(text: String) = mutable.update { it.copy(assignReason = text.take(ChangeReason.MAX), formError = null) }
    fun assign(admission: HospitalAdmission, suggestion: HospitalBedSuggestion) {
        val reason = mutable.value.assignReason
        HospitalizationRules.assignReasonError(reason)?.let { error -> mutable.update { it.copy(formError = error) }; return }
        mutate("/admisiones/${admission.id}/cama", HospitalizationRules.assignBody(suggestion.id, suggestion.version, reason), "Cama asignada.")
    }

    fun openDischarge(admission: HospitalAdmission) = mutable.update { it.copy(discharge = DischargeForm(admission.id), formError = null, error = null) }
    fun closeDischarge() = mutable.update { it.copy(discharge = null, formError = null) }
    fun onDischargeType(type: DischargeType) = updateDischarge { it.copy(type = type) }
    fun onSummary(text: String) = updateDischarge { it.copy(summary = text.take(HospitalizationRules.SUMMARY_MAX)) }
    fun onVoluntaryConsent(value: Boolean) = updateDischarge { it.copy(voluntaryConsent = value) }
    fun addPending() = updateDischarge { it.copy(pending = it.pending + DischargePending()) }
    fun removePending(index: Int) = updateDischarge { form -> form.copy(pending = form.pending.filterIndexed { i, _ -> i != index }) }
    fun onPending(index: Int, item: DischargePending) = updateDischarge { form -> form.copy(pending = form.pending.mapIndexed { i, current -> if (i == index) item.copy(description = item.description.take(500), responsible = item.responsible.take(200)) else current }) }
    fun signDischarge(admission: HospitalAdmission) {
        val form = mutable.value.discharge?.takeIf { it.admissionId == admission.id } ?: return
        HospitalizationRules.dischargeError(form.type, form.summary, form.pending, form.voluntaryConsent)?.let { error -> mutable.update { it.copy(formError = error) }; return }
        mutate("/admisiones/${admission.id}/alta", HospitalizationRules.dischargeBody(admission.version, form.type, form.summary, form.pending, form.voluntaryConsent), "Alta firmada.")
    }

    fun openExit(admission: HospitalAdmission) = mutable.update { it.copy(exitId = admission.id, exitReason = "", formError = null, error = null) }
    fun closeExit() = mutable.update { it.copy(exitId = null, exitReason = "", formError = null) }
    fun onExitReason(text: String) = mutable.update { it.copy(exitReason = text.take(ChangeReason.MAX), formError = null) }
    fun registerExit(admission: HospitalAdmission) {
        val reason = mutable.value.exitReason
        HospitalizationRules.exitReasonError(reason)?.let { error -> mutable.update { it.copy(formError = error) }; return }
        mutate("/admisiones/${admission.id}/salida", HospitalizationRules.exitBody(admission.version, reason), "Salida registrada; cama enviada a limpieza.")
    }

    /** [action] is [AdmissionAction.CANCEL], [AdmissionAction.REQUEST_DISCHARGE] or [AdmissionAction.REVOKE_DISCHARGE]. */
    fun openReason(admission: HospitalAdmission, action: AdmissionAction) = mutable.update { it.copy(reasonDialog = ReasonDialog(admission.id, action), formError = null, error = null) }
    fun closeReason() = mutable.update { it.copy(reasonDialog = null, formError = null) }
    fun onReason(text: String) = mutable.update { state -> state.copy(reasonDialog = state.reasonDialog?.copy(text = text.take(ChangeReason.MAX)), formError = null) }
    fun submitReason(admission: HospitalAdmission) {
        val dialog = mutable.value.reasonDialog?.takeIf { it.admissionId == admission.id } ?: return
        val (error, path, body, notice) = when (dialog.action) {
            AdmissionAction.CANCEL -> Quad(HospitalizationRules.reasonError(dialog.text), "cancelar", HospitalizationRules.reasonBody(admission.version, dialog.text), "Admisión cancelada.")
            AdmissionAction.REVOKE_DISCHARGE -> Quad(HospitalizationRules.reasonError(dialog.text), "revocar-alta", HospitalizationRules.reasonBody(admission.version, dialog.text), "Alta revocada; el paciente sigue hospitalizado.")
            AdmissionAction.REQUEST_DISCHARGE -> Quad(HospitalizationRules.dischargeRequestError(dialog.text), "solicitar-alta", HospitalizationRules.dischargeRequestBody(admission.version, dialog.text), "Solicitud de alta enviada al médico tratante.")
            else -> return
        }
        if (error != null) { mutable.update { it.copy(formError = error) }; return }
        mutate("/admisiones/${admission.id}/$path", body, notice)
    }

    fun openTransfer(admission: HospitalAdmission) {
        mutable.update { it.copy(transfer = TransferForm(admission.id), formError = null, error = null) }
        viewModelScope.launch {
            try {
                val beds = HospitalizationRules.transferCandidates(AdmissionParser.beds(api.request("/camas")), admission)
                mutable.update { s -> s.copy(transfer = s.transfer?.takeIf { it.admissionId == admission.id }?.copy(loading = false, beds = beds, loadError = null)) }
            } catch (e: CancellationException) { throw e } catch (e: Exception) {
                mutable.update { s -> s.copy(transfer = s.transfer?.takeIf { it.admissionId == admission.id }?.copy(loading = false, loadError = readable(e, "No se pudieron consultar las camas libres."))) }
            }
        }
    }
    fun closeTransfer() = mutable.update { it.copy(transfer = null, formError = null) }
    fun pickTransferBed(bedId: String) = mutable.update { s -> s.copy(transfer = s.transfer?.copy(bedId = bedId), formError = null) }
    fun onTransferReason(text: String) = mutable.update { s -> s.copy(transfer = s.transfer?.copy(reason = text.take(ChangeReason.MAX)), formError = null) }
    fun transfer(admission: HospitalAdmission) {
        val form = mutable.value.transfer?.takeIf { it.admissionId == admission.id } ?: return
        val bedId = form.bedId?.takeIf { id -> form.beds.any { it.id == id } }
        val occupation = admission.occupationId
        val error = when {
            occupation.isNullOrBlank() -> "El paciente no tiene una cama asignada que trasladar. Actualiza la lista."
            bedId == null -> "Elige la cama de destino."
            else -> HospitalizationRules.reasonError(form.reason)
        }
        if (error != null || occupation == null || bedId == null) { mutable.update { it.copy(formError = error) }; return }
        mutate("/ocupaciones/$occupation/traslado", HospitalizationRules.transferBody(bedId, admission.version, form.reason), "Paciente trasladado; la cama anterior pasa a limpieza.")
    }

    fun openNotes(admission: HospitalAdmission) {
        mutable.update { it.copy(notes = NotesPanel(admission.id), formError = null, error = null) }
        loadNotes(admission.id, silent = false)
    }
    fun retryNotes() { mutable.value.notes?.let { loadNotes(it.admissionId, silent = false) } }
    fun closeNotes() { notesJob?.cancel(); mutable.update { it.copy(notes = null, formError = null) } }
    fun onNoteText(text: String) = mutable.update { s -> s.copy(notes = s.notes?.copy(text = text.take(HospitalizationRules.NOTE_MAX), saved = null), formError = null) }
    fun addNote(admission: HospitalAdmission) {
        val panel = mutable.value.notes?.takeIf { it.admissionId == admission.id } ?: return
        if (mutable.value.busy) return
        HospitalizationRules.noteError(panel.text)?.let { error -> mutable.update { it.copy(formError = error) }; return }
        mutable.update { s -> s.copy(busy = true, formError = null, notice = null, notes = s.notes?.copy(saved = null)) }
        viewModelScope.launch {
            try {
                api.request("/admisiones/${admission.id}/notas-enfermeria", "POST", HospitalizationRules.noteBody(panel.text))
                mutable.update { s -> s.copy(busy = false, notes = s.notes?.copy(text = "", saved = "Nota de enfermería guardada.")) }
                loadNotes(admission.id, silent = true)
            } catch (e: CancellationException) { throw e } catch (e: Exception) {
                mutable.update { it.copy(busy = false, formError = failure(e)) }
            }
        }
    }

    private fun loadNotes(admissionId: String, silent: Boolean) {
        if (!silent) mutable.update { s -> s.copy(notes = s.notes?.copy(loading = true, loadError = null)) }
        notesJob?.cancel()
        notesJob = viewModelScope.launch {
            try {
                val notes = AdmissionParser.notes(api.request("/admisiones/$admissionId/notas-enfermeria"))
                mutable.update { s -> s.copy(notes = s.notes?.takeIf { it.admissionId == admissionId }?.copy(loading = false, notes = notes, loadError = null)) }
            } catch (e: CancellationException) { throw e } catch (e: Exception) {
                if (!silent) mutable.update { s -> s.copy(notes = s.notes?.takeIf { it.admissionId == admissionId }?.copy(loading = false, loadError = readable(e, "No se pudieron cargar las notas de enfermería."))) }
            }
        }
    }

    fun clearMessages() { mutable.value = mutable.value.copy(error = null, notice = null) }
    fun announce(text: String) { mutable.value = mutable.value.copy(notice = text) }

    private fun updateDischarge(change: (DischargeForm) -> DischargeForm) = mutable.update { state -> state.copy(discharge = state.discharge?.let(change), formError = null) }

    /** On success every dialog closes; on failure the open dialog keeps what was typed and shows the error (stale lists reload). */
    private fun mutate(path: String, body: JSONObject, notice: String) {
        if (mutable.value.busy) return
        mutable.update { it.copy(busy = true, formError = null, error = null, notice = null) }
        viewModelScope.launch {
            try {
                api.request(path, "POST", body)
                mutable.update { it.copy(busy = false, notice = notice, selectedId = null, suggestions = emptyList(), assignReason = "", discharge = null, exitId = null, exitReason = "", reasonDialog = null, transfer = null) }
                load(silent = true)
            } catch (e: CancellationException) { throw e
            } catch (e: Exception) {
                mutable.update { it.copy(busy = false, formError = failure(e)) }
                val code = (e as? AuthRequestException)?.code
                if (HospitalizationRules.staleCode(code)) load(silent = true)
                // The chosen bed was taken meanwhile: read the suggestions again, keeping the error in the open dialog.
                if (code == "cama_ocupada") mutable.value.selectedId?.let(::refreshSuggestions)
            }
        }
    }

    private fun refreshSuggestions(admissionId: String) {
        viewModelScope.launch {
            try {
                val suggestions = AdmissionParser.suggestions(api.request("/admisiones/$admissionId/sugerencias-cama"))
                mutable.update { if (it.selectedId == admissionId) it.copy(suggestions = suggestions) else it }
            } catch (e: CancellationException) { throw e } catch (_: Exception) { /* The dialog already shows the assign error. */ }
        }
    }

    /** API errors carry Spanish text (MOV-03); anything else gets the generic [fallback], never a raw exception message. */
    private fun readable(e: Exception, fallback: String): String = (e as? AuthRequestException)?.let { userMessage(it, fallback) } ?: fallback
    private fun failure(e: Exception): String = HospitalizationRules.problemMessage((e as? AuthRequestException)?.code, readable(e, "No se pudo completar la operación."))

    private data class Quad(val error: String?, val path: String, val body: JSONObject, val notice: String)
}

@Composable
fun HospitalizationScreen(
    modifier: Modifier = Modifier,
    profile: AccessProfile? = null,
    quickAction: QuickAction? = null,
    onQuickActionHandled: () -> Unit = {},
    /** G5: "Signos" on a ward card opens Signos vitales on that patient; null when the role cannot record signs. */
    onOpenVitals: ((sv.edu.catolica.climesa.domain.QuickSubject) -> Unit)? = null,
    /** R7 U1 (G2): "Ingresar" from the patient record opens the admission guide with this patient chosen. */
    subject: sv.edu.catolica.climesa.domain.QuickSubject? = null,
    model: HospitalizationViewModel = viewModel(),
    intake: AdmissionIntakeViewModel = viewModel(),
) {
    val state by model.state.collectAsStateWithLifecycle(); LaunchedEffect(Unit) { model.load() }
    val intakeState by intake.state.collectAsStateWithLifecycle()
    // A confirmed admission reloads the list behind the guided flow.
    val createdNotice = stringResource(R.string.ing_creado)
    LaunchedEffect(intakeState.finished) { if (intakeState.finished) { model.load(silent = true); model.announce(createdNotice); intake.consumeFinished() } }
    // A dashboard asked to "assign a bed": open the bed suggestions of the first admission the server lets this person assign.
    LaunchedEffect(quickAction, state.loading, state.admissions) {
        if (quickAction == null || state.loading) return@LaunchedEffect
        if (quickAction == QuickAction.ASSIGN_BED && QuickActions.allowed(QuickAction.ASSIGN_BED, profile?.permissions.orEmpty())) state.admissions.firstOrNull { AdmissionAction.ASSIGN_BED in it.allowedActions }?.let(model::open)
        if (quickAction == QuickAction.ADMIT && QuickActions.allowed(QuickAction.ADMIT, profile?.permissions.orEmpty())) {
            // From a patient record the guide starts fresh with that patient; otherwise a kept draft resumes.
            if (subject != null) intake.restart() else intake.open()
            subject?.let { intake.pickPatient(sv.edu.catolica.climesa.domain.PickerPatient(it.id, it.detail.orEmpty(), it.name, null)) }
        }
        onQuickActionHandled()
    }
    LaunchedEffect(profile?.channels) { profile?.let { model.startLive(it.channels); intake.startLive(it.channels) } }
    val permissions = profile?.permissions.orEmpty()
    val canAssignBed = "camas.asignar" in permissions
    BackHandler(enabled = intakeState.open) { intake.backPressed(canAssignBed) }
    if (intakeState.open) { AdmissionIntakeScreen(canAssignBed, modifier, intake); return }
    fun byId(id: String?) = id?.let { wanted -> state.admissions.firstOrNull { it.id == wanted } }
    byId(state.selectedId)?.let { BedSuggestionDialog(it, state, model) }
    state.discharge?.let { form -> byId(form.admissionId)?.let { DischargeDialog(it, form, state, model) } }
    byId(state.exitId)?.let { ExitDialog(it, state, model) }
    state.reasonDialog?.let { dialog -> byId(dialog.admissionId)?.let { ReasonActionDialog(it, dialog, state, model) } }
    state.transfer?.let { form -> byId(form.admissionId)?.let { TransferDialog(it, form, state, model) } }
    state.notes?.let { panel -> byId(panel.admissionId)?.let { NursingNotesDialog(it, panel, state, model) } }
    val retry = { model.clearMessages(); model.load() }
    // ENF/AST + MED audit: one ward order (discharge requested, signed discharge, unstable, then bed) and a fold after N rows.
    val ordered = HospitalizationRules.wardOrder(state.admissions)
    var wardOpen by rememberSaveable { mutableStateOf(false) }
    PageList(modifier) {
        // One primary per screen: the first admission with a main action; "Ingresar paciente" is primary only when none has one.
        val primaryRow = HospitalizationRules.primaryAdmission(ordered)
        state.notice?.let { item { NoticeBanner(NoticeKind.SUCCESS, it) } }
        if (state.tray.isNotEmpty()) item { IndicatedTray(state.tray, model) }
        if ("admision.crear" in permissions) item {
            // S0: admitting is the shared create action. Lote 2: a kept draft is offered first, never lost silently.
            val resume = intakeState.resumeName
            if (resume == null) CrudButton(CrudKind.Create, stringResource(R.string.ing_ingresar), { model.clearMessages(); intake.open() }, enabled = !state.busy)
            else Column(verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                PrimaryButton(stringResource(R.string.ing_continuar_de, resume), { model.clearMessages(); intake.open() }, icon = Icons.Default.PlayArrow, enabled = !state.busy)
                SecondaryButton(stringResource(R.string.ing_empezar_de_nuevo), { model.clearMessages(); intake.restart() }, icon = Icons.Default.Refresh, enabled = !state.busy)
            }
        }
        when {
            state.loading && state.admissions.isEmpty() -> item { LoadingState() }
            state.error != null && state.admissions.isEmpty() -> item { ErrorState(state.error, retry) }
            state.admissions.isEmpty() && HospitalizationRules.wardFollowsShift(profile?.permissionContexts?.get("admision.ver").orEmpty()) ->
                item { EmptyState(stringResource(R.string.clin_hosp_sin_turno), detail = stringResource(R.string.clin_hosp_sin_turno_detalle), icon = Icons.Default.Bed) }
            state.admissions.isEmpty() -> item { EmptyState(stringResource(R.string.clin_hosp_sin_admisiones), detail = stringResource(R.string.clin_hosp_sin_admisiones_detalle), icon = Icons.Default.Bed) }
            else -> {
                if (state.loading) item { RefreshHint() }
                state.error?.let { error -> item { NoticeBanner(NoticeKind.ERROR, error) } }
                foldedItems(ordered, HospitalizationRules.WARD_VISIBLE, wardOpen, { wardOpen = !wardOpen }, foldKey = "planta-fold", key = { it.id }) { row -> AdmissionCard(row, state.busy, model, primary = row.id == primaryRow, onOpenVitals, state.signAlerts[row.id]) }
            }
        }
    }
}

/**
 * G3 "Ingresos indicados": admissions a doctor indicated from a consultation, each with the suggested bed. "Ingresar" is a
 * row action (the list keeps its one primary); the result or the error shows in place.
 */
@Composable
private fun IndicatedTray(rows: List<IndicatedAdmission>, model: HospitalizationViewModel) {
    val anyBusy = rows.any { it.busy }
    SectionCard(title = stringResource(R.string.u5_ingresos_indicados), eyebrow = rows.size.toString()) {
        rows.forEachIndexed { index, row ->
            if (index > 0) HorizontalDivider()
            Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(Spacing.xs)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                    Text(row.admission.patientName, Modifier.weight(1f), style = MaterialTheme.typography.titleSmall)
                    if (row.admission.unstable) CriticalPill(stringResource(R.string.u5_inestable))
                }
                row.admission.motive?.let { Text(it, style = MaterialTheme.typography.bodyMedium) }
                HospitalizationRules.indicatedBy(row.admission.attendingDoctorName, row.admission.origin, row.admission.scheduledAt)?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                when {
                    row.loading -> Text(stringResource(R.string.clin_hosp_buscando_camas), style = MaterialTheme.typography.bodySmall)
                    row.bed != null -> Text(stringResource(R.string.u5_cama_sugerida, row.bed.code, row.bed.room), style = MaterialTheme.typography.bodyMedium)
                    row.noBeds -> Text(stringResource(R.string.hosp_sin_camas_compatibles), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                row.error?.let { NoticeBanner(NoticeKind.ERROR, it) }
                if (row.bed != null) RowAction(stringResource(R.string.u5_ingresar), { model.admitIndicated(row) }, enabled = !anyBusy, loading = row.busy)
            }
        }
    }
}

/** Every button comes from the server's `allowedActions`; the main action of the state is the only primary button. */
@Composable
private fun AdmissionCard(row: HospitalAdmission, busy: Boolean, model: HospitalizationViewModel, primary: Boolean, onOpenVitals: ((sv.edu.catolica.climesa.domain.QuickSubject) -> Unit)?, signAlerts: List<sv.edu.catolica.climesa.domain.VitalAlert>? = null) {
    val actions = row.allowedActions
    val main = HospitalizationRules.primaryAction(actions)?.takeIf { primary }
    @Composable fun act(action: AdmissionAction, text: String, onClick: () -> Unit, icon: androidx.compose.ui.graphics.vector.ImageVector? = null) {
        if (action !in actions) return
        if (action == main) PrimaryButton(text, onClick, icon = icon, enabled = !busy) else SecondaryButton(text, onClick, icon = icon, enabled = !busy)
    }
    SectionCard(title = row.patientName, eyebrow = AdmissionIntake.CATEGORY_LABELS[row.category] ?: row.category, action = { StatusTag(row.state) }) {
        Row(horizontalArrangement = Arrangement.spacedBy(Spacing.lg)) {
            LabeledValue(stringResource(R.string.hosp_cama), if (row.bed.isBlank()) stringResource(R.string.clin_hosp_sin_cama) else row.bed, Modifier.weight(1f))
            if (row.isolation) FamilyBadge(stringResource(R.string.clin_hosp_aislamiento), null)
        }
        row.attendingDoctorName?.let { LabeledValue(stringResource(R.string.hosp_tratante), it) }
        // D86: a critical value of the latest signs shows on the card as soon as it is recorded.
        HospitalizationRules.criticalSignsText(signAlerts.orEmpty())?.let { CriticalPill(stringResource(R.string.hosp_signos_criticos, it)) }
        // Row 20: the request shows to everyone who sees the row, not only to who can sign (iOS `requestHint`).
        row.dischargeRequestedAt?.let { NoticeBanner(NoticeKind.INFO, stringResource(R.string.hosp_alta_solicitada, localTime(it))) }
        HospitalizationRules.waitingDischargeHint(row)?.let { NoticeBanner(if (row.attendingDoctorHasAccount) NoticeKind.INFO else NoticeKind.WARNING, it) }
        row.discharge?.takeIf { row.state == "alta_firmada" }?.let { d ->
            val signer = d.signedByName ?: stringResource(R.string.hosp_alta_firmante_desconocido)
            Text(
                d.type?.let { stringResource(R.string.hosp_alta_firmada, it.label.lowercase(), signer, localTime(d.signedAt)) }
                    ?: stringResource(R.string.hosp_alta_firmada_sin_tipo, signer, localTime(d.signedAt)),
                style = MaterialTheme.typography.bodySmall,
            )
            // Row 7: what is left after the signed discharge and who answers for it (RN-11, iOS `SignedDischarge`).
            val pending = d.pending
            when {
                !pending.isNullOrEmpty() -> pending.forEach { p -> Text(stringResource(R.string.med_alta_pendiente_item, p.description, p.responsible), style = MaterialTheme.typography.bodySmall) }
                pending == null && d.pendingCount > 0 -> Text(androidx.compose.ui.res.pluralStringResource(R.plurals.med_alta_pendientes_n, d.pendingCount, d.pendingCount), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                else -> Text(stringResource(R.string.med_alta_sin_pendientes), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        act(AdmissionAction.ASSIGN_BED, stringResource(R.string.hosp_asignar_cama), { model.open(row) }, Icons.Default.Bed)
        act(AdmissionAction.SIGN_DISCHARGE, stringResource(R.string.hosp_firmar_alta), { model.openDischarge(row) })
        act(AdmissionAction.REGISTER_EXIT, stringResource(R.string.hosp_registrar_salida), { model.openExit(row) })
        if (AdmissionAction.REQUEST_DISCHARGE in actions) SecondaryButton(stringResource(R.string.hosp_solicitar_alta), { model.openReason(row, AdmissionAction.REQUEST_DISCHARGE) }, enabled = !busy)
        if (AdmissionAction.TRANSFER in actions) SecondaryButton(stringResource(R.string.hosp_trasladar), { model.openTransfer(row) }, icon = Icons.Default.SwapHoriz, enabled = !busy)
        if (AdmissionAction.NURSING_NOTE in actions) SecondaryButton(stringResource(R.string.hosp_notas), { model.openNotes(row) }, icon = Icons.AutoMirrored.Filled.Notes, enabled = !busy)
        HospitalizationRules.vitalsSubject(row)?.let { subject -> onOpenVitals?.let { open -> RowAction(stringResource(R.string.rec7_hosp_signos), { open(subject) }) } }
        if (AdmissionAction.REVOKE_DISCHARGE in actions) SecondaryButton(stringResource(R.string.hosp_revocar_alta), { model.openReason(row, AdmissionAction.REVOKE_DISCHARGE) }, enabled = !busy)
        // S0: cancelling an admission is the shared red deactivate action.
        if (AdmissionAction.CANCEL in actions) CrudButton(CrudKind.Deactivate, stringResource(R.string.hosp_cancelar_admision), { model.openReason(row, AdmissionAction.CANCEL) }, enabled = !busy)
    }
}

@Composable private fun BedSuggestionDialog(admission: HospitalAdmission, state: HospitalizationState, model: HospitalizationViewModel) {
    var selected by rememberSaveable(admission.id) { mutableStateOf("") }; val suggestion = state.suggestions.firstOrNull { it.id == selected }
    ConfirmDialog(
        title = stringResource(R.string.clin_hosp_seleccionar_cama),
        confirmLabel = stringResource(R.string.clin_hosp_confirmar_cama),
        onConfirm = { if (suggestion != null) model.assign(admission, suggestion) },
        onDismiss = model::close,
        busy = state.busy,
        confirmEnabled = suggestion != null,
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            state.formError?.let { NoticeBanner(NoticeKind.ERROR, it) }
            if (state.loadingSuggestions) Text(stringResource(R.string.clin_hosp_buscando_camas), style = MaterialTheme.typography.bodySmall)
            else if (state.suggestions.isEmpty() && state.formError == null) Text(stringResource(R.string.hosp_sin_camas_compatibles), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            else HospitalizationRules.byRoom(state.suggestions).forEach { (room, beds) ->
                // Lote 2: grouped by room like the intake Cama step, so the choice reads as the floor plan, not a flat list.
                Text(stringResource(R.string.hosp_habitacion_n, room, beds.size), style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(top = Spacing.xs))
                beds.forEach { row ->
                    DataRow(
                        title = row.code,
                        subtitle = listOf(AdmissionIntake.CATEGORY_LABELS[row.category] ?: row.category, row.reason).filter { it.isNotBlank() }.joinToString(" · "),
                        leadingIcon = if (row.id == selected) Icons.Default.Check else Icons.Default.Bed,
                        onClick = { selected = row.id },
                        divider = true,
                        container = false,
                    )
                }
            }
            FormField(stringResource(R.string.hosp_motivo_asignacion), state.assignReason, model::onAssignReason, hint = stringResource(R.string.hosp_motivo_opcional_ayuda), enabled = !state.busy, singleLine = false)
        }
    }
}

@Composable private fun DischargeDialog(admission: HospitalAdmission, form: DischargeForm, state: HospitalizationState, model: HospitalizationViewModel) {
    ConfirmDialog(
        title = stringResource(R.string.hosp_firmar_alta),
        confirmLabel = stringResource(R.string.hosp_firmar_alta),
        onConfirm = { model.signDischarge(admission) },
        onDismiss = model::closeDischarge,
        busy = state.busy,
        destructive = true,
        confirmEnabled = HospitalizationRules.dischargeError(form.type, form.summary, form.pending, form.voluntaryConsent) == null,
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text(admission.patientName, style = MaterialTheme.typography.titleSmall)
            // D86: signing is irreversible; a critical value of the latest signs is said before, not found after.
            HospitalizationRules.criticalSignsText(state.signAlerts[admission.id].orEmpty())?.let { NoticeBanner(NoticeKind.WARNING, stringResource(R.string.hosp_alta_signos_criticos, it)) }
            admission.dischargeRequestedAt?.let { NoticeBanner(NoticeKind.INFO, stringResource(R.string.hosp_alta_solicitada, localTime(it))) }
            state.formError?.let { NoticeBanner(NoticeKind.ERROR, it) }
            Text(stringResource(R.string.hosp_alta_tipo), style = MaterialTheme.typography.labelLarge)
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) { DischargeType.entries.take(2).forEach { type -> FilterChip(selected = form.type == type, onClick = { model.onDischargeType(type) }, label = { Text(type.label) }, enabled = !state.busy) } }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) { DischargeType.entries.drop(2).forEach { type -> FilterChip(selected = form.type == type, onClick = { model.onDischargeType(type) }, label = { Text(type.label) }, enabled = !state.busy) } }
            // D88: the length rule shows under the field while typing, so a disabled "Firmar alta" is never a mystery.
            FormField(stringResource(R.string.hosp_alta_resumen), form.summary, model::onSummary, hint = stringResource(R.string.hosp_alta_resumen_ayuda) + " " + HospitalizationRules.counter(form.summary, HospitalizationRules.SUMMARY_MAX), error = HospitalizationRules.summaryError(form.summary), enabled = !state.busy, singleLine = false)
            if (form.type == DischargeType.VOLUNTARY) Row(verticalAlignment = Alignment.CenterVertically) { Checkbox(form.voluntaryConsent, model::onVoluntaryConsent, enabled = !state.busy); Text(stringResource(R.string.hosp_alta_constancia), style = MaterialTheme.typography.bodySmall) }
            Text(stringResource(R.string.hosp_alta_pendientes), style = MaterialTheme.typography.labelLarge)
            // D13: each pending row keeps its own identity, so removing one never moves another row's «Otro» choice.
            val rowKeys = androidx.compose.runtime.remember(form.admissionId) { PendingRowKeys() }
            rowKeys.sync(form.pending.size)
            form.pending.forEachIndexed { index, item -> androidx.compose.runtime.key(rowKeys[index]) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        FormField(stringResource(R.string.hosp_alta_pendiente), item.description, { model.onPending(index, item.copy(description = it)) }, enabled = !state.busy)
                        ResponsiblePicker(item.responsible, !state.busy) { model.onPending(index, item.copy(responsible = it)) }
                        if (item.description.isNotBlank() != item.responsible.isNotBlank()) Text(stringResource(R.string.hosp_alta_pendiente_incompleto), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
                    }
                    IconButton(onClick = { rowKeys.remove(index); model.removePending(index) }, enabled = !state.busy) { Icon(Icons.Default.Close, stringResource(R.string.hosp_alta_quitar)) }
                }
            } }
            TextButton(onClick = model::addPending, enabled = !state.busy) { Text(stringResource(R.string.hosp_alta_agregar)) }
        }
    }
}

/** D13: stable composition keys for the pending rows of the discharge form; a removed row takes its key with it. */
internal class PendingRowKeys {
    private val keys = ArrayList<Long>()
    private var next = 0L
    fun sync(size: Int) { while (keys.size < size) keys.add(next++); while (keys.size > size) keys.removeAt(keys.lastIndex) }
    operator fun get(index: Int): Long = keys[index]
    fun remove(index: Int) { if (index in keys.indices) keys.removeAt(index) }
}

/** D89: "Quién responde" is a choice of the usual teams, with «Otro» for a name or team that is not listed. */
@OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable private fun ResponsiblePicker(value: String, enabled: Boolean, onChange: (String) -> Unit) {
    val options = HospitalizationRules.PENDING_RESPONSIBLES
    var other by rememberSaveable { mutableStateOf(value.isNotBlank() && value !in options) }
    Text(stringResource(R.string.hosp_alta_responsable), style = MaterialTheme.typography.labelMedium)
    androidx.compose.foundation.layout.FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        options.forEach { option -> FilterChip(selected = !other && value == option, onClick = { other = false; onChange(option) }, label = { Text(option) }, enabled = enabled) }
        FilterChip(selected = other, onClick = { other = true; if (value in options) onChange("") }, label = { Text(stringResource(R.string.hosp_alta_responsable_otro)) }, enabled = enabled)
    }
    if (other) FormField(stringResource(R.string.hosp_alta_responsable_otro_campo), value, onChange, enabled = enabled)
}

/** MA-HOS-03 (partial): the exit shows what the discharge left pending and who answers for it. */
@Composable private fun ExitDialog(admission: HospitalAdmission, state: HospitalizationState, model: HospitalizationViewModel) {
    ConfirmDialog(
        title = stringResource(R.string.hosp_registrar_salida),
        confirmLabel = stringResource(R.string.hosp_registrar_salida),
        onConfirm = { model.registerExit(admission) },
        onDismiss = model::closeExit,
        message = stringResource(R.string.hosp_salida_detalle),
        busy = state.busy,
        confirmEnabled = ChangeReason.error(state.exitReason) == null,
    ) {
        Column(Modifier, verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(admission.patientName, style = MaterialTheme.typography.titleSmall)
            admission.discharge?.let { d ->
                if (d.specialHandling) NoticeBanner(NoticeKind.WARNING, stringResource(R.string.hosp_salida_tramite_especial))
                Text(stringResource(R.string.hosp_pendientes_alta), style = MaterialTheme.typography.labelLarge)
                val pending = d.pending
                when {
                    pending == null && d.pendingCount > 0 -> Text(if (d.pendingCount == 1) stringResource(R.string.hosp_pendiente_sin_detalle) else stringResource(R.string.hosp_pendientes_sin_detalle, d.pendingCount), style = MaterialTheme.typography.bodySmall)
                    pending.isNullOrEmpty() -> Text(stringResource(R.string.hosp_sin_pendientes), style = MaterialTheme.typography.bodySmall)
                    else -> pending.forEach { Text(stringResource(R.string.hosp_pendiente_linea, it.description, it.responsible), style = MaterialTheme.typography.bodySmall) }
                }
            }
            state.formError?.let { NoticeBanner(NoticeKind.ERROR, it) }
            FormField(stringResource(R.string.hosp_salida_motivo), state.exitReason, model::onExitReason, hint = stringResource(R.string.hosp_contador_motivo, HospitalizationRules.counter(state.exitReason, ChangeReason.MAX)), enabled = !state.busy, singleLine = false)
        }
    }
}

/** Cancel admission (reason), request discharge (optional note) or revoke discharge (reason), with a live counter. */
@Composable private fun ReasonActionDialog(admission: HospitalAdmission, dialog: ReasonDialog, state: HospitalizationState, model: HospitalizationViewModel) {
    val optional = dialog.action == AdmissionAction.REQUEST_DISCHARGE
    val title = stringResource(when (dialog.action) { AdmissionAction.CANCEL -> R.string.hosp_cancelar_admision; AdmissionAction.REVOKE_DISCHARGE -> R.string.hosp_revocar_alta; else -> R.string.hosp_solicitar_alta })
    val message = when (dialog.action) {
        AdmissionAction.CANCEL -> stringResource(R.string.hosp_cancelar_detalle)
        AdmissionAction.REVOKE_DISCHARGE -> stringResource(R.string.hosp_revocar_detalle)
        else -> stringResource(R.string.hosp_solicitar_alta_detalle, admission.attendingDoctorName ?: stringResource(R.string.hosp_tratante).lowercase())
    }
    val label = stringResource(when (dialog.action) { AdmissionAction.CANCEL -> R.string.hosp_cancelar_motivo; AdmissionAction.REVOKE_DISCHARGE -> R.string.hosp_revocar_motivo; else -> R.string.hosp_solicitar_nota })
    val valid = if (optional) HospitalizationRules.dischargeRequestError(dialog.text) == null else HospitalizationRules.reasonError(dialog.text) == null
    val counter = HospitalizationRules.counter(dialog.text, ChangeReason.MAX)
    ConfirmDialog(
        title = title,
        confirmLabel = if (optional) stringResource(R.string.hosp_solicitar_enviar) else title,
        onConfirm = { model.submitReason(admission) },
        onDismiss = model::closeReason,
        message = message,
        dismissLabel = stringResource(R.string.hosp_volver),
        destructive = dialog.action != AdmissionAction.REQUEST_DISCHARGE,
        busy = state.busy,
        confirmEnabled = valid,
    ) {
        Text(admission.patientName, style = MaterialTheme.typography.titleSmall)
        state.formError?.let { NoticeBanner(NoticeKind.ERROR, it) }
        FormField(label, dialog.text, model::onReason, hint = if (optional) stringResource(R.string.hosp_contador_nota, counter) else stringResource(R.string.hosp_contador_motivo, counter), enabled = !state.busy, singleLine = false)
    }
}

/** MA-HOS-01: free bed of the same category (never the current one) and the reason. */
@Composable private fun TransferDialog(admission: HospitalAdmission, form: TransferForm, state: HospitalizationState, model: HospitalizationViewModel) {
    val category = admission.bedCategory ?: admission.category
    ConfirmDialog(
        title = stringResource(R.string.hosp_trasladar),
        confirmLabel = stringResource(R.string.hosp_traslado_confirmar),
        onConfirm = { model.transfer(admission) },
        onDismiss = model::closeTransfer,
        message = stringResource(R.string.hosp_traslado_detalle, AdmissionIntake.CATEGORY_LABELS[category] ?: category),
        busy = state.busy,
        confirmEnabled = form.bedId != null && HospitalizationRules.reasonError(form.reason) == null,
    ) {
        Column(Modifier, verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(admission.patientName, style = MaterialTheme.typography.titleSmall)
            state.formError?.let { NoticeBanner(NoticeKind.ERROR, it) }
            when {
                form.loading -> Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) { Spinner(size = 20.dp, strokeWidth = 2.dp); Text(stringResource(R.string.clin_hosp_buscando_camas), style = MaterialTheme.typography.bodySmall) }
                form.loadError != null -> NoticeBanner(NoticeKind.ERROR, form.loadError)
                form.beds.isEmpty() -> NoticeBanner(NoticeKind.INFO, stringResource(R.string.hosp_traslado_sin_camas))
                else -> form.beds.forEach { bed ->
                    DataRow(title = "${bed.code} · ${bed.room}", leadingIcon = if (bed.id == form.bedId) Icons.Default.Check else Icons.Default.Bed, onClick = { model.pickTransferBed(bed.id) }, divider = true, container = false)
                }
            }
            FormField(stringResource(R.string.hosp_traslado_motivo), form.reason, model::onTransferReason, hint = stringResource(R.string.hosp_contador_motivo, HospitalizationRules.counter(form.reason, ChangeReason.MAX)), enabled = !state.busy, singleLine = false)
        }
    }
}

/** A51: nursing notes, newest first, and the note being written. A failed read is an error, never an empty list. */
@Composable private fun NursingNotesDialog(admission: HospitalAdmission, panel: NotesPanel, state: HospitalizationState, model: HospitalizationViewModel) {
    ConfirmDialog(
        title = stringResource(R.string.hosp_notas),
        confirmLabel = stringResource(R.string.hosp_nota_guardar),
        onConfirm = { model.addNote(admission) },
        onDismiss = model::closeNotes,
        dismissLabel = stringResource(R.string.hosp_cerrar),
        busy = state.busy,
        confirmEnabled = HospitalizationRules.noteError(panel.text) == null,
    ) {
        Column(Modifier, verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(admission.patientName, style = MaterialTheme.typography.titleSmall)
            state.formError?.let { NoticeBanner(NoticeKind.ERROR, it) }
            panel.saved?.let { NoticeBanner(NoticeKind.SUCCESS, it) }
            // D98: an empty note says why "Guardar nota" is off, right under the field.
            FormField(stringResource(R.string.hosp_nota_nueva), panel.text, model::onNoteText, hint = if (panel.text.isBlank()) stringResource(R.string.hosp_nota_vacia) else HospitalizationRules.counter(panel.text, HospitalizationRules.NOTE_MAX), enabled = !state.busy, singleLine = false)
            when {
                panel.loading && panel.notes.isEmpty() -> Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) { Spinner(size = 20.dp, strokeWidth = 2.dp); Text(stringResource(R.string.ui_cargando_titulo), style = MaterialTheme.typography.bodySmall) }
                panel.loadError != null -> { NoticeBanner(NoticeKind.ERROR, panel.loadError); TextButton(onClick = model::retryNotes) { Text(stringResource(R.string.ui_reintentar)) } }
                panel.notes.isEmpty() -> Text(stringResource(R.string.hosp_notas_vacio), style = MaterialTheme.typography.bodySmall)
                // ENF/AST audit #6: the note is body text, never cut to two lines.
                else -> panel.notes.forEachIndexed { index, note ->
                    if (index > 0) HorizontalDivider(color = MaterialTheme.climesa.line)
                    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(Spacing.xs)) {
                        Text(note.text, style = MaterialTheme.typography.bodyMedium)
                        Text("${note.authorName ?: stringResource(R.string.hosp_nota_autor_desconocido)} · ${localTime(note.createdAt)}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
        }
    }
}
