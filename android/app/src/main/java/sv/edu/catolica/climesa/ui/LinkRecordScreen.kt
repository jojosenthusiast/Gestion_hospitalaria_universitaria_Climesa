package sv.edu.catolica.climesa.ui

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import sv.edu.catolica.climesa.R
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.text.input.KeyboardType
import sv.edu.catolica.climesa.domain.AccessProfile
import sv.edu.catolica.climesa.domain.LinkStatus

/** A03 · Vincular expediente (spec 101). Opens on the real state of the request (G2, `GET /me/vinculacion`).
 * The typed DUI and date survive rotation (`rememberSaveable`); "Volver a pedir" fills them once with what was declared.
 */
@Composable
fun LinkRecordScreen(profile: AccessProfile, modifier: Modifier = Modifier, model: LinkRecordViewModel = viewModel()) {
    val state by model.state.collectAsStateWithLifecycle()
    var dui by rememberSaveable { mutableStateOf("") }
    var birth by rememberSaveable { mutableStateOf("") }
    LaunchedEffect(profile.patientId) { model.init(profile.patientId) }
    LaunchedEffect(profile.channels) { model.startLive(profile.channels) }
    LaunchedEffect(state.prefill) { state.prefill?.let { dui = it.dui; birth = it.birth.orEmpty(); model.prefillApplied() } }
    PageList(modifier) {
        // A refresh that failed over a known state: said above it, with the retry; the state stays.
        state.readError?.takeIf { state.status != LinkStatus.UNAVAILABLE }?.let { message -> item {
            ClimesaActionGroup { NoticeBanner(NoticeKind.ERROR, message); RowAction(stringResource(R.string.camas_reintentar), { model.reload() }) }
        } }
        when (state.status) {
            LinkStatus.LOADING -> item { LoadingState(title = stringResource(R.string.u9_vinculo_cargando)) }
            LinkStatus.UNAVAILABLE -> item { ErrorState(state.readError, { model.reload() }, title = stringResource(R.string.u9_vinculo_sin_estado)) }
            LinkStatus.APPROVED -> item {
                SectionCard(stringResource(R.string.vinculo_aprobada), action = { StatusTag("aprobada") }) {
                    Text(stringResource(R.string.vinculo_aprobada_detalle), style = MaterialTheme.typography.bodyMedium)
                }
            }
            LinkStatus.PENDING -> item {
                SectionCard(stringResource(R.string.vinculo_en_verificacion), action = { StatusTag("en_espera") }) {
                    // G2: the request the patient sent, with its day, instead of an empty form.
                    state.since?.let { Text(stringResource(R.string.rec7_vinculo_desde, it.format(java.time.format.DateTimeFormatter.ofPattern("dd/MM"))), style = MaterialTheme.typography.titleSmall) }
                    Text(stringResource(R.string.vinculo_en_verificacion_detalle), style = MaterialTheme.typography.bodyMedium)
                }
            }
            LinkStatus.REJECTED -> item {
                SectionCard(stringResource(R.string.vinculo_rechazada), action = { StatusTag("rechazada") }) {
                    NoticeBanner(NoticeKind.ERROR, state.rejectionReason?.let { stringResource(R.string.u9_vinculo_motivo, it) } ?: stringResource(R.string.vinculo_rechazada_detalle))
                    PrimaryButton(stringResource(R.string.vinculo_volver_a_pedir), { model.retry() }, icon = Icons.Default.Refresh)
                }
            }
            LinkStatus.FORM -> item {
                ClimesaActionGroup {
                    state.error?.let { NoticeBanner(NoticeKind.ERROR, it) }
                    FormField(stringResource(R.string.vinculo_dui), dui, { dui = it.take(10) }, error = state.fieldErrors["dui"], enabled = !state.busy, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone))
                    FormField(stringResource(R.string.vinculo_nacimiento), birth, { birth = it.take(10) }, error = state.fieldErrors["birth"], hint = stringResource(R.string.vinculo_nacimiento_formato), enabled = !state.busy, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone))
                    Text(stringResource(R.string.vinculo_privacidad), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    PrimaryButton(
                        stringResource(if (state.busy) R.string.vinculo_enviando else R.string.vinculo_enviar),
                        { model.submit(dui, birth) },
                        icon = Icons.AutoMirrored.Filled.Send,
                        enabled = dui.isNotBlank() && birth.isNotBlank(),
                        loading = state.busy,
                    )
                }
            }
        }
    }
}
