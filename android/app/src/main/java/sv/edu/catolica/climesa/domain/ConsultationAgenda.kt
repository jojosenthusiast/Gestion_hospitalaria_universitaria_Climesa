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

/**
 * Lote 5 S11: today's appointments of "Mi día" split by what the doctor does next. [now] holds the consultations open right
 * now (started and unsigned) and the appointments whose slot is running; [upcoming] the ones still ahead today, in start
 * order; [done] the ones signed or whose slot already ended. Other days are not here: they live in [DoctorDayPlan].
 */
data class TodaySections(
    val now: List<MedicalAppointment>,
    val upcoming: List<MedicalAppointment>,
    val done: List<MedicalAppointment>,
)

/** "Mi día" as the doctor reads it: today by section, then the next days and the history of earlier days, apart. */
data class DoctorDayPlan(val today: TodaySections, val later: List<AgendaDay>, val past: List<AgendaDay>)

object DoctorDaySections {
    private val zone: ZoneId = ZoneId.of("America/El_Salvador")
    private val shortDate = java.time.format.DateTimeFormatter.ofPattern("EEE d MMM", java.util.Locale("es", "SV"))

    /** How many upcoming appointments of today show before the "Mostrar N más de hoy" expander. */
    const val UPCOMING_VISIBLE = 3

    fun plan(appointments: List<MedicalAppointment>, now: Instant): DoctorDayPlan {
        val today = now.atZone(zone).toLocalDate()
        val groups = ConsultationAgenda.group(appointments, today)
        return DoctorDayPlan(split(groups.today?.appointments.orEmpty(), now), groups.later, groups.past.sortedByDescending { it.date })
    }

    /** Splits today's rows; a row without a readable start or end counts as upcoming, never as done. */
    fun split(rows: List<MedicalAppointment>, now: Instant): TodaySections {
        val nowRows = mutableListOf<MedicalAppointment>()
        val upcoming = mutableListOf<MedicalAppointment>()
        val done = mutableListOf<MedicalAppointment>()
        rows.sortedBy { it.start }.forEach { row ->
            val start = parse(row.start)
            val end = parse(row.end)
            when {
                row.consultationState == "firmada" || row.appointmentState == "atendida" -> done += row
                row.consultationId != null -> nowRows += row
                start != null && !start.isAfter(now) && (end == null || end.isAfter(now)) -> nowRows += row
                end != null && !end.isAfter(now) -> done += row
                else -> upcoming += row
            }
        }
        return TodaySections(nowRows, upcoming, done)
    }

    /** "Mostrar 3 más de hoy" under the first [UPCOMING_VISIBLE] upcoming rows; null when nothing is hidden. */
    fun moreTodayLabel(total: Int, expanded: Boolean): String? = when {
        total <= UPCOMING_VISIBLE -> null
        expanded -> "Mostrar menos"
        else -> "Mostrar ${total - UPCOMING_VISIBLE} más de hoy"
    }

    /**
     * Detail of the separate "Historial de días anteriores" entry: how many days and appointments and the date span,
     * "3 días · 7 citas · lun 16 nov a mié 18 nov". Null when there is no earlier day.
     */
    fun historyDetail(past: List<AgendaDay>): String? {
        if (past.isEmpty()) return null
        val dates = past.map { it.date }.sorted()
        val count = past.sumOf { it.appointments.size }
        val days = if (past.size == 1) "1 día" else "${past.size} días"
        val citas = if (count == 1) "1 cita" else "$count citas"
        val span = if (dates.size == 1) dayLabel(dates.first()) else "${dayLabel(dates.first())} a ${dayLabel(dates.last())}"
        return "$days · $citas · $span"
    }

    /** Detail of the "Próximos días" entry: "2 días · 5 citas · hasta vie 27 nov". Null when nothing is ahead. */
    fun laterDetail(later: List<AgendaDay>): String? {
        if (later.isEmpty()) return null
        val count = later.sumOf { it.appointments.size }
        val days = if (later.size == 1) "1 día" else "${later.size} días"
        val citas = if (count == 1) "1 cita" else "$count citas"
        return "$days · $citas · hasta ${dayLabel(later.maxOf { it.date })}"
    }

    /** "lun 16 nov" (no dots, no year). */
    fun dayLabel(date: LocalDate): String = shortDate.format(date).replace(".", "")

    private fun parse(iso: String): Instant? = runCatching { Instant.parse(iso) }.getOrNull()
}
