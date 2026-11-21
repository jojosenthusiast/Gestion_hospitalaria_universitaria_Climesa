package sv.edu.catolica.climesa

import android.os.SystemClock
import sv.edu.catolica.climesa.domain.InactivityTimeout

/**
 * S10: one inactivity clock for the whole process. `MainActivity` touches it on every interaction it sees, and every
 * saved draft touches it too, because typing on the on-screen keyboard and taps inside dialogs never reach
 * `Activity.onUserInteraction`: a person writing a long note is never signed out mid-sentence.
 */
object SessionActivity {
    val timeout = InactivityTimeout(SystemClock::elapsedRealtime)
}
