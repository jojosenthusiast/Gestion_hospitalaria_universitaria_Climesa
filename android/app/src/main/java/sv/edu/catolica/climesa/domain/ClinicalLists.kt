package sv.edu.catolica.climesa.domain

import java.text.Normalizer
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

/** Round 2 list rules shared by the lab worklist, the queue board and the appointment agenda (web twins live in the web features/listas folder). Pure: the clock arrives as a parameter. */

private val zone: ZoneId = ZoneId.of("America/El_Salvador")
private val spanish = Locale.forLanguageTag("es-SV")

/** Without accents or capitals, like the web `SearchPicker`: "maria" finds "María". */
fun foldText(value: String): String = Normalizer.normalize(value, Normalizer.Form.NFD).replace(Regex("\\p{M}+"), "").lowercase()
fun matchesQuery(query: String, vararg parts: String?): Boolean {
    val needle = foldText(query.trim())
    return needle.isEmpty() || foldText(parts.filterNotNull().joinToString(" ")).contains(needle)
}
fun parseMillis(value: String?): Long? = value?.takeIf { it.isNotBlank() }?.let { runCatching { Instant.parse(it).toEpochMilli() }.getOrNull() }

enum class SlaLevel { OK, WARN, LATE, NONE }

fun elapsedText(minutes: Long): String = when {
    minutes < 60 -> "$minutes min"
    minutes < 24 * 60 -> (minutes / 60).let { h -> val m = minutes % 60; if (m == 0L) "$h h" else "$h h ${m.toString().padStart(2, '0')} min" }
    else -> "${minutes / (24 * 60)} d ${(minutes / 60) % 24} h"
}

enum class LabStage(val label: String) { PENDING("Pendiente"), IN_PROCESS("En proceso"), TO_REVIEW("Por revisar"), RELEASED("Liberada"), CANCELLED("Cancelada") }

/** The lab list as a clinical worklist: urgent first, oldest first, with a time goal colour per order. */
object LabWorklist {
    /** Visual goals in minutes since the order was placed. A guide for the screen, not a business rule. */
    private const val URGENT_WARN = 30L; private const val URGENT_LATE = 60L; private const val ROUTINE_WARN = 120L; private const val ROUTINE_LATE = 240L

    fun stage(order: LaboratoryOrder): LabStage = when {
        order.state == "cancelado" -> LabStage.CANCELLED
        order.state == "pendiente" -> LabStage.PENDING
        order.state == "en_proceso" -> LabStage.IN_PROCESS
        order.reviewed -> LabStage.RELEASED
        else -> LabStage.TO_REVIEW
    }
    fun isUrgent(order: LaboratoryOrder) = order.priority == "urgente"
    fun isCritical(order: LaboratoryOrder) = order.items.any { it.result?.mark == "critico_alto" || it.result?.mark == "critico_bajo" }
    fun elapsedMinutes(order: LaboratoryOrder, nowMillis: Long): Long? = order.createdAtMillis?.let { maxOf(0L, (nowMillis - it) / 60_000) }
    /** The clock only runs while the order waits for the lab; afterwards there is nothing to watch. */
    fun sla(order: LaboratoryOrder, nowMillis: Long): SlaLevel {
        if (order.state != "pendiente" && order.state != "en_proceso") return SlaLevel.NONE
        val minutes = elapsedMinutes(order, nowMillis) ?: return SlaLevel.NONE
        val (warn, late) = if (isUrgent(order)) URGENT_WARN to URGENT_LATE else ROUTINE_WARN to ROUTINE_LATE
        return if (minutes >= late) SlaLevel.LATE else if (minutes >= warn) SlaLevel.WARN else SlaLevel.OK
    }
    fun sorted(orders: List<LaboratoryOrder>): List<LaboratoryOrder> = orders.sortedWith(
        compareBy<LaboratoryOrder>({ if (it.state == "completado" || it.state == "cancelado") 1 else 0 }, { if (isUrgent(it)) 0 else 1 }, { it.createdAtMillis ?: Long.MAX_VALUE }),
    )
    /** "Exp. 000101-1 · 34 años · F"; only what the role may see. */
    fun identityLine(order: LaboratoryOrder): String = listOfNotNull(
        order.record?.let { "Exp. $it" }, order.age, order.sex?.let { mapOf("femenino" to "F", "masculino" to "M")[it] },
    ).joinToString(" · ")
    fun matches(order: LaboratoryOrder, query: String) = matchesQuery(query, order.patientName, order.record, order.doctorName, *order.items.flatMap { listOf(it.code, it.name) }.toTypedArray())
}

