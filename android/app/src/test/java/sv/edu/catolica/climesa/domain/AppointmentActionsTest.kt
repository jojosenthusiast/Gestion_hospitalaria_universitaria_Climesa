package sv.edu.catolica.climesa.domain

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AppointmentActionsTest {
    private fun row(state: String, allowed: List<String> = emptyList(), blocked: List<Pair<String, String>> = emptyList()) = JSONObject()
        .put("id", "a1").put("patientName", "Ana").put("doctorId", "d1").put("doctorName", "Dr. Prueba")
        .put("start", "2026-11-14T20:00:00Z").put("end", "2026-11-14T20:20:00Z").put("state", state).put("version", 2)
        .put("allowedActions", JSONArray(allowed))
        .put("blockedActions", JSONArray().apply { blocked.forEach { (a, r) -> put(JSONObject().put("action", a).put("reason", r)) } })
        .put("cancelableUntil", "2026-11-14T18:00:00Z").put("rescheduledFromId", JSONObject.NULL).put("rescheduledToId", JSONObject.NULL)

    private fun parse(vararg rows: JSONObject) = ReceptionScheduling.appointments(JSONArray().apply { rows.forEach { put(it) } })

    @Test fun theButtonsAreExactlyTheActionsTheServerAllows() {
        val a = parse(row("solicitada", listOf("rechazar", "confirmar", "reprogramar", "accion_futura"))).single()
        assertEquals(listOf(AppointmentAction.CONFIRM, AppointmentAction.REJECT, AppointmentAction.RESCHEDULE), AppointmentActions.available(a))
        assertEquals("d1", a.doctorId)
        assertEquals("2026-11-14T18:00:00Z", a.cancelableUntil)
        assertNull(a.rescheduledToId)
    }

    @Test fun nothingIsGuessedFromTheStateWhenTheServerOffersNothing() {
        val a = parse(row("confirmada")).single()
        assertTrue(AppointmentActions.available(a).isEmpty())
    }

    @Test fun blockedActionsKeepTheirSpanishReasonAndUnknownOnesAreIgnored() {
        val a = parse(row("confirmada", listOf("cancelar"), listOf("no_asistio" to "Todavía no llega la hora de la cita.", "otra" to "x"))).single()
        assertEquals(listOf(AppointmentAction.NO_SHOW to "Todavía no llega la hora de la cita."), AppointmentActions.blocked(a))
        assertEquals(listOf(AppointmentAction.CANCEL), AppointmentActions.available(a))
    }

    @Test fun newStatesAndThePendingRescheduleAreParsed() {
        val withRequest = row("confirmada", listOf("aceptar_reprogramacion", "rechazar_reprogramacion")).put("reschedule", JSONObject()
            .put("id", "r1").put("start", "2026-11-15T15:00:00Z").put("end", "2026-11-15T15:20:00Z").put("state", "pendiente")
            .put("origin", "paciente").put("reason", JSONObject.NULL).put("rejectionReason", JSONObject.NULL).put("version", 4))
        val rows = parse(withRequest, row("vencida"), row("reprogramada").put("rescheduledToId", "a2"))
        assertEquals("r1", rows[0].pendingReschedule?.id)
        assertEquals(4, rows[0].reschedule?.version)
        assertEquals(AppointmentActions.EXPIRED, rows[1].state)
        assertEquals("a2", rows[2].rescheduledToId)
        assertEquals(listOf(rows[0]), ReceptionScheduling.rescheduleDecisions(rows))
    }

    @Test fun aRescheduleDecisionWithoutItsRequestIsNotOffered() {
        val withRequest = row("confirmada", listOf("aceptar_reprogramacion", "rechazar_reprogramacion", "cancelar")).put("reschedule", JSONObject()
            .put("id", "r1").put("start", "2026-11-15T15:00:00Z").put("end", "2026-11-15T15:20:00Z").put("state", "pendiente").put("version", 4))
        val withoutRequest = row("confirmada", listOf("aceptar_reprogramacion", "rechazar_reprogramacion", "cancelar"))
        val rows = parse(withRequest, withoutRequest)
        assertEquals(listOf(AppointmentAction.ACCEPT_RESCHEDULE, AppointmentAction.REJECT_RESCHEDULE, AppointmentAction.CANCEL), AppointmentActions.available(rows[0]))
        assertEquals(listOf(AppointmentAction.CANCEL), AppointmentActions.available(rows[1]))
    }

    @Test fun commandPathsAndBodies() {
        assertEquals("/citas/a1/reprogramar", AppointmentActions.path(AppointmentAction.RESCHEDULE, "a1"))
        assertEquals("/citas/a1/no-asistio", AppointmentActions.path(AppointmentAction.NO_SHOW, "a1"))
        assertEquals("/citas/reprogramaciones/r1/aceptar", AppointmentActions.path(AppointmentAction.ACCEPT_RESCHEDULE, "a1", "r1"))
        val body = AppointmentActions.body(AppointmentAction.RESCHEDULE, 2, "", DaySlot("s", "e", SlotStatus.FREE, null))
        assertEquals("s", body.getString("start")); assertEquals("e", body.getString("end")); assertEquals(2, body.getInt("version"))
        assertEquals("Llegó tarde", AppointmentActions.body(AppointmentAction.NO_SHOW, 2, " Llegó tarde ").getString("reason"))
        assertEquals("rejectionReason", AppointmentActions.reasonField(AppointmentAction.REJECT_RESCHEDULE))
    }

    @Test fun rejectAndCancelNeedAMotiveOfTenCharactersWithALiveCounter() {
        assertNotNull(AppointmentActions.reasonError(AppointmentAction.REJECT, "corto"))
        assertNull(AppointmentActions.reasonError(AppointmentAction.REJECT, "Sin turno ese día"))
        assertNotNull(AppointmentActions.reasonError(AppointmentAction.CANCEL, "   "))
        assertNotNull(AppointmentActions.reasonError(AppointmentAction.REJECT_RESCHEDULE, "no"))
        assertNull(AppointmentActions.reasonError(AppointmentAction.CONFIRM, ""))
        assertEquals("reason", AppointmentActions.reasonField(AppointmentAction.CANCEL))
        assertEquals("rejectionReason", AppointmentActions.reasonField(AppointmentAction.REJECT))
        assertEquals("Faltan 5 caracteres", AppointmentActions.counter("corto"))
        assertEquals("17/500 ✓", AppointmentActions.counter("Sin turno ese día"))
    }

    @Test fun businessCodesHaveSpanishMessages() {
        listOf("cita_con_consulta", "cita_fuera_de_dia", "fila_llamados_insuficientes", "fila_sin_espera", "solicitudes_pendientes_max", "cancelacion_fuera_de_plazo", "franja_ocupada")
            .forEach { assertNotNull(it, BusinessErrors.message(it)) }
        assertNull(BusinessErrors.message("otro"))
    }

    @Test fun patientAppointmentsCarryTheDeadlineAndTheActions() {
        val rows = PatientAppointmentRules.parse(JSONArray().put(row("confirmada", listOf("cancelar"), listOf("reprogramar" to "Ya tienes una solicitud pendiente."))))
        val a = rows.single()
        assertTrue(a.allows(AppointmentAction.CANCEL))
        assertEquals("Ya tienes una solicitud pendiente.", a.blockedReason(AppointmentAction.RESCHEDULE))
        assertEquals("2026-11-14T18:00:00Z", a.cancelableUntil)
        assertEquals("d1", a.doctorId)
    }
}
