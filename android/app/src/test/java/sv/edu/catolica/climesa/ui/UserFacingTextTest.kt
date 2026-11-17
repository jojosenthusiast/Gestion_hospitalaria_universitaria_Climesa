package sv.edu.catolica.climesa.ui

import org.json.JSONException
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import sv.edu.catolica.climesa.data.AuthRequestException
import sv.edu.catolica.climesa.data.NetworkMessages
import java.io.File

/** R3 A-20, A-21, A-22: no technical or English text reaches a screen, and the network message fits what the person did. */
class UserFacingTextTest {
    private val fallback = "No se pudo cargar la información."

    @Test fun `parser and runtime errors become the Spanish fallback`() {
        listOf(
            JSONException("No value for patientName"),
            JSONException("Value <html> of type java.lang.String cannot be converted to JSONObject"),
            IllegalStateException("Expected BEGIN_OBJECT but was STRING at line 1"),
            java.net.SocketTimeoutException("timeout"),
            NullPointerException(),
            RuntimeException("Unable to resolve host \"api\": No address associated with hostname"),
        ).forEach { assertEquals(it.toString(), fallback, userMessage(it, fallback)) }
    }

    @Test fun `a Spanish business message is kept`() {
        assertEquals("La cama ya no está libre.", userMessage(AuthRequestException("La cama ya no está libre.", 409), fallback))
        assertEquals(NetworkMessages.READ, userMessage(AuthRequestException(NetworkMessages.READ), fallback))
    }

    @Test fun `a read failure never talks about a form`() {
        assertEquals("No se pudo cargar. Revisa tu conexión.", NetworkMessages.forMethod("GET"))
        assertTrue(!NetworkMessages.forMethod("GET").contains("formulario"))
        listOf("POST", "PATCH", "PUT", "DELETE").forEach {
            assertEquals(it, "Sin conexión. Conservamos el formulario; vuelve a intentar.", NetworkMessages.forMethod(it))
        }
        assertTrue(!NetworkMessages.UNAVAILABLE.contains("API"))
    }

    /** Lint-like guard: a screen or view model never shows `e.message ?: …` directly; it goes through `userMessage()`. */
    @Test fun `no screen shows a raw exception message`() {
        val root = listOf(File("src/main/java"), File("app/src/main/java"), File("android/app/src/main/java")).first { it.isDirectory }
        val raw = Regex("""\be\.message\s*\?:""")
        val offenders = root.walkTopDown().filter { it.isFile && it.extension == "kt" && it.path.replace('\\', '/').contains("/ui/") }
            .flatMap { file -> file.readLines().mapIndexedNotNull { i, line -> if (raw.containsMatchIn(line)) "${file.name}:${i + 1}" else null } }
            .toList()
        assertEquals(emptyList<String>(), offenders)
    }
}
