package sv.edu.catolica.climesa.domain

import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

/**
 * Text of the live clock in the top bar (obs 2): "14:05:09" and the full weekday "Miércoles 18 de noviembre", in hospital
 * time, like the web header clock.
 */
object HospitalClockText {
    private val locale = Locale("es", "SV")
    val zone: ZoneId = ZoneId.of("America/El_Salvador")
    private val time = DateTimeFormatter.ofPattern("HH:mm:ss", locale).withZone(zone)
    private val date = DateTimeFormatter.ofPattern("EEEE d 'de' MMMM", locale).withZone(zone)

    fun time(now: Instant): String = time.format(now)

    fun date(now: Instant): String = date.format(now).replaceFirstChar { it.uppercase(locale) }

    private val shortDate = DateTimeFormatter.ofPattern("EEE d MMM", locale).withZone(zone)

    /** D12/D67/D132: "Vie 20 nov", short enough for the top bar at the largest font size. */
    fun shortDate(now: Instant): String = shortDate.format(now).replace(".", "").replaceFirstChar { it.uppercase(locale) }

    /** Milliseconds until the next whole second, so every tick lands on the second and never drifts. */
    fun untilNextSecond(nowMillis: Long): Long = 1_000L - Math.floorMod(nowMillis, 1_000L)
}
