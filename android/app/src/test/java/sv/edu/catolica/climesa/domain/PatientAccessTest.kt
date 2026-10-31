package sv.edu.catolica.climesa.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class PatientAccessTest {
    private val recepcion = listOf("sesion.perfil", "pacientes.buscar", "pacientes.registrar", "pacientes.ver_ficha", "pacientes.editar_demograficos")
    private val jefe = listOf("sesion.perfil", "pacientes.buscar", "pacientes.ver_ficha", "pacientes.gestionar_duplicados")

    @Test fun recepcionTieneBuscarRegistrarVerEditarEInactivar() {
        assertEquals(
            setOf(PatientAction.SEARCH, PatientAction.REGISTER, PatientAction.VIEW, PatientAction.EDIT, PatientAction.CHANGE_STATUS),
            PatientAccess.allowed(recepcion),
        )
    }

    @Test fun jefeSoloBuscaYVeFichaSinRegistrarNiEditar() {
        val acciones = PatientAccess.allowed(jefe)
        assertEquals(setOf(PatientAction.SEARCH, PatientAction.VIEW), acciones)
        assertTrue(PatientAction.REGISTER !in acciones)
        assertTrue(PatientAction.EDIT !in acciones)
        assertTrue(PatientAction.CHANGE_STATUS !in acciones)
    }

    @Test fun inactivarUsaElMismoPermisoQueEditarComoEnElCatalogo() {
        assertEquals("pacientes.editar_demograficos", PatientAction.CHANGE_STATUS.permission)
        assertEquals(PatientAction.EDIT.permission, PatientAction.CHANGE_STATUS.permission)
    }

    @Test fun sinPermisosNoHayAcciones() {
        assertTrue(PatientAccess.allowed(listOf("sesion.perfil")).isEmpty())
    }

    @Test fun elMotivoDebeTenerDeDiezAQuinientosCaracteres() {
        assertEquals("Indica el motivo, de al menos 10 caracteres.", ChangeReason.error("123456789"))
        assertNull(ChangeReason.error("1234567890"))
        assertNull(ChangeReason.error("   1234567890   "))
        assertNull(ChangeReason.error("a".repeat(500)))
        assertEquals("El motivo no puede pasar de 500 caracteres.", ChangeReason.error("a".repeat(501)))
    }
}
