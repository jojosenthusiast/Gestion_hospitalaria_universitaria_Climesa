package sv.edu.catolica.climesa.ui.lab

import android.net.Uri
import android.provider.OpenableColumns
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import java.security.MessageDigest
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import sv.edu.catolica.climesa.R
import sv.edu.catolica.climesa.domain.ExternalExam
import sv.edu.catolica.climesa.domain.LabAttachment
import sv.edu.catolica.climesa.domain.LabAttachmentRules
import sv.edu.catolica.climesa.domain.LabExternalRules
import sv.edu.catolica.climesa.ui.ConfirmDialog
import sv.edu.catolica.climesa.ui.DataRow
import sv.edu.catolica.climesa.ui.FormField
import sv.edu.catolica.climesa.ui.NoticeBanner
import sv.edu.catolica.climesa.ui.NoticeKind
import sv.edu.catolica.climesa.ui.SecondaryButton

/**
 * D4 · «Registrar resultado externo» (A22, doctor with `laboratorio.ordenar`): where it was done, the exams of the catalog with
 * their values, the PDF or photo of the report and an optional note. Everything typed lives in [ExternalRecordViewModel].
 */
@Composable
internal fun ExternalRecordDialog(patientName: String, state: ExternalRecordState, model: ExternalRecordViewModel) {
    val draft = state.draft ?: return
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var query by rememberSaveable { mutableStateOf("") }
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri: Uri? ->
        if (uri != null) scope.launch { model.setAttachment(withContext(Dispatchers.IO) { describeDocument(context, uri) }) }
    }
    ConfirmDialog(
        title = stringResource(R.string.extres_titulo),
        message = stringResource(R.string.extres_efecto, patientName),
        confirmLabel = stringResource(R.string.extres_guardar),
        onConfirm = model::save,
        onDismiss = model::dismiss,
        dismissLabel = stringResource(R.string.lab_cancelar_volver),
        busy = draft.busy,
        body = {
            Column(Modifier, verticalArrangement = Arrangement.spacedBy(10.dp)) {
                draft.error?.let { NoticeBanner(NoticeKind.ERROR, it) }
                FormField(stringResource(R.string.extres_lugar), draft.place, model::setPlace, enabled = !draft.busy, hint = stringResource(R.string.extres_lugar_ayuda))
                Text(stringResource(R.string.extres_examenes), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                draft.exams.forEach { exam -> ExamValue(exam, draft.values[exam.id].orEmpty(), !draft.busy, model) }
                when {
                    state.catalogLoading -> Text(stringResource(R.string.extres_catalogo_cargando), style = MaterialTheme.typography.bodySmall)
                    state.catalogError != null -> {
                        NoticeBanner(NoticeKind.ERROR, state.catalogError)
                        SecondaryButton(stringResource(R.string.extres_catalogo_reintentar), model::retryCatalog)
                    }
                    else -> {
                        FormField(stringResource(R.string.extres_buscar_examen), query, { query = it.take(60) }, enabled = !draft.busy)
                        val matches = examMatches(state.catalog, draft.exams, query)
                        matches.forEach { exam ->
                            DataRow(exam.name, meta = exam.code, leadingIcon = Icons.Default.Add, container = false, onClick = { model.addExam(exam.id); query = "" })
                        }
                        if (query.trim().length >= 2 && matches.isEmpty()) Text(stringResource(R.string.extres_sin_coincidencias), style = MaterialTheme.typography.bodySmall)
                    }
                }
                SecondaryButton(stringResource(if (draft.attachment == null) R.string.lab_cargar_externo_elegir else R.string.lab_cargar_externo_cambiar), { picker.launch(LabExternalRules.ATTACHMENT_TYPES.toTypedArray()) }, enabled = !draft.busy)
                draft.attachment?.let { Text("${it.fileName} · ${LabAttachmentRules.sizeText(it.sizeBytes)}", style = MaterialTheme.typography.bodySmall) }
                FormField(stringResource(R.string.lab_cargar_externo_nota), draft.note, model::setNote, singleLine = false, enabled = !draft.busy)
                Text(stringResource(R.string.lab_cargar_externo_almacen), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        },
    )
}

@Composable
private fun ExamValue(exam: ExternalExam, value: String, enabled: Boolean, model: ExternalRecordViewModel) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        FormField(if (exam.numeric && exam.unit != null) "${exam.name} (${exam.unit})" else exam.name, value, { model.setValue(exam.id, it) }, Modifier.weight(1f), enabled = enabled,
            keyboardOptions = if (exam.numeric) KeyboardOptions(keyboardType = KeyboardType.Decimal) else KeyboardOptions.Default)
        TextButton({ model.removeExam(exam.id) }, enabled = enabled) { Text(stringResource(R.string.extres_quitar)) }
    }
}

/** Up to six exams not picked yet whose name or code contains [query] (two letters at least). */
internal fun examMatches(catalog: List<ExternalExam>, picked: List<ExternalExam>, query: String): List<ExternalExam> {
    val q = query.trim().lowercase()
    if (q.length < 2) return emptyList()
    return catalog.filter { exam -> picked.none { it.id == exam.id } && (exam.name.lowercase().contains(q) || exam.code.lowercase().contains(q)) }.take(6)
}

/** Name, type, size and SHA-256 of the picked document; its bytes are read again when the file is uploaded. */
private fun describeDocument(context: android.content.Context, uri: Uri): LabAttachment? = runCatching {
    val resolver = context.contentResolver
    var name = "informe"; var size = -1L
    resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null)?.use { cursor ->
        if (cursor.moveToFirst()) {
            cursor.getString(0)?.let { name = it }
            if (!cursor.isNull(1)) size = cursor.getLong(1)
        }
    }
    val type = resolver.getType(uri) ?: "application/octet-stream"
    if (size > LabExternalRules.MAX_ATTACHMENT_BYTES) return@runCatching LabAttachment(name, type, size, uri = uri.toString())
    val digest = MessageDigest.getInstance("SHA-256")
    var read = 0L
    resolver.openInputStream(uri)?.use { input ->
        val buffer = ByteArray(64 * 1024)
        while (true) { val n = input.read(buffer); if (n < 0) break; digest.update(buffer, 0, n); read += n }
    }
    LabAttachment(name, type, if (size >= 0) size else read, digest.digest().joinToString("") { "%02x".format(it) }, uri.toString())
}.getOrNull()
