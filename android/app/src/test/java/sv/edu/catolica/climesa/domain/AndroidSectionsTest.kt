package sv.edu.catolica.climesa.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AndroidSectionsTest {
    private val paramedico = listOf("sesion.perfil", "pacientes.buscar", "turnos.ver", "ambulancia.ver_estado", "ambulancia.operar", "ambulancia.ver_bitacora")

    @Test fun paramedicoVeUnidadServicioBitacoraYPerfil() {
        assertEquals(
            listOf(AndroidSection.UNIT, AndroidSection.SERVICE, AndroidSection.LOG, AndroidSection.PROFILE),
            AndroidSections.visible(paramedico),
        )
    }

    @Test fun lasSeccionesSalenDelPermisoNoDelRol() {
        val enfermeria = AndroidSections.visible(listOf("sesion.perfil", "pacientes.buscar", "camas.ver_tablero", "turnos.ver"))
        assertTrue(AndroidSection.BEDS in enfermeria)
        assertFalse(AndroidSection.UNIT in enfermeria)
        assertEquals(AndroidSection.HOME, enfermeria.first())
        assertEquals(AndroidSection.PROFILE, enfermeria.last())
    }

    @Test fun sinPermisoDeCamasNoHayTablero() {
        assertFalse(AndroidSection.BEDS in AndroidSections.visible(listOf("sesion.perfil", "turnos.ver")))
    }

    @Test fun soloInicioYPerfilSignificaQueElRolNoUsaLaApp() {
        assertFalse(AndroidSections.hasAppScreens(listOf("sesion.perfil")))
        assertTrue(AndroidSections.hasAppScreens(listOf("sesion.perfil", "camas.ver_tablero")))
    }

    @Test fun lasSeccionesSinPantallaQuedanComoProximaEntrega() {
        assertFalse(AndroidSection.SERVICE.ready)
        assertFalse(AndroidSection.LOG.ready)
        assertTrue(AndroidSection.UNIT.ready)
        assertTrue(AndroidSection.BEDS.ready)
    }
}
