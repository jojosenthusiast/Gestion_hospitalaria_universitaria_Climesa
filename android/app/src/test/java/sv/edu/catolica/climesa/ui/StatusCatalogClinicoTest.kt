package sv.edu.catolica.climesa.ui

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class StatusCatalogClinicoTest {
    @Test fun `clinical codes have their own tone`() {
        assertEquals(StatusTone.DANGER, StatusCatalogClinico.tone("urgente"))
        assertEquals(StatusTone.WARNING, StatusCatalogClinico.tone("en_revision"))
        assertEquals(StatusTone.NEUTRAL, StatusCatalogClinico.tone("sin_iniciar"))
    }

    @Test fun `codes of the shared catalog are not redefined`() {
        assertNull(StatusCatalogClinico.tone("firmada"))
        assertNull(StatusCatalogClinico.tone("en_proceso"))
    }

    @Test fun `result marks follow the web colours`() {
        assertEquals(StatusTone.SUCCESS, StatusCatalogClinico.markTone("normal"))
        assertEquals(StatusTone.WARNING, StatusCatalogClinico.markTone("alto"))
        assertEquals(StatusTone.DANGER, StatusCatalogClinico.markTone("critico_bajo"))
        assertEquals(StatusTone.NEUTRAL, StatusCatalogClinico.markTone("sin_rango"))
    }
}
