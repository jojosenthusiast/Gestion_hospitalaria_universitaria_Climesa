package sv.edu.catolica.climesa.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import sv.edu.catolica.climesa.R
import sv.edu.catolica.climesa.domain.AccessProfile
import sv.edu.catolica.climesa.domain.LinkStatus

/**
 * A03 · Vincular expediente (U12). The account joins its record on its own when Recepción writes its confirmed email on
 * it, so there is no form: the screen says whether the email still needs confirming, which email to give Recepción, or
 * that the account is linked (`GET /me/vinculacion`).
 */
@Composable
fun LinkRecordScreen(profile: AccessProfile, modifier: Modifier = Modifier, model: LinkRecordViewModel = viewModel()) {
    val state by model.state.collectAsStateWithLifecycle()
    LaunchedEffect(profile.patientId) { model.init(profile.patientId) }
    LaunchedEffect(profile.channels) { model.startLive(profile.channels) }
    PageList(modifier) {
        // A refresh that failed over a known state: said above it, with the retry; the state stays.
        state.readError?.takeIf { state.status != LinkStatus.UNAVAILABLE }?.let { message -> item {
            ClimesaActionGroup { NoticeBanner(NoticeKind.ERROR, message); RowAction(stringResource(R.string.camas_reintentar), { model.reload() }) }
        } }
        when (state.status) {
            LinkStatus.LOADING -> item { LoadingState(title = stringResource(R.string.vinculo_cargando)) }
            LinkStatus.UNAVAILABLE -> item { ErrorState(state.readError, { model.reload() }, title = stringResource(R.string.vinculo_sin_estado)) }
            LinkStatus.LINKED -> item {
                SectionCard(stringResource(R.string.vinculo_aprobada), action = { StatusTag("aprobada") }) {
                    Text(stringResource(R.string.vinculo_aprobada_detalle), style = MaterialTheme.typography.bodyMedium)
                }
            }
            LinkStatus.EMAIL_NOT_VERIFIED -> item {
                SectionCard(stringResource(R.string.vinculo_confirma_correo), action = { StatusTag("en_espera") }) {
                    Text(
                        state.email?.let { stringResource(R.string.vinculo_confirma_correo_detalle, it) } ?: stringResource(R.string.vinculo_confirma_correo_sin_correo),
                        style = MaterialTheme.typography.bodyMedium,
                    )
                }
            }
            LinkStatus.NOT_LINKED -> item {
                SectionCard(stringResource(R.string.vinculo_sin_vincular), action = { StatusTag("en_espera") }) {
                    Text(
                        state.email?.let { stringResource(R.string.vinculo_pide_recepcion, it) } ?: stringResource(R.string.vinculo_pide_recepcion_sin_correo),
                        style = MaterialTheme.typography.titleSmall,
                    )
                    Text(stringResource(R.string.vinculo_sin_vincular_detalle), style = MaterialTheme.typography.bodyMedium)
                }
            }
        }
    }
}
