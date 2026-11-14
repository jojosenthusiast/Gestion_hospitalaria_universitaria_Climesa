package sv.edu.catolica.climesa.domain

object QueueFlow {
    /** The ticket "call next" targets: the first one still waiting, in the order the API lists them. */
    fun nextToCall(tickets: List<QueueTicket>): QueueTicket? = tickets.firstOrNull { it.state == "en_espera" }
}
