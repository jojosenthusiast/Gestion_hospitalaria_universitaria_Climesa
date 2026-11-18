package sv.edu.catolica.climesa.domain

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate

/** Ambulance workflow audit: last outcome for the patient, discard reason, triage colour, day-grouped log, admin close. */
class AmbulanceFlowAuditTest {
    private fun request(id: String, state: String, extra: JSONObject.() -> Unit = {}) = JSONObject().put("id", id).put("state", state).put("address", "Colonia Ficticia").put("reason", "Caída en casa")
        .put("createdAt", "2026-11-18T15:00:00Z").put("version", 2).put("service", JSONObject.NULL).put("allowedActions", JSONArray()).apply(extra)
    private fun entry(id: String, dispatchedAt: String, finalState: String? = "completado", adminClose: Boolean = false) =
        AmbulanceLogEntry(id, "emergencia_domicilio", "roja", "Colonia Ficticia", "Hospital CLIMESA", dispatchedAt, finalState, 8, administrativeClose = adminClose)

    @Test fun elPacienteVeElMotivoDelDescarte() {
        val own = AmbulanceParser.ownRequests(JSONArray().put(request("r1", "descartada") { put("discardReason", "Se resolvió por teléfono") }).put(request("r2", "cancelada") { put("discardReason", JSONObject.NULL) }))
        assertEquals("Se resolvió por teléfono", own[0].discardReason)
        assertNull(own[1].discardReason)
        assertEquals("Despacho no pudo atender esta solicitud: Se resolvió por teléfono. Si hay riesgo de vida, llama al 911.", AmbulanceRules.requestProgress(own[0]))
        assertEquals("Despacho no pudo atender esta solicitud. Si hay riesgo de vida, llama al 911.", AmbulanceRules.requestProgress(own[0].copy(discardReason = null)))
    }

    @Test fun sinSolicitudActivaSeMuestraLaUltimaResuelta() {
        val own = AmbulanceParser.ownRequests(JSONArray().put(request("r1", "descartada")).put(request("r0", "cancelada")))
        assertNull(AmbulanceRules.activeRequest(own))
        assertEquals("r1", AmbulanceRules.latestResolved(own)?.id)
        val withActive = AmbulanceParser.ownRequests(JSONArray().put(request("r2", "por_confirmar")).put(request("r1", "descartada")))
        assertNull(AmbulanceRules.latestResolved(withActive))
        assertNull(AmbulanceRules.latestResolved(emptyList()))
    }

    @Test fun laPrioridadUsaLaEscalaCompartida() {
        assertEquals("emergencia", AmbulanceRules.priorityLevel("roja"))
        assertEquals("urgente", AmbulanceRules.priorityLevel("naranja"))
        assertEquals("urgente", AmbulanceRules.priorityLevel("amarilla"))
        assertEquals("rutina", AmbulanceRules.priorityLevel("verde"))
    }

    @Test fun laBitacoraSeAgrupaPorDiaLocal() {
        // 2026-11-18T03:00Z is still 17 Nov in El Salvador (UTC-6).
        val days = AmbulanceRules.logDays(listOf(entry("a", "2026-11-18T15:00:00Z"), entry("b", "2026-11-18T03:00:00Z"), entry("c", "2026-11-17T20:00:00Z"), entry("d", "2026-11-16T15:00:00Z")))
        assertEquals(listOf(LocalDate.of(2026, 11, 18), LocalDate.of(2026, 11, 17), LocalDate.of(2026, 11, 16)), days.map { it.first })
        assertEquals(listOf("b", "c"), days[1].second.map { it.id })
    }

    @Test fun elCierreAdministrativoSeCuentaComoTal() {
        assertTrue(AmbulanceRules.narrate(entry("a", "2026-11-18T15:00:00Z", "cancelado", adminClose = true)).endsWith(", cierre administrativo."))
        assertTrue(AmbulanceRules.narrate(entry("a", "2026-11-18T15:00:00Z", "cancelado")).endsWith(", cancelado."))
    }

    @Test fun laBitacoraFiltraLosServiciosEnCurso() {
        val filters = LogFilters(finalState = AmbulanceLabels.OPEN)
        assertEquals("/ambulancia/bitacora?finalState=en_curso", AmbulanceRules.logPath(filters))
        assertEquals(listOf("finalState" to "Estado: En curso"), AmbulanceLabels.chips(filters))
    }
}
