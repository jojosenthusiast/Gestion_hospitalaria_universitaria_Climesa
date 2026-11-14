package sv.edu.catolica.climesa.data

import java.util.UUID
import kotlin.coroutines.AbstractCoroutineContextElement
import kotlin.coroutines.CoroutineContext
import kotlinx.coroutines.withContext

/** Idempotency key of one user intent, carried in the coroutine context down to [ApiClient]. */
class RequestIntent(val idempotencyKey: String) : AbstractCoroutineContextElement(RequestIntent) {
    companion object Key : CoroutineContext.Key<RequestIntent>
}

/**
 * One user intent: one form or dialog submission. The key is created on the first attempt and reused on every retry
 * of that same intent, even if the user corrects the form between attempts (the API rolls back failed attempts, so
 * the key is free again). It is released only when the API confirms the operation; the next intent gets a new key.
 * If the API answers `idempotencia_conflicto` (the key already completed with other data), the intent also ends.
 */
class SubmissionIntent(private val newKey: () -> String = { UUID.randomUUID().toString() }) {
    private var key: String? = null

    /** Key of the intent in progress, or null when no submission is pending. */
    val pendingKey: String? @Synchronized get() = key

    @Synchronized fun key(): String = key ?: newKey().also { key = it }

    /** Forget the pending intent, for example when the user closes the form without sending it. */
    @Synchronized fun reset() { key = null }

    suspend fun <T> send(block: suspend () -> T): T {
        val result = try {
            withContext(RequestIntent(key())) { block() }
        } catch (error: AuthRequestException) {
            if (error.code == "idempotencia_conflicto") reset()
            throw error
        }
        reset()
        return result
    }
}

/**
 * Fallback for writes sent without a [SubmissionIntent]: the same request (method, path and body) is the same intent
 * while it has no definitive answer. A 2xx or a definitive 4xx closes it; a network error, 5xx, 408, 425 or 429 keeps
 * the key for the retry. The map is bounded so it never grows without limit.
 */
class IdempotencyKeys(
    private val capacity: Int = 64,
    private val newKey: () -> String = { UUID.randomUUID().toString() },
) {
    private val keys = object : LinkedHashMap<String, String>(16, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, String>?) = size > capacity
    }

    @Synchronized fun keyFor(signature: String): String = keys.getOrPut(signature, newKey)

    /** [status] is null when the request never got an HTTP answer. */
    @Synchronized fun settle(signature: String, status: Int?) {
        if (status != null && status in 200..499 && status !in RETRYABLE) keys.remove(signature)
    }

    @Synchronized fun size() = keys.size

    private companion object { val RETRYABLE = setOf(408, 425, 429) }
}
