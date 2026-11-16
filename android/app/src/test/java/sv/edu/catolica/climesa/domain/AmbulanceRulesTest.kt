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

    @Test fun laSolicitudPendienteTraeQuienPidioYElBloqueoDeDespacho() {
        val parsed = AmbulanceParser.status(JSONObject()
            .put("unit", JSONObject().put("id", "u1").put("plate", "P-1").put("state", "en_mantenimiento").put("version", 3).put("stateReason", "Cambio de llantas").put("stateSince", "2026-11-15T12:00:00Z"))
            .put("paramedicOnDuty", false).put("activeService", JSONObject.NULL)
            .put("dispatchBlock", JSONObject().put("code", "en_mantenimiento").put("message", "La unidad está en mantenimiento.").put("action", "Publica un turno de paramédico."))
            .put("pendingRequests", org.json.JSONArray()
                .put(JSONObject().put("id", "r1").put("channel", "telefono").put("address", "Calle a Apopa").put("reason", "Caída").put("contactPhone", "7000-2222").put("createdAt", "2026-11-15T14:00:00Z").put("version", 1).put("requesterName", "Marta Quintanilla").put("callerName", "Marta Quintanilla").put("patientRecord", JSONObject.NULL))
                .put(JSONObject().put("id", "r2").put("channel", "telefono").put("address", "Otra calle").put("reason", "Dolor").put("contactPhone", "7000-3333").put("createdAt", "2026-11-15T14:00:00Z").put("version", 1))))!!
        assertEquals("Cambio de llantas", parsed.unit.stateReason)
        assertEquals("en_mantenimiento", parsed.dispatchBlock!!.code)
        assertEquals("Publica un turno de paramédico.", parsed.dispatchBlock!!.action)
        assertEquals("Marta Quintanilla", AmbulanceRules.requesterLabel(parsed.pendingRequests[0]))
        assertEquals("", parsed.pendingRequests[0].patientRecord)
        assertEquals("Llamada sin identificar", AmbulanceRules.requesterLabel(parsed.pendingRequests[1]))
        assertEquals("Recién recibida", AmbulanceRules.waiting(0)); assertEquals("Espera 45 min", AmbulanceRules.waiting(45)); assertEquals("Espera 2 h 10 min", AmbulanceRules.waiting(130))
    }

    @Test fun laBitacoraSeConsultaConBusquedaYFiltrosYSeCuentaComoHistoria() {
        assertEquals("/ambulancia/bitacora", AmbulanceRules.logPath(LogFilters()))
        assertEquals("/ambulancia/bitacora?q=San+Salvador&priority=roja&finalState=completado", AmbulanceRules.logPath(LogFilters(query = " San Salvador ", priority = "roja", finalState = "completado")))
        assertEquals(2, LogFilters(priority = "roja", type = "emergencia_domicilio").activeCount)
        assertEquals(listOf("Prioridad: Roja"), AmbulanceLabels.chips(LogFilters(priority = "roja")).map { it.second })
        val entry = AmbulanceParser.log(org.json.JSONArray().put(JSONObject().put("id", "s1").put("type", "emergencia_domicilio").put("priority", "roja").put("origin", "Colonia Ficticia").put("destination", "Hospital CLIMESA").put("municipality", "Soyapango")
            .put("dispatchedAt", "2026-11-15T14:00:00Z").put("finalState", "completado").put("responseMinutes", 20).put("patientRef", "*******042")
            .put("crew", org.json.JSONArray().put(JSONObject().put("name", "Ana Ficticia"))).put("milestones", org.json.JSONArray().put(JSONObject().put("type", "salida").put("occurredAt", "2026-11-15T14:05:00Z")))))
        assertEquals("La ambulancia salió de Colonia Ficticia (Soyapango) hacia Hospital CLIMESA — paciente con expediente *******042, con Ana Ficticia, completado.", AmbulanceRules.narrate(entry.single()))
        assertTrue(AmbulanceRules.narrate(entry.single().copy(patientRef = "", milestones = emptyList(), finalState = null)).endsWith("sin paciente vinculado, con Ana Ficticia, en curso."))
        assertFalse(entry.single().administrativeClose)
        val closed = AmbulanceParser.log(org.json.JSONArray().put(JSONObject().put("id", "s2").put("finalState", "cancelado").put("administrativeClose", true))).single()
        assertTrue(closed.administrativeClose)
        assertEquals("Cierre administrativo", AmbulanceLabels.ADMINISTRATIVE_CLOSE)
    }

    @Test fun elEstadoSeLeeSinServicioActivo() {
        val parsed = AmbulanceParser.status(JSONObject().put("unit", JSONObject().put("id", "u1").put("plate", "P-1").put("state", "disponible").put("version", 2)).put("activeService", JSONObject.NULL).put("paramedicOnDuty", true))!!
        assertNull(parsed.activeService)
        assertTrue(parsed.pendingRequests.isEmpty())
        assertEquals(2, parsed.unit.version)
    }

    @Test fun elMotoristaDeTurnoSeLeeYUnServidorViejoNoDaFalsaAlarma() {
        val base = JSONObject().put("unit", JSONObject().put("id", "u1").put("plate", "P-1").put("state", "disponible").put("version", 2)).put("activeService", JSONObject.NULL).put("paramedicOnDuty", true)
        assertTrue(AmbulanceParser.status(JSONObject(base.toString()))!!.driverOnDuty)
        assertFalse(AmbulanceParser.status(JSONObject(base.toString()).put("driverOnDuty", false))!!.driverOnDuty)
        assertTrue(AmbulanceParser.status(JSONObject(base.toString()).put("driverOnDuty", true))!!.driverOnDuty)
    }

    /** MA-AMB-03: the same rule as the API; from "trasladando" the service ends without a fake arrival. */
    @Test fun losEstadosFinalesSiguenLosHitosYNuncaOfrecenCompletadoSinLlegada() {
        assertEquals(listOf("en_hospital", "finalizado"), AmbulanceRules.nextMilestones(listOf("salida", "en_escena", "trasladando")))
        assertEquals(listOf("fallecido", "desviado", "cancelado"), AmbulanceRules.allowedFinalStates(listOf("salida", "en_escena", "trasladando")))
        assertEquals(listOf("sin_traslado", "rechaza_traslado", "fallecido", "cancelado"), AmbulanceRules.allowedFinalStates(listOf("salida")))
        assertEquals(listOf("completado"), AmbulanceRules.allowedFinalStates(listOf("salida", "en_escena", "trasladando", "en_hospital")))
        assertEquals(listOf("desviado" to "Desviado a otro centro", "cancelado" to "Cancelado"), AmbulanceLabels.finishChoices(listOf("completado", "desviado", "cancelado")))
        assertEquals("Paciente fallecido", AmbulanceLabels.finalState("fallecido"))
    }

    /** Review of #117: without `finalStates` (older API) the choices follow the recorded milestones, never a static list. */
    @Test fun sinFinalStatesLasOpcionesSalenDeLosHitos() {
        val beforeTransport = AmbulanceService("s1", "emergencia_domicilio", "roja", "A", "B", "", false, emptyList(), listOf(AmbulanceMilestone("salida", ""), AmbulanceMilestone("en_escena", "")), listOf("trasladando", "finalizado"))
        assertEquals(listOf("sin_traslado", "rechaza_traslado", "fallecido", "cancelado"), AmbulanceRules.finishOptions(beforeTransport).map { it.first })
        val transporting = beforeTransport.copy(milestones = beforeTransport.milestones + AmbulanceMilestone("trasladando", ""))
        assertEquals(listOf("fallecido", "desviado", "cancelado"), AmbulanceRules.finishOptions(transporting).map { it.first })
        assertEquals(listOf("desviado"), AmbulanceRules.finishOptions(transporting.copy(finalStates = listOf("desviado"))).map { it.first })
    }

    /** MA-AMB-02: crew proposed for dispatch and what is missing from a selection. */
    @Test fun laTripulacionPropuestaYLoQueFalta() {
        val pool = listOf(CrewCandidate("par-2", "paramedico", "Beto", false), CrewCandidate("par-1", "paramedico", "Ana", true), CrewCandidate("mot-1", "motorista", "Carlos", false))
        assertEquals(listOf("par-1", "mot-1"), AmbulanceRules.defaultCrew(pool))
        assertNull(AmbulanceRules.crewProblem(pool, listOf("par-1", "mot-1")))
        assertEquals("Elige un paramédico con cuenta en la app: registra los hitos del servicio.", AmbulanceRules.crewProblem(pool, listOf("par-2", "mot-1")))
        assertEquals(listOf("par-1", "mot-1"), AmbulanceRules.dispatchBody(5, "r1", "emergencia_domicilio", "roja", "Hospital", listOf("par-1", "mot-1")).getJSONArray("crew").let { a -> (0 until a.length()).map(a::getString) })
    }

    /** MA-AMB-04 / MA-AMB-05: handover and own requests are read from the server, with the actions it allows. */
    @Test fun laEntregaYLasSolicitudesPropiasSeLeenConSusAcciones() {
        val view = AmbulanceParser.prehospital(JSONObject().put("serviceId", "s1").put("version", 4).put("active", false).put("arrived", true).put("clinical", true)
            .put("reports", org.json.JSONArray()).put("handover", JSONObject().put("receivedAt", "2026-11-15T14:40:00Z").put("receivedByName", "Ana Ficticia")).put("allowedActions", org.json.JSONArray()))!!
        assertEquals(Handover("2026-11-15T14:40:00Z", "Ana Ficticia"), view.handover)
        assertFalse(view.canReceive)
        val own = AmbulanceParser.ownRequests(org.json.JSONArray().put(JSONObject().put("id", "r1").put("state", "descartada").put("address", "A").put("reason", "B").put("createdAt", "x").put("version", 2).put("service", JSONObject.NULL).put("allowedActions", org.json.JSONArray())))
        assertNull(AmbulanceRules.activeRequest(own))
        assertEquals("No se pudo atender", AmbulanceLabels.requestState("descartada"))
    }
}
