package sv.edu.catolica.climesa.ui

import org.junit.Assert.assertEquals
import org.junit.Test

class FoldRuleTest {
    @Test fun muestraLasPrimerasYCuentaLasOcultas() {
        val items = (1..10).toList()
        assertEquals(listOf(1, 2, 3), FoldRule.visible(items, 3, open = false))
        assertEquals(7, FoldRule.hidden(items.size, 3))
    }

    @Test fun abiertaOCortaMuestraTodo() {
        val items = (1..10).toList()
        assertEquals(items, FoldRule.visible(items, 3, open = true))
        assertEquals(listOf(1, 2), FoldRule.visible(listOf(1, 2), 3, open = false))
        assertEquals(0, FoldRule.hidden(2, 3))
    }
}
