package sv.edu.catolica.climesa.data

import org.junit.Assert.assertEquals
import org.junit.Test

class ApiClientTest {
    @Test fun elMensajeDeErrorMuestraSoloElServidor() {
        assertEquals("sghu-api.onrender.com", apiHostLabel("https://sghu-api.onrender.com/api/v1"))
        assertEquals("10.0.2.2", apiHostLabel("http://10.0.2.2:3000/api/v1"))
    }

    @Test fun unaDireccionVaciaNoRompeElMensaje() {
        assertEquals("", apiHostLabel(""))
        assertEquals("sin-formato", apiHostLabel("sin-formato"))
    }
}
