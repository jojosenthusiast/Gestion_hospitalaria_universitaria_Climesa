package sv.edu.catolica.climesa.domain

import org.json.JSONObject

/** Mantenimiento de la ambulancia (`POST /ambulancia/mantenimiento`, FR-109-06). Todo sale de permisos, no de roles. */
object MaintenanceRules {
    const val PERMISSION = "ambulancia.mantenimiento"
    const val MIN_REASON = 10
    const val MAX_REASON = 500

    /** Se ofrece con el permiso del catálogo y nunca con un servicio activo. */
    fun available(permissions: Collection<String>, unitState: String) =
        PERMISSION in permissions && unitState != "en_servicio"

    /** Para sacar la unidad de mantenimiento debe haber un paramédico con turno en curso. */
    fun leavingBlocked(unitState: String, paramedicOnDuty: Boolean) =
        unitState == "en_mantenimiento" && !paramedicOnDuty

    fun reasonError(reason: String): String? = when {
        reason.trim().length < MIN_REASON -> "Indica el motivo, de al menos $MIN_REASON caracteres."
        reason.trim().length > MAX_REASON -> "El motivo no puede pasar de $MAX_REASON caracteres."
        else -> null
    }

    fun body(version: Int, inMaintenance: Boolean, reason: String): JSONObject =
        JSONObject().put("version", version).put("inMaintenance", inMaintenance).put("reason", reason.trim())
}

/** Etiquetas en español de códigos que la API devuelve crudos. */
object StaffLabels {
    private val functions = mapOf(
        "medico" to "Médico", "enfermero" to "Enfermería", "asistente" to "Asistencia", "recepcionista" to "Recepción",
        "laboratorista" to "Laboratorio", "paramedico" to "Paramédico", "motorista" to "Motorista", "limpieza" to "Limpieza",
        "administrativo" to "Administración", "otro" to "Otro",
    )
    private val shiftStates = mapOf("borrador" to "Borrador", "publicado" to "Publicado", "cancelado" to "Cancelado")

    /** Función del personal (`type` de la API). */
    fun function(code: String) = functions[code] ?: code
    fun shiftState(code: String) = shiftStates[code] ?: code
}
