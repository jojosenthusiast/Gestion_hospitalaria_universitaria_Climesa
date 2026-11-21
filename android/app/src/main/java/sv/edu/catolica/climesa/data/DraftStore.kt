package sv.edu.catolica.climesa.data

import android.content.Context
import java.io.File
import org.json.JSONObject
import sv.edu.catolica.climesa.domain.FormDrafts

/**
 * Local drafts of long forms not yet saved in the API (consultation, vital signs, prehospital report, admission
 * intake). A draft belongs to one signed-in user and one record; it survives leaving the screen, closing the app and
 * process death, and is removed on a successful save, on sign-out and when another account signs in on the device.
 */
interface DraftStore {
    /** False when the device refused to store it (full disk, I/O error). */
    fun save(userId: String, key: String, value: JSONObject): Boolean
    fun load(userId: String, key: String): JSONObject?
    fun clear(userId: String, key: String)
    /** Keeps only [userId]'s drafts (plus every account's [keep] keys): a shared device never shows one account another's notes. */
    fun retainOnly(userId: String, keep: Set<String> = emptySet())
    /** Drops every draft except the [keep] keys of each account. */
    fun clearAll(keep: Set<String> = emptySet())
    /** Drops the [keys] of every account last written before [before] (epoch millis). */
    fun expire(keys: Set<String>, before: Long)
}

/**
 * Drops drafts when the session changes: every draft when it ends (manual sign-out, the 5-minute inactivity
 * sign-out in `MainActivity`, or an expired session) and every other account's drafts when one signs in.
 * Pending writes ([PENDING_WRITES]: the paramedic's offline milestone and prehospital queues and the provisional patient)
 * are not drafts: they stay in their owner's folder, are only read by that account and are sent when it signs in again.
 * Those with clinical data ([EXPIRING]) live at most [PENDING_WRITES_TTL_MS] after their last write: older ones are purged on
 * app start and on any sign-in (the API no longer accepts a milestone older than that either).
 */
class SessionDrafts(private val drafts: DraftStore, private val now: () -> Long = System::currentTimeMillis) {
    fun appStarted() = purgeStale()
    fun signedIn(userId: String) { purgeStale(); drafts.retainOnly(userId, PENDING_WRITES) }
    fun ended() = drafts.clearAll(PENDING_WRITES)
    private fun purgeStale() = drafts.expire(EXPIRING, now() - PENDING_WRITES_TTL_MS)
    /** True when [userId] still has milestones or a prehospital report waiting for signal (sign-out warns about it). */
    fun hasPendingWrites(userId: String) =
        (drafts.load(userId, FormDrafts.MILESTONE_QUEUE)?.optJSONArray("items")?.length() ?: 0) > 0 || drafts.load(userId, FormDrafts.PREHOSPITAL_QUEUE) != null ||
            listOf(FormDrafts.DEFERRED_NO_SHOW, FormDrafts.DEFERRED_ABSENCE).any { (drafts.load(userId, it)?.optJSONArray("items")?.length() ?: 0) > 0 }

    companion object {
        val PENDING_WRITES = setOf(FormDrafts.MILESTONE_QUEUE, FormDrafts.PREHOSPITAL_QUEUE, FormDrafts.PROVISIONAL_PATIENT, FormDrafts.DEFERRED_NO_SHOW, FormDrafts.DEFERRED_ABSENCE, ResultsSeen.KEY)
        /**
         * The pending writes that hold clinical data and expire. The "results seen" marker ([ResultsSeen]) survives
         * sign-out like a pending write but never expires; otherwise "Resultados nuevos" would come back after 24 h.
         */
        val EXPIRING = PENDING_WRITES - ResultsSeen.KEY
        /** 24 h, the API's `PREHOSPITAL_GRACE_MS`: after it the server rejects the milestone and the report is no longer received. */
        const val PENDING_WRITES_TTL_MS = 24 * 3_600_000L
    }
}

/** Never stores anything; the default for ViewModels built without a store (JVM tests, previews). */
object NoDraftStore : DraftStore {
    override fun save(userId: String, key: String, value: JSONObject) = false
    override fun load(userId: String, key: String): JSONObject? = null
    override fun clear(userId: String, key: String) = Unit
    override fun retainOnly(userId: String, keep: Set<String>) = Unit
    override fun clearAll(keep: Set<String>) = Unit
    override fun expire(keys: Set<String>, before: Long) = Unit
}