enum class QueueColumn(val label: String) { WAITING("En espera"), CALLED("Llamados"), IN_ATTENTION("En atención"), CLOSED("Terminados") }
data class QueueSummary(val counts: Map<QueueColumn, Int>, val averageWait: Long, val longestWait: Long)

/** The daily line as a board: counts per stage, wait times with a colour, filters by service and text. */
object QueueBoard {
    private const val WARN = 20L; private const val LATE = 45L
    fun column(ticket: QueueTicket) = when (ticket.state) {
        "en_espera" -> QueueColumn.WAITING; "llamado" -> QueueColumn.CALLED; "en_atencion" -> QueueColumn.IN_ATTENTION; else -> QueueColumn.CLOSED
    }
    fun waitMinutes(ticket: QueueTicket, nowMillis: Long): Long? = ticket.issuedAtMillis?.let { maxOf(0L, (nowMillis - it) / 60_000) }
    fun waitLevel(ticket: QueueTicket, nowMillis: Long): SlaLevel {
        if (ticket.state != "en_espera" && ticket.state != "llamado") return SlaLevel.NONE
        val minutes = waitMinutes(ticket, nowMillis) ?: return SlaLevel.NONE
        return if (minutes >= LATE) SlaLevel.LATE else if (minutes >= WARN) SlaLevel.WARN else SlaLevel.OK
    }
    fun summary(tickets: List<QueueTicket>, nowMillis: Long): QueueSummary {
        val waits = tickets.filter { it.state == "en_espera" || it.state == "llamado" }.mapNotNull { waitMinutes(it, nowMillis) }
        return QueueSummary(QueueColumn.entries.associateWith { c -> tickets.count { column(it) == c } }, if (waits.isEmpty()) 0 else waits.sum() / waits.size, waits.maxOrNull() ?: 0)
    }
    fun visible(tickets: List<QueueTicket>, service: String?, query: String): List<QueueTicket> =
        tickets.filter { (service == null || it.service == service) && matchesQuery(query, it.number.toString(), it.patientName, QueueLabels.service(it.service)) }
    fun sorted(tickets: List<QueueTicket>): List<QueueTicket> = tickets.sortedWith(compareBy<QueueTicket>({ column(it).ordinal }, { if (column(it) == QueueColumn.CLOSED) -it.number else it.number }))
}

/** Appointments as an agenda: one cell "08:00 – 08:20" per row, grouped by day, never entry and exit in two rows. */
object AppointmentAgenda {
    private val hm = DateTimeFormatter.ofPattern("HH:mm")
    fun time(iso: String) = runCatching { hm.format(Instant.parse(iso).atZone(zone)) }.getOrDefault(iso)
    fun timeRange(start: String, end: String) = "${time(start)} – ${time(end)}"
    fun dayKey(iso: String) = runCatching { Instant.parse(iso).atZone(zone).toLocalDate().toString() }.getOrDefault("")
    fun dayLabel(key: String): String = runCatching {
        val date = LocalDate.parse(key)
        DateTimeFormatter.ofPattern("EEEE d 'de' MMMM", spanish).format(date).replaceFirstChar { it.uppercase() }
    }.getOrDefault(key)
    fun <T> groupByDay(items: List<T>, start: (T) -> String): List<Pair<String, List<T>>> =
        items.sortedBy { start(it) }.groupBy { dayKey(start(it)) }.toList().sortedBy { it.first }
}

/** Data the patient sheet still lacks, so reception sees at a glance what to complete. */
object PatientCompleteness {
    fun gaps(patient: Patient): List<String> = buildList {
        if (patient.birth == null) add("fecha de nacimiento")
        if (patient.dui.isNullOrBlank()) add("DUI")
        if (patient.phone.isBlank()) add("teléfono")
    }
}
