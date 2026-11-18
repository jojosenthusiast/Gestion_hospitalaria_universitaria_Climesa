package sv.edu.catolica.climesa.ui

import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import sv.edu.catolica.climesa.R

/**
 * Shared "Ver N más" rule: a long list shows its first [limit] rows and folds the rest behind one button. Pure, so the
 * JVM tests pin it; [FoldMoreButton] and [foldedItems] draw it.
 */
object FoldRule {
    /** Rows drawn: all of them when [open] or when the list fits, else the first [limit]. */
    fun <T> visible(items: List<T>, limit: Int, open: Boolean): List<T> = if (open || items.size <= limit) items else items.take(limit.coerceAtLeast(0))

    /** Rows behind the button (0 when nothing is folded). */
    fun hidden(total: Int, limit: Int): Int = (total - limit.coerceAtLeast(0)).coerceAtLeast(0)
}

/** "Ver 3 más" / "Ver menos"; draws nothing when no row is folded. */
@Composable
internal fun FoldMoreButton(hidden: Int, open: Boolean, onToggle: () -> Unit, modifier: Modifier = Modifier) {
    if (hidden <= 0) return
    TextButton(onClick = onToggle, modifier = modifier.heightIn(min = Spacing.touch)) {
        Text(if (open) stringResource(R.string.fold_ver_menos) else stringResource(R.string.fold_ver_mas, hidden))
    }
}

/**
 * Lazy-list version: the first [limit] rows of [items], then the fold button under [foldKey]. The caller keeps [open]
 * (in `rememberSaveable`) so rotating the phone keeps the list as it was.
 */
internal fun <T> LazyListScope.foldedItems(
    items: List<T>,
    limit: Int,
    open: Boolean,
    onToggle: () -> Unit,
    foldKey: String,
    key: ((T) -> Any)? = null,
    itemContent: @Composable (T) -> Unit,
) {
    val shown = FoldRule.visible(items, limit, open)
    items(shown.size, key = key?.let { k -> { index: Int -> k(shown[index]) } }) { index -> itemContent(shown[index]) }
    val hidden = FoldRule.hidden(items.size, limit)
    if (hidden > 0) item(key = foldKey) { FoldMoreButton(hidden, open, onToggle) }
}
