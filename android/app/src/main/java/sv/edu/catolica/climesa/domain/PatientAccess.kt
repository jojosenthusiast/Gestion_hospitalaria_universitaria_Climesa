package sv.edu.catolica.climesa.domain

/**
 * Acciones de pacientes en Android. Cada una se pregunta por su permiso del catálogo `permisos.csv` (regla 8),
 * nunca por rol. Inactivar y reactivar usan `pacientes.editar_demograficos`, igual que `POST /pacientes/{id}/estado`.
 */
enum class PatientAction(val permission: String) {
    SEARCH("pacientes.buscar"),
    REGISTER("pacientes.registrar"),
    VIEW("pacientes.ver_ficha"),
    EDIT("pacientes.editar_demograficos"),
    CHANGE_STATUS("pacientes.editar_demograficos"),
}

object PatientAccess {
    fun allowed(permissions: Collection<String>): Set<PatientAction> =
        PatientAction.entries.filter { it.permission in permissions }.toSet()
}
