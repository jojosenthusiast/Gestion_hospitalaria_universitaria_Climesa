@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package sv.edu.catolica.climesa.ui

import androidx.activity.compose.BackHandler
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.ModalBottomSheetProperties
import androidx.compose.material3.SheetValue
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.res.stringResource
import sv.edu.catolica.climesa.R

/**
 * Bottom sheet for a form (D18, D101, D119). It opens fully expanded, so the keyboard never makes it jump between a half and a
 * full height, and its content gets the keyboard inset (the caller scrolls; focused fields come into view by themselves).
 * With [dirty] input, back, a swipe down or a tap outside ask before dropping what was typed instead of closing silently.
 */
@Composable
internal fun FormSheet(onDismiss: () -> Unit, dirty: Boolean = false, content: @Composable () -> Unit) {
    val hasInput by rememberUpdatedState(dirty)
    var asking by remember { mutableStateOf(false) }
    val sheetState = rememberModalBottomSheetState(
        skipPartiallyExpanded = true,
        confirmValueChange = { target -> if (target == SheetValue.Hidden && hasInput) { asking = true; false } else true },
    )
    ModalBottomSheet(
        onDismissRequest = { if (hasInput) asking = true else onDismiss() },
        sheetState = sheetState,
        // D4: the sheet window's taps count as activity for the inactivity sign-out.
        modifier = androidx.compose.ui.Modifier.keepsSessionAlive(),
        properties = ModalBottomSheetProperties(shouldDismissOnBackPress = !dirty),
    ) {
        // Inside the sheet's own window: back with typed data asks first.
        BackHandler(enabled = dirty) { asking = true }
        content()
    }
    if (asking) ConfirmDialog(
        title = stringResource(R.string.hoja_descartar_titulo),
        message = stringResource(R.string.hoja_descartar_detalle),
        confirmLabel = stringResource(R.string.hoja_descartar),
        dismissLabel = stringResource(R.string.hoja_seguir),
        destructive = true,
        onConfirm = { asking = false; onDismiss() },
        onDismiss = { asking = false },
    )
}
