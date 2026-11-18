package sv.edu.catolica.climesa.domain

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

/** One day of the doctor's agenda, its appointments in start order. */
data class AgendaDay(val date: LocalDate, val appointments: List<MedicalAppointment>)

/** Row 15: "Mi día" agenda by day. Today is open; earlier and later days stay folded behind one button each. */
data class AgendaGroups(val past: List<AgendaDay>, val today: AgendaDay?, val later: List<AgendaDay>)

object ConsultationAgenda {
    private val zone: ZoneId = ZoneId.of("America/El_Salvador")

    /** Pending lists ("Sin firmar", reprogramaciones) show this many rows before folding the rest. */
    const val VISIBLE = 2

    fun day(iso: String): LocalDate? = runCatching { Instant.parse(iso).atZone(zone).toLocalDate() }.getOrNull()

    /** Appointments grouped by local day; a row without a readable start goes with today. */
    fun group(appointments: List<MedicalAppointment>, today: LocalDate): AgendaGroups {
        val days = appointments.groupBy { day(it.start) ?: today }.toSortedMap()
            .map { (date, rows) -> AgendaDay(date, rows.sortedBy { it.start }) }
        return AgendaGroups(days.filter { it.date < today }, days.firstOrNull { it.date == today }, days.filter { it.date > today })
    }

    /** Rows of a folded list: all when [expanded], else the first [VISIBLE]. */
    fun <T> shown(items: List<T>, expanded: Boolean): List<T> = if (expanded) items else items.take(VISIBLE)

    /** How many rows the fold hides. */
    fun hidden(count: Int, expanded: Boolean): Int = if (expanded) 0 else maxOf(0, count - VISIBLE)
}
