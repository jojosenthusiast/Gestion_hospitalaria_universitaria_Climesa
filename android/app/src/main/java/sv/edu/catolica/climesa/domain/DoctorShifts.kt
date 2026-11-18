package sv.edu.catolica.climesa.domain

import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit
import java.util.Locale

/** Chip of a doctor picker: only the doctors with a shift that day (default) or every doctor. */
enum class DoctorShiftFilter { WITH_SHIFT, ALL }

/**
 * Owner rule R3 applied to every doctor picker (Agendar cita, Asignar solicitud, Ingreso): the doctors who can take
 * the appointment come first, the ones without a shift after them, and the «Con turno» chip hides the latter.
 * Order inside each group is the order the API sent (alphabetical, or suggested first).
 */
object DoctorShifts {
    /** Doctors with a shift first; the relative order of each group is kept. */
    fun <T> ordered(doctors: List<T>, hasShift: (T) -> Boolean): List<T> = doctors.filter(hasShift) + doctors.filterNot(hasShift)

    fun <T> withShift(doctors: List<T>, hasShift: (T) -> Boolean): Int = doctors.count(hasShift)

    /** «Con turno» with nobody on shift would show an empty list: the picker falls back to «Todos». */
    fun <T> effective(filter: DoctorShiftFilter, doctors: List<T>, hasShift: (T) -> Boolean): DoctorShiftFilter =
        if (filter == DoctorShiftFilter.WITH_SHIFT && doctors.isNotEmpty() && doctors.none(hasShift)) DoctorShiftFilter.ALL else filter

    /** Rows to draw for [filter]; the chosen doctor always stays visible. */
    fun <T> visible(doctors: List<T>, filter: DoctorShiftFilter, hasShift: (T) -> Boolean, chosen: (T) -> Boolean = { false }): List<T> {
        val ordered = ordered(doctors, hasShift)
        return when (effective(filter, doctors, hasShift)) {
            DoctorShiftFilter.ALL -> ordered
            DoctorShiftFilter.WITH_SHIFT -> ordered.filter { hasShift(it) || chosen(it) }
        }
    }
}

/** Owner rule R4: a day the way people say it, never with the year. */
object ShortDay {
    private val spanish = Locale.forLanguageTag("es-SV")
    private val dayMonth = DateTimeFormatter.ofPattern("EEE d MMM", spanish)

    /** "Hoy · mié 18 nov", "Mañana · jue 19 nov", "Ayer · mar 17 nov", else "Jue 26 nov". */
    fun of(day: LocalDate, today: LocalDate): String {
        val text = dayMonth.format(day).replace(".", "")
        return when (ChronoUnit.DAYS.between(today, day)) {
            0L -> "Hoy · $text"
            1L -> "Mañana · $text"
            -1L -> "Ayer · $text"
            else -> text.replaceFirstChar { it.titlecase(spanish) }
        }
    }
}
