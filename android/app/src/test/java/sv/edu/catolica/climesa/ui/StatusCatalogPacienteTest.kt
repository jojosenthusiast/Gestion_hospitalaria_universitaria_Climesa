package sv.edu.catolica.climesa.ui

import org.junit.Assert.assertEquals
import org.junit.Test

class StatusCatalogPacienteTest {
    @Test fun `appointment states keep the patient Spanish copy`() {
        assertEquals("Solicitud pendiente", StatusCatalogPaciente.label("solicitada"))
        assertEquals("No asistió", StatusCatalogPaciente.label("no_asistio"))
    }

    @Test fun `unknown appointment states show the raw code`() {
        assertEquals("estado_raro", StatusCatalogPaciente.label("estado_raro"))
        assertEquals(StatusTone.NEUTRAL, StatusCatalogPaciente.tone("estado_raro"))
    }

    @Test fun `cancelled and rejected appointments use the danger tone`() {
        assertEquals(StatusTone.DANGER, StatusCatalogPaciente.tone("cancelada"))
        assertEquals(StatusTone.DANGER, StatusCatalogPaciente.tone("rechazada"))
        assertEquals(StatusTone.SUCCESS, StatusCatalogPaciente.tone("confirmada"))
    }
}
