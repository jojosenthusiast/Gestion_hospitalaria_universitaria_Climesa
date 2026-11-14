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
    /** Expediente enlazado a la cuenta (`patientId` de `/auth/me`); nulo hasta que Recepción aprueba la vinculación (RN-39). */
    val patientId: String? = null,
)

data class AuthenticatedAccount(
    val session: AuthSession,
    val profile: AccessProfile,
)

object AuthRules {
    // Igual que la web: acepta también dominios sin punto, como las cuentas de demostración (enf@climesa).
    private val emailPattern = Regex("^[^\\s@]+@[^\\s@]+$")

    fun validate(email: String, password: String): Map<String, String> = buildMap {
        if (!emailPattern.matches(email.trim())) put("email", "Ingresa un correo válido.")
        if (password.length < 8) put("password", "La contraseña debe tener al menos 8 caracteres.")
    }
}

object RoleAccess {
    /**
     * Roles of the account that can enter this app. The backend is the source of truth: the platform comes from
     * `platforms` of `/auth/me` (`acceso.rol.plataformas`) and the permissions decide which sections exist. The role
     * catalog of [AndroidSections] only says which roles have Android screens, in its display order.
     */
    fun allowed(profile: AccessProfile, platform: String): List<String> {
        if (!profile.verifiedByBackend || platform.lowercase() != "android" || "android" !in profile.platforms || "sesion.perfil" !in profile.permissions) return emptyList()
        return AndroidSections.roles.filter { it in profile.roles && AndroidSections.hasAppScreens(it, profile.permissions) }
    }
    fun label(role: String) = mapOf("JOP" to "Jefe de Operaciones", "REC" to "Recepción", "AST" to "Asistencia", "ENF" to "Enfermería", "MED" to "Medicina", "LAB" to "Laboratorio", "PAR" to "Paramédico", "PAC" to "Paciente")[role] ?: role
}

/**
 * Secciones de la navegación inferior. Cada una exige un permiso de `/auth/me` (regla 8: se pregunta por permiso,
 * no por rol). `ready` indica si la sección ya tiene pantalla; las demás muestran "Próxima entrega".
 */
enum class AndroidSection(val screenId: String, val label: String, val permission: String, val ready: Boolean) {
    HOME("A04", "Inicio", "sesion.perfil", true),
    LINK_RECORD("A03", "Vincular expediente", "cuenta.vincular", true),
    PATIENT_QUEUE("A05", "Mi turno", "fila.ver", true),
    MY_APPOINTMENTS("A06", "Mis citas", "citas.ver", true),
    RESULTS("A07", "Mis exámenes", "resultados.ver", true),
    HISTORY("A08", "Mi historial", "expediente.ver", true),
    AMBULANCE_REQUEST("A09", "Pedir ambulancia", "ambulancia.solicitar", true),
    HOSPITAL_INFO("A10", "Hospital", "sesion.perfil", true),
    MY_ACCESS("A11", "Quién vio mi expediente", "auditoria.mis_accesos", true),
    PROFILE("A12", "Perfil", "sesion.perfil", true),
    MEDICAL_DAY("A20", "Mi día", "consulta.iniciar", true),
    CONSULTATIONS("A21", "Consulta", "consulta.iniciar", true),
    RECORD("A22", "Expediente", "expediente.ver", true),
    RESULT_REVIEW("A23", "Resultados por revisar", "laboratorio.revisar", true),
    HOSPITALIZED("A24", "Mis hospitalizados", "admision.ver", true),
    AMBULANCE_ARRIVAL("A25", "Llegada de ambulancia", "ambulancia.recibir_prehospital", true),
    SHIFTS("A26", "Mis turnos", "turnos.ver", true),
    PATIENTS("A30", "Pacientes", "pacientes.buscar", true),
    QUEUE("A31", "Emitir número", "fila.emitir", true),
    APPOINTMENTS("A32", "Citas", "citas.ver", true),
    LINKING("A33", "Vinculaciones", "cuentas.verificar", true),
    ADMISSION("A34", "Admisión y cama", "admision.crear", true),
    BEDS("A35", "Tablero de camas", "camas.ver_tablero", true),
    DISPATCH("A36", "Despacho", "ambulancia.despachar", true),
    ASSISTANT_STATION("A40", "Mi consultorio", "fila.llamar", true),
    VITAL_SIGNS("A41", "Signos vitales", "signos.registrar", true),
    WARD("A50", "Mi planta", "admision.ver", true),
    INPATIENT_CARE("A51", "Paciente hospitalizado", "enfermeria.registrar", true),
    CLEANING("A52", "Limpieza de camas", "camas.registrar_limpieza", true),
    SUPPLIES("A53", "Consumo de insumos", "inventario.mover", true),
    AMBULANCE_RECEPTION("A54", "Recepción de ambulancia", "ambulancia.recibir_prehospital", true),
    UNIT("A70", "Unidad", "ambulancia.ver_estado", true),
    SERVICE("A71", "Servicio", "ambulancia.operar", true),
    PREHOSPITAL_REPORT("A72", "Reporte prehospital", "ambulancia.reportar_prehospital", true),
    UNIDENTIFIED_PATIENT("A73", "Paciente sin identidad", "pacientes.registrar_provisional", true),
    LOG("A74", "Mi bitácora", "ambulancia.ver_bitacora", true),
    PLANNING("", "Planificación", "turnos.planificar", true),
    STAFF("", "Personal", "personal.ver", true),
}

