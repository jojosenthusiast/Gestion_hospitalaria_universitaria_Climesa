package sv.edu.catolica.climesa.data

import java.io.ByteArrayOutputStream
import java.util.UUID

/** multipart/form-data with a single file part, for `POST /laboratorio/adjuntos/{id}/archivo` (field `archivo`). */
object Multipart {
    fun boundary(): String = "climesa-" + UUID.randomUUID().toString().replace("-", "")

    fun contentType(boundary: String) = "multipart/form-data; boundary=$boundary"

    /** Quotes, backslashes and line breaks in [fileName] would break the part header, so they become `_`. */
    fun body(boundary: String, field: String, fileName: String, mimeType: String, bytes: ByteArray): ByteArray {
        val safeName = fileName.replace(Regex("[\"\\\r\n]"), "_")
        val out = ByteArrayOutputStream(bytes.size + 256)
        out.write("--$boundary\r\nContent-Disposition: form-data; name=\"$field\"; filename=\"$safeName\"\r\nContent-Type: $mimeType\r\n\r\n".toByteArray(Charsets.UTF_8))
        out.write(bytes)
        out.write("\r\n--$boundary--\r\n".toByteArray(Charsets.UTF_8))
        return out.toByteArray()
    }
}

/** Port to read a document the person picked (a `content://` uri), so ViewModels stay testable on the JVM. */
fun interface DocumentReader {
    /** The bytes of [uri]; throws [sv.edu.catolica.climesa.domain.LabAttachmentRules.FileTooLarge] past [maxBytes]. */
    suspend fun read(uri: String, maxBytes: Long): ByteArray
}
