package sv.edu.catolica.climesa.ui

import org.junit.Assert.assertEquals
import org.junit.Test

class StatusCatalogTest {
    @Test fun `known codes use the shared Spanish label`() {
        assertEquals("Pendiente de iniciar", StatusCatalog.label("publicado"))
        assertEquals("En mantenimiento", StatusCatalog.label("en_mantenimiento"))
        assertEquals("Crítico alto", StatusCatalog.label("critico_alto"))
    }

    @Test fun `unknown codes are readable instead of raw snake case`() {
        assertEquals("estado raro", StatusCatalog.label("estado_raro"))
        assertEquals(StatusTone.NEUTRAL, StatusCatalog.tone("estado_raro"))
    }

    @Test fun `tones follow the web status classes`() {
        assertEquals(StatusTone.SUCCESS, StatusCatalog.tone("libre"))
        assertEquals(StatusTone.PROCESS, StatusCatalog.tone("en_curso"))
        assertEquals(StatusTone.RESERVED, StatusCatalog.tone("pendiente"))
        assertEquals(StatusTone.WARNING, StatusCatalog.tone("limpieza"))
        assertEquals(StatusTone.BLOCKED, StatusCatalog.tone("inactivo"))
        assertEquals(StatusTone.DANGER, StatusCatalog.tone("cancelado"))
    }

    @Test fun `spacing scale grows`() {
        val steps = listOf(Spacing.xs, Spacing.sm, Spacing.md, Spacing.lg, Spacing.xl)
        assertEquals(steps.sortedBy { it.value }, steps)
    }
}
