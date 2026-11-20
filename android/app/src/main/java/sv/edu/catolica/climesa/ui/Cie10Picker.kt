package sv.edu.catolica.climesa.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.relocation.bringIntoViewRequester
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import sv.edu.catolica.climesa.R

/**
 * Diagnosis code of the consultation, chosen from the API CIE-10 search ([Cie10SearchViewModel]). A chosen [code] shows
 * with its [description] and "Cambiar"; the code is typed by hand only when the search failed. [resetKey] is the
 * consultation, so another one starts with an empty search; the typed search survives rotation.
 */
@Composable
internal fun Cie10Picker(code: String, description: String, enabled: Boolean, resetKey: Any, model: Cie10SearchViewModel, onPicked: (code: String, description: String) -> Unit) {
    val state by model.state.collectAsStateWithLifecycle()
    var query by rememberSaveable(resetKey) { mutableStateOf("") }
    var manualCode by rememberSaveable(resetKey) { mutableStateOf("") }
    LaunchedEffect(resetKey) { model.query(query) }
    if (code.isNotBlank()) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Spacing.sm), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(code, style = MaterialTheme.typography.titleSmall)
                Text(description.ifBlank { stringResource(R.string.u9_cie10_sin_descripcion) }, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            if (enabled) RowAction(stringResource(R.string.u9_cie10_cambiar), { onPicked("", "") })
        }
        return
    }
    // D80: the suggestions scroll into view above the keyboard as they arrive, instead of waiting for it to close.
    val requester = androidx.compose.runtime.remember { androidx.compose.foundation.relocation.BringIntoViewRequester() }
    LaunchedEffect(state.results, state.searched) { if (state.results.isNotEmpty() || state.searched) runCatching { requester.bringIntoView() } }
    Column(Modifier.bringIntoViewRequester(requester), verticalArrangement = Arrangement.spacedBy(Spacing.xs)) {
        FormField(stringResource(R.string.u9_cie10_buscar), query, { query = it.take(60); model.query(query) }, hint = stringResource(R.string.u9_cie10_ayuda), enabled = enabled)
        Column(Modifier.semantics { liveRegion = LiveRegionMode.Polite }) {
            when {
                state.error != null -> Column(verticalArrangement = Arrangement.spacedBy(Spacing.xs)) {
                    NoticeBanner(NoticeKind.ERROR, state.error.orEmpty())
                    RowAction(stringResource(R.string.camas_reintentar), { model.retry() })
                }
                state.searching -> Text(stringResource(R.string.u9_cie10_buscando), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                state.searched && state.results.isEmpty() -> Text(stringResource(R.string.u9_cie10_sin_resultados, state.query.trim()), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        state.results.forEachIndexed { index, result ->
            if (index > 0) HorizontalDivider(color = MaterialTheme.climesa.line)
            Row(
                Modifier.fillMaxWidth().heightIn(min = Spacing.touch).clickable(enabled = enabled) { val picked = model.pick(result); query = ""; onPicked(picked.code, picked.description) }
                    .padding(vertical = Spacing.xs),
                horizontalArrangement = Arrangement.spacedBy(Spacing.sm),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(result.code, Modifier.widthIn(min = 56.dp), style = MaterialTheme.typography.titleSmall)
                Text(result.description, Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
            }
        }
        // Fallback only when the search failed: the exact code by hand.
        if (state.manual) {
            Text(stringResource(R.string.u9_cie10_manual_ayuda), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Row(horizontalArrangement = Arrangement.spacedBy(Spacing.sm), verticalAlignment = Alignment.CenterVertically) {
                FormField(stringResource(R.string.u9_cie10_manual), manualCode, { manualCode = it.take(20) }, Modifier.weight(1f), enabled = enabled)
                SecondaryButton(stringResource(R.string.u9_cie10_usar), { onPicked(manualCode.trim().uppercase(), ""); manualCode = "" }, enabled = enabled && manualCode.isNotBlank())
            }
        }
    }
}
