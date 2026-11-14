package sv.edu.catolica.climesa.data

import android.content.Context
import java.io.File
import org.json.JSONObject

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
    /** Keeps only [userId]'s drafts: a device shared by two accounts never shows one the other's notes. */
    fun retainOnly(userId: String)
    fun clearAll()
}

/** Never stores anything; the default for ViewModels built without a store (JVM tests, previews). */
object NoDraftStore : DraftStore {
    override fun save(userId: String, key: String, value: JSONObject) = false
    override fun load(userId: String, key: String): JSONObject? = null
    override fun clear(userId: String, key: String) = Unit
    override fun retainOnly(userId: String) = Unit
    override fun clearAll() = Unit
}

/**
 * One JSON file per draft under `[root]/<user>/<key>.json`, in app-private storage excluded from backups
 * ([of] uses `noBackupFilesDir`). Names are reduced to safe characters so a key never leaves its user folder.
 */
class FileDraftStore(private val root: File) : DraftStore {
    private fun safe(value: String) = value.map { if (it.isLetterOrDigit() || it == '-' || it == '_') it else '_' }.joinToString("").ifBlank { "_" }
    private fun folder(userId: String) = File(root, safe(userId))
    private fun file(userId: String, key: String) = File(folder(userId), safe(key) + ".json")

    @Synchronized override fun save(userId: String, key: String, value: JSONObject): Boolean = runCatching {
        val target = file(userId, key)
        target.parentFile?.mkdirs()
        val temp = File(target.parentFile, target.name + ".tmp")
        temp.writeText(value.toString(), Charsets.UTF_8)
        if (!temp.renameTo(target)) { target.delete(); check(temp.renameTo(target)) }
        true
    }.getOrDefault(false)

    @Synchronized override fun load(userId: String, key: String): JSONObject? = runCatching {
        file(userId, key).takeIf { it.isFile }?.readText(Charsets.UTF_8)?.let(::JSONObject)
    }.getOrNull()

    @Synchronized override fun clear(userId: String, key: String) { runCatching { file(userId, key).delete() } }

    @Synchronized override fun retainOnly(userId: String) {
        val keep = safe(userId)
        runCatching { root.listFiles()?.filter { it.name != keep }?.forEach { it.deleteRecursively() } }
    }

    @Synchronized override fun clearAll() { runCatching { root.listFiles()?.forEach { it.deleteRecursively() } } }

    companion object {
        fun of(context: Context) = FileDraftStore(File(context.noBackupFilesDir, "borradores"))
    }
}
