package sv.edu.catolica.climesa.data

import android.content.Context
import android.net.Uri
import java.io.ByteArrayOutputStream
import java.io.FileNotFoundException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import sv.edu.catolica.climesa.domain.LabAttachmentRules

/** Reads a picked document through the content resolver, stopping as soon as it passes the limit. */
class ContentDocumentReader(private val context: Context) : DocumentReader {
    override suspend fun read(uri: String, maxBytes: Long): ByteArray = withContext(Dispatchers.IO) {
        val input = context.contentResolver.openInputStream(Uri.parse(uri)) ?: throw FileNotFoundException(uri)
        input.use {
            val out = ByteArrayOutputStream()
            val buffer = ByteArray(64 * 1024)
            while (true) {
                val n = it.read(buffer)
                if (n < 0) break
                out.write(buffer, 0, n)
                if (out.size() > maxBytes) throw LabAttachmentRules.FileTooLarge()
            }
            out.toByteArray()
        }
    }
}
