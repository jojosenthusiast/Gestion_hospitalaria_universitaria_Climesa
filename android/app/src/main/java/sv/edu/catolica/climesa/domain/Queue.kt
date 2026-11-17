package sv.edu.catolica.climesa.domain

import org.json.JSONArray

/** Actions the API may offer on one ticket (`AccionFila`); unknown values are ignored. */
enum class QueueAction(val wire: String) {
    CALL("llamar"), ATTEND("atender"), COMPLETE("completar"), ABSENT("no_se_presento");
    companion object { fun of(wire: String?) = entries.firstOrNull { it.wire == wire } }
}

data class QueueTicket(
    val id: String,
    val service: String,
    val number: Int,
    val patientName: String,
    val state: String,
    val calls: Int,
    val version: Int,
    val issuedAtMillis: Long? = null,
    val allowedActions: List<QueueAction> = emptyList(),
    val blockedActions: Map<QueueAction, String> = emptyMap(),
    /** Calls the API makes before the number closes (`maxCalls`), and calls needed to mark an absence (`callsForAbsence`). */
    val maxCalls: Int? = null,
    val callsForAbsence: Int? = null,
    /** Fase 2 (S9): area code next to the number (counts from 1 per area and day), clinical priority, today's appointment. */
    val area: String = QueueLabels.areaOf(service),
    val priority: String = "rutina",
    val appointmentAt: String? = null,
    val walkIn: Boolean = true,
    /** Reversible actions the server accepts now (`undoActions`), apart from `allowedActions`. */
    val undoActions: List<String> = emptyList(),
    val officeCode: String? = null,
) {
    fun allows(action: QueueAction) = action in allowedActions
    /** The action is shown: allowed, or blocked with a reason from the server. */
    fun shows(action: QueueAction) = allows(action) || action in blockedActions
}

/**
 * R3 A-6: what a patient sees in "Mi turno": only their own ticket, never the reception board. The active one (waiting,
 * called or in attention) comes first; with none active, the most recent of the day.
 */
object PatientQueue {
    private val active = setOf("en_espera", "llamado", "en_atencion")
    fun current(tickets: List<QueueTicket>): QueueTicket? =
        tickets.firstOrNull { it.state in active } ?: tickets.maxByOrNull { it.issuedAtMillis ?: 0L }
    fun others(tickets: List<QueueTicket>): List<QueueTicket> = current(tickets)?.let { mine -> tickets.filter { it.id != mine.id } }.orEmpty()
}

object QueueLabels {
    private val areas = mapOf("consulta_general" to "CON", "emergencia" to "EMG", "laboratorio" to "LAB", "admisiones" to "REC")
    fun areaOf(service: String) = areas[service] ?: "GEN"
    /** "CON 7": the area code and the number, as the patient hears it called. */
    fun code(ticket: QueueTicket) = "${ticket.area} ${ticket.number}"
    fun priority(value: String) = mapOf("emergencia" to "Emergencia", "urgente" to "Urgente", "rutina" to "Rutina")[value] ?: value
    /** Cited (with the appointment time) or walk-in. */
    fun arrival(ticket: QueueTicket) = ticket.appointmentAt?.let { "Cita ${AppointmentAgenda.time(it)}" } ?: "Sin cita"
    val services = listOf("consulta_general" to "Consulta general", "emergencia" to "Emergencia", "laboratorio" to "Laboratorio", "admisiones" to "Admisiones")
    fun service(value: String) = services.firstOrNull { it.first == value }?.second ?: value
    fun state(value: String) = mapOf("en_espera" to "En espera", "llamado" to "Llamado", "en_atencion" to "En atención", "atendido" to "Atendido", "no_se_presento" to "No se presentó", "cerrado" to "Cerrado sin atender")[value] ?: value