object AndroidSections {
    /**
     * Asistente and Enfermería are the same person at the same station per the course PDF: one shared catalog, filtered by the
     * permissions of each account. "Paciente hospitalizado" opens the same screen as "Mi planta", so it is not a second entry.
     */
    private val careStation = listOf(
        AndroidSection.HOME, AndroidSection.VITAL_SIGNS, AndroidSection.ASSISTANT_STATION, AndroidSection.WARD, AndroidSection.CLEANING,
        AndroidSection.SUPPLIES, AndroidSection.AMBULANCE_RECEPTION, AndroidSection.SHIFTS, AndroidSection.HOSPITAL_INFO, AndroidSection.PROFILE,
    )

    /** Jefe de Operaciones and Laboratorio use the web only (D-090): they have no Android catalog and see "Tu rol no usa esta aplicación". */
    private val roleCatalog = mapOf(
        "REC" to listOf(AndroidSection.HOME, AndroidSection.QUEUE, AndroidSection.PATIENTS, AndroidSection.APPOINTMENTS, AndroidSection.LINKING, AndroidSection.ADMISSION, AndroidSection.BEDS, AndroidSection.DISPATCH, AndroidSection.SHIFTS, AndroidSection.HOSPITAL_INFO, AndroidSection.PROFILE),
        "AST" to careStation,
        "ENF" to careStation,
        "MED" to listOf(AndroidSection.HOME, AndroidSection.MEDICAL_DAY, AndroidSection.RESULT_REVIEW, AndroidSection.HOSPITALIZED, AndroidSection.RECORD, AndroidSection.VITAL_SIGNS, AndroidSection.AMBULANCE_ARRIVAL, AndroidSection.SHIFTS, AndroidSection.HOSPITAL_INFO, AndroidSection.PROFILE),
        "PAR" to listOf(AndroidSection.HOME, AndroidSection.SERVICE, AndroidSection.LOG, AndroidSection.SHIFTS, AndroidSection.HOSPITAL_INFO, AndroidSection.PROFILE),
        "PAC" to listOf(AndroidSection.HOME, AndroidSection.PATIENT_QUEUE, AndroidSection.MY_APPOINTMENTS, AndroidSection.RESULTS, AndroidSection.LINK_RECORD, AndroidSection.HISTORY, AndroidSection.AMBULANCE_REQUEST, AndroidSection.HOSPITAL_INFO, AndroidSection.MY_ACCESS, AndroidSection.PROFILE),
    )

