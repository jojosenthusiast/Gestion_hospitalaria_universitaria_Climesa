package sv.edu.catolica.climesa.ui

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class IdentityTest {
    @Test fun cadaRolTieneIconoYColorPropios() {
        assertEquals(10, IdentityCatalog.roleCodes.size)
        assertEquals(10, IdentityCatalog.roleCodes.map { IdentityCatalog.role(it).tone }.toSet().size)
        assertTrue(IdentityCatalog.roleCodes.all { IdentityCatalog.role(it).label.length > 2 })
    }

    @Test fun aceptaElTipoDePersonalDeLaApiYUnValorDesconocidoNoRompe() {
        assertEquals("MED", IdentityCatalog.role("medico").key)
        assertEquals("Enfermería", IdentityCatalog.role("enfermero").label)
        assertEquals("nueva_funcion", IdentityCatalog.role("nueva_funcion").label)
        assertEquals("otro", IdentityCatalog.role(null).key)
    }

    @Test fun elAreaSeReconocePorNombreSinTildesYSinoPorTipo() {
        assertEquals("emergencia", IdentityCatalog.area("Emergencia").key)
        assertEquals("hospitalizacion", IdentityCatalog.area("Hospitalización", "planta").key)
        assertEquals("planta", IdentityCatalog.area("Planta 2", "planta").key)
        assertEquals("area", IdentityCatalog.area("Sin pista").key)
    }
}
