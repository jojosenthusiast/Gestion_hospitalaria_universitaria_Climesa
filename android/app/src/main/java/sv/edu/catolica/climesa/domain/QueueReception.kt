package sv.edu.catolica.climesa.domain

import org.json.JSONObject

/**
 * Owner batch 5 (S4): the waiting numbers split into walk-ins of the day («de fila») and numbers linked to an appointment
 * («con cita»), the same words as the web `waitingSplitText`.
 */
data class WaitingSplit(val total: Int, val walkIn: Int, val booked: Int) {
    /** «5 de fila · 3 con cita». */
    val text: String get() = "$walkIn de fila · $booked con cita"
}

/** One figure of the queue summary on top of the board: the stage and how many numbers it holds. */
data class QueueSummaryItem(val column: QueueColumn, val count: Int) {
    val label: String get() = column.label
}

/**
 * The confirmation card after "Llamar siguiente" (S5): who was called, where they go and for what service, in one line:
 * «Llamaste CON 12 · Juan Pérez → C-101 · Consultorio 1 · Consulta general».
 */
data class CallNextConfirmation(val ticketId: String, val code: String, val patientName: String?, val office: String?, val service: String) {
    val text: String get() = buildString {
        append("Llamaste ").append(code)
        patientName?.takeIf { it.isNotBlank() }?.let { append(" · ").append(it) }
        append(if (office.isNullOrBlank()) " → sin consultorio asignado" else " → $office")
        append(" · ").append(service)
    }
}

/** Pure rules of the reception queue board added in owner batch 5 (S4, S5, S11). */
object QueueReception {
    /** A number is booked when the API links it to an appointment (`appointmentAt`, `appointmentId` or a registered arrival). */
    fun booked(ticket: QueueTicket): Boolean = ticket.appointmentAt != null || ticket.appointmentId != null || ticket.arrivalFromAppointment

    fun waitingSplit(tickets: List<QueueTicket>): WaitingSplit {
        val waiting = tickets.filter { it.state == "en_espera" }
        val booked = waiting.count(::booked)
        return WaitingSplit(waiting.size, waiting.size - booked, booked)
    }

    /** The same split read from raw `/fila` rows (Inicio reads the JSON without parsing tickets). */
    fun waitingSplitRows(rows: List<JSONObject>): WaitingSplit {
        val waiting = rows.filter { it.optString("state") == "en_espera" }
        fun text(row: JSONObject, key: String) = row.has(key) && !row.isNull(key) && row.optString(key).isNotBlank()
        val booked = waiting.count { text(it, "appointmentAt") || text(it, "appointmentId") || it.optBoolean("arrivalFromAppointment", false) }
        return WaitingSplit(waiting.size, waiting.size - booked, booked)
    }

    /** Counts of every stage, in board order, for the summary on top (zeros included so the strip never jumps). */
    fun summary(tickets: List<QueueTicket>): List<QueueSummaryItem> =
        QueueColumn.entries.map { column -> QueueSummaryItem(column, tickets.count { QueueBoard.column(it) == column }) }

    /**
     * Confirmation of a "Llamar siguiente" answer (`QueueCallNextResponse`); null when the API sent no number. The room is the
     * answer's `officeCode` (Lote 5) when present, else the [office] picked before calling (older APIs).
     */
    fun callNextConfirmation(result: Any?, service: String, office: String?): CallNextConfirmation? {
        val row = result as? JSONObject ?: return null
        val number = row.optInt("numero", 0).takeIf { it > 0 } ?: return null
        val area = ServerActions.text(row, "area") ?: QueueLabels.areaOf(service)
        return CallNextConfirmation(row.optString("id"), "$area $number", ServerActions.text(row, "patientName"), ServerActions.text(row, "officeCode") ?: office, QueueLabels.service(service))
    }

    /**
     * The success banner of the board, without the "Llamar siguiente" one once its confirmation card is shown ([lastCall]);
     * any other notice (issued, voided, priority changed) still shows.
     */
    fun noticeShown(notice: String?, lastCall: CallNextConfirmation?): String? =
        notice?.takeUnless { lastCall != null && (it.startsWith("Se llamó al N.º") || it == "Número llamado.") }

    /**
     * What a doctor reads on a queue row (S11): the reason of the visit (categories of the appointment request, or the
     * service), whether it is an appointment, and how long the patient has waited. Age and sex go after the name
     * ([QueueTicket.patientSummary]), from the Lote 5 `/fila` read fields.
     */
    fun doctorSummary(ticket: QueueTicket, nowMillis: Long): String = listOfNotNull(
        ticket.categories.takeIf { it.isNotEmpty() }?.joinToString(", ") { it.name } ?: QueueLabels.service(ticket.service),
        QueueLabels.arrival(ticket),
        QueueBoard.waitMinutes(ticket, nowMillis)?.takeIf { ticket.state == "en_espera" }?.let { "Espera ${elapsedText(it)}" },
    ).joinToString(" · ")
}
