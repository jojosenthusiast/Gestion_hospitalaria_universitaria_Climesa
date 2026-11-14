@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
package sv.edu.catolica.climesa.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.ImeAction
import sv.edu.catolica.climesa.R
import sv.edu.catolica.climesa.domain.SlaLevel

/** Búsqueda que filtra mientras se escribe (sin botón), igual que `LiveSearch` en la web. */
@Composable
internal fun LiveSearchField(value: String, onChange: (String) -> Unit, label: String, modifier: Modifier = Modifier) {
    OutlinedTextField(
        value = value, onValueChange = { onChange(it.take(100)) }, modifier = modifier.fillMaxWidth(), singleLine = true, label = { Text(label) },
        leadingIcon = { Icon(Icons.Default.Search, null) },
        trailingIcon = { if (value.isNotEmpty()) IconButton(onClick = { onChange("") }) { Icon(Icons.Default.Close, stringResource(R.string.listas_limpiar)) } },
        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
    )
}

/** Fila de chips de filtro con su conteo; una opción activa a la vez. */
@Composable
internal fun <T> ChipRow(options: List<Triple<T, String, Int?>>, selected: T, onSelect: (T) -> Unit) {
    LazyRow(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
        items(options) { (value, label, count) -> FilterChip(selected == value, { onSelect(value) }, { Text(if (count != null) "$label ($count)" else label) }) }
    }
}

/** Color del tiempo respecto a su meta: verde, ámbar, rojo; gris cuando ya no corre. */
@Composable
internal fun slaColor(level: SlaLevel): Color = when (level) {
    SlaLevel.OK -> MaterialTheme.climesa.success
    SlaLevel.WARN -> MaterialTheme.climesa.warning
    SlaLevel.LATE -> MaterialTheme.climesa.danger
    SlaLevel.NONE -> MaterialTheme.colorScheme.onSurfaceVariant
}
