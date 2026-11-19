package sv.edu.catolica.climesa.domain

/**
 * Owner batch 5 (S6): the texts of a request card in reception, in the order the card reads them: who (name first), why
 * (the categories, each with its icon and name), when it is wanted («Para: …») and when it was asked («Pedida: …»), and
 * the record number last. A request has no date until it is assigned: «Para» is the time of day the patient asked for.
 */
object AppointmentRequestCards {
    /** «Para: Mañana, de 7:00 a 12:00» / «Para: Cualquier hora». */
    fun requestedFor(franja: RequestFranja): String =
        if (franja == RequestFranja.ANY) "Para: ${franja.label}" else "Para: ${franja.label}, de ${franja.fromHour}:00 a ${franja.toHour}:00"

    /** «Pedida: hace 5 min»; null when the creation time cannot be read. */
    fun askedAt(createdAt: String, nowMillis: Long): String? = CategoryRequestRules.waitingFor(createdAt, nowMillis)?.let { "Pedida: $it" }

    /** «Expediente 2026-000123», the tertiary line; null for a provisional patient without a record. */
    fun record(record: String?): String? = record?.takeIf { it.isNotBlank() }?.let { "Expediente $it" }

    /** Label of the state strip above the buttons: the same words as the state tag of the list. */
    fun stateLabel(state: String): String = CategoryRequestRules.status(state).second
}
