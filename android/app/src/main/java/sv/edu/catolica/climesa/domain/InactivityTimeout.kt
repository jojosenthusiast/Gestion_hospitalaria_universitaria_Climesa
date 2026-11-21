package sv.edu.catolica.climesa.domain

/**
 * S10: the session closes after [limitMs] without the person touching the app while it is open. `MainActivity` calls
 * [touch] on every user interaction and asks [expired] when [remainingMs] runs out; [now] is a monotonic clock in millis.
 * Typing does not reach `onUserInteraction`, so every saved draft also calls [touch] (see `SessionActivity`).
 */
class InactivityTimeout(private val now: () -> Long, val limitMs: Long = LIMIT_MS) {
    @Volatile private var lastInteraction = now()

    fun touch() { lastInteraction = now() }

    fun idleMs(): Long = (now() - lastInteraction).coerceAtLeast(0)

    fun expired(): Boolean = idleMs() >= limitMs

    /** Time left before [expired] turns true; zero once it has. */
    fun remainingMs(): Long = (limitMs - idleMs()).coerceAtLeast(0)

    companion object {
        /** 5 minutes, the same limit as the background sign-out. */
        const val LIMIT_MS = 5 * 60_000L
    }
}