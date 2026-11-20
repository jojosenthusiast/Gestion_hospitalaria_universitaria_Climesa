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
    /** Floor of the bed (`level`), null when the API does not know it. */
    val level: Int? = null,
    val roomId: String = "",
    /** Room category (`vip` or `semiprivada`), null when the API does not send it. */
    val category: String? = null,
)

/** One room of the board with its beds, in code order. */
data class BedRoomGroup(val room: String, val beds: List<Bed>)

/** One floor of the board and its room category; [level] null groups beds without a floor. */
data class BedFloorGroup(val level: Int?, val rooms: List<BedRoomGroup>, val category: String? = null)

/**
 * Beds board as a map (obs 7/17): floor, then room, then the beds as tiles, with one filter chip per state and its count.
 * Same order as the web building map: lower floors first, unknown floor last, rooms and beds by natural code order.
 */
object BedBoard {
    /** States offered as chips, in board order; only the states present (or the chosen one) are shown. */
    val states = listOf("libre", "ocupada", "reservada", "limpieza", "bloqueada")

    private val natural = Comparator<String> { a, b -> compareNatural(a, b) }

    fun counts(beds: List<Bed>): Map<String, Int> = beds.groupingBy { it.state }.eachCount()

    /** Chips to show: (state or null for "Todas", count). */
    fun chips(beds: List<Bed>, selected: String?): List<Pair<String?, Int>> {
        val counts = counts(beds)
        return listOf<Pair<String?, Int>>(null to beds.size) + states.filter { (counts[it] ?: 0) > 0 || it == selected }.map { it to (counts[it] ?: 0) }
    }

    /** Groups by floor and room category ("Piso 3 · VIP"), so a floor that mixed categories would show one card per category. */
    fun group(beds: List<Bed>, state: String? = null): List<BedFloorGroup> =
        beds.filter { state == null || it.state == state }
            .groupBy { it.level to it.category }
            .entries.sortedWith(compareBy<Map.Entry<Pair<Int?, String?>, List<Bed>>> { it.key.first == null }.thenBy { it.key.first ?: 0 }.thenBy { it.key.second.orEmpty() })
            .map { (key, onFloor) ->
                val rooms = onFloor.groupBy { it.roomId.ifBlank { it.room } }.values
                    .map { list -> BedRoomGroup(list.first().room, list.sortedWith(compareBy(natural) { it.code })) }
                    .sortedWith(compareBy(natural) { it.room })
                BedFloorGroup(key.first, rooms, key.second)
            }

    /** "C-2" before "C-10": digits compare as numbers. */
    internal fun compareNatural(a: String, b: String): Int {
        val chunk = Regex("""\d+|\D+""")
        val x = chunk.findAll(a).map { it.value }.toList()
        val y = chunk.findAll(b).map { it.value }.toList()
        for (i in 0 until minOf(x.size, y.size)) {
            val p = x[i]; val q = y[i]
            val c = if (p[0].isDigit() && q[0].isDigit()) p.toBigInteger().compareTo(q.toBigInteger()) else p.compareTo(q, ignoreCase = true)
            if (c != 0) return c
        }
        return x.size - y.size
    }
}

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

    /** Rows of the board that stay visible before "Ver N más" folds the rest. */
    const val REST_VISIBLE = 6

    /**
     * ENF/AST audit #4: what this person can act on comes first: beds to verify, then beds to finish cleaning; the rest keep
     * the server order. Returns (actionable, rest); only the rest folds.
     */
    fun boardGroups(beds: List<Bed>, permissions: Set<String>): Pair<List<Bed>, List<Bed>> {
        fun rank(bed: Bed): Int {
            val actions = availableActions(bed, permissions)
            return when {
                BedAction.VERIFY_CLEANING in actions -> 0
                BedAction.COMPLETE_CLEANING in actions -> 1
                else -> 2
            }
        }
        val ordered = beds.sortedBy(::rank)
        return ordered.partition { rank(it) < 2 }
    }

    /** D92: finishing a cleaning does not ask for a reason; a blank one is sent as [CLEANING_DONE_REASON]. */
    fun reasonOptional(action: BedAction) = action == BedAction.COMPLETE_CLEANING

    /** The API still requires a reason of 10 characters to finish a cleaning; this is what a blank one sends. */
    const val CLEANING_DONE_REASON = "Limpieza terminada; lista para verificar."

    fun reasonToSend(action: BedAction, reason: String): String = if (reasonOptional(action) && reason.isBlank()) CLEANING_DONE_REASON else reason

    /** D93: a cleaned bed waiting for its check (`limpieza` with the cleaning completed); it reads apart from one being cleaned. */
    fun awaitsVerification(bed: Bed) = bed.state == "limpieza" && bed.cleaningPending && bed.cleaningCompleted

    /** Status code and label of a bed for its tag: a cleaned bed waiting for its check is not "En limpieza" (D93). */
    fun tag(bed: Bed): Pair<String, String> = if (awaitsVerification(bed)) "completado" to "Limpia, por verificar" else bed.state to stateLabel(bed.state)

    fun validateReason(action: BedAction, reason: String): String? = when {
        reasonOptional(action) && reason.isBlank() -> null
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
