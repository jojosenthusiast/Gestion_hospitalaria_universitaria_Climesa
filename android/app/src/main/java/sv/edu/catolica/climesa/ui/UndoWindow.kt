package sv.edu.catolica.climesa.ui

import java.util.UUID
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import sv.edu.catolica.climesa.data.ApiGateway
import sv.edu.catolica.climesa.data.AuthRequestException
import sv.edu.catolica.climesa.data.DraftStore
import sv.edu.catolica.climesa.data.NoDraftStore
import sv.edu.catolica.climesa.data.RequestIntent

/** An action waiting in its undo window: [key] names what it acts on (a ticket, an appointment), [label] is what the row says. */
data class PendingUndo(val key: String, val label: String)

/**
 * A deferred `POST`, stored from the tap until the server confirms it or the person undoes it. [id] is its idempotency
 * key (every resend reuses it), [tappedAt] and [dueAt] are epoch millis, [error] is the last failure, if any.
 */
data class DeferredRequest(
    val id: String, val key: String, val label: String, val path: String, val body: String,
    val tappedAt: Long, val dueAt: Long, val error: String? = null,
) {
    fun toJson(): JSONObject = JSONObject().put("id", id).put("key", key).put("label", label).put("path", path).put("body", body)
        .put("tappedAt", tappedAt).put("dueAt", dueAt).put("error", error ?: JSONObject.NULL)

    companion object {
        fun fromJson(json: JSONObject): DeferredRequest? = runCatching {
            DeferredRequest(json.getString("id"), json.getString("key"), json.optString("label"), json.getString("path"), json.getString("body"),
                json.getLong("tappedAt"), json.getLong("dueAt"), if (json.isNull("error")) null else json.optString("error").ifBlank { null })
        }.getOrNull()
    }
}

/**
 * D-3: a reversible action is held for [windowMs] before it is sent, so "Deshacer" cancels it without any API call (no
 * inverse endpoint exists). The action is written to the account's [drafts] under [storeKey] at the tap, so a killed app,
 * a sign-out or a lost signal never loses it: [bind] and [resume] send every stored action whose window has ended, in tap
 * order, with its own idempotency key. An action leaves the store only when the server confirms it or the person undoes
 * or discards it; a failure keeps it, with the error, for the next [resume]. Starting another action sends the waiting one.
 */
internal class UndoWindow(
    private val scope: CoroutineScope,
    private val api: ApiGateway,
    private val storeKey: String,
    private val drafts: DraftStore = NoDraftStore,
    private val windowMs: Long = WINDOW_MS,
    private val now: () -> Long = System::currentTimeMillis,
    /** The body to send; lets the owner refresh a version it knows to be newer. */
    private val prepare: (DeferredRequest) -> JSONObject = { JSONObject(it.body) },
    private val onSent: (DeferredRequest, Any?) -> Unit = { _, _ -> },
    private val onFailed: (DeferredRequest, Exception) -> Unit = { _, _ -> },
    private val onChange: (PendingUndo?) -> Unit,
) {
    private var userId: String? = null
    private var items: List<DeferredRequest> = emptyList()
    private val timers = mutableMapOf<String, Job>()
    private val sending = Mutex()

    /** The latest action still inside its window (the one "Deshacer" cancels). */
    val pending: PendingUndo? get() = items.lastOrNull { it.id in timers }?.let { PendingUndo(it.key, it.label) }

    /** Stored actions whose window ended and whose last send failed. */
    val failed: List<DeferredRequest> get() = items.filter { it.error != null && it.id !in timers }

    /** Every stored action, in tap order. */
    val stored: List<DeferredRequest> get() = items

    /** Signed-in user: loads what that account left stored (a killed app, a sign-out) and sends what is due. */
    fun bind(user: String) {
        if (userId == user) return
        userId = user
        val restored = drafts.load(user, storeKey)?.optJSONArray("items")?.let { a -> (0 until a.length()).mapNotNull { a.optJSONObject(it)?.let(DeferredRequest::fromJson) } }.orEmpty()
        items = (items + restored).distinctBy { it.id }.sortedBy { it.tappedAt }
        save()
        resume()
    }

    fun start(key: String, label: String, path: String, body: JSONObject) {
        flush()
        val tap = now()
        val item = DeferredRequest(UUID.randomUUID().toString(), key, label, path, body.toString(), tap, tap + windowMs)
        items = items + item
        save()
        schedule(item, windowMs)
        notifyChange()
    }

    /** Cancels the action in its window; true when there was one (nothing reached the server). */
    fun undo(): Boolean {
        val item = items.lastOrNull { it.id in timers } ?: return false
        timers.remove(item.id)?.cancel()
        remove(item.id)
        return true
    }

    /** The person drops a failed action after reading its error. */
    fun discard(id: String) { if (id !in timers) remove(id) }

    /** Sends every waiting action now (another action starts, or the person leaves). */
    fun flush() {
        if (timers.isEmpty()) return
        timers.values.forEach { it.cancel() }
        timers.clear()
        notifyChange()
        drain()
    }

    /**
     * App start, screen resume or signal back: what is past its window is sent in tap order (failed ones again); what is
     * still inside it (the app was killed seconds after the tap) waits only for the rest of its window.
     */
    fun resume() {
        val t = now()
        items.filter { it.id !in timers && it.error == null && it.dueAt > t }.forEach { schedule(it, (it.dueAt - t).coerceIn(0, windowMs)) }
        notifyChange()
        drain()
    }

    private fun schedule(item: DeferredRequest, wait: Long) {
        timers[item.id] = scope.launch {
            delay(wait)
            timers.remove(item.id)
            notifyChange()
            drain()
        }
    }

    /** Sends in tap order. A failure keeps the action and holds back the later ones on the same subject; no signal stops all. */
    private fun drain() {
        scope.launch {
            sending.withLock {
                val held = mutableSetOf<String>()
                for (item in items.filter { it.id !in timers }) {
                    if (item.key in held || items.none { it.id == item.id } || item.id in timers) continue
                    try {
                        val result = withContext(RequestIntent(item.id)) { api.request(item.path, "POST", prepare(item)) }
                        remove(item.id)
                        onSent(item, result)
                    } catch (e: CancellationException) { throw e }
                    catch (e: Exception) {
                        items = items.map { if (it.id == item.id) it.copy(error = userMessage(e, "No se pudo enviar.")) else it }
                        save()
                        held += item.key
                        onFailed(item, e)
                        if (e is AuthRequestException && e.statusCode == null) break
                    }
                }
            }
        }
    }

    private fun remove(id: String) {
        items = items.filterNot { it.id == id }
        save()
        notifyChange()
    }

    private fun notifyChange() = onChange(pending)

    private fun save() {
        val user = userId ?: return
        if (items.isEmpty()) drafts.clear(user, storeKey)
        else drafts.save(user, storeKey, JSONObject().put("items", JSONArray().apply { items.forEach { put(it.toJson()) } }))
    }

    companion object { const val WINDOW_MS = 8_000L }
}
