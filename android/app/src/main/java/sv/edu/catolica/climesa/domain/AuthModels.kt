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
    val androidRoles = listOf("REC", "AST", "ENF", "MED", "LAB", "PAR", "PAC")
    val iosRoles = listOf("MED", "PAC")
    fun allowed(profile: AccessProfile, platform: String): List<String> {
        if (!profile.verifiedByBackend || platform.lowercase() !in profile.platforms || "sesion.perfil" !in profile.permissions) return emptyList()
        val catalog = if (platform == "android") androidRoles else if (platform == "ios") iosRoles else emptyList()
        return catalog.filter { it in profile.roles }
    }
    fun label(role: String) = mapOf("REC" to "Recepción", "AST" to "Asistencia", "ENF" to "Enfermería", "MED" to "Medicina", "LAB" to "Laboratorio", "PAR" to "Paramédico", "PAC" to "Paciente")[role] ?: role
    fun sections(role: String): List<String> = when(role) {
        "REC" -> listOf("Inicio", "Pacientes", "Mi cuenta")
        "AST" -> listOf("Inicio", "Fila", "Pacientes", "Mi cuenta")
        "ENF" -> listOf("Inicio", "Camas", "Mi cuenta")
        "MED" -> listOf("Inicio", "Consultas", "Mis turnos", "Mi cuenta")
        "LAB" -> listOf("Inicio", "Laboratorio", "Mi cuenta")
        "PAR" -> listOf("Inicio", "Ambulancia", "Mi cuenta")
        "PAC" -> listOf("Inicio", "Citas", "Resultados", "Mi cuenta")
        else -> emptyList()
    }
}
object RegistrationRules {
    fun validate(name: String, email: String, password: String, confirmation: String): Map<String,String> = buildMap {
        putAll(AuthRules.validate(email,password))
        if(name.trim().length !in 2..120)put("name","Escribe tu nombre completo.")
        if(password.length<8 || !password.any(Char::isUpperCase) || !password.any(Char::isLowerCase) || !password.any(Char::isDigit) || password.all(Char::isLetterOrDigit))put("password","Usa 8 caracteres, mayúscula, minúscula, número y símbolo.")
        if(password!=confirmation)put("confirmation","Las contraseñas no coinciden.")
    }
}
