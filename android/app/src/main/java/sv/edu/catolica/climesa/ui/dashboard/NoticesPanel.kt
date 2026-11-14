package sv.edu.catolica.climesa.ui.dashboard

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material.icons.filled.Info
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import sv.edu.catolica.climesa.R
import sv.edu.catolica.climesa.domain.NoticePriority
import sv.edu.catolica.climesa.domain.RoleNotice
import sv.edu.catolica.climesa.domain.RoleNoticeParser
import sv.edu.catolica.climesa.ui.Spacing
import sv.edu.catolica.climesa.ui.climesa

/** Una tarjeta por aviso, coloreada por prioridad (D-071): el color nunca va solo, la palabra de la prioridad también. */
@Composable
internal fun NoticeCard(notice: RoleNotice, modifier: Modifier = Modifier) {
    val c = MaterialTheme.climesa
    val (fg, bg) = when (notice.priority) {
        NoticePriority.CRITICAL -> c.danger to c.dangerSoft
        NoticePriority.URGENT -> c.warning to c.warningSoft
        NoticePriority.ATTENTION -> c.primaryText to c.soft
    }
    val label = stringResource(when (notice.priority) {
        NoticePriority.CRITICAL -> R.string.aviso_critico
        NoticePriority.URGENT -> R.string.aviso_urgente
        NoticePriority.ATTENTION -> R.string.aviso_atencion
    })
    val audience = RoleNoticeParser.audience(notice)
    Surface(modifier.fillMaxWidth().semantics { liveRegion = LiveRegionMode.Polite }, color = bg, contentColor = fg, shape = MaterialTheme.shapes.medium) {
        Row(Modifier.padding(horizontal = 14.dp, vertical = 12.dp), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.Top) {
            Icon(if (notice.priority == NoticePriority.ATTENTION) Icons.Default.Info else Icons.Default.ErrorOutline, null, Modifier.size(22.dp))
            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text("$label · ${notice.title}", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold, color = fg)
                if (notice.body.isNotBlank()) Text(notice.body, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurface)
                if (audience.isNotBlank()) Text(stringResource(R.string.aviso_para, audience), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

/** Sección «Avisos» del inicio; el host la agrega solo si hay avisos vigentes. */
@Composable
internal fun NoticesSection(notices: List<RoleNotice>) {
    Column(verticalArrangement = Arrangement.spacedBy(Spacing.sm)) {
        Text(stringResource(R.string.avisos_titulo), style = MaterialTheme.typography.titleLarge)
        notices.take(MAX_SHOWN).forEach { NoticeCard(it) }
        if (notices.size > MAX_SHOWN) Text(stringResource(R.string.avisos_mas, notices.size - MAX_SHOWN), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

private const val MAX_SHOWN = 4
