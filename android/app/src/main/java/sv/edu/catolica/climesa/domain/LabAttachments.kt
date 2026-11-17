package sv.edu.catolica.climesa.domain

import java.net.URI
import java.util.Locale
import org.json.JSONObject

/**
 * `LabAttachmentResponse` (T07b, S10): the photo or PDF of an external result. With [stored] false only the reference exists
 * (name, type, size and fingerprint); the file itself is not in the private clinical storage.
 */
data class LabFile(
    val id: String, val fileName: String, val mimeType: String, val sizeBytes: Long, val stored: Boolean,
    val note: String?, val uploadedAt: String?, val uploadedByName: String?,
)

/**
 * T07c (S10): attachments of an external lab result on Android, mirror of `web/src/lib/lab-attachments.ts` and the
 * `ExternalReport` of `laboratory.tsx`. The phone never talks to the bucket: it uploads through the API and opens a
 * 5-minute signed link the API hands out on every tap (and audits). The patient never sees attachments.
 */
object LabAttachmentRules {
    const val UPLOAD_FIELD = "archivo"

    /** The signed link is not an http(s) address the system can open. */
    class UnopenableLink : Exception("No se pudo abrir el archivo en este equipo. Vuelve a intentar.")

    /** The document grew past 10 MiB between picking and sending (checked again while reading it). */
    class FileTooLarge : Exception(TOO_LARGE)

    private const val TOO_LARGE = "El archivo pasa de 10 MB; toma una foto más liviana o comprime el PDF."
    const val UNREADABLE = "No se pudo leer el archivo en este equipo. Elígelo de nuevo."

    fun detailPath(orderId: String) = "/laboratorio/ordenes/$orderId"
    fun linkPath(attachmentId: String) = "/laboratorio/adjuntos/$attachmentId/enlace"
    fun filePath(attachmentId: String) = "/laboratorio/adjuntos/$attachmentId/archivo"

    /** `attachments` of `GET /laboratorio/ordenes/{id}`; empty for whoever does not see values and on an older server. */
    fun parseDetail(value: Any?): List<LabFile> {
        val rows = (value as? JSONObject)?.optJSONArray("attachments") ?: return emptyList()
        return (0 until rows.length()).mapNotNull { i ->
            rows.optJSONObject(i)?.let { r ->
                LabFile(
                    r.optString("id"), r.optString("fileName").ifBlank { "informe" }, r.optString("mimeType"), r.optLong("sizeBytes", 0), r.optBoolean("stored", false),
                    text(r, "note"), text(r, "uploadedAt"), text(r, "uploadedByName"),
                )
            }
        }.filter { it.id.isNotBlank() }
    }

    /** `url` of `LabAttachmentLinkResponse`; null when missing. Never stored. */
    fun linkUrl(value: Any?): String? = (value as? JSONObject)?.let { text(it, "url") }

    /** `attachmentId` of the external-result answer: the reference the file is uploaded to. */
    fun attachmentIdOf(value: Any?): String? = (value as? JSONObject)?.let { text(it, "attachmentId") }

    /** The signed link only if it is http(s) with a host; any other scheme (file, content, intent, javascript) is not opened. */
    fun openableUrl(url: String?): String? {
        val uri = runCatching { URI(url?.trim().orEmpty()) }.getOrNull() ?: return null
        val scheme = uri.scheme?.lowercase(Locale.ROOT) ?: return null
        if (scheme != "https" && scheme != "http") return null
        if (uri.host.isNullOrBlank()) return null
        return url
    }

    /** "PDF" or "Foto", as the web. */
    fun kindLabel(mimeType: String) = if (mimeType == "application/pdf") "PDF" else "Foto"

    /** Same wording as the web `formatBytes`: "200 KB", "1,5 MB". */
    fun sizeText(bytes: Long): String =
        if (bytes < 1024 * 1024) "${maxOf(1L, Math.round(bytes / 1024.0))} KB"
        else String.format(Locale.US, "%.1f", bytes / (1024.0 * 1024.0)).replace('.', ',') + " MB"

    /** Checked before sending: a readable PDF or photo of at most 10 MiB. The API checks the content again (magic bytes). */
    fun uploadProblem(file: LabAttachment?): String? =
        LabExternalRules.attachmentError(file) ?: if (file?.uri.isNullOrBlank()) UNREADABLE else null

    /** Spanish text for a failed signed link; null to fall back to the generic message. */
    fun linkMessage(code: String?, status: Int?): String? = when {
        code == "adjunto_sin_archivo" -> "Solo hay la referencia del archivo: no se guardó en el sistema."
        status == 404 -> "No encontramos este archivo. Vuelve a cargar la orden."
        status == 403 -> "Tu cuenta no puede abrir este archivo."
        else -> null
    }

    /** Spanish text for a failed upload code; null to fall back to the generic message. */
    fun uploadMessage(code: String?): String? = when (code) {
        "adjunto_tipo_invalido" -> "El archivo no es un PDF ni una foto JPG, PNG, HEIC o WEBP."
        "adjunto_muy_grande" -> TOO_LARGE
        "adjunto_ya_almacenado" -> "Este adjunto ya tiene su archivo guardado; no se reemplaza."
        "adjunto_no_coincide" -> "El archivo no coincide con el que se adjuntó al resultado; sube el mismo archivo."
        else -> null
    }

    private fun text(r: JSONObject, key: String) = if (r.isNull(key)) null else r.optString(key).takeIf { it.isNotBlank() }
}
