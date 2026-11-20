@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class, androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
package sv.edu.catolica.climesa.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale
import sv.edu.catolica.climesa.R
import sv.edu.catolica.climesa.domain.DaySlot
import sv.edu.catolica.climesa.domain.ReceptionScheduling

/** Chip text of a day: "Hoy", "Mañana", else "mar 18". */
internal object DayChipLabels {
    private val short = DateTimeFormatter.ofPattern("EEE d", Locale("es", "SV"))
    fun of(date: LocalDate, today: LocalDate = ReceptionScheduling.today()): String = when (date) {
        today -> "Hoy"
        today.plusDays(1) -> "Mañana"
        else -> short.format(date).replace(".", "")
    }
    /** The 7 days a person can pick, from [from] (today by default). */
    fun week(from: LocalDate = ReceptionScheduling.today()): List<LocalDate> = (0L until 7L).map { from.plusDays(it) }
}

/** A2/A4: one row of 7 day chips instead of a date picker on top of a dialog. */
@Composable
internal fun DayChips(selected: LocalDate, onSelect: (LocalDate) -> Unit, enabled: Boolean = true, days: List<LocalDate> = DayChipLabels.week()) {
    val shown = if (selected in days) days else listOf(selected) + days
    // D126: the chosen day is scrolled fully into view, never left cut at the edge.
    val list = androidx.compose.foundation.lazy.rememberLazyListState()
    androidx.compose.runtime.LaunchedEffect(selected) { shown.indexOf(selected).takeIf { it >= 0 }?.let { list.animateScrollToItem(it) } }
    LazyRow(state = list, horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
        items(shown, key = { it.toString() }) { day ->
            FilterChip(selected = day == selected, onClick = { onSelect(day) }, enabled = enabled, label = { Text(DayChipLabels.of(day)) })
        }
    }
}

/**
 * Quick reasons as chips (D-8): a chip fills the reason; [other] opens the text field. Returns nothing: the caller keeps
 * the chosen value.
 */
@Composable
internal fun ReasonChips(options: List<String>, selected: String?, onSelect: (String) -> Unit, enabled: Boolean = true, other: String? = null) {
    FlowRow(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
        (options + listOfNotNull(other)).forEach { option -> FilterChip(selected = option == selected, onClick = { onSelect(option) }, enabled = enabled, label = { Text(option) }) }
    }
}

/**
 * A4 "Reprogramar" as a bottom sheet (no dialog on a dialog): day chips, the free slots of that day and one primary action.
 * It closes only through [onDismiss]; the caller closes it when the API accepts the change.
 */
@Composable
internal fun RescheduleSheet(
    title: String,
    summary: String,
    date: LocalDate,
    onDate: (LocalDate) -> Unit,
    loading: Boolean,
    slots: List<DaySlot>,
    slot: DaySlot?,
    onSlot: (DaySlot) -> Unit,
    error: String?,
    busy: Boolean,
    confirmLabel: String,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
    /** D126: start of the appointment being moved; its slot reads «Tu cita», not «Ocupado». */
    ownStart: String? = null,
) {
    val sheet = rememberModalBottomSheetState(skipPartiallyExpanded = true, confirmValueChange = { !busy })
    ModalBottomSheet(onDismissRequest = { if (!busy) onDismiss() }, sheetState = sheet) {
        Column(
            Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(horizontal = Spacing.md).padding(bottom = Spacing.lg).navigationBarsPadding(),
            verticalArrangement = Arrangement.spacedBy(Spacing.sm),
        ) {
            Text(title, style = MaterialTheme.typography.titleLarge)
            Text(summary, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            DayChips(date, onDate, enabled = !busy)
            when {
                loading -> LoadingState()
                slots.none { it.selectable } -> Text(stringResource(R.string.cita_sin_franjas), style = MaterialTheme.typography.bodySmall)
                else -> DaySlotGrid(slots, slot, onSlot, ownStart = ownStart)
            }
            error?.let { NoticeBanner(NoticeKind.ERROR, it) }
            PrimaryButton(confirmLabel, onConfirm, enabled = slot?.selectable == true && !busy, loading = busy)
            SecondaryButton(stringResource(R.string.rec_cita_volver), onDismiss, enabled = !busy)
        }
    }
}
