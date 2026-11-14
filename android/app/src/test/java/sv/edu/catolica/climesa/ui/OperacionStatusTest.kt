package sv.edu.catolica.climesa.ui

import org.junit.Assert.assertEquals
import org.junit.Test

class OperacionStatusTest {
    @Test fun queueStatesHaveOperationTones() {
        assertEquals(StatusTone.RESERVED, OperacionStatus.tone("en_espera"))
        assertEquals(StatusTone.PROCESS, OperacionStatus.tone("llamado"))
        assertEquals(StatusTone.SUCCESS, OperacionStatus.tone("atendido"))
        assertEquals("Atendido", OperacionStatus.label("atendido"))
    }

    @Test fun unknownCodesFallBackToSharedCatalog() {
        assertEquals(StatusTone.SUCCESS, OperacionStatus.tone("libre"))
        assertEquals("En limpieza", OperacionStatus.label("limpieza"))
    }

    @Test fun belowMinimumIsDanger() {
        assertEquals(StatusTone.DANGER, OperacionStatus.tone("bajo_minimo"))
    }
}
