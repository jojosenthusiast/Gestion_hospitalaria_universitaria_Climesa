package sv.edu.catolica.climesa.domain

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import sv.edu.catolica.climesa.data.profileFromJson
import sv.edu.catolica.climesa.ui.CategoryRequestsState
import sv.edu.catolica.climesa.ui.ProvisionalPatient
import java.time.Instant

/** New API contract fields of the 2026-11-20 audit, read tolerantly (they may be absent in the deployed API). */
class AuditContractFieldsTest {
    private val now = Instant.parse("2026-11-20T15:00:00Z")

    private fun status(block: JSONObject) = AmbulanceParser.status(
        JSONObject().put("unit", JSONObject().put("id", "u").put("plate", "P1").put("state", "disponible")).put("dispatchBlock", block),
    )!!.dispatchBlock!!

    // D135
    @Test fun ausenciaRegistradaUsaElTextoDelServidor() {
        val block = status(JSONObject().put("code", "sin_paramedico_de_turno").put("message", "No hay paramédico de turno.").put("action", "Tienes una ausencia registrada en el turno de hoy.").put("cause", "ausencia_registrada"))
        assertTrue(block.absenceRecorded)
        assertEquals("Tienes una ausencia registrada en el turno de hoy.", ParamedicRules.blockGuidance(block, canPlanShifts = false))
        assertFalse(ParamedicRules.blockGuidance(block, canPlanShifts = false).contains("publique"))
        val noText = DispatchBlock("sin_paramedico_de_turno", "No hay paramédico de turno.", "", "ausencia_registrada")
        assertEquals(ParamedicRules.ABSENCE_GUIDANCE, ParamedicRules.blockGuidance(noText, canPlanShifts = false))
    }

    @Test fun sinCausaConservaLaGuiaAnterior() {
        val block = status(JSONObject().put("code", "sin_paramedico_de_turno").put("message", "m").put("action", "a"))
        assertNull(block.cause)
        assertEquals(ParamedicRules.blockGuidance("sin_paramedico_de_turno", false), ParamedicRules.blockGuidance(block, false))
    }

    // D25/D26
    @Test fun llegadaLeeUrgenteYEstado() {
        val parsed = AmbulanceParser.arrivals(JSONObject().put("services", JSONArray().put(
            JSONObject().put("serviceId", "s1").put("dispatchedAt", "2026-11-20T14:40:00Z").put("active", true).put("arrived", false)
                .put("urgent", true).put("priority", "roja").put("hasPrehospital", true).put("state", "en_escena"),
        )))
        val one = parsed.single()
        assertTrue(one.urgent)
        assertEquals("en_escena", one.state)
        val alert = RoleDashboard.ambulanceAlerts(parsed, now).single()
        assertEquals("Ambulancia en camino", alert.title)
        assertEquals("Urgente · En la escena · Prioridad Roja · despachada a las 08:40 · reporte prehospital enviado", alert.detail)
    }

    @Test fun llegadaSinCamposNuevosNoCambia() {
        val one = AmbulanceParser.arrivals(JSONObject().put("services", JSONArray().put(JSONObject().put("serviceId", "s").put("dispatchedAt", "2026-11-20T14:40:00Z").put("active", true).put("arrived", false)))).single()
        assertFalse(one.urgent)
        assertNull(one.state)
        assertEquals("Despachada a las 08:40 · sin reporte prehospital aún", RoleDashboard.ambulanceAlerts(listOf(one), now).single().detail)
    }

    @Test fun etiquetasDeEstado() {
        assertEquals("Despachada", ArrivalStates.label("despachado"))
        assertEquals("En camino al hospital", ArrivalStates.label("trasladando"))
        assertNull(ArrivalStates.label(null))
        assertNull(ArrivalStates.label("otro"))
    }

    // D120 / S12
    @Test fun recibirBloqueadoMuestraElMotivo() {
        val view = AmbulanceParser.prehospital(JSONObject().put("serviceId", "s").put("urgent", true).put("urgentAccess", true).put("allowedActions", JSONArray())
            .put("blockedActions", JSONArray().put(JSONObject().put("action", "recibir").put("code", "sin_llegada_hospital").put("reason", "La ambulancia aún no registra la llegada al hospital."))))!!
        assertFalse(view.canReceive)
        assertTrue(view.urgent)
        assertTrue(view.urgentAccess)
        assertEquals("sin_llegada_hospital", view.blockedActions.single().code)
        assertEquals("La ambulancia aún no registra la llegada al hospital.", view.receiveBlockedReason)
    }

    @Test fun recibirPermitidoNoTieneMotivo() {
        val allowed = AmbulanceParser.prehospital(JSONObject().put("serviceId", "s").put("allowedActions", JSONArray().put("recibir")))!!
        assertTrue(allowed.canReceive)
        assertNull(allowed.receiveBlockedReason)
        val older = AmbulanceParser.prehospital(JSONObject().put("serviceId", "s"))!!
        assertFalse(older.canReceive)
        assertNull(older.receiveBlockedReason)
        assertFalse(older.urgentAccess)
    }

