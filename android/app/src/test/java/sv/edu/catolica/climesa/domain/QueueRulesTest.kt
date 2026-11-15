package sv.edu.catolica.climesa.domain

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class QueueRulesTest {
    private fun ticket(state: String, calls: Int = 0, allowed: List<String> = emptyList(), blocked: List<Pair<String, String>> = emptyList(), service: String = "consulta_general") = JSONObject()
        .put("id", "t1").put("service", service).put("numero", 7).put("patientName", JSONObject.NULL).put("state", state).put("llamados", calls).put("version", 2)
        .put("issuedAt", "2026-11-14T14:00:00Z").put("maxCalls", 3).put("callsForAbsence", 2)
        .put("allowedActions", JSONArray(allowed))
        .put("blockedActions", JSONArray().apply { blocked.forEach { (a, r) -> put(JSONObject().put("action", a).put("reason", r)) } })

    @Test fun ticketsCarryTheServerActionsAndTheCallLimits() {
        val t = QueueRules.parse(JSONArray().put(ticket("llamado", 1, listOf("llamar", "atender", "futura"), listOf("no_se_presento" to "Faltan llamados.")))).single()
        assertEquals(listOf(QueueAction.CALL, QueueAction.ATTEND), t.allowedActions)
        assertEquals("Faltan llamados.", t.blockedActions[QueueAction.ABSENT])
        assertTrue(t.shows(QueueAction.ABSENT)); assertFalse(t.allows(QueueAction.ABSENT)); assertFalse(t.shows(QueueAction.COMPLETE))
        assertEquals(3, t.maxCalls); assertEquals(2, t.callsForAbsence)
        assertEquals("Paciente", t.patientName)
    }

    @Test fun progressTextDependsOnWhoReadsIt() {
        val waiting = QueueRules.parse(JSONArray().put(ticket("en_espera"))).single()
        assertEquals("En espera", QueueLabels.progress(waiting, canCall = true))
        assertEquals("Esperando a que el médico llame", QueueLabels.progress(waiting, canCall = false))
        assertEquals("Llamado 2 de 3", QueueLabels.progress(waiting.copy(state = "llamado", calls = 2), canCall = false))
        assertEquals("Presente, en atención", QueueLabels.progress(waiting.copy(state = "en_atencion"), canCall = true))
        assertEquals("Cerrado sin atender", QueueLabels.state("cerrado"))
    }

    @Test fun callNextUsesTheChosenServiceOrTheFirstWaitingOne() {
        val tickets = QueueRules.parse(JSONArray().put(ticket("atendido", service = "emergencia")).put(ticket("en_espera", service = "laboratorio")))
        assertEquals("laboratorio", QueueRules.callNextService(tickets, null))
        assertEquals("admisiones", QueueRules.callNextService(tickets, "admisiones"))
        assertEquals("consulta_general", QueueRules.callNextBody("consulta_general").getString("service"))
    }
}
