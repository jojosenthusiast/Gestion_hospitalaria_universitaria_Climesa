package sv.edu.catolica.climesa.ui

import sv.edu.catolica.climesa.ui.icons.ClimesaIcons
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyListScope
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
import sv.edu.catolica.climesa.domain.AuthenticatedAccount
import sv.edu.catolica.climesa.domain.RoleAccess

/** Reference account summary: name, e-mail, roles and whether the backend verified the permissions. */
@Composable
internal fun ProfileSummaryCard(account: AuthenticatedAccount, modifier: Modifier = Modifier) {
    SectionCard(account.profile.name.ifBlank { account.session.email }, modifier) {
        Text(account.session.email, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        HorizontalDivider(color = MaterialTheme.climesa.line)
        LabeledValue(stringResource(R.string.ui_cuenta_roles), account.profile.roles.joinToString { RoleAccess.label(it) }.ifBlank { "—" })
        FamilyBadge(
            stringResource(if (account.profile.verifiedByBackend) R.string.ui_cuenta_verificada else R.string.ui_cuenta_autenticada),
            if (account.profile.verifiedByBackend) StatusFamily.LISTO else null,
        )
    }
}

/**
 * Appearance: the light/dark switch and "Tamaño de letra" (Normal 100 %, Grande 115 %, Muy grande 130 %). Both choices are
 * kept on the device; the text size comes from [LocalTextScaleControl], provided by the activity, and applies app-wide at once.
 */
@Composable
internal fun AppearanceCard(dark: Boolean, setDark: (Boolean) -> Unit, modifier: Modifier = Modifier) {
    val textScale = LocalTextScaleControl.current
    ClimesaCard(modifier) {
        Column {
            Row(Modifier.fillMaxWidth().padding(Spacing.md), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text(stringResource(R.string.ui_modo_oscuro), style = MaterialTheme.typography.titleMedium)
                    Text(stringResource(R.string.ui_modo_oscuro_detalle), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Switch(dark, setDark)
            }
            HorizontalDivider(color = MaterialTheme.climesa.line)
            Column(Modifier.fillMaxWidth().padding(Spacing.md), verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                Text(stringResource(R.string.ui_tamano_letra), style = MaterialTheme.typography.titleMedium)
                Text(stringResource(R.string.ui_tamano_letra_detalle), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                val steps = TextScale.entries
                SegmentedControl(
                    segments = steps.map { Segment(it.label) },
                    selectedIndex = steps.indexOf(textScale.value),
                    onSelect = { textScale.set(steps[it]) },
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }
    }
}

/** Profile of any role: account summary, own data when allowed, appearance and sign-out. Navigation lives in the bar and "Más". */
internal fun LazyListScope.profileItems(
    account: AuthenticatedAccount,
    dark: Boolean,
    setDark: (Boolean) -> Unit,
    onLogout: () -> Unit,
    myData: @Composable (() -> Unit)? = null,
) {
    item { ProfileSummaryCard(account) }
    if (myData != null) item { myData() }
    item { AppearanceCard(dark, setDark) }
    item {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            SecondaryButton(stringResource(R.string.cerrar_sesion), onLogout, icon = ClimesaIcons.Logout)
            Text(stringResource(R.string.ui_cerrar_sesion_ayuda), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}
