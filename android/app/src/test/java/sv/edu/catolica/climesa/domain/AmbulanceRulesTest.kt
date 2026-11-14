package sv.edu.catolica.climesa.domain

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant

class AmbulanceRulesTest {
    @Test fun laSolicitudExigeDireccionMotivoYTelefono() {
        assertNotNull(AmbulanceRules.requestError("Col", "Caída en casa", "7000-0001"))
        assertNotNull(AmbulanceRules.requestError("Colonia Ficticia", "Caída en casa", "70"))
        assertNull(AmbulanceRules.requestError("Colonia Ficticia", "Caída en casa", "7000-0001"))
        assertFalse(AmbulanceRules.requestBody("Colonia Ficticia", " ", "Caída", "7000-0001").has("municipality"))
    }

    @Test fun elPrehospitalSoloEnviaLosSignosEscritos() {
        val body = AmbulanceRules.prehospitalBody(PrehospitalForm(reason = "Dolor", priority = "roja", temperature = "37,5", heartRate = "100"), Instant.parse("2026-11-15T14:00:00Z"), null)
        val signs = body.getJSONObject("vitalSigns")
        assertEquals(setOf("heartRate", "temperature"), signs.keys().asSequence().toSet())
        assertEquals(37.5, signs.getDouble("temperature"), 0.0)
        assertFalse(body.has("estimatedArrival")); assertFalse(body.has("patientId"))
        assertNotNull(AmbulanceRules.prehospitalError(PrehospitalForm(reason = "Dolor torácico", heartRate = "cien")))
        assertNull(AmbulanceRules.prehospitalError(PrehospitalForm(reason = "Dolor torácico", etaMinutes = "20")))
    }

    @Test fun finalizarAntesDelHospitalExigeMotivo() {
        val service = AmbulanceService("s1", "emergencia_domicilio", "roja", "A", "B", "", false, emptyList(), listOf(AmbulanceMilestone("salida", "")), listOf("en_escena", "finalizado"))
        assertTrue(AmbulanceRules.finishNeedsReason(service))
        assertFalse(AmbulanceRules.finishNeedsReason(service.copy(milestones = service.milestones + AmbulanceMilestone("en_hospital", ""))))
        val body = AmbulanceRules.milestoneBody("finalizado", "sin_traslado", "Paciente estable")
        assertEquals("sin_traslado", body.getString("finalState"))
        assertFalse(AmbulanceRules.milestoneBody("salida").has("finalState"))
    }

    @Test fun elPacienteSinIdentidadNoInventaDatos() {
        assertNotNull(AmbulanceRules.unidentifiedError("otro", "30", "Camisa azul"))
        assertNotNull(AmbulanceRules.unidentifiedError("masculino", "200", "Camisa azul"))
        assertNull(AmbulanceRules.unidentifiedError("no_registrado", "", "Camisa azul"))
    }

    @Test fun losEventosDeUbicacionNoRecargan() {
        assertTrue(AmbulanceEvents.matches(EventoDominio("ambulancia.hito", "servicio", "s1", 2)))
        assertFalse(AmbulanceEvents.matches(EventoDominio("ambulancia.ubicacion", "servicio", "s1", 2)))
        assertFalse(AmbulanceEvents.matches(EventoDominio("turno.publicado", "turno", "t1", 1)))
    }

    @Test fun elEstadoSeLeeSinServicioActivo() {
        val parsed = AmbulanceParser.status(JSONObject().put("unit", JSONObject().put("id", "u1").put("plate", "P-1").put("state", "disponible").put("version", 2)).put("activeService", JSONObject.NULL).put("paramedicOnDuty", true))!!
        assertNull(parsed.activeService)
        assertTrue(parsed.pendingRequests.isEmpty())
        assertEquals(2, parsed.unit.version)
    }
}
