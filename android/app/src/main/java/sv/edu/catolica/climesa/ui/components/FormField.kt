package sv.edu.catolica.climesa.ui

import androidx.compose.foundation.layout.Arrangement
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

/** Web `.field input`: control-line border, primary-text border on focus, danger on error, 6dp corners. */
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
)

/**
 * Text input the web way (`.field`): the label sits above the box instead of floating inside it, and the box is 52dp
 * tall with 6dp corners. Same parameters as the Material `OutlinedTextField`; `label` is drawn above, `shape` is fixed.
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
) {
    Column(modifier, verticalArrangement = Arrangement.spacedBy(Space2)) {
        if (label != null) {
            CompositionLocalProvider(LocalContentColor provides MaterialTheme.colorScheme.onSurface) { ProvideTextStyle(FieldLabel) { label() } }
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
        supportingText = when {
            error != null -> ({ Text(error, Modifier.semantics { liveRegion = LiveRegionMode.Assertive }) })
            hint != null -> ({ Text(hint) })
            else -> null
        },
    )
}
