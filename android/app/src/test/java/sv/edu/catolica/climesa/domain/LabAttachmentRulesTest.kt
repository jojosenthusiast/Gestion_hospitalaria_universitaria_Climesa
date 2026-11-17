package sv.edu.catolica.climesa.domain

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * T07c (S10): attachments of an external lab result. Field names are the SQL aliases of `laboratory.service.ts`
 * (`fileName, mimeType, sizeBytes, sha256, stored, note, uploadedAt, uploadedByName`) and `LabAttachmentLinkResponse`.
 */
class LabAttachmentRulesTest {
    private fun row(id: String, stored: Boolean, mime: String = "application/pdf", size: Any = 1_572_864) = JSONObject()
        .put("id", id).put("fileName", "informe-$id.pdf").put("mimeType", mime).put("sizeBytes", size).put("sha256", "ab".repeat(32))
        .put("stored", stored).put("note", if (id == "a") "Traído por el paciente" else JSONObject.NULL)
        .put("uploadedAt", "2026-11-16T12:00:00.000Z").put("uploadedByName", if (id == "a") "Ana Pérez" else JSONObject.NULL)

    @Test fun readsTheAttachmentsOfTheOrderDetail() {
        val files = LabAttachmentRules.parseDetail(JSONObject().put("id", "o1").put("attachments", JSONArray().put(row("a", true)).put(row("b", false, "image/jpeg", "2048"))))
        assertEquals(2, files.size)
        val (a, b) = files
        assertEquals("a", a.id); assertEquals("informe-a.pdf", a.fileName); assertEquals("application/pdf", a.mimeType)
        assertEquals(1_572_864L, a.sizeBytes); assertTrue(a.stored); assertEquals("Traído por el paciente", a.note)
        assertEquals("2026-11-16T12:00:00.000Z", a.uploadedAt); assertEquals("Ana Pérez", a.uploadedByName)
        assertFalse(b.stored); assertNull(b.note); assertNull(b.uploadedByName); assertEquals(2048L, b.sizeBytes)
    }

    @Test fun aDetailWithoutAttachmentsIsEmpty() {
        assertTrue(LabAttachmentRules.parseDetail(JSONObject().put("id", "o1")).isEmpty())
        assertTrue(LabAttachmentRules.parseDetail(JSONArray()).isEmpty())
    }

    @Test fun kindAndSizeAreWordedLikeTheWeb() {
        assertEquals("PDF", LabAttachmentRules.kindLabel("application/pdf"))
        assertEquals("Foto", LabAttachmentRules.kindLabel("image/heic"))
        assertEquals("1 KB", LabAttachmentRules.sizeText(300))
        assertEquals("200 KB", LabAttachmentRules.sizeText(204_800))
        assertEquals("1,5 MB", LabAttachmentRules.sizeText(1_572_864))
    }

    @Test fun onlyHttpAndHttpsLinksWithAHostAreOpened() {
        assertEquals("https://x.supabase.co/storage/v1/object/sign/a.pdf?token=t", LabAttachmentRules.openableUrl("https://x.supabase.co/storage/v1/object/sign/a.pdf?token=t"))
        assertEquals("http://10.0.2.2:54321/a.pdf", LabAttachmentRules.openableUrl("http://10.0.2.2:54321/a.pdf"))
        assertEquals("HTTPS://x.test/a", LabAttachmentRules.openableUrl("HTTPS://x.test/a"))
        assertNull(LabAttachmentRules.openableUrl("javascript:alert(1)"))
        assertNull(LabAttachmentRules.openableUrl("file:///sdcard/a.pdf"))
        assertNull(LabAttachmentRules.openableUrl("content://media/a"))
        assertNull(LabAttachmentRules.openableUrl("intent://x#Intent;end"))
        assertNull(LabAttachmentRules.openableUrl("https:///nohost"))
        assertNull(LabAttachmentRules.openableUrl("no es un enlace"))
        assertNull(LabAttachmentRules.openableUrl(""))
    }

    @Test fun readsTheSignedLinkAndTheNewAttachmentId() {
        val link = JSONObject().put("url", "https://x.test/a.pdf").put("expiresAt", "2026-11-16T12:05:00.000Z").put("expiresInSeconds", 300)
            .put("fileName", "a.pdf").put("mimeType", "application/pdf").put("sizeBytes", 10)
        assertEquals("https://x.test/a.pdf", LabAttachmentRules.linkUrl(link))
        assertNull(LabAttachmentRules.linkUrl(JSONObject()))
        assertEquals("f1", LabAttachmentRules.attachmentIdOf(JSONObject().put("id", "o1").put("attachmentId", "f1")))
        assertNull(LabAttachmentRules.attachmentIdOf(JSONObject().put("id", "o1")))
    }

    @Test fun pathsAreTheLinkAndFileEndpoints() {
        assertEquals("/laboratorio/adjuntos/f1/enlace", LabAttachmentRules.linkPath("f1"))
        assertEquals("/laboratorio/adjuntos/f1/archivo", LabAttachmentRules.filePath("f1"))
        assertEquals("/laboratorio/ordenes/o1", LabAttachmentRules.detailPath("o1"))
        assertEquals("archivo", LabAttachmentRules.UPLOAD_FIELD)
    }

    @Test fun errorCodesMapToSpanish() {
        assertEquals("Solo hay la referencia del archivo: no se guardó en el sistema.", LabAttachmentRules.linkMessage("adjunto_sin_archivo", 409))
        assertEquals("No encontramos este archivo. Vuelve a cargar la orden.", LabAttachmentRules.linkMessage("no_encontrado", 404))
        assertEquals("Tu cuenta no puede abrir este archivo.", LabAttachmentRules.linkMessage(null, 403))
        assertNull(LabAttachmentRules.linkMessage(null, 500))
        assertEquals("El archivo no es un PDF ni una foto JPG, PNG, HEIC o WEBP.", LabAttachmentRules.uploadMessage("adjunto_tipo_invalido"))
        assertEquals("El archivo pasa de 10 MB; toma una foto más liviana o comprime el PDF.", LabAttachmentRules.uploadMessage("adjunto_muy_grande"))
        assertEquals("Este adjunto ya tiene su archivo guardado; no se reemplaza.", LabAttachmentRules.uploadMessage("adjunto_ya_almacenado"))
        assertEquals("El archivo no coincide con el que se adjuntó al resultado; sube el mismo archivo.", LabAttachmentRules.uploadMessage("adjunto_no_coincide"))
        assertNull(LabAttachmentRules.uploadMessage("validacion"))
    }

    @Test fun theSizeIsCheckedBeforeSendingAndTheFileMustStillBeReadable() {
        val ok = LabAttachment("a.pdf", "application/pdf", 1024, uri = "content://a")
        assertNull(LabAttachmentRules.uploadProblem(ok))
        assertEquals("El archivo pasa de 10 MB; toma una foto más liviana o comprime el PDF.", LabAttachmentRules.uploadProblem(ok.copy(sizeBytes = 10L * 1024 * 1024 + 1)))
        assertNull(LabAttachmentRules.uploadProblem(ok.copy(sizeBytes = 10L * 1024 * 1024)))
        assertEquals("El informe debe ser PDF o una foto (JPG, PNG, HEIC o WEBP).", LabAttachmentRules.uploadProblem(ok.copy(mimeType = "text/plain")))
        assertEquals("No se pudo leer el archivo en este equipo. Elígelo de nuevo.", LabAttachmentRules.uploadProblem(ok.copy(uri = null)))
        assertEquals("Adjunta la foto o el PDF del informe externo.", LabAttachmentRules.uploadProblem(null))
    }
}
