package sv.edu.catolica.climesa.domain

data class Bed(
    val id: String,
    val code: String,
    val room: String,
    val state: String,
    val version: Int,
    val cleaningPending: Boolean = false,
    val cleaningCompleted: Boolean = false,
    val cleanedByCurrentUser: Boolean = false,
    val occupant: String? = null,
)

/** Acciones del tablero; `path` es la ruta bajo `/camas/{id}/`. */
enum class BedAction(val path: String, val minReason: Int, val successMessage: String) {
    BLOCK("bloquear", 5, "Bloqueo registrado."),
    UNBLOCK("desbloquear", 10, "Bloqueo retirado."),
    REQUEST_CLEANING("limpieza", 10, "Limpieza solicitada."),
    COMPLETE_CLEANING("limpieza/completar", 10, "Limpieza registrada; queda pendiente de verificación."),
    VERIFY_CLEANING("limpieza/verificar", 10, "Limpieza verificada. La cama está libre."),
}

object BedRules {
    const val MAX_REASON = 500

    fun stateLabel(state: String) = mapOf(
        "libre" to "Libre", "ocupada" to "Ocupada", "reservada" to "Reservada", "limpieza" to "En limpieza", "bloqueada" to "Bloqueada",
    )[state] ?: state

    /** Acciones que ofrece el tablero, según los permisos de `/auth/me` (regla 8: nunca por nombre de rol). */
    fun availableActions(bed: Bed, permissions: Set<String>): List<BedAction> = buildList {
        val canBlock = "camas.bloquear" in permissions
        val canClean = "camas.registrar_limpieza" in permissions
        val canVerify = "camas.verificar_limpieza" in permissions
        if (bed.state == "libre" && canBlock) add(BedAction.BLOCK)
        if (bed.state == "bloqueada" && canBlock) add(BedAction.UNBLOCK)
        if ((bed.state == "libre" || bed.state == "ocupada") && !bed.cleaningPending && canClean) add(BedAction.REQUEST_CLEANING)
        if (bed.state == "limpieza" && bed.cleaningPending && !bed.cleaningCompleted && canClean) add(BedAction.COMPLETE_CLEANING)
        if (bed.state == "limpieza" && bed.cleaningPending && bed.cleaningCompleted && !bed.cleanedByCurrentUser && canVerify) add(BedAction.VERIFY_CLEANING)
    }

    fun validateReason(action: BedAction, reason: String): String? = when {
        reason.trim().length < action.minReason -> "Escribe al menos ${action.minReason} caracteres."
        reason.trim().length > MAX_REASON -> "Usa como máximo $MAX_REASON caracteres."
        else -> null
    }

    /** Nombre del campo de texto: el bloqueo usa `motivo` y el resto `reason` (operations.dto.ts). */
    fun reasonField(action: BedAction) = if (action == BedAction.BLOCK) "motivo" else "reason"

    fun versionConflict(code: String?) = code == "version_conflicto"

    fun errorMessage(status: Int?, code: String?, serverMessage: String?): String = when {
        status == 403 -> "No tienes permiso para realizar esta acción."
        status == 401 -> "Tu sesión terminó. Ingresa nuevamente."
        versionConflict(code) -> "La cama cambió mientras la mirabas. Actualizamos el tablero; revisa y vuelve a intentar."
        status == 409 && serverMessage?.contains("no puede verificarla") == true -> "Quien limpió la cama no puede verificarla; debe hacerlo otra persona."
        status == 409 -> serverMessage?.takeIf { it.isNotBlank() } ?: "La cama ya no está en ese estado. Actualizamos el tablero."
        status == 404 -> "No se encontró la cama. Actualizamos el tablero."
        status == 400 -> serverMessage?.takeIf { it.isNotBlank() } ?: "Revisa el motivo escrito."
        else -> serverMessage?.takeIf { it.isNotBlank() } ?: "No se pudo completar la acción. Intenta de nuevo."
    }
}
