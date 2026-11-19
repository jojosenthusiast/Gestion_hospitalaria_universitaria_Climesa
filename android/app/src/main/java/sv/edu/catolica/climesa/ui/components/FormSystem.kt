@file:OptIn(androidx.compose.foundation.ExperimentalFoundationApi::class)

package sv.edu.catolica.climesa.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.relocation.BringIntoViewRequester
import androidx.compose.foundation.relocation.bringIntoViewRequester
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import sv.edu.catolica.climesa.ui.icons.ClimesaIcons

/** Copy of the form system (Lote 5 S3), kept in code so the summary rules are testable on the JVM. */
internal object FormCopy {
    /** Visible marker after a required field's label; screen readers hear [REQUIRED_SPOKEN] instead. */
    const val REQUIRED_MARK = "*"
    const val REQUIRED_SPOKEN = "obligatorio"

    /** One line above a form that has required fields. */
    const val LEGEND = "Los campos con * son obligatorios."

    /** Default text of [SavedFeedback]. */
    const val SAVED = "Guardado"

    /** How many missing items the sticky bar names before "y N más". */
    const val MAX_NAMED = 3

    /**
     * "Falta: motivo de consulta, plan y diagnóstico" for the sticky action bar; past [MAX_NAMED] items the rest are counted
     * ("Falta: a, b, c y 2 más"). Blank names are skipped; null when nothing is missing (no line is drawn).
     */
    fun missingSummary(missing: List<String>): String? {
        val names = missing.map { it.trim() }.filter { it.isNotEmpty() }.distinct()
        if (names.isEmpty()) return null
        val listed = names.take(MAX_NAMED)
        val rest = names.size - listed.size
        val body = when {
            rest > 0 -> listed.joinToString(", ") + " y $rest más"
            listed.size == 1 -> listed[0]
            else -> listed.dropLast(1).joinToString(", ") + " y " + listed.last()
        }
        return "Falta: $body"
    }
}

/** Red asterisk after a required label; TalkBack reads "obligatorio". Prefer `FormField(required = true)`, which draws it. */
@Composable
internal fun RequiredMark(modifier: Modifier = Modifier) {
    Text(
        " ${FormCopy.REQUIRED_MARK}",
        modifier.semantics { contentDescription = FormCopy.REQUIRED_SPOKEN },
        color = MaterialTheme.climesa.danger,
        style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold),
    )
}

