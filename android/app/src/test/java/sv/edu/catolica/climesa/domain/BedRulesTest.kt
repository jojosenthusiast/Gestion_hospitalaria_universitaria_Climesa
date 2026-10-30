package sv.edu.catolica.climesa.domain

import org.json.JSONArray
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import sv.edu.catolica.climesa.data.parseBeds

class BedRulesTest {
    private fun bed(state: String, pending: Boolean = false, completed: Boolean = false, mine: Boolean = false) =
        Bed("b1", "C-101", "Habitación 101", state, 3, pending, completed, mine)

    private val jefatura = setOf("camas.ver_tablero", "camas.bloquear", "camas.verificar_limpieza")
    private val enfermeria = setOf("camas.ver_tablero", "camas.registrar_limpieza", "camas.verificar_limpieza")

    @Test fun unaCamaLibreSePuedeBloquearSoloConPermiso() {
        assertEquals(listOf(BedAction.BLOCK), BedRules.availableActions(bed("libre"), jefatura))
        assertEquals(listOf(BedAction.REQUEST_CLEANING), BedRules.availableActions(bed("libre"), enfermeria))
        assertTrue(BedRules.availableActions(bed("libre"), setOf("camas.ver_tablero")).isEmpty())
    }

    @Test fun unaCamaBloqueadaSoloOfreceRetirarElBloqueo() {
        assertEquals(listOf(BedAction.UNBLOCK), BedRules.availableActions(bed("bloqueada"), jefatura))
    }

    @Test fun laLimpiezaPasaPorSolicitarCompletarYVerificar() {
        assertEquals(listOf(BedAction.REQUEST_CLEANING), BedRules.availableActions(bed("ocupada"), enfermeria))
        assertEquals(listOf(BedAction.COMPLETE_CLEANING), BedRules.availableActions(bed("limpieza", pending = true), enfermeria))
        assertEquals(listOf(BedAction.VERIFY_CLEANING), BedRules.availableActions(bed("limpieza", pending = true, completed = true), enfermeria))
    }

    @Test fun quienLimpioLaCamaNoVeLaAccionDeVerificar() {
        assertTrue(BedRules.availableActions(bed("limpieza", pending = true, completed = true, mine = true), enfermeria).isEmpty())
    }

    @Test fun elMotivoTieneUnMinimoPorAccion() {
        assertEquals("Escribe al menos 5 caracteres.", BedRules.validateReason(BedAction.BLOCK, "abc"))
        assertNull(BedRules.validateReason(BedAction.BLOCK, "Fuga de agua"))
        assertEquals("Escribe al menos 10 caracteres.", BedRules.validateReason(BedAction.VERIFY_CLEANING, "breve"))
    }

    @Test fun elBloqueoUsaMotivoYLasDemasAccionesReason() {
        assertEquals("motivo", BedRules.reasonField(BedAction.BLOCK))
        assertEquals("reason", BedRules.reasonField(BedAction.UNBLOCK))
    }

    @Test fun traduceLosErroresDelApiAMensajesEnEspanol() {
        assertEquals("No tienes permiso para realizar esta acción.", BedRules.errorMessage(403, null, "Forbidden"))
        assertTrue(BedRules.errorMessage(409, "version_conflicto", "x").startsWith("La cama cambió"))
        assertTrue(BedRules.errorMessage(409, "conflicto", "Quien limpió la cama no puede verificarla.").contains("otra persona"))
        assertEquals("La limpieza ya fue registrada.", BedRules.errorMessage(409, "conflicto", "La limpieza ya fue registrada."))
    }

    @Test fun leeElTableroDelApi() {
        val rows = JSONArray("""[{"id":"b1","code":"C-101","room":"Habitación 101","state":"limpieza","version":4,"cleaningPending":true,"cleaningCompleted":true,"cleanedByCurrentUser":false,"occupant":""}]""")
        val bed = parseBeds(rows).single()
        assertEquals(Bed("b1", "C-101", "Habitación 101", "limpieza", 4, true, true, false, null), bed)
    }
}
