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
    /** B2: the doctor of the linked appointment (`appointmentDoctorName`), so the chip says whose appointment it is. */
    val appointmentDoctorName: String? = null,
    /** B5: numbers waiting before this one, when the API sends it on the row (`ahead`); null otherwise. */
    val ahead: Int? = null,
    /** B-3: until when this reader (the issuer) may void the number (`voidableUntil`, epoch ms); null for anyone else. */
    val voidableUntilMillis: Long? = null,
    /** The server says this reader made the last call of the number (`calledByMe`), so "Deshacer" survives a restart. */
    val calledByMe: Boolean = false,
    /** The patient of the number (`patientId`), for "Tomar signos" from the card; null for an unidentified number. */
    val patientId: String? = null,
) {
    fun allows(action: QueueAction) = action in allowedActions
    /** The action is shown: allowed, or blocked with a reason from the server. */
    fun shows(action: QueueAction) = allows(action) || action in blockedActions
}

/**
 * R3 A-6: what a patient sees in "Mi turno": only their own ticket, never the reception board. Only an active ticket
 * (waiting, called or in attention) is "my number" (iOS `QueueRules.activeTicket`); a finished one is history.
 */
object PatientQueue {
    private val active = setOf("en_espera", "llamado", "en_atencion")
    fun current(tickets: List<QueueTicket>): QueueTicket? =
        tickets.filter { it.state in active }.maxByOrNull { it.issuedAtMillis ?: 0L }
    /** The day's other tickets (finished ones included), under the current number. */
    fun others(tickets: List<QueueTicket>): List<QueueTicket> {
        val mine = current(tickets)
        return tickets.filter { it.id != mine?.id }
    }

    /** B5: called numbers of the patient's service today (`GET /publico/fila/{servicio}`), without names. */
    fun parsePublic(value: Any?): List<PublicCall> {
        val rows = (value as? org.json.JSONObject)?.optJSONArray("llamados") ?: return emptyList()
        return (0 until rows.length()).mapNotNull { rows.optJSONObject(it) }
            .map { PublicCall(it.optInt("numero"), ServerActions.text(it, "consultorio")) }.filter { it.number > 0 }
    }

    /** People before [number] in its area: the numbers after the last one called (same rule as iOS); null before any call. */
    fun ahead(number: Int, called: List<PublicCall>): Int? = called.maxOfOrNull { it.number }?.let { maxOf(0, number - it - 1) }

    /** B5: "N personas antes de ti": the API's count when the row carries it, else the estimate from the public board. */
    fun ahead(ticket: QueueTicket, called: List<PublicCall>): Int? = ticket.ahead ?: ahead(ticket.number, called)

    /** Consulting room the patient was called to, from the ticket or the public board. */
    fun office(ticket: QueueTicket, called: List<PublicCall>): String? = ticket.officeCode ?: called.firstOrNull { it.number == ticket.number }?.office
}

/** One called number of the public board: its number and room, no name. */
data class PublicCall(val number: Int, val office: String?)

