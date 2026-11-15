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
) {
    fun allows(action: QueueAction) = action in allowedActions
    /** The action is shown: allowed, or blocked with a reason from the server. */
    fun shows(action: QueueAction) = allows(action) || action in blockedActions
}

object QueueLabels {
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
            )
        } }
    }

    /** Service preselected for "Llamar siguiente": the chosen filter, else the service of the first waiting number. */
    fun callNextService(tickets: List<QueueTicket>, filter: String?): String =
        filter ?: tickets.firstOrNull { it.state == "en_espera" }?.service ?: QueueLabels.services.first().first

    fun callNextBody(service: String) = org.json.JSONObject().put("service", service)
}
