package sv.edu.catolica.climesa.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AdminPanelSettings
import androidx.compose.material.icons.filled.Assignment
import androidx.compose.material.icons.filled.Bed
import androidx.compose.material.icons.filled.Category
import androidx.compose.material.icons.filled.Emergency
import androidx.compose.material.icons.filled.Event
import androidx.compose.material.icons.filled.HealthAndSafety
import androidx.compose.material.icons.filled.Inventory2
import androidx.compose.material.icons.filled.Layers
import androidx.compose.material.icons.filled.LocalHospital
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.MedicalServices
import androidx.compose.material.icons.filled.Medication
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Science
import androidx.compose.material.icons.filled.SensorDoor
import androidx.compose.material.icons.filled.SupportAgent
import androidx.compose.material.icons.filled.VolunteerActivism
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import sv.edu.catolica.climesa.domain.StaffLabels

/** Color families of the shared identity palette (same hex values as `web/src/components/identity.css`). */
internal enum class IdentityTone(val lightFg: Long, val lightBg: Long, val darkFg: Long, val darkBg: Long) {
    INDIGO(0xFF3F37A0, 0xFFECEBFA, 0xFFB8B3F5, 0xFF25224A),
    TEAL(0xFF0B6161, 0xFFE0F3F2, 0xFF7FD6D3, 0xFF123433),
    BLUE(0xFF00358F, 0xFFE6EEFB, 0xFF8DB3FA, 0xFF18284A),
    ORANGE(0xFF8F3F06, 0xFFFDEBDD, 0xFFF2B27A, 0xFF3A2410),
    GREEN(0xFF17633A, 0xFFE4F3EA, 0xFF6CCB92, 0xFF13301F),
    MAGENTA(0xFF8F1F5B, 0xFFFBE6F1, 0xFFF0A1CB, 0xFF3D1830),
    CYAN(0xFF0A5A85, 0xFFE1F1FA, 0xFF8CCBEE, 0xFF112F42),
    PURPLE(0xFF5B3A99, 0xFFF1EBFA, 0xFFC4A8F0, 0xFF2E2147),
    RED(0xFFA31515, 0xFFFCEAEA, 0xFFF5A29A, 0xFF3E1816),
    SLATE(0xFF3F4B5B, 0xFFEDF0F2, 0xFFB9C3D1, 0xFF222B38),
    AMBER(0xFF7A4B00, 0xFFFFF2D9, 0xFFF2B65A, 0xFF33240C),
}

/** One role or area kind: stable key, Spanish label, icon and color. The color never goes alone: the chip always has the icon and the label. */
internal data class Identity(val key: String, val label: String, val icon: ImageVector, val tone: IdentityTone)

/** Same codes, labels, icons (Material counterparts) and tones as `roleIdentity`/`areaIdentity` in the web `identity.tsx`. */
internal object IdentityCatalog {
    val roleCodes = listOf("ADM", "DPD", "JOP", "REC", "AST", "ENF", "MED", "LAB", "PAR", "PAC")
    private val roles = mapOf(
        "ADM" to Identity("ADM", "Administración", Icons.Default.AdminPanelSettings, IdentityTone.INDIGO),
        "DPD" to Identity("DPD", "Protección de datos", Icons.Default.Lock, IdentityTone.TEAL),
        "JOP" to Identity("JOP", "Jefatura de operaciones", Icons.Default.Assignment, IdentityTone.BLUE),
        "REC" to Identity("REC", "Recepción", Icons.Default.SupportAgent, IdentityTone.ORANGE),
        "AST" to Identity("AST", "Asistencia", Icons.Default.VolunteerActivism, IdentityTone.GREEN),
        "ENF" to Identity("ENF", "Enfermería", Icons.Default.HealthAndSafety, IdentityTone.MAGENTA),
        "MED" to Identity("MED", "Medicina", Icons.Default.MedicalServices, IdentityTone.CYAN),
        "LAB" to Identity("LAB", "Laboratorio", Icons.Default.Science, IdentityTone.PURPLE),
        "PAR" to Identity("PAR", "Paramedicina", Icons.Default.Emergency, IdentityTone.RED),
        "PAC" to Identity("PAC", "Paciente", Icons.Default.Person, IdentityTone.SLATE),
    )
    private val staffRole = mapOf(
        "medico" to "MED", "enfermero" to "ENF", "asistente" to "AST", "recepcionista" to "REC", "laboratorista" to "LAB",
        "paramedico" to "PAR", "administrativo" to "ADM", "motorista" to "PAR",
    )
    private val neutral = Identity("otro", "Otro", Icons.Default.Person, IdentityTone.SLATE)

    private fun fold(text: String) = java.text.Normalizer.normalize(text, java.text.Normalizer.Form.NFD).replace(Regex("\\p{M}+"), "").lowercase().trim()

