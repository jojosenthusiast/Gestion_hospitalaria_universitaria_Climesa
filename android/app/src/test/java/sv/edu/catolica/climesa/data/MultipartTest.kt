package sv.edu.catolica.climesa.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** The lab attachment upload (`POST /laboratorio/adjuntos/{id}/archivo`) is multipart/form-data with one file part. */
class MultipartTest {
    @Test fun buildsOneFilePartWithItsNameAndType() {
        val body = Multipart.body("XyZ", "archivo", "informe.pdf", "application/pdf", byteArrayOf(1, 2, 3))
        val head = "--XyZ\r\nContent-Disposition: form-data; name=\"archivo\"; filename=\"informe.pdf\"\r\nContent-Type: application/pdf\r\n\r\n"
        val tail = "\r\n--XyZ--\r\n"
        assertEquals(head.length + 3 + tail.length, body.size)
        assertEquals(head, String(body, 0, head.length, Charsets.UTF_8))
        assertEquals(listOf<Byte>(1, 2, 3), body.copyOfRange(head.length, head.length + 3).toList())
        assertEquals(tail, String(body, head.length + 3, tail.length, Charsets.UTF_8))
        assertEquals("multipart/form-data; boundary=XyZ", Multipart.contentType("XyZ"))
    }

    @Test fun quotesAndLineBreaksInTheFileNameCannotBreakTheHeader() {
        val text = String(Multipart.body("b", "archivo", "a\"b\r\nc.pdf", "application/pdf", byteArrayOf()), Charsets.UTF_8)
        assertTrue(text.contains("filename=\"a_b__c.pdf\""))
    }

    @Test fun eachBoundaryIsFresh() {
        assertTrue(Multipart.boundary() != Multipart.boundary())
        assertTrue(Multipart.boundary().matches(Regex("[A-Za-z0-9-]{20,70}")))
    }
}