    /**
     * What the ticket is waiting for, in words. Someone who cannot call numbers (Recepción) reads that the doctor will call;
     * a called number shows how many calls it has of the maximum the API allows.
     */
    fun progress(ticket: QueueTicket, canCall: Boolean): String = when (ticket.state) {
        "en_espera" -> if (canCall) "En espera" else "Esperando a que el médico llame"
        "llamado" -> ticket.maxCalls?.takeIf { it > 0 }?.let { "Llamado ${ticket.calls} de $it" } ?: "Llamado"
        "en_atencion" -> "Presente, en atención"
        else -> state(ticket.state)
    }
}

object QueueRules {
    fun parse(value: Any): List<QueueTicket> {
        val rows = value as? JSONArray ?: return emptyList()
        return (0 until rows.length()).mapNotNull { index -> rows.optJSONObject(index)?.let { row ->
            QueueTicket(
                row.optString("id"), row.optString("service"), row.optInt("numero"), ServerActions.text(row, "patientName") ?: "Paciente", row.optString("state"),
                row.optInt("llamados"), row.optInt("version", 1), parseMillis(row.optString("issuedAt")),
                allowedActions = ServerActions.allowed(row).mapNotNull(QueueAction::of).distinct(),
                blockedActions = ServerActions.blocked(row).mapNotNull { (k, v) -> QueueAction.of(k)?.let { it to v } }.toMap(),
                maxCalls = if (row.has("maxCalls") && !row.isNull("maxCalls")) row.optInt("maxCalls") else null,
                callsForAbsence = if (row.has("callsForAbsence") && !row.isNull("callsForAbsence")) row.optInt("callsForAbsence") else null,
                area = ServerActions.text(row, "area") ?: QueueLabels.areaOf(row.optString("service")),
                priority = ServerActions.text(row, "priority") ?: "rutina",
                appointmentAt = ServerActions.text(row, "appointmentAt"),
                walkIn = if (row.has("walkIn")) row.optBoolean("walkIn", true) else ServerActions.text(row, "appointmentAt") == null,
                undoActions = row.optJSONArray("undoActions")?.let { list -> (0 until list.length()).map { list.optString(it) } } ?: emptyList(),
                officeCode = ServerActions.text(row, "officeCode"),
            )
        } }
    }

    /** Service preselected for "Llamar siguiente": the chosen filter, else the service of the first waiting number. */
    fun callNextService(tickets: List<QueueTicket>, filter: String?): String =
        filter ?: tickets.firstOrNull { it.state == "en_espera" }?.service ?: QueueLabels.services.first().first

    fun callNextBody(service: String, officeId: String? = null) = org.json.JSONObject().put("service", service).apply { officeId?.let { put("officeId", it) } }

    /**
     * Reception issues a number for the patient it chose (`patientId`; the API answers 403 to a staff issue without it).
     * `rutina` is the server default: a routine number does not send `priority`.
     */
    fun issueBody(service: String, priority: String, patientId: String) =
        org.json.JSONObject().put("service", service).put("patientId", patientId).apply { if (priority != "rutina") put("priority", priority) }

    /** Active consulting rooms of `GET /espacios`, the optional destination of a call (same filter as the web). */
    fun offices(value: Any?): List<QueueOffice> {
        val rows = value as? JSONArray ?: return emptyList()
        return (0 until rows.length()).mapNotNull { rows.optJSONObject(it) }
            .filter { it.optString("type") == "consultorio" && it.optBoolean("active", false) }
            .map { QueueOffice(it.optString("id"), it.optString("code"), it.optString("name")) }
    }

    /** What the "who goes next" panel shows: computing until an answer arrives, the error, nobody waiting, or the proposal. */
    fun nextStatus(next: NextProposal?, loading: Boolean, error: String?): NextStatus = when {
        next?.proposal != null -> NextStatus.PROPOSAL
        error != null -> NextStatus.ERROR
        loading || next == null -> NextStatus.LOADING
        else -> NextStatus.NONE
    }
    fun undoBody(version: Int) = org.json.JSONObject().put("version", version)
    fun priorityBody(version: Int, priority: String) = org.json.JSONObject().put("version", version).put("priority", priority)

