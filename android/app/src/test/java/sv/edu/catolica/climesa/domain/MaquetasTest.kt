package sv.edu.catolica.climesa.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class MaquetasTest {
    /** Permisos reales de un paciente (PAC) en `permisos.csv`, solo los que abren secciones de Android. */
    private val paciente = listOf("sesion.perfil", "fila.ver", "citas.ver", "citas.solicitar", "resultados.ver", "ambulancia.solicitar", "pacientes.ver_ficha")

    @Test fun cadaSeccionSinPantallaTieneMaquetaNavegable() {
        AndroidSection.entries.filter { !it.ready }.forEach { section ->
            val encontrada = Maquetas.of(section)
            assertNotNull("sin maqueta: ${section.name}", encontrada)
            val maqueta = encontrada!!
            assertTrue(maqueta.title.isNotBlank())
            assertTrue("sin filas: ${section.name}", maqueta.rows.isNotEmpty() || maqueta.actions.isNotEmpty())
        }
    }

    @Test fun laSeccionListaParaUsarNoTieneMaqueta() {
        assertNull(Maquetas.of(AndroidSection.UNIT))
        assertNull(Maquetas.of(AndroidSection.PROFILE))
    }

    @Test fun elRotuloEsMaquetaYElContenidoEsFicticio() {
        assertEquals("Maqueta", Maquetas.LABEL)
        Maquetas.of(AndroidSection.AMBULANCE_REQUEST)!!.let { m ->
            assertEquals("A09", m.screen)
            assertTrue("Enviar solicitud" in m.actions)
            assertTrue(m.rows.all { it.value.isNotBlank() })
        }
    }

    @Test fun elPacienteVeElFlujoCompletoDeMaquetas() {
        val visibles = AndroidSections.visible(paciente)
        listOf(
            AndroidSection.QUEUE,
            AndroidSection.APPOINTMENTS,
            AndroidSection.APPOINTMENT_REQUEST,
            AndroidSection.RESULTS,
            AndroidSection.AMBULANCE_REQUEST,
        ).forEach { assertTrue("falta ${it.name}", it in visibles) }
        visibles.filter { !it.ready }.forEach { assertNotNull(Maquetas.of(it)) }
        assertTrue(AndroidSections.hasAppScreens(paciente))
    }

    @Test fun laMaquetaDeAmbulanciaNoAparecePorRolSinPermiso() {
        assertFalse(AndroidSection.AMBULANCE_REQUEST in AndroidSections.visible(listOf("sesion.perfil", "citas.ver")))
    }
}
