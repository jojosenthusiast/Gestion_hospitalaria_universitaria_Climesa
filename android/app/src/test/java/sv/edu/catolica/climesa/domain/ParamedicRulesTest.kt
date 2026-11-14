package sv.edu.catolica.climesa.domain

import java.time.Instant
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ParamedicRulesTest {
    private fun service(done: List<String>, next: List<String>, location: AmbulanceLocation? = null) = AmbulanceService(
        "s1", "emergencia_domicilio", "roja", "Colonia Ficticia", "Hospital CLIMESA", "2026-11-15T14:00:00Z", false, emptyList(),
        done.map { AmbulanceMilestone(it, "2026-11-15T14:05:00Z") }, next, location,
    )

    @Test fun elPasoPrincipalSigueElOrdenYFinalizarEsSecundarioAntesDelHospital() {
        val onScene = service(listOf("salida", "en_escena"), listOf("trasladando", "finalizado"))
        assertEquals("trasladando", ParamedicRules.primaryStep(onScene))
        assertTrue(ParamedicRules.canFinishEarly(onScene))
        assertEquals("Salgo con el paciente", ParamedicRules.stepLabel("trasladando"))
    }

    @Test fun enElHospitalFinalizarEsElBotonPrincipal() {
        val atHospital = service(listOf("salida", "en_escena", "trasladando", "en_hospital"), listOf("finalizado"))
        assertEquals("finalizado", ParamedicRules.primaryStep(atHospital))
        assertFalse(ParamedicRules.canFinishEarly(atHospital))
        assertEquals(4 to 5, ParamedicRules.progress(atHospital))
    }

    @Test fun sinSiguienteNoHayBoton() {
        assertNull(ParamedicRules.primaryStep(service(emptyList(), emptyList())))
    }

    @Test fun tiempoTranscurridoNuncaEsNegativo() {
        val now = Instant.parse("2026-11-15T15:05:00Z")
        assertEquals(65, ParamedicRules.elapsedMinutes("2026-11-15T14:00:00Z", now))
        assertEquals(0, ParamedicRules.elapsedMinutes("2026-11-15T16:00:00Z", now))
        assertEquals("Hace 1 h 05 min", ParamedicRules.elapsed(65))
        assertEquals("Hace 4 min", ParamedicRules.elapsed(4))
        assertEquals("Hace menos de 1 min", ParamedicRules.elapsed(0))
    }

    @Test fun elBloqueoDiceQueHacerSegunQuienLoLee() {
        assertTrue(ParamedicRules.blockGuidance("sin_paramedico_de_turno", canPlanShifts = true).contains("Publica un turno"))
        assertTrue(ParamedicRules.blockGuidance("sin_paramedico_de_turno", canPlanShifts = false).contains("Jefatura de Operaciones"))
    }

    @Test fun elBloqueoSinMotoristaOTripulacionDiceQueHacer() {
        assertTrue(ParamedicRules.blockGuidance("sin_motorista_de_turno", canPlanShifts = true).contains("Publica un turno de motorista"))
        assertTrue(ParamedicRules.blockGuidance("sin_motorista_de_turno", canPlanShifts = false).contains("Jefatura de Operaciones"))
        val both = ParamedicRules.blockGuidance("sin_tripulacion_de_turno", canPlanShifts = true)
        assertTrue(both.contains("paramédico") && both.contains("motorista"))
        assertTrue(ParamedicRules.blockGuidance("sin_tripulacion_de_turno", canPlanShifts = false).contains("Jefatura de Operaciones"))
    }

    @Test fun elPacienteSeNombraSinInventarIdentidad() {
        assertEquals("Sin identificar · expediente provisional 000123", ParamedicRules.patientLabel("000123", false))
        assertEquals("Sin paciente vinculado", ParamedicRules.patientLabel(null, false))
    }

    @Test fun lasSeccionesDelParamedicoCaenEnSuPantalla() {
        assertTrue(ParamedicRules.handles(AndroidSection.SERVICE, emptyList()))
        assertTrue(ParamedicRules.handles(AndroidSection.UNIT, listOf("ambulancia.operar")))
        assertFalse(ParamedicRules.handles(AndroidSection.UNIT, listOf("ambulancia.ver_estado")))
        assertFalse(ParamedicRules.handles(AndroidSection.LOG, listOf("ambulancia.operar")))
    }

    @Test fun elCuerpoDeUbicacionLlevaLaHoraDelTelefono() {
        val body = AmbulanceRules.locationBody(13.69, -89.19, Instant.parse("2026-11-15T14:10:00Z"))
        assertEquals(13.69, body.getDouble("latitude"), 0.0)
        assertEquals("2026-11-15T14:10:00Z", body.getString("capturedAt"))
    }
}