    /** `GET /fila/siguiente` and `nextProposal` of a signed consultation; null when the answer is not that object. */
    fun parseNext(value: Any?): NextProposal? {
        val json = value as? org.json.JSONObject ?: return null
        val p = json.optJSONObject("proposal")
        val proposal = p?.let {
            ProposedTicket(it.optString("id"), it.optInt("numero"), ServerActions.text(it, "area") ?: json.optString("area"), ServerActions.text(it, "patientName") ?: "Paciente",
                ServerActions.text(it, "priority") ?: "rutina", it.optInt("version", 1), it.optString("reason"), it.optString("reasonText"))
        }
        return NextProposal(json.optString("service"), json.optString("area"), json.optString("rule"), proposal)
    }
}

/** A consulting room a called number can be sent to. */
data class QueueOffice(val id: String, val code: String, val name: String) {
    val label get() = "$code · $name"
}

enum class NextStatus { LOADING, ERROR, NONE, PROPOSAL }

data class ProposedTicket(val id: String, val number: Int, val area: String, val patientName: String, val priority: String, val version: Int, val reason: String, val reasonText: String) {
    val code get() = "$area $number"
}
/** Who goes next in one area, by the server's documented rule (RN-FILA-SIGUIENTE). */
data class NextProposal(val service: String, val area: String, val rule: String, val proposal: ProposedTicket?)

/** A board move is a request for one server action (drag is not used on mobile: the card menu offers the moves). */
enum class QueueMove(val wire: String, val path: String, val label: String) {
    CALL("llamar", "llamar", "Llamar"), ATTEND("atender", "atender", "Iniciar atención"), COMPLETE("completar", "completar", "Completar"),
    ABSENT("no_se_presento", "no-se-presento", "No se presentó"), UNDO_CALL("deshacer_llamado", "deshacer-llamado", "Devolver a espera"),
    /** Same server action as [UNDO_CALL] with 2+ calls: one call less, the number stays called. Not a column move. */
    REMOVE_CALL("deshacer_llamado", "deshacer-llamado", "Quitar un llamado"),
}

object QueueMoves {
    private val moves = mapOf(
        QueueColumn.WAITING to mapOf(QueueColumn.CALLED to QueueMove.CALL),
        QueueColumn.CALLED to mapOf(QueueColumn.WAITING to QueueMove.UNDO_CALL, QueueColumn.IN_ATTENTION to QueueMove.ATTEND, QueueColumn.CLOSED to QueueMove.ABSENT),
        QueueColumn.IN_ATTENTION to mapOf(QueueColumn.CLOSED to QueueMove.COMPLETE),
    )
    /** The server action that moves [ticket] to [to], only when the server accepts it now; else null. */
    fun moveFor(ticket: QueueTicket, to: QueueColumn): QueueMove? {
        val move = moves[QueueBoard.column(ticket)]?.get(to) ?: return null
        // Undo removes one call; only the last one sends the number back to waiting. With more calls the card would
        // land in "En espera" and jump back, so that is not a column move (see [canRemoveCall]).
        if (move == QueueMove.UNDO_CALL && ticket.calls > 1) return null
        val server = if (move == QueueMove.UNDO_CALL) ticket.undoActions else ticket.allowedActions.map { it.wire }
        return move.takeIf { it.wire in server }
    }
    /** "Quitar un llamado": the number keeps being called (2+ calls) and the server accepts removing one. */
    fun canRemoveCall(ticket: QueueTicket) = ticket.state == "llamado" && ticket.calls > 1 && "deshacer_llamado" in ticket.undoActions
    fun destinations(ticket: QueueTicket): List<Pair<QueueColumn, QueueMove>> = QueueColumn.entries.mapNotNull { c -> moveFor(ticket, c)?.let { c to it } }
    fun path(ticket: QueueTicket, move: QueueMove) = "/fila/${ticket.id}/${move.path}"
}