    /** Accepts a role code (`MED`) or the staff type of the API (`medico`); anything unknown gets the neutral identity. */
    fun role(code: String?): Identity {
        val text = code.orEmpty().trim()
        roles[text.uppercase()]?.let { return it }
        staffRole[fold(text)]?.let { key -> return roles.getValue(key).copy(label = StaffLabels.function(fold(text))) }
        return if (text.isEmpty()) neutral else neutral.copy(key = fold(text), label = StaffLabels.function(fold(text)).let { if (it == fold(text)) text else it })
    }

    private val types = mapOf(
        "hospital" to Identity("hospital", "Hospital", Icons.Default.LocalHospital, IdentityTone.BLUE),
        "planta" to Identity("planta", "Planta", Icons.Default.Layers, IdentityTone.INDIGO),
        "area" to Identity("area", "Área", Icons.Default.Category, IdentityTone.TEAL),
        "habitacion" to Identity("habitacion", "Habitación", Icons.Default.Bed, IdentityTone.CYAN),
        "cama" to Identity("cama", "Cama", Icons.Default.Bed, IdentityTone.CYAN),
        "consultorio" to Identity("consultorio", "Consultorio", Icons.Default.MedicalServices, IdentityTone.GREEN),
        "cubiculo" to Identity("cubiculo", "Cubículo", Icons.Default.SensorDoor, IdentityTone.SLATE),
        "bodega" to Identity("bodega", "Bodega", Icons.Default.Inventory2, IdentityTone.AMBER),
        "bahia" to Identity("bahia", "Bahía", Icons.Default.Event, IdentityTone.ORANGE),
    )
    private val names = listOf(
        Regex("emergenc|urgenc|trauma") to Identity("emergencia", "Emergencia", Icons.Default.Emergency, IdentityTone.RED),
        Regex("laborator") to Identity("laboratorio", "Laboratorio", Icons.Default.Science, IdentityTone.PURPLE),
        Regex("farmaci|medicament") to Identity("farmacia", "Farmacia", Icons.Default.Medication, IdentityTone.AMBER),
        Regex("quirofan|cirug|sala de operaci") to Identity("quirofano", "Quirófano", Icons.Default.MedicalServices, IdentityTone.INDIGO),
        Regex("hospitaliz|internamiento|encamad") to Identity("hospitalizacion", "Hospitalización", Icons.Default.Bed, IdentityTone.BLUE),
        Regex("consult|ambulator") to Identity("consulta", "Consulta", Icons.Default.MedicalServices, IdentityTone.GREEN),
        Regex("recepci|admision|citas") to Identity("recepcion", "Recepción", Icons.Default.SupportAgent, IdentityTone.ORANGE),
        Regex("bodega|almacen|inventario") to Identity("bodega", "Bodega", Icons.Default.Inventory2, IdentityTone.AMBER),
        Regex("cuidado|intensiv|uci") to Identity("cuidados", "Cuidados intensivos", Icons.Default.HealthAndSafety, IdentityTone.MAGENTA),
    )

    /** By area name (`Emergencia`) first, then by space type (`area`, `planta`...). */
    fun area(name: String?, type: String? = null): Identity {
        val folded = fold(name.orEmpty())
        names.firstOrNull { it.first.containsMatchIn(folded) }?.let { return it.second }
        return types[fold(type.orEmpty())] ?: types[folded] ?: Identity("area", name?.trim().orEmpty().ifEmpty { "Área" }, Icons.Default.Category, IdentityTone.SLATE)
    }
}

@Composable
internal fun IdentityChip(identity: Identity, modifier: Modifier = Modifier, label: String = identity.label, compact: Boolean = false) {
    // E-17: follow the app theme (its own light/dark toggle), not the system setting.
    val dark = MaterialTheme.colorScheme.background.luminance() < 0.5f
    val fg = Color(if (dark) identity.tone.darkFg else identity.tone.lightFg)
    val bg = Color(if (dark) identity.tone.darkBg else identity.tone.lightBg)
    Surface(
        modifier.semantics { contentDescription = label },
        shape = if (compact) CircleShape else MaterialTheme.shapes.extraLarge,
        color = bg, contentColor = fg, border = BorderStroke(1.dp, fg.copy(alpha = .35f)),
    ) {
        Row(Modifier.padding(horizontal = if (compact) 6.dp else 10.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Icon(identity.icon, contentDescription = null, Modifier.size(if (compact) 18.dp else 16.dp))
            if (!compact) Text(label, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold, maxLines = 1)
        }
    }
}

/** `code`: a role code (`MED`) or a staff type of the API (`medico`). */
@Composable
fun RoleChip(code: String?, modifier: Modifier = Modifier, label: String? = null, compact: Boolean = false) {
    val identity = IdentityCatalog.role(code)
    IdentityChip(identity, modifier, label ?: identity.label, compact)
}

/** `name`: area name; `type`: space type as fallback. */
@Composable
fun AreaChip(name: String?, modifier: Modifier = Modifier, type: String? = null, compact: Boolean = false) {
    val identity = IdentityCatalog.area(name, type)
    IdentityChip(identity, modifier, name?.trim().orEmpty().ifEmpty { identity.label }, compact)
}