    /** The role's core tasks, in bar order (they are what its dashboard leads to). The bar takes the first visible ones after "Inicio". */
    private val coreTasks = mapOf(
        "REC" to listOf(AndroidSection.QUEUE, AndroidSection.PATIENTS, AndroidSection.APPOINTMENTS),
        "AST" to listOf(AndroidSection.VITAL_SIGNS, AndroidSection.ASSISTANT_STATION, AndroidSection.WARD, AndroidSection.SUPPLIES),
        "ENF" to listOf(AndroidSection.VITAL_SIGNS, AndroidSection.ASSISTANT_STATION, AndroidSection.WARD, AndroidSection.SUPPLIES),
        "MED" to listOf(AndroidSection.MEDICAL_DAY, AndroidSection.RESULT_REVIEW, AndroidSection.HOSPITALIZED),
        "PAR" to listOf(AndroidSection.SERVICE, AndroidSection.LOG),
        "PAC" to listOf(AndroidSection.PATIENT_QUEUE, AndroidSection.MY_APPOINTMENTS, AndroidSection.RESULTS),
    )

    /** Roles with an Android catalog, in display order. */
    val roles: List<String> get() = roleCatalog.keys.toList()

    /** Core tasks of [role], in bar order, before permissions are applied. */
    fun coreTasks(role: String): List<AndroidSection> = coreTasks[role].orEmpty()

    /**
     * Permissions remain the security source of truth. The role catalog only prevents the UI from exposing a
     * destination that does not exist for that role in `pantallas.csv`.
     */
    fun visible(role: String, permissions: Collection<String>): List<AndroidSection> =
        roleCatalog[role].orEmpty().filter { it.permission in permissions }

    /** Without a destination beyond Home, Hospital and Profile, the role has no operational Android flow. */
    fun hasAppScreens(role: String, permissions: Collection<String>) =
        visible(role, permissions).any { it != AndroidSection.HOME && it != AndroidSection.HOSPITAL_INFO && it != AndroidSection.PROFILE }
}

enum class AndroidNavigationMode { BOTTOM_BAR, RAIL, DRAWER }

/** Groups of the "Más" sheet. Order is display order. */
enum class MoreGroup(val title: String) {
    TASKS("Más tareas"),
    HOSPITAL("Hospital"),
    ACCOUNT("Mi cuenta"),
}

data class MoreEntry(val group: MoreGroup, val sections: List<AndroidSection>)

/** What the phone shows: the bar items and the grouped content of "Más". Every visible section is in exactly one of them. */
data class CompactNavigation(
    val primary: List<AndroidSection>,
    val more: List<MoreEntry>,
) {
    val overflow: List<AndroidSection> get() = more.flatMap { it.sections }
}

object AndroidNavigationPolicy {
    /** Home plus up to three core tasks; the fifth bar item is "Más". Material recommends at most five destinations. */
    const val BAR_TASKS = 3

    fun mode(widthDp: Int) = when {
        widthDp >= 840 -> AndroidNavigationMode.DRAWER
        widthDp >= 600 -> AndroidNavigationMode.RAIL
        else -> AndroidNavigationMode.BOTTOM_BAR
    }

    private fun group(section: AndroidSection) = when (section) {
        AndroidSection.PROFILE -> MoreGroup.ACCOUNT
        AndroidSection.HOSPITAL_INFO, AndroidSection.MY_ACCESS -> MoreGroup.HOSPITAL
        else -> MoreGroup.TASKS
    }

    /**
     * Bar = Inicio + the role's core tasks (from its dashboard). The rest (other tasks, hospital information, account) goes to
     * "Más", grouped and in catalog order, so nothing is duplicated and every catalogued section stays reachable.
     */
    fun compact(role: String, sections: List<AndroidSection>): CompactNavigation {
        val home = sections.firstOrNull { it == AndroidSection.HOME }
        val operational = sections.filter { it != AndroidSection.HOME && group(it) == MoreGroup.TASKS }
        val core = AndroidSections.coreTasks(role).filter { it in operational }
        val tasks = (core + operational.filterNot { it in core }).take(if (home != null) BAR_TASKS else BAR_TASKS + 1)
        val primary = listOfNotNull(home) + tasks
        val rest = sections.filterNot { it in primary }
        val more = MoreGroup.entries.mapNotNull { g -> rest.filter { group(it) == g }.takeIf { it.isNotEmpty() }?.let { MoreEntry(g, it) } }
        return CompactNavigation(primary, more)
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