    // D21
    @Test fun provisionalVinculado() {
        val linked = ProvisionalPatient.fromCreated(JSONObject().put("id", "p").put("record", "0000015-9").put("version", 1).put("linkedServiceId", "s1"))
        assertTrue(linked.linked)
        assertEquals("s1", linked.linkedServiceId)
        val notLinked = ProvisionalPatient.fromCreated(JSONObject().put("id", "p").put("record", "0000015-9").put("version", 1))
        assertFalse(notLinked.linked)
        assertNull(notLinked.linkedServiceId)
    }

    // D120: urgent rows of "Quién vio mi expediente"
    @Test fun accesoUrgente() {
        val rows = MyAccessRules.parse(JSONArray()
            .put(JSONObject().put("fecha", "2026-11-20T14:00:00Z").put("rol", "Recepción").put("tipoDato", "prehospital").put("motivo", "Recepción de ambulancia (urgente)").put("urgente", true))
            .put(JSONObject().put("fecha", "2026-11-20T13:00:00Z").put("rol", "Médico").put("tipoDato", "consulta").put("motivo", "atención").put("urgente", false))
            .put(JSONObject().put("fecha", "2026-11-20T12:00:00Z").put("rol", "Recepción").put("tipoDato", "prehospital").put("motivo", "Recepción de ambulancia (urgente)")))
        assertEquals(listOf(true, false, true), rows.map { it.urgent })
        assertEquals("al recibirte de una ambulancia (acceso urgente)", MyAccessRules.reasonText("Recepción de ambulancia (urgente)"))
        assertEquals("para atenderte", MyAccessRules.reasonText("atención"))
    }

    // D74
    @Test fun siguienteSinPropuestaPorCitasDeOtroMedico() {
        val next = QueueRules.parseNext(JSONObject().put("service", "consulta_general").put("area", "CON").put("rule", "r").put("waiting", 2).put("noProposalReason", "citas_de_otro_medico").put("proposal", JSONObject.NULL))!!
        assertEquals(2, next.waiting)
        assertEquals(2, next.waitingForOtherDoctor)
        val nobody = QueueRules.parseNext(JSONObject().put("service", "consulta_general").put("area", "CON").put("rule", "r").put("waiting", 0).put("noProposalReason", "sin_espera").put("proposal", JSONObject.NULL))!!
        assertEquals("sin_espera", nobody.noProposalReason)
        assertNull(nobody.waitingForOtherDoctor)
        val older = QueueRules.parseNext(JSONObject().put("service", "consulta_general").put("area", "CON").put("rule", "r"))!!
        assertNull(older.waiting)
        assertNull(older.noProposalReason)
        assertNull(older.waitingForOtherDoctor)
    }

    @Test fun filaActualizadaRefrescaQuienSigue() {
        assertTrue(QueueEvents.matches(EventoDominio("fila.actualizada", "fila", "consulta_general", null)))
    }

    // D128
    @Test fun limiteDeSolicitudes() {
        val blocked = CategoryRequestRules.limit(JSONObject().put("pending", 3).put("max", 3).put("canRequest", false).put("code", "solicitudes_pendientes_max").put("reason", "Ya tienes 3 solicitudes pendientes."))!!
        assertFalse(blocked.canRequest)
        assertEquals("Ya tienes 3 solicitudes pendientes.", blocked.reason)
        val state = CategoryRequestsState(picked = listOf("general"), limit = blocked)
        assertTrue(state.blockedByLimit)
        assertFalse(state.canSend)
        val open = CategoryRequestRules.limit(JSONObject().put("pending", 1).put("max", 3).put("canRequest", true).put("code", JSONObject.NULL).put("reason", JSONObject.NULL))!!
        assertNull(open.reason)
        assertNull(open.code)
        assertTrue(CategoryRequestsState(picked = listOf("general"), limit = open).canSend)
        assertNull(CategoryRequestRules.limit(JSONArray()))
        assertNull(CategoryRequestRules.limit(JSONObject().put("message", "x")))
        // An older API without the endpoint leaves the form as before.
        assertTrue(CategoryRequestsState(picked = listOf("general")).canSend)
    }

    // D129
    private fun me(extra: JSONObject.() -> Unit) = JSONObject().put("roles", JSONArray().put("PAC"))
        .put("permissions", JSONArray().put(JSONObject().put("code", "sesion.perfil").put("context", "propio"))).apply(extra)

    @Test fun saludoDelPacienteVinculado() {
        val profile = profileFromJson(me { put("name", "Ana Cecilia Portillo Mejía").put("patientId", "p1").put("patientName", "Ana Cecilia Portillo Mejía").put("patientRecord", "9900004-3").put("staffId", JSONObject.NULL) })
        assertEquals("Ana Cecilia Portillo Mejía", profile.displayName)
        assertEquals("9900004-3", profile.patientRecord)
        assertNull(profile.staffId)
        // Older API: the account name differs from the linked record; a patient account greets with the record's name.
        assertEquals("Ana", AccessProfile(name = "Miguel", patientName = "Ana").displayName)
        // Staff keep their own name.
        assertEquals("Dra. Ficticia", AccessProfile(name = "Dra. Ficticia", staffId = "s1", patientName = "Otra").displayName)
    }

    @Test fun nombreNuloNoEsLaPalabraNull() {
        val profile = profileFromJson(me { put("name", JSONObject.NULL).put("patientName", JSONObject.NULL) })
        assertEquals("", profile.name)
        assertNull(profile.patientName)
        assertEquals("", profile.displayName)
    }
}
