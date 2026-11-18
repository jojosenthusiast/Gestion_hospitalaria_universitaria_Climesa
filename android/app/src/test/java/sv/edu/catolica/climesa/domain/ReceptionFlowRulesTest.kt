package sv.edu.catolica.climesa.domain

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Reception audit (REC): the rules the Android screens now share with the web. */
class ReceptionFlowRulesTest {
    private fun row(vararg pairs: Pair<String, Any?>) = JSONObject().apply { pairs.forEach { (k, v) -> put(k, v ?: JSONObject.NULL) } }

    // Pending count merge (S8): asked appointments plus pending requests by category, one count, like the web.
    @Test fun appointmentRequestsCountAskedAppointmentsAndPendingCategoryRequests() {
        val appointments = listOf(row("state" to "solicitada"), row("state" to "confirmada"), row("state" to "vencida"))
        val requests = listOf(row("state" to "pendiente"), row("state" to "pendiente"), row("state" to "asignada"))
        assertEquals(3, RoleDashboard.appointmentRequestCount(appointments, requests))
        assertEquals(1, RoleDashboard.appointmentRequestCount(appointments, emptyList()))
    }

    // Void window (B-3): only while the server window is open and the number still waits.
    @Test fun aNumberIsVoidableOnlyInsideTheServerWindowWhileItWaits() {
        val now = 1_000_000L
        assertTrue(QueueRules.voidable(now + 60_000, "en_espera", now))
        assertFalse(QueueRules.voidable(now - 1, "en_espera", now))
        assertFalse(QueueRules.voidable(null, "en_espera", now))
        assertFalse(QueueRules.voidable(now + 60_000, "llamado", now))
    }

    @Test fun theBoardReadsVoidWindowCalledByMeAndPatientFromTheServer() {
        val tickets = QueueRules.parse(JSONArray().put(row("id" to "t1", "service" to "consulta_general", "numero" to 4, "state" to "llamado", "version" to 3,
            "voidableUntil" to "2030-11-20T14:10:00Z", "calledByMe" to true, "patientId" to "p1", "patientName" to "Ana Ficticia")))
        val ticket = tickets.single()
        assertEquals(java.time.Instant.parse("2030-11-20T14:10:00Z").toEpochMilli(), ticket.voidableUntilMillis)
        assertEquals(setOf("t1"), QueueRules.calledByMe(tickets))
        assertEquals(QuickSubject("p1", "Ana Ficticia", "CON 4"), QueueRules.vitalsSubject(ticket))
        assertNull(QueueRules.vitalsSubject(ticket.copy(state = "en_espera")))
    }

    // Per-field match (G-2): name, DUI and birth compared one by one; a null account name never prints "null".
    @Test fun linkingComparesEachFieldAndNeverShowsNull() {
        val parsed = ReceptionLinking.parse(JSONArray().put(row(
            "id" to "v1", "version" to 2, "createdAt" to "2030-11-20T14:00:00Z",
            "account" to row("email" to "ana@example.test", "name" to null),
            "declared" to row("dui" to "06612345-2", "birth" to "1999-05-30"),
            "candidate" to row("id" to "pac-1", "record" to "000412-7", "fullName" to "Ána  Ficticia", "birth" to "1999-05-30", "dui" to "06612345-2"),
            "candidates" to 1,
        ))).single()
        assertEquals("", parsed.accountName)
        assertEquals("06612345-2", parsed.candidateDui)
        val fields = parsed.fields.associateBy { it.label }
        assertEquals("Sin nombre en la cuenta", fields.getValue("Nombre").declared)
        assertFalse(fields.getValue("Nombre").matches)
        assertTrue(fields.getValue("DUI").matches)
        assertTrue(fields.getValue("Nacimiento").matches)
        assertEquals("30 may 1999", fields.getValue("Nacimiento").declared)
        assertEquals(listOf("nombre"), parsed.mismatched)
        val named = parsed.copy(accountName = "Ana Ficticia")
        assertTrue(named.fields.first { it.label == "Nombre" }.matches)
    }

    @Test fun duplicateRecordsSayWhatReceptionCanDo() {
        val row = LinkRequestRow("v", 1, "", "a@example.test", "Ana", "06612345-2", "1999-05-30", null, null, null, 2)
        assertTrue(row.guidance.contains("Recepción no fusiona expedientes"))
        assertTrue(row.guidance.contains("06612345-2"))
        assertFalse(row.canApprove)
    }

    // Label map: the web field names and readable values in "Cambios".
    @Test fun historyUsesTheWebFieldNamesAndReadableValues() {
        assertEquals("Segundo apellido", PatientHistory.label("segundo_apellido"))
        assertEquals("Correo", PatientHistory.label("correo"))
        assertEquals("Dirección", PatientHistory.label("direccion"))
        assertEquals("Precisión del nacimiento", PatientHistory.label("precision_nacimiento"))
        assertEquals("Apellidos", PatientHistory.label("primer_apellido"))
        assertEquals("Sexo" to "No registrado → Femenino", PatientHistory.change("sexo", "no_registrado", "femenino"))
        assertEquals("Nacimiento" to "Sin registrar → 30 may 1999", PatientHistory.change("nacimiento", null, "1999-05-30"))
        assertEquals("Estimada", PatientHistory.value("precision_nacimiento", "estimada"))
    }

    @Test fun birthDatesKeepTheYear() {
        assertEquals("3 ene 2001", BirthDates.format("2001-01-03"))
        assertNull(BirthDates.format(" "))
    }

    @Test fun theAssignSuggestionIsReadOnlyWhenFound() {
        val found = CategoryRequestRules.suggestion(row("found" to true, "doctorId" to "d1", "date" to "2030-11-21", "start" to "2030-11-21T15:00:00Z"))
        assertEquals(RequestSuggestion("d1", java.time.LocalDate.parse("2030-11-21"), "2030-11-21T15:00:00Z"), found)
        assertNull(CategoryRequestRules.suggestion(row("found" to false, "doctorId" to null, "date" to null)))
        assertNull(CategoryRequestRules.suggestion(JSONArray()))
    }

    @Test fun arrivalIsRegisteredOnlyOnTodaysConfirmedAppointmentWithoutOne() {
        val today = AppointmentAgenda.dayKey("2030-11-20T16:00:00Z")
        val parsed = ReceptionScheduling.appointments(JSONArray()
            .put(row("id" to "c1", "patientId" to "p1", "patientName" to "Ana", "doctorName" to "Dra", "start" to "2030-11-20T16:00:00Z", "end" to "2030-11-20T16:20:00Z", "state" to "confirmada", "version" to 1))
            .put(row("id" to "c2", "patientId" to "p2", "patientName" to "Luis", "doctorName" to "Dra", "start" to "2030-11-20T16:20:00Z", "end" to "2030-11-20T16:40:00Z", "state" to "confirmada", "version" to 1,
                "arrival" to row("id" to "t1", "numero" to 4, "state" to "en_espera"))))
        assertTrue(parsed[0].canRegisterArrival(today))
        assertFalse(parsed[1].canRegisterArrival(today))
        assertEquals("CON 4", parsed[1].arrival?.code)
        assertFalse(parsed[0].copy(state = "solicitada").canRegisterArrival(today))
    }
}