object QueueLabels {
    private val areas = mapOf("consulta_general" to "CON", "emergencia" to "EMG", "laboratorio" to "LAB", "admisiones" to "REC")
    fun areaOf(service: String) = areas[service] ?: "GEN"
    /** "CON 7": the area code and the number, as the patient hears it called. */
    fun code(ticket: QueueTicket) = "${ticket.area} ${ticket.number}"
    fun priority(value: String) = mapOf("emergencia" to "Emergencia", "urgente" to "Urgente", "rutina" to "Rutina")[value] ?: value
    /** Cited (with the appointment time) or walk-in. */
    fun arrival(ticket: QueueTicket) = ticket.appointmentAt?.let { at ->
        // Sweep #11: "Cita 09:00 con <médico>"; a "·" before the doctor read as a second patient.
        "Cita ${AppointmentAgenda.time(at)}" + (ticket.appointmentDoctorName?.let { " con $it" } ?: "")
    } ?: "Sin cita"
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
                appointmentDoctorName = ServerActions.text(row, "appointmentDoctorName"),
                ahead = if (row.has("ahead") && !row.isNull("ahead")) row.optInt("ahead") else null,
                voidableUntilMillis = ServerActions.text(row, "voidableUntil")?.let(::parseMillis),
                calledByMe = row.optBoolean("calledByMe", false),
                patientId = ServerActions.text(row, "patientId"),
            )
        } }
    }

    /**
     * B-3 (same rule as the web): "Anular este número" shows only while the server window is open and the number still
     * waits; the server checks again (only the issuer, 10 minutes).
     */
    fun voidable(untilMillis: Long?, state: String, now: Long): Boolean = untilMillis != null && untilMillis > now && state == "en_espera"

    /** G5 on the board (like the ward): a called or attended number opens "Signos vitales" on its patient. */
    fun vitalsSubject(ticket: QueueTicket): QuickSubject? {
        val id = ticket.patientId ?: return null
        if (ticket.state !in setOf("llamado", "en_atencion")) return null
        return QuickSubject(id, ticket.patientName, QueueLabels.code(ticket))
    }

    /** Waiting numbers shown before "Ver N más"; finished ones start folded (they grow all day). */
    const val WAITING_FOLD = 6

    /** B3: the numbers whose last call this reader made, by the server (`calledByMe`), still called. */
    fun calledByMe(tickets: List<QueueTicket>): Set<String> = tickets.filter { it.calledByMe && it.state == "llamado" }.map { it.id }.toSet()

    /** B1: numbers still waiting before [ticket] in its service (lower number, waiting), for "3 antes". */
    fun ahead(tickets: List<QueueTicket>, ticket: QueueTicket): Int =
        tickets.count { it.service == ticket.service && it.state == "en_espera" && it.number < ticket.number }

    /** Service preselected for "Llamar siguiente": the chosen filter, else the service of the first waiting number. */
    fun callNextService(tickets: List<QueueTicket>, filter: String?): String =
        filter ?: tickets.firstOrNull { it.state == "en_espera" }?.service ?: QueueLabels.services.first().first

    /** D99: numbers waiting in [service]; "Llamar siguiente" for a service with none is never offered (the API answers 409). */
    fun waitingCount(tickets: List<QueueTicket>, service: String): Int = tickets.count { it.state == "en_espera" && it.service == service }

    fun callNextBody(service: String, officeId: String? = null) = org.json.JSONObject().put("service", service).apply { officeId?.let { put("officeId", it) } }

    /**
     * Reception issues a number for the patient it chose (`patientId`; the API answers 403 to a staff issue without it).
     * `rutina` is the server default: a routine number does not send `priority`.
     */
    fun issueBody(service: String, priority: String, patientId: String, appointmentId: String? = null) =
        org.json.JSONObject().put("service", service).put("patientId", patientId).apply {
            if (priority != "rutina") put("priority", priority)
            // B-1 / D-1: "Registrar llegada" links the number to today's appointment (the API requires Consulta general).
            appointmentId?.let { put("appointmentId", it) }
        }

    /** B3: the caller's post of the shift in progress (`GET /fila/mi-puesto`); every field is null without a shift. */
    fun myPost(value: Any?): MyPost? {
        val json = value as? org.json.JSONObject ?: return null
        return MyPost(ServerActions.text(json, "service"), ServerActions.text(json, "officeId"), ServerActions.text(json, "officeCode"), ServerActions.text(json, "areaName"))
    }

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
        // D74: `waiting` and `noProposalReason` are optional (older API): without them the panel says nobody waits.
        val waiting = if (json.has("waiting") && !json.isNull("waiting")) json.optInt("waiting") else null
        return NextProposal(json.optString("service"), json.optString("area"), json.optString("rule"), proposal, waiting, ServerActions.text(json, "noProposalReason"))
    }
}

/** Service and room of the caller's shift in progress, used to preselect the board and "Llamar siguiente". */
data class MyPost(val service: String?, val officeId: String?, val officeCode: String?, val areaName: String?)

/** A consulting room a called number can be sent to. */
data class QueueOffice(val id: String, val code: String, val name: String) {
    val label get() = "$code · $name"
}

enum class NextStatus { LOADING, ERROR, NONE, PROPOSAL }

data class ProposedTicket(val id: String, val number: Int, val area: String, val patientName: String, val priority: String, val version: Int, val reason: String, val reasonText: String) {
    val code get() = "$area $number"
}
/** Who goes next in one area, by the server's documented rule (RN-FILA-SIGUIENTE). */
data class NextProposal(
    val service: String, val area: String, val rule: String, val proposal: ProposedTicket?,
    /** D74: numbers waiting in the service now, with or without a proposal. */
    val waiting: Int? = null,
    /** D74: `sin_espera` or `citas_de_otro_medico` (people wait, but with another doctor's appointment); null with a proposal. */
    val noProposalReason: String? = null,
) {
    /** D74: how many wait for another doctor when that is why nobody is proposed; null means "nobody waits". */
    val waitingForOtherDoctor: Int? get() = if (proposal == null && noProposalReason == "citas_de_otro_medico") (waiting ?: 0).takeIf { it > 0 } else null
}

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

    /** Moves the card already shows as direct buttons from `allowedActions` (Llamar, Iniciar atención, Completar, No se presentó). */
    private val direct = setOf(QueueMove.CALL, QueueMove.ATTEND, QueueMove.COMPLETE, QueueMove.ABSENT)

    /**
     * Lote 2 «Mover»: the main next step is a direct button on the card, so the menu keeps only the other moves, with plain
     * labels ("Devolver a espera", "Quitar un llamado"), and never repeats a button. [undoShown] is true when the card
     * already shows its own "Deshacer" for this call.
     */
    fun menuMoves(ticket: QueueTicket, undoShown: Boolean = false): List<QueueMove> = buildList {
        if (canRemoveCall(ticket) && !undoShown) add(QueueMove.REMOVE_CALL)
        destinations(ticket).map { it.second }.filter { it !in direct && !(it == QueueMove.UNDO_CALL && undoShown) }.forEach(::add)
    }
}
