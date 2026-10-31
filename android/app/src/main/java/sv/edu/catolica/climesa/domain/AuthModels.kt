package sv.edu.catolica.climesa.domain

data class AuthSession(
    val accessToken: String,
    val refreshToken: String,
    val expiresAtEpochSeconds: Long,
    val userId: String,
    val email: String,
)

data class AccessProfile(
    val roles: List<String> = emptyList(),
    val permissions: List<String> = emptyList(),
    val verifiedByBackend: Boolean = false,
    val platforms: List<String> = emptyList(),
    val channels: List<String> = emptyList(),
    val name: String = "",
    val notice: String? = null,
)

data class AuthenticatedAccount(
    val session: AuthSession,
    val profile: AccessProfile,
)

object AuthRules {
    private val emailPattern = Regex("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$")

    fun validate(email: String, password: String): Map<String, String> = buildMap {
        if (!emailPattern.matches(email.trim())) put("email", "Ingresa un correo válido.")
        if (password.length < 8) put("password", "La contraseña debe tener al menos 8 caracteres.")
    }
}

object RoleAccess {
    val androidRoles = listOf("JOP", "REC", "AST", "ENF", "MED", "LAB", "PAR", "PAC")
    val iosRoles = listOf("MED", "PAC")
    fun allowed(profile: AccessProfile, platform: String): List<String> {
        if (!profile.verifiedByBackend || platform.lowercase() !in profile.platforms || "sesion.perfil" !in profile.permissions) return emptyList()
        val catalog = if (platform == "android") androidRoles else if (platform == "ios") iosRoles else emptyList()
        return catalog.filter { it in profile.roles }
    }
    fun label(role: String) = mapOf("JOP" to "Jefe de Operaciones", "REC" to "Recepción", "AST" to "Asistencia", "ENF" to "Enfermería", "MED" to "Medicina", "LAB" to "Laboratorio", "PAR" to "Paramédico", "PAC" to "Paciente")[role] ?: role
}

/**
 * Secciones de la navegación inferior. Cada una exige un permiso de `/auth/me` (regla 8: se pregunta por permiso,
 * no por rol). `ready` indica si la sección ya tiene pantalla; las demás muestran "Próxima entrega".
 */
enum class AndroidSection(val label: String, val permission: String, val ready: Boolean) {
    HOME("Inicio", "sesion.perfil", true),
    PATIENTS("Pacientes", "pacientes.buscar", true),
    QUEUE("Fila", "fila.ver", false),
    BEDS("Camas", "camas.ver_tablero", true),
    CONSULTATIONS("Consultas", "consulta.iniciar", false),
    SHIFTS("Mis turnos", "turnos.ver", true),
    PLANNING("Planificación", "turnos.planificar", true),
    STAFF("Personal", "personal.ver", true),
    LAB("Laboratorio", "laboratorio.ver_cola", false),
    APPOINTMENTS("Citas", "citas.ver", false),
    RESULTS("Resultados", "resultados.ver", false),
    UNIT("Unidad", "ambulancia.ver_estado", true),
    SERVICE("Servicio", "ambulancia.operar", false),
    LOG("Bitácora", "ambulancia.ver_bitacora", false),
    PROFILE("Perfil", "sesion.perfil", true),
}

object AndroidSections {
    private val ambulanceCrew = listOf(AndroidSection.UNIT, AndroidSection.SERVICE, AndroidSection.LOG, AndroidSection.PROFILE)

    /**
     * Quien opera la ambulancia (`ambulancia.operar`) trabaja en campo: ve Unidad, Servicio, Bitácora y Perfil
     * (spec 121, escenario 1) y los permisos que le falten no se muestran. El resto ve cada sección cuyo permiso tenga.
     */
    fun visible(permissions: Collection<String>): List<AndroidSection> {
        if (AndroidSection.SERVICE.permission in permissions) return ambulanceCrew.filter { it.permission in permissions }
        return AndroidSection.entries.filter { if (it == AndroidSection.PLANNING) ShiftPlanning.canView(permissions) else it.permission in permissions }
    }

    /** Sin ninguna pantalla más allá de Inicio y Perfil, el rol no usa Android. */
    fun hasAppScreens(permissions: Collection<String>) =
        visible(permissions).any { it != AndroidSection.HOME && it != AndroidSection.PROFILE }
}
object RegistrationRules {
    fun validate(name: String, email: String, password: String, confirmation: String): Map<String,String> = buildMap {
        putAll(AuthRules.validate(email,password))
        if(name.trim().length !in 2..120)put("name","Escribe tu nombre completo.")
        if(password.length<8 || !password.any(Char::isUpperCase) || !password.any(Char::isLowerCase) || !password.any(Char::isDigit) || password.all(Char::isLetterOrDigit))put("password","Usa 8 caracteres, mayúscula, minúscula, número y símbolo.")
        if(password!=confirmation)put("confirmation","Las contraseñas no coinciden.")
    }
}
