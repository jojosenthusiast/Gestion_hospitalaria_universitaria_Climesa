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
data class PendingUndo(val key: String, val label: String, /** Epoch ms when the undo window closes; 0 = no countdown. */ val until: Long = 0L)

/** Whole seconds left in an undo window that closes at [until] (epoch ms), never negative; rounds up so "1 s" is the last. */
internal fun undoSecondsLeft(until: Long, now: Long): Long = if (until <= now) 0L else (until - now + 999) / 1000

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
 * or discards it, or the server rejects it for good (a 4xx such as `transicion_invalida`: resending cannot help, so it is
 * dropped and [onFailed] says why once). No signal, 5xx, 401, 408 and 429 keep it for the next [resume]. The body is
 * frozen at the tap and stored with its key: a retry is an exact replay (same key, same body), so the server's idempotency
 * check never sees one key with two bodies. An action older than [MAX_AGE_MS] by its tap time is dropped and reported.
 */
internal class UndoWindow(
    private val scope: CoroutineScope,
    private val api: ApiGateway,
    private val storeKey: String,
    private val drafts: DraftStore = NoDraftStore,
    private val windowMs: Long = WINDOW_MS,
    private val now: () -> Long = System::currentTimeMillis,
    private val onSent: (DeferredRequest, Any?) -> Unit = { _, _ -> },
    /** [kept] is true when the action stays stored for a retry, false when the server rejected it for good. */
    private val onFailed: (DeferredRequest, Exception, kept: Boolean) -> Unit = { _, _, _ -> },
    /** Actions dropped because their tap is older than [MAX_AGE_MS]. */
    private val onExpired: (List<DeferredRequest>) -> Unit = {},
    /**
     * On 409 `version_conflicto` the owner re-reads the subject: a new body (fresh version) is sent once more under a NEW
     * idempotency key (a key never carries two bodies); null means the action no longer applies and it is dropped.
     */
    private val rebase: suspend (DeferredRequest) -> JSONObject? = { null },
    /** Every action still inside its window, in tap order (one per subject). */
    private val onChange: (List<PendingUndo>) -> Unit,
) {
    private var userId: String? = null
    private var items: List<DeferredRequest> = emptyList()
    private val timers = mutableMapOf<String, Job>()
    private val sending = Mutex()

    /** The latest action still inside its window (the one "Deshacer" cancels). */
    val pending: PendingUndo? get() = items.lastOrNull { it.id in timers }?.let { PendingUndo(it.key, it.label) }

    /** Every action inside its window, in tap order. */
    val pendingAll: List<PendingUndo> get() = items.filter { it.id in timers }.map { PendingUndo(it.key, it.label) }

    /** Stored actions whose window ended and whose last send failed. */
    val failed: List<DeferredRequest> get() = items.filter { it.error != null && it.id !in timers }

    /** Every stored action, in tap order. */
    val stored: List<DeferredRequest> get() = items

    /** Signed-in user: loads what that account left stored (a killed app, a sign-out) and sends what is due. */
    fun bind(user: String) {
        if (userId == user) return
        // Another account on this device: nothing of the previous one stays in memory (its own store keeps it).
        val previous = userId
        if (previous != null) { timers.values.forEach { it.cancel() }; timers.clear(); items = emptyList() }
        userId = user
        val restored = drafts.load(user, storeKey)?.optJSONArray("items")?.let { a -> (0 until a.length()).mapNotNull { a.optJSONObject(it)?.let(DeferredRequest::fromJson) } }.orEmpty()
        items = (items + restored).distinctBy { it.id }.sortedBy { it.tappedAt }
        save()
        resume()
    }

    fun start(key: String, label: String, path: String, body: JSONObject) {
        // Only a waiting action on the same subject is sent first; other subjects keep their own undo.
        if (endWindows(key)) drain()
        val tap = now()
        val item = DeferredRequest(UUID.randomUUID().toString(), key, label, path, body.toString(), tap, tap + windowMs)
        items = items + item
        save()
        schedule(item, windowMs)
        notifyChange()
    }

    /** Cancels the action in its window; true when there was one (nothing reached the server). */
    fun undo(key: String? = null): Boolean {
        val item = items.lastOrNull { it.id in timers && (key == null || it.key == key) } ?: return false
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
        val expired = items.filter { it.id !in timers && it.tappedAt < t - MAX_AGE_MS }
        if (expired.isNotEmpty()) { items = items - expired.toSet(); save(); onExpired(expired) }
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

    /**
     * Ends the window of [key] (every subject when null) and waits until the stored actions got their answer, so another
     * request on that subject is sent only after the waiting one (and never overtakes it). Other subjects keep their undo.
     */
    suspend fun settle(key: String? = null) {
        endWindows(key)
        drainNow()
    }

    private fun endWindows(key: String?): Boolean {
        val ending = items.filter { it.id in timers && (key == null || it.key == key) }
        if (ending.isEmpty()) return false
        ending.forEach { timers.remove(it.id)?.cancel() }
        notifyChange()
        return true
    }

    private fun drain() { scope.launch { drainNow() } }

    /** Sends in tap order. A kept failure holds back the later ones on the same subject; no signal stops all. */
    private suspend fun drainNow() {
            sending.withLock {
                val held = mutableSetOf<String>()
                for (queued in items.filter { it.id !in timers }) {
                    if (queued.key in held || items.none { it.id == queued.id } || queued.id in timers) continue
                    var item = queued
                    var rebased = false
                    while (true) try {
                        // Exact replay: the body stored at the tap, with the key stored at the tap.
                        val result = withContext(RequestIntent(item.id)) { api.request(item.path, "POST", JSONObject(item.body)) }
                        remove(item.id)
                        onSent(item, result)
                        break
                    } catch (e: CancellationException) { throw e }
                    catch (e: Exception) {
                        if (!rebased && (e as? AuthRequestException)?.code == "version_conflicto") {
                            val fresh = try { rebase(item) } catch (c: CancellationException) { throw c } catch (_: Exception) { null }
                            if (fresh != null) {
                                // New body, new key: the stored entry is replaced, never resent under the old key.
                                val next = item.copy(id = UUID.randomUUID().toString(), body = fresh.toString(), error = null)
                                items = items.map { if (it.id == item.id) next else it }
                                save()
                                item = next; rebased = true
                                continue
                            }
                        }
                        if (definitive(e)) {
                            remove(item.id)
                            onFailed(item, e, false)
                            break
                        }
                        items = items.map { if (it.id == item.id) it.copy(error = userMessage(e, "No se pudo enviar.")) else it }
                        save()
                        held += item.key
                        onFailed(item, e, true)
                        if (e is AuthRequestException && e.statusCode == null) return@withLock
                        break
                    }
                }
            }
    }

    /** A 4xx the same request will always get (invalid transition, key conflict, not found, forbidden, validation). */
    private fun definitive(e: Exception): Boolean {
        val status = (e as? AuthRequestException)?.statusCode ?: return false
        return status in 400..499 && status !in setOf(401, 408, 429)
    }

    private fun remove(id: String) {
        items = items.filterNot { it.id == id }
        save()
        notifyChange()
    }

    private fun notifyChange() = onChange(pendingAll)

    private fun save() {
        val user = userId ?: return
        if (items.isEmpty()) drafts.clear(user, storeKey)
        else drafts.save(user, storeKey, JSONObject().put("items", JSONArray().apply { items.forEach { put(it.toJson()) } }))
    }

    companion object {
        const val WINDOW_MS = 8_000L
        /** 24 h from the tap, like the other pending writes (`SessionDrafts.PENDING_WRITES_TTL_MS`). */
        const val MAX_AGE_MS = 24 * 3_600_000L
    }
}
