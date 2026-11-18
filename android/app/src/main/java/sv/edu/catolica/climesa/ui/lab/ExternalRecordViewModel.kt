package sv.edu.catolica.climesa.ui.lab

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import sv.edu.catolica.climesa.data.ApiGateway
import sv.edu.catolica.climesa.data.DocumentReader
import sv.edu.catolica.climesa.data.SubmissionIntent
import sv.edu.catolica.climesa.domain.ExternalExam
import sv.edu.catolica.climesa.domain.ExternalRecordRules
import sv.edu.catolica.climesa.domain.LabAttachment
import sv.edu.catolica.climesa.domain.LabAttachmentRules
import sv.edu.catolica.climesa.domain.LabExternalRules
import sv.edu.catolica.climesa.ui.labUploadMessage
import sv.edu.catolica.climesa.ui.userMessage

/** The open «Registrar resultado externo» form; it lives in the ViewModel so a rotation keeps what was typed. */
data class ExternalRecordDraft(
    val patientId: String,
    val place: String = "",
    val exams: List<ExternalExam> = emptyList(),
    val values: Map<String, String> = emptyMap(),
    val note: String = "",
    val attachment: LabAttachment? = null,
    val error: String? = null,
    val busy: Boolean = false,
)

data class ExternalRecordState(
    val draft: ExternalRecordDraft? = null,
    val catalog: List<ExternalExam> = emptyList(),
    val catalogLoading: Boolean = false,
    val catalogError: String? = null,
    val notice: String? = null,
    /** The values were saved but the file did not go up: it is uploaded later from the order (Laboratorio). */
    val uploadFailure: String? = null,
    /** Goes up on every saved record, so the record screen reads the history again. */
    val saved: Int = 0,
)

/**
 * D4 · «Registrar resultado externo» from the doctor's patient record (A22). The values go first with the file reference
 * (`POST /laboratorio/pacientes/{id}/resultado-externo`), then the file itself (`POST /laboratorio/adjuntos/{id}/archivo`),
 * as the web dialog does. One [SubmissionIntent] per form: a retry of the same intent reuses its `Idempotency-Key`.
 */
@HiltViewModel
class ExternalRecordViewModel @Inject constructor(private val api: ApiGateway, private val documents: DocumentReader) : ViewModel() {
    private val mutable = MutableStateFlow(ExternalRecordState())
    val state = mutable.asStateFlow()
    private var intent = SubmissionIntent()

    fun open(patientId: String) {
        intent = SubmissionIntent()
        mutable.value = mutable.value.copy(draft = ExternalRecordDraft(patientId), notice = null, uploadFailure = null)
        loadCatalog()
    }

    fun dismiss() { if (mutable.value.draft?.busy != true) mutable.value = mutable.value.copy(draft = null) }
    fun dismissNotice() { mutable.value = mutable.value.copy(notice = null, uploadFailure = null) }

    private fun loadCatalog() {
        val current = mutable.value
        if (current.catalog.isNotEmpty() || current.catalogLoading) return
        mutable.value = current.copy(catalogLoading = true, catalogError = null)
        viewModelScope.launch {
            try { mutable.value = mutable.value.copy(catalogLoading = false, catalog = ExternalRecordRules.parseCatalog(api.request("/laboratorio/catalogo"))) }
            catch (e: CancellationException) { throw e }
            catch (e: Exception) { mutable.value = mutable.value.copy(catalogLoading = false, catalogError = userMessage(e, "No pudimos cargar el catálogo de exámenes.")) }
        }
    }

    fun retryCatalog() = loadCatalog()

    private fun edit(change: (ExternalRecordDraft) -> ExternalRecordDraft) {
        val draft = mutable.value.draft ?: return
        if (!draft.busy) mutable.value = mutable.value.copy(draft = change(draft).copy(error = null))
    }

    fun setPlace(place: String) = edit { it.copy(place = place.take(ExternalRecordRules.MAX_PLACE)) }
    fun addExam(examId: String) = edit { d ->
        val exam = mutable.value.catalog.firstOrNull { it.id == examId }
        if (exam == null || d.exams.any { it.id == examId } || d.exams.size >= ExternalRecordRules.MAX_EXAMS) d else d.copy(exams = d.exams + exam)
    }
    fun removeExam(examId: String) = edit { it.copy(exams = it.exams.filterNot { e -> e.id == examId }, values = it.values - examId) }
    fun setValue(examId: String, value: String) = edit { it.copy(values = it.values + (examId to value.take(ExternalRecordRules.MAX_TEXT))) }
    fun setNote(note: String) = edit { it.copy(note = note.take(LabExternalRules.MAX_NOTE)) }
    fun setAttachment(file: LabAttachment?) {
        val draft = mutable.value.draft ?: return
        if (!draft.busy) mutable.value = mutable.value.copy(draft = draft.copy(attachment = file, error = LabExternalRules.attachmentError(file)))
    }

    fun save() {
        val draft = mutable.value.draft ?: return
        if (draft.busy) return
        val problem = ExternalRecordRules.error(draft.place, draft.exams, draft.values, draft.attachment, draft.note) ?: LabAttachmentRules.uploadProblem(draft.attachment)
        if (problem != null) { mutable.value = mutable.value.copy(draft = draft.copy(error = problem)); return }
        val file = draft.attachment!!
        mutable.value = mutable.value.copy(draft = draft.copy(busy = true, error = null))
        viewModelScope.launch {
            val saved = try {
                intent.send { api.request(ExternalRecordRules.path(draft.patientId), "POST", ExternalRecordRules.body(draft.place, file, draft.exams, draft.values, draft.note)) }
            }
            catch (e: CancellationException) { throw e }
            catch (e: Exception) { mutable.value = mutable.value.copy(draft = draft.copy(busy = false, error = userMessage(e, "No se pudo registrar el resultado externo."))); return@launch }
            val attachmentId = LabAttachmentRules.attachmentIdOf(saved)
            val uploadError = attachmentId?.let { id -> try { sendFile(id, file); null } catch (e: CancellationException) { throw e } catch (e: Exception) { labUploadMessage(e) } }
            val s = mutable.value
            mutable.value = if (uploadError != null) {
                s.copy(draft = null, saved = s.saved + 1, uploadFailure = "Los valores se guardaron, pero el archivo no se subió: $uploadError Súbelo desde la orden, en Laboratorio › «Informe externo».")
            } else {
                s.copy(draft = null, saved = s.saved + 1, notice = ExternalRecordRules.DONE)
            }
        }
    }

    /** Reads the picked document again (checking 10 MiB while reading) and posts it in the `archivo` field. */
    private suspend fun sendFile(attachmentId: String, file: LabAttachment) {
        val bytes = documents.read(file.uri ?: throw java.io.FileNotFoundException(file.fileName), LabExternalRules.MAX_ATTACHMENT_BYTES)
        if (bytes.isEmpty()) throw java.io.FileNotFoundException(file.fileName)
        api.upload(LabAttachmentRules.filePath(attachmentId), LabAttachmentRules.UPLOAD_FIELD, file.fileName, file.mimeType, bytes)
    }
}
