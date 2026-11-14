package sv.edu.catolica.climesa.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import sv.edu.catolica.climesa.R
import sv.edu.catolica.climesa.domain.AndroidNavigationPolicy
import sv.edu.catolica.climesa.domain.AndroidSection
import sv.edu.catolica.climesa.domain.AuthenticatedAccount
import sv.edu.catolica.climesa.domain.RoleAccess

/** Reference account summary: name, e-mail, roles and whether the backend verified the permissions. */
@Composable
internal fun ProfileSummaryCard(account: AuthenticatedAccount, modifier: Modifier = Modifier) {
    SectionCard(account.profile.name.ifBlank { account.session.email }, modifier) {
        Text(account.session.email, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        HorizontalDivider(color = MaterialTheme.climesa.line)
        LabeledValue(stringResource(R.string.ui_cuenta_roles), account.profile.roles.joinToString { RoleAccess.label(it) }.ifBlank { "—" })
        StatusPill(
            stringResource(if (account.profile.verifiedByBackend) R.string.ui_cuenta_verificada else R.string.ui_cuenta_autenticada),
            if (account.profile.verifiedByBackend) StatusTone.SUCCESS else StatusTone.NEUTRAL,
        )
    }
}

/** Light/dark switch row; the choice is kept on the device by the caller. */
@Composable
internal fun AppearanceCard(dark: Boolean, setDark: (Boolean) -> Unit, modifier: Modifier = Modifier) {
    ClimesaCard(modifier) {
        Row(Modifier.fillMaxWidth().padding(Spacing.md), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(stringResource(R.string.ui_modo_oscuro), style = MaterialTheme.typography.titleMedium)
                Text(stringResource(R.string.ui_modo_oscuro_detalle), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Switch(dark, setDark)
        }
    }
}

/** Profile of any role: account summary, shortcuts to the role's main sections, and the refresh action. */
internal fun LazyListScope.profileItems(
    account: AuthenticatedAccount,
    sections: List<AndroidSection>,
    onOpen: (AndroidSection) -> Unit,
    refresh: () -> Unit,
    myData: @Composable (() -> Unit)? = null,
) {
    item { ProfileSummaryCard(account) }
    if (myData != null) item { myData() }
    item { Text(stringResource(R.string.ui_accesos_principales), style = MaterialTheme.typography.titleLarge) }
    items(AndroidNavigationPolicy.compact(sections).primary.filter { it != AndroidSection.PROFILE }, key = { it.name }) { section ->
        DataRow(section.label, subtitle = stringResource(R.string.ui_abrir_modulo), leadingIcon = iconFor(section), onClick = { onOpen(section) })
    }
    item {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            SecondaryButton(stringResource(R.string.ui_actualizar_acceso), refresh, icon = Icons.Default.Refresh)
            Text(stringResource(R.string.ui_cerrar_sesion_ayuda), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}
