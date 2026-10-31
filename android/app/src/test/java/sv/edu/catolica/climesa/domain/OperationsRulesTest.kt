package sv.edu.catolica.climesa.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class OperationsRulesTest {
    private val permisos = listOf("sesion.perfil", "ambulancia.ver_estado", "ambulancia.mantenimiento")

    @Test fun elMantenimientoSalePorPermisoYNuncaConServicioActivo() {
        assertTrue(MaintenanceRules.available(permisos, "disponible"))
        assertTrue(MaintenanceRules.available(permisos, "en_mantenimiento"))
        assertFalse(MaintenanceRules.available(permisos, "en_servicio"))
        assertFalse(MaintenanceRules.available(listOf("ambulancia.ver_estado"), "disponible"))
    }

    @Test fun sacarLaUnidadDeMantenimientoExigeParamedicoDeTurno() {
        assertTrue(MaintenanceRules.leavingBlocked("en_mantenimiento", paramedicOnDuty = false))
        assertFalse(MaintenanceRules.leavingBlocked("en_mantenimiento", paramedicOnDuty = true))
        assertFalse(MaintenanceRules.leavingBlocked("disponible", paramedicOnDuty = false))
    }

    @Test fun elMotivoLleva_entre10y500Caracteres() {
        assertEquals("Indica el motivo, de al menos 10 caracteres.", MaintenanceRules.reasonError("corto"))
        assertEquals("Indica el motivo, de al menos 10 caracteres.", MaintenanceRules.reasonError("   123456789   "))
        assertNull(MaintenanceRules.reasonError("Cambio de aceite"))
        assertEquals("El motivo no puede pasar de 500 caracteres.", MaintenanceRules.reasonError("x".repeat(501)))
    }

    @Test fun elCuerpoDelMantenimientoLlevaVersionDireccionYMotivo() {
        val body = MaintenanceRules.body(version = 3, inMaintenance = true, reason = "  Cambio de aceite  ")
        assertEquals(3, body.getInt("version"))
        assertTrue(body.getBoolean("inMaintenance"))
        assertEquals("Cambio de aceite", body.getString("reason"))
    }

    @Test fun laFuncionDelPersonalSeMuestraEnEspanol() {
        assertEquals("Médico", StaffLabels.function("medico"))
        assertEquals("Enfermería", StaffLabels.function("enfermero"))
        assertEquals("Paramédico", StaffLabels.function("paramedico"))
        assertEquals("desconocida", StaffLabels.function("desconocida"))
    }

    @Test fun elEstadoDelTurnoSeMuestraEnEspanol() {
        assertEquals("Publicado", StaffLabels.shiftState("publicado"))
        assertEquals("Cancelado", StaffLabels.shiftState("cancelado"))
        assertEquals("Borrador", StaffLabels.shiftState("borrador"))
    }
}