/**
 * One file per draft under `[root]/<user>/<key>.json`, in app-private storage excluded from backups
 * ([of] uses `noBackupFilesDir`). Names are reduced to safe characters so a key never leaves its user folder.
 * The JSON is sealed with [cipher] (AES-GCM with an Android Keystore key in the app): clinical text is never stored in clear.
 * A file written in clear before encryption is sealed on its first read; one that does not decrypt (tampered, or whose
 * key is gone) is deleted and reads as no draft.
 */
class FileDraftStore(
    private val root: File,
    private val cipher: PayloadCipher,
    /** Called after every successful save: a draft autosaved while typing counts as activity for the inactivity sign-out. */
    private val onWrite: () -> Unit = {},
) : DraftStore {
    private fun safe(value: String) = value.map { if (it.isLetterOrDigit() || it == '-' || it == '_') it else '_' }.joinToString("").ifBlank { "_" }
    private fun folder(userId: String) = File(root, safe(userId))
    private fun file(userId: String, key: String) = File(folder(userId), safe(key) + ".json")

    @Synchronized override fun save(userId: String, key: String, value: JSONObject): Boolean = runCatching {
        val target = file(userId, key)
        target.parentFile?.mkdirs()
        val temp = File(target.parentFile, target.name + ".tmp")
        temp.writeBytes(cipher.encrypt(value.toString().toByteArray(Charsets.UTF_8)))
        if (!temp.renameTo(target)) { target.delete(); check(temp.renameTo(target)) }
        true
    }.getOrDefault(false).also { if (it) runCatching(onWrite) }

    @Synchronized override fun load(userId: String, key: String): JSONObject? {
        val target = file(userId, key)
        if (!target.isFile) return null
        val bytes = runCatching { target.readBytes() }.getOrNull() ?: return null
        val failure = try {
            val plain = cipher.decrypt(bytes)
            // Decrypted but not JSON: the file is damaged beyond use.
            return runCatching { JSONObject(String(plain, Charsets.UTF_8)) }.getOrNull() ?: run { runCatching { target.delete() }; null }
        } catch (e: Exception) { e }
        // Written in clear by a version before encryption: seal it now so pending queues survive the update. A readable
        // draft is returned even if sealing it fails, and is never deleted.
        val legacy = runCatching { JSONObject(String(bytes, Charsets.UTF_8)) }.getOrNull()
        if (legacy != null) { save(userId, key, legacy); return legacy }
        // Only a payload that is provably not ours (tampered, sealed with a lost key, or too short to be sealed) is deleted.
        // A Keystore that is momentarily unavailable (KeyStoreException, ProviderException...) keeps the file for a later read.
        if (unreadable(failure)) runCatching { target.delete() }
        return null
    }

    private fun unreadable(e: Exception) = e is javax.crypto.AEADBadTagException || e is IllegalArgumentException

    @Synchronized override fun clear(userId: String, key: String) { runCatching { file(userId, key).delete() } }

    @Synchronized override fun retainOnly(userId: String, keep: Set<String>) {
        val own = safe(userId)
        runCatching { root.listFiles()?.filter { it.name != own }?.forEach { dropExcept(it, keep) } }
    }

    @Synchronized override fun clearAll(keep: Set<String>) { runCatching { root.listFiles()?.forEach { dropExcept(it, keep) } } }

    @Synchronized override fun expire(keys: Set<String>, before: Long) {
        val names = keys.map { safe(it) + ".json" }.toSet()
        runCatching {
            root.listFiles()?.filter { it.isDirectory }?.forEach { folder ->
                folder.listFiles()?.filter { it.name in names && it.lastModified() < before }?.forEach { it.delete() }
                if (folder.listFiles().isNullOrEmpty()) folder.delete()
            }
        }
    }

    /** Deletes a user folder except the files of the [keep] keys; the folder goes too when nothing is left. */
    private fun dropExcept(folder: File, keep: Set<String>) {
        val names = keep.map { safe(it) + ".json" }.toSet()
        if (!folder.isDirectory) { folder.deleteRecursively(); return }
        folder.listFiles()?.filter { it.name !in names }?.forEach { it.deleteRecursively() }
        if (folder.listFiles().isNullOrEmpty()) folder.delete()
    }

    companion object {
        private const val KEY_ALIAS = "climesa_drafts_v1"

        fun of(context: Context, onWrite: () -> Unit = {}) =
            FileDraftStore(File(context.noBackupFilesDir, "borradores"), AesGcmCipher { AndroidKeyStoreKeys.getOrCreate(KEY_ALIAS) }, onWrite)
    }
}
