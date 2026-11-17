package sv.edu.catolica.climesa.domain

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Fase 2, flow B (S9): per-area number, priority, cited vs walk-in, board moves, undo and the next-patient proposal. */
class QueueBoardFase2Test {
    private fun row(state: String, allowed: List<String> = emptyList(), undo: List<String> = emptyList()) = JSONObject()
        .put("id", "t7").put("service", "consulta_general").put("area", "CON").put("numero", 7).put("patientName", "Paciente Ficticio").put("state", state)
        .put("llamados", if (state == "llamado") 1 else 0).put("version", 2).put("issuedAt", "2026-11-17T15:00:00Z")
        .put("priority", "urgente").put("appointmentAt", "2026-11-17T16:30:00Z").put("walkIn", false)
        .put("allowedActions", JSONArray(allowed)).put("blockedActions", JSONArray()).put("undoActions", JSONArray(undo))

    @Test fun ticketsCarryAreaPriorityAndAppointment() {
        val t = QueueRules.parse(JSONArray().put(row("en_espera"))).single()
        assertEquals("CON 7", QueueLabels.code(t))
        assertEquals("Urgente", QueueLabels.priority(t.priority))
        assertEquals("Cita 10:30", QueueLabels.arrival(t))
        val walkInRow = row("en_espera").apply { put("appointmentAt", JSONObject.NULL); put("walkIn", true); remove("area") }
        val walkIn = QueueRules.parse(JSONArray().put(walkInRow)).single()
        assertEquals("Sin cita", QueueLabels.arrival(walkIn))
        assertEquals("CON 7", QueueLabels.code(walkIn))
    }

    @Test fun movesAreServerActionsAndOnlyWhenAllowed() {
        val waiting = QueueRules.parse(JSONArray().put(row("en_espera", listOf("llamar")))).single()
        assertEquals(QueueMove.CALL, QueueMoves.moveFor(waiting, QueueColumn.CALLED))
        assertNull(QueueMoves.moveFor(waiting, QueueColumn.IN_ATTENTION))
        val called = QueueRules.parse(JSONArray().put(row("llamado", listOf("atender"), listOf("deshacer_llamado")))).single()
        assertEquals(listOf(QueueColumn.WAITING, QueueColumn.IN_ATTENTION), QueueMoves.destinations(called).map { it.first })
        assertEquals("/fila/t7/deshacer-llamado", QueueMoves.path(called, QueueMove.UNDO_CALL))
        assertTrue(called.undoActions.contains("deshacer_llamado"))
        assertFalse(QueueMoves.destinations(called.copy(undoActions = emptyList())).any { it.first == QueueColumn.WAITING })
    }

    @Test fun undoIsAColumnMoveOnlyForTheLastCall() {
        val twice = QueueRules.parse(JSONArray().put(row("llamado", listOf("atender"), listOf("deshacer_llamado")).put("llamados", 2))).single()
        assertNull(QueueMoves.moveFor(twice, QueueColumn.WAITING))
        assertEquals(listOf(QueueColumn.IN_ATTENTION), QueueMoves.destinations(twice).map { it.first })
        assertTrue(QueueMoves.canRemoveCall(twice))
        assertEquals("Quitar un llamado", QueueMove.REMOVE_CALL.label)
        assertEquals("/fila/t7/deshacer-llamado", QueueMoves.path(twice, QueueMove.REMOVE_CALL))
        val once = twice.copy(calls = 1)
        assertEquals(QueueMove.UNDO_CALL, QueueMoves.moveFor(once, QueueColumn.WAITING))
        assertFalse(QueueMoves.canRemoveCall(once))
    }

    @Test fun bodiesKeepRoutineIssuesAsBefore() {
        assertEquals(setOf("service", "patientId"), QueueRules.issueBody("laboratorio", "rutina", "p1").keys().asSequence().toSet())
        assertEquals("emergencia", QueueRules.issueBody("laboratorio", "emergencia", "p1").getString("priority"))
        assertEquals("""{"version":3}""", QueueRules.undoBody(3).toString())
        assertEquals("urgente", QueueRules.priorityBody(3, "urgente").getString("priority"))
        assertEquals("c-1", QueueRules.callNextBody("consulta_general", "c-1").getString("officeId"))
        assertFalse(QueueRules.callNextBody("consulta_general").has("officeId"))
    }

    @Test fun nextProposalIsReadFromTheServer() {
        val json = JSONObject().put("service", "emergencia").put("area", "EMG").put("rule", "Emergencias primero; luego urgentes.")
            .put("proposal", JSONObject().put("id", "t9").put("numero", 9).put("area", "EMG").put("patientName", "Paciente Nueve").put("priority", "emergencia")
                .put("appointmentAt", JSONObject.NULL).put("version", 1).put("reason", "emergencia").put("reasonText", "Emergencia: pasa antes que todos."))
        val next = QueueRules.parseNext(json)!!
        assertEquals("EMG 9", next.proposal!!.code)
        assertEquals("Emergencia: pasa antes que todos.", next.proposal!!.reasonText)
        assertNull(QueueRules.parseNext(JSONObject().put("service", "emergencia").put("area", "EMG").put("rule", "r").put("proposal", JSONObject.NULL))!!.proposal)
        assertNull(QueueRules.parseNext(JSONArray()))
    }
}
