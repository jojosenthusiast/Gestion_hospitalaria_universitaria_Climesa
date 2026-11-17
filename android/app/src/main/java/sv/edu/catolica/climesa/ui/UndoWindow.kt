package sv.edu.catolica.climesa.ui

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** An action waiting in its undo window: [key] names what it acts on (a ticket, an appointment), [label] is what the row says. */
data class PendingUndo(val key: String, val label: String)

/**
 * D-3: a reversible action is held for [windowMs] before it is sent, so "Deshacer" cancels it without any API call (no
 * inverse endpoint exists). When the window ends the action is sent; starting another one first sends the waiting one.
 * The owner keeps [PendingUndo] in its UI state through [onChange].
 */
internal class UndoWindow(
    private val scope: CoroutineScope,
    private val windowMs: Long = WINDOW_MS,
    private val onChange: (PendingUndo?) -> Unit,
) {
    private var job: Job? = null
    private var waiting: Pair<PendingUndo, suspend () -> Unit>? = null

    val pending: PendingUndo? get() = waiting?.first

    fun start(pending: PendingUndo, send: suspend () -> Unit) {
        flush()
        waiting = pending to send
        onChange(pending)
        job = scope.launch {
            delay(windowMs)
            val current = waiting ?: return@launch
            waiting = null
            onChange(null)
            current.second()
        }
    }

    /** Cancels the waiting action; true when there was one (nothing reached the server). */
    fun undo(): Boolean {
        val had = waiting != null
        job?.cancel()
        waiting = null
        if (had) onChange(null)
        return had
    }

    /** Sends the waiting action now (another action starts, or the person leaves). */
    fun flush() {
        val current = waiting ?: return
        job?.cancel()
        waiting = null
        onChange(null)
        scope.launch { current.second() }
    }

    companion object { const val WINDOW_MS = 8_000L }
}
