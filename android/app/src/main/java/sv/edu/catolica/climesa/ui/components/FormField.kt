package sv.edu.catolica.climesa.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.ui.Alignment
import androidx.compose.material3.Icon
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.ProvideTextStyle
import androidx.compose.material3.Text
import androidx.compose.material3.TextFieldColors
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/** Field label above the input: sans 14/700, line height 1.4 (web `.field > span:first-child`). */
private val FieldLabel = TextStyle(fontFamily = ClimesaSans, fontWeight = FontWeight.Bold, fontSize = 14.sp, lineHeight = 20.sp)

/** Web `.field input`: control-line border, primary-text border on focus, danger on error (border and text under it), 6dp corners. */
@Composable
internal fun climesaFieldColors(): TextFieldColors = OutlinedTextFieldDefaults.colors(
    unfocusedBorderColor = MaterialTheme.climesa.controlLine,
    focusedBorderColor = MaterialTheme.climesa.primaryText,
    errorBorderColor = MaterialTheme.climesa.danger,
    disabledBorderColor = MaterialTheme.climesa.line,
    unfocusedContainerColor = MaterialTheme.colorScheme.surface,
    focusedContainerColor = MaterialTheme.colorScheme.surface,
    disabledContainerColor = MaterialTheme.climesa.disabled,
    errorContainerColor = MaterialTheme.colorScheme.surface,
    // Lote 5 S3: the error under the field is always danger red, never the grey hint colour.
    errorSupportingTextColor = MaterialTheme.climesa.danger,
    errorTrailingIconColor = MaterialTheme.climesa.danger,
    errorCursorColor = MaterialTheme.climesa.danger,
)

/**
 * Text input the web way (`.field`): the label sits above the box instead of floating inside it, and the box is 52dp
 * tall with 6dp corners. Same parameters as the Material `OutlinedTextField`; `label` is drawn above, `shape` is fixed.
 * [required] adds the red [RequiredMark] after the label (TalkBack: "obligatorio").
 */
@Composable
internal fun ClimesaTextField(
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    readOnly: Boolean = false,
    label: (@Composable () -> Unit)? = null,
    placeholder: (@Composable () -> Unit)? = null,
    leadingIcon: (@Composable () -> Unit)? = null,
    trailingIcon: (@Composable () -> Unit)? = null,
    suffix: (@Composable () -> Unit)? = null,
    supportingText: (@Composable () -> Unit)? = null,
    isError: Boolean = false,
    visualTransformation: VisualTransformation = VisualTransformation.None,
    keyboardOptions: KeyboardOptions = KeyboardOptions.Default,
    keyboardActions: KeyboardActions = KeyboardActions.Default,
    singleLine: Boolean = false,
    @Suppress("UNUSED_PARAMETER") shape: Shape? = null,
    colors: TextFieldColors = climesaFieldColors(),
    required: Boolean = false,
) {
    Column(modifier, verticalArrangement = Arrangement.spacedBy(Space2)) {
        if (label != null) {
            CompositionLocalProvider(LocalContentColor provides MaterialTheme.colorScheme.onSurface) {
                ProvideTextStyle(FieldLabel) {
                    if (required) Row(verticalAlignment = Alignment.CenterVertically) { label(); RequiredMark() } else label()
                }
            }
        }
        OutlinedTextField(
            value = value,
            onValueChange = onValueChange,
            modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp),
            enabled = enabled,
            readOnly = readOnly,
            placeholder = placeholder,
            leadingIcon = leadingIcon,
            trailingIcon = trailingIcon,
            suffix = suffix,
            supportingText = supportingText,
            isError = isError,
            visualTransformation = visualTransformation,
            keyboardOptions = keyboardOptions,
            keyboardActions = keyboardActions,
            singleLine = singleLine,
            shape = RoundedCornerShape(Radius.control),
            colors = colors,
        )
    }
}

/**
 * Text field with label, optional hint and error. The error replaces the hint, turns the field red and is announced by TalkBack
 * (web `Field` with `aria-invalid`). The caller owns the value and any length limit (`onChange = { value = it.take(80) }`).
 * Lote 5 S3: [required] marks it with a red asterisk; the error sits right under the box in danger red with an alert icon.
 * Tag it with `Modifier.errorAnchor(focus, key)` so a failed submit scrolls to it ([FormErrorFocus]).
 */
@Composable
internal fun FormField(
    label: String,
    value: String,
    onChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    error: String? = null,
    hint: String? = null,
    enabled: Boolean = true,
    singleLine: Boolean = true,
    keyboardOptions: KeyboardOptions = KeyboardOptions.Default,
    visualTransformation: VisualTransformation = VisualTransformation.None,
    required: Boolean = false,
) {
    ClimesaTextField(
        value = value,
        onValueChange = onChange,
        modifier = modifier.fillMaxWidth(),
        label = { Text(label) },
        enabled = enabled,
        singleLine = singleLine,
        isError = error != null,
        keyboardOptions = keyboardOptions,
        visualTransformation = visualTransformation,
        required = required,
        supportingText = when {
            error != null -> ({ FieldError(error) })
            hint != null -> ({ Text(hint) })
            else -> null
        },
    )
}

/** Error line under a field: alert icon and the message in danger red, announced by TalkBack. */
@Composable
internal fun FieldError(text: String, modifier: Modifier = Modifier) {
    Row(modifier.semantics(mergeDescendants = true) { liveRegion = LiveRegionMode.Assertive }, horizontalArrangement = Arrangement.spacedBy(Space1), verticalAlignment = Alignment.Top) {
        Icon(sv.edu.catolica.climesa.ui.icons.ClimesaIcons.Alert, null, Modifier.padding(top = 2.dp).size(14.dp), tint = MaterialTheme.climesa.danger)
        Text(text, color = MaterialTheme.climesa.danger, style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.SemiBold))
    }
}