/** "Los campos con * son obligatorios." in muted text; put it once at the top of a form with required fields. */
@Composable
internal fun RequiredLegend(modifier: Modifier = Modifier) {
    Text(FormCopy.LEGEND, modifier, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
}

/**
 * Remembers the fields of a form in screen order so a failed submit can scroll to and focus the first one with an error
 * (S3: "los errores no aparecen donde esta el error"). Tag each field with [errorAnchor], then on submit call
 * `scope.launch { focus.focusFirst(errors.keys) }`. Fields must be composed to be found: use it in a scrolling `Column`
 * (forms), not for rows a `LazyColumn` has not drawn yet.
 */
@Stable
internal class FormErrorFocus {
    private class Anchor(val focus: FocusRequester, val view: BringIntoViewRequester)
    private val anchors = LinkedHashMap<String, Anchor>()
    private val order = mutableListOf<String>()

    /** Declares [key]'s position in the form; called by [errorAnchor]. Order is the composition order (screen order). */
    internal fun register(key: String, focus: FocusRequester, view: BringIntoViewRequester) {
        anchors[key] = Anchor(focus, view)
        if (key !in order) order += key
    }

    internal fun unregister(key: String) { anchors.remove(key); order.remove(key) }

    /** First registered key that is in [errorKeys], in screen order; null when none is. */
    fun firstError(errorKeys: Collection<String>): String? = order.firstOrNull { it in errorKeys }

    /** Scrolls the first field with an error into view and focuses it. Returns false when no tagged field has an error. */
    suspend fun focusFirst(errorKeys: Collection<String>): Boolean {
        val key = firstError(errorKeys) ?: return false
        val anchor = anchors[key] ?: return false
        anchor.view.bringIntoView()
        runCatching { anchor.focus.requestFocus() }
        return true
    }
}

@Composable
internal fun rememberFormErrorFocus(): FormErrorFocus = remember { FormErrorFocus() }

/**
 * Tags a field (or its wrapper) as [key] in [focus], so [FormErrorFocus.focusFirst] can scroll to it and focus the first
 * focusable child. Usage: `FormField("Motivo", value, onChange, required = true, error = errors["motivo"], modifier = Modifier.errorAnchor(focus, "motivo"))`.
 */
@Composable
internal fun Modifier.errorAnchor(focus: FormErrorFocus, key: String): Modifier {
    val requester = remember { FocusRequester() }
    val view = remember { BringIntoViewRequester() }
    DisposableEffect(focus, key) {
        focus.register(key, requester, view)
        onDispose { focus.unregister(key) }
    }
    return this.bringIntoViewRequester(view).focusRequester(requester)
}

/**
 * Inline "Guardado" confirmation (S3: "no hay respuesta de si se guardaron los datos"): a green check line announced by
 * TalkBack. Shows while [message] is non-null and calls [onDismiss] after [visibleMillis]; the ViewModel clears its flag there.
 * Usage: `SavedFeedback(state.savedMessage, onDismiss = model::clearSaved)`.
 */
@Composable
internal fun SavedFeedback(message: String?, onDismiss: () -> Unit, modifier: Modifier = Modifier, visibleMillis: Long = 4000) {
    if (message == null) return
    LaunchedEffect(message) { delay(visibleMillis); onDismiss() }
    val c = MaterialTheme.climesa
    Surface(
        modifier.fillMaxWidth().semantics { liveRegion = LiveRegionMode.Polite },
        color = c.successSoft,
        contentColor = c.success,
        shape = MaterialTheme.shapes.small,
        border = BorderStroke(1.dp, c.success.copy(alpha = .4f)),
    ) {
        Row(Modifier.heightIn(min = 44.dp).padding(horizontal = Spacing.md, vertical = Spacing.sm), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
            Icon(ClimesaIcons.Check, null, Modifier.size(18.dp))
            Text(message.ifBlank { FormCopy.SAVED }, style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.Bold))
        }
    }
}

/**
 * Sticky bottom bar of a long form (S3, S12 "guardar borrador, firmar"): an optional "Falta: …" line listing the missing
 * required items, then the secondary action (outlined, weight 1) and the primary one (solid, weight 1.4) side by side, above
 * the navigation bar and the keyboard. Tapping the "Falta" line calls [onMissingClick] (jump to the first missing field).
 * Put it in the scaffold's `bottomBar` (or at the bottom of a `Column` under a weighted scroll area).
 *
 * Usage: `StickyFormActionBar(CardAction("Firmar", ActionRole.Primary, ::sign), secondary = CardAction("Guardar borrador", ActionRole.Edit, ::save), missing = listOf("motivo", "plan"))`
 */
@Composable
internal fun StickyFormActionBar(
    primary: CardAction,
    modifier: Modifier = Modifier,
    secondary: CardAction? = null,
    missing: List<String> = emptyList(),
    onMissingClick: (() -> Unit)? = null,
) {
    Surface(modifier.fillMaxWidth(), color = MaterialTheme.colorScheme.surface, shadowElevation = 8.dp, border = BorderStroke(1.dp, MaterialTheme.climesa.line)) {
        Column(Modifier.navigationBarsPadding().imePadding().padding(horizontal = Spacing.md, vertical = Spacing.sm + Spacing.xs), verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
            FormCopy.missingSummary(missing)?.let { summary ->
                Row(
                    Modifier.fillMaxWidth().then(if (onMissingClick != null) Modifier.clickable(onClick = onMissingClick) else Modifier).heightIn(min = 32.dp)
                        .semantics { liveRegion = LiveRegionMode.Polite },
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(Spacing.xs + 2.dp),
                ) {
                    Icon(ClimesaIcons.Alert, null, Modifier.size(16.dp), tint = MaterialTheme.climesa.danger)
                    Text(summary, style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.SemiBold), color = MaterialTheme.climesa.danger)
                }
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Spacing.sm), verticalAlignment = Alignment.CenterVertically) {
                secondary?.let { CardActionButton(it, Modifier.weight(1f).heightIn(min = Spacing.touch)) }
                CardActionButton(primary, Modifier.weight(if (secondary != null) 1.4f else 1f).heightIn(min = Spacing.touch))
            }
        }
    }
}
