package sv.edu.catolica.climesa.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.MenuAnchorType
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import sv.edu.catolica.climesa.R
import sv.edu.catolica.climesa.domain.DemoAccount

/** TEMPORARY testing aid (docs/operacion/login-de-prueba.md): picks a fictitious test account; the user still signs in. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun DemoAccountPicker(accounts: List<DemoAccount>, enabled: Boolean, onPick: (DemoAccount) -> Unit) {
    var expanded by rememberSaveable { mutableStateOf(false) }
    var selected by rememberSaveable { mutableStateOf("") }
    val label = stringResource(R.string.login_demo_selector)
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Surface(color = MaterialTheme.colorScheme.tertiaryContainer, shape = MaterialTheme.shapes.small) {
            Text(stringResource(R.string.login_demo_banner), Modifier.fillMaxWidth().padding(12.dp), color = MaterialTheme.colorScheme.onTertiaryContainer, style = MaterialTheme.typography.bodyMedium)
        }
        ExposedDropdownMenuBox(expanded = expanded, onExpandedChange = { if (enabled) expanded = it }) {
            OutlinedTextField(
                value = selected,
                onValueChange = {},
                readOnly = true,
                enabled = enabled,
                singleLine = true,
                label = { Text(label) },
                placeholder = { Text(stringResource(R.string.login_demo_choose)) },
                trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
                modifier = Modifier.fillMaxWidth().menuAnchor(MenuAnchorType.PrimaryNotEditable).semantics { contentDescription = label },
            )
            ExposedDropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
                accounts.forEach { account ->
                    DropdownMenuItem(text = { Text(account.role) }, onClick = { selected = account.role; expanded = false; onPick(account) })
                }
            }
        }
    }
}
