package sv.edu.catolica.climesa.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class QuickActionsTest {
    private val everything = AndroidSection.entries.map(AndroidSection::permission).toSet() + setOf(
        "camas.asignar", "pacientes.registrar", "citas.agendar", "citas.solicitar", "fila.emitir", "fila.llamar", "ambulancia.despachar", "ambulancia.solicitar", "laboratorio.procesar",
    )

    @Test fun cadaAccionApuntaASeccionesQueElRolTieneCatalogadas() {
        AndroidSections.roles.forEach { role ->
            val sections = AndroidSections.visible(role, everything)
            QuickActions.forRole(role, everything).forEach { action -> assertTrue("$role -> ${action.request.section}", action.request.section in sections) }
        }
    }

    @Test fun sinElPermisoLaAccionNoAparece() {
        assertTrue(QuickActions.forRole("REC", setOf("sesion.perfil", "pacientes.buscar")).isEmpty())
    }

    @Test fun elVerboCoincideConElParametroDeLaWeb() {
        assertEquals(QuickAction.REGISTER_PATIENT, QuickAction.fromVerb("registrar"))
        assertEquals(QuickAction.SCHEDULE_APPOINTMENT, QuickAction.fromVerb("agendar"))
        assertEquals(QuickAction.REQUEST_AMBULANCE, QuickAction.fromVerb("solicitud"))
        assertNull(QuickAction.fromVerb("inexistente"))
    }

    @Test fun laPantallaSoloAbreLaAccionSiLaCuentaTodaviaTieneElPermiso() {
        assertTrue(QuickActions.allowed(QuickAction.CALL_NEXT, listOf("fila.llamar")))
        assertFalse(QuickActions.allowed(QuickAction.CALL_NEXT, listOf("fila.ver")))
        QuickAction.entries.forEach { assertTrue(QuickActions.permissionFor(it).contains('.')) }
    }
}
