package sv.edu.catolica.climesa.domain

import java.time.LocalDate
import java.time.temporal.ChronoUnit
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Patient flow audit: appointment window, menu by link state, «Mi habitación», access log by day, hospital location. */
class PatientFlowRulesTest {
    private val today = LocalDate.parse("2026-11-18")

    // A bare `GET /citas` covers 7 days back and 31 ahead; "Mis citas" asks for an explicit window inside the 93-day limit.
    @Test fun appointmentWindowIsExplicitAndInsideTheApiLimit() {
        assertEquals("/citas?from=2026-09-20&to=2026-12-21", PatientAppointmentRules.listPath(today))
        val from = today.minusDays(PatientAppointmentRules.PAST_DAYS)
        val to = today.plusDays(PatientAppointmentRules.AHEAD_DAYS)
        // The API spans from 00:00 of `from` to 23:59:59 of `to`: that must stay under 93 days.
        assertTrue(ChronoUnit.DAYS.between(from, to) + 1 <= 93)
        assertTrue(PatientAppointmentRules.AHEAD_DAYS > 31)
    }

    // "Vincular expediente" leaves the menu once linked; «Mi habitación» needs the record.
    @Test fun linkRecordHidesOnceLinkedAndMyRoomWaitsForTheRecord() {
        val permissions = listOf("sesion.perfil", "cuenta.vincular", "admision.ver", "citas.ver")
        val unlinked = AndroidSections.forAccount("PAC", AccessProfile(permissions = permissions))
        assertTrue(AndroidSection.LINK_RECORD in unlinked)
        assertFalse(AndroidSection.MY_ROOM in unlinked)
        val linked = AndroidSections.forAccount("PAC", AccessProfile(permissions = permissions, patientId = "p1"))
        assertFalse(AndroidSection.LINK_RECORD in linked)
        assertTrue(AndroidSection.MY_ROOM in linked)
        // Other roles keep exactly their visible sections.
        val rec = listOf("sesion.perfil", "fila.emitir", "citas.ver")
        assertEquals(AndroidSections.visible("REC", rec), AndroidSections.forAccount("REC", AccessProfile(permissions = rec)))
    }

    @Test fun myRoomIsTheCurrentStayWithABed() {
        fun admission(id: String, state: String, bed: String, patient: String? = "p1") = HospitalAdmission(id, "Ana", state, bed, "semiprivada", false, 1, patientId = patient)
        val list = listOf(admission("a", "alta", "2-01A"), admission("b", "hospitalizado", "2-04A"), admission("c", "pendiente_cama", ""))
        assertEquals("b", MyRoomRules.current(list, "p1")?.id)
        assertNull(MyRoomRules.current(list, "otro"))
        assertNull(MyRoomRules.current(listOf(admission("d", "hospitalizado", ""))))
        assertEquals("c", MyRoomRules.waiting(list, "p1")?.id)
    }

    // "Quién vio mi expediente": grouped by local day, newest first; the last week stays open, older days fold.
    @Test fun accessLogGroupsByDayAndFoldsOlderThanAWeek() {
        val entries = listOf(
            AccessEntry("2026-11-18T16:00:00Z", "Médico", "Expediente", "Consulta"),
            AccessEntry("2026-11-18T15:00:00Z", "Recepción", "Ficha", "Cita"),
            AccessEntry("2026-11-12T15:00:00Z", "Médico", "Expediente", "Consulta"),
            AccessEntry("2026-11-11T15:00:00Z", "Laboratorio", "Resultados", "Orden"),
            AccessEntry("sin fecha", "Médico", "Expediente", "Consulta"),
        )
        val days = MyAccessRules.byDay(entries, today)
        assertEquals(listOf("2026-11-18", "2026-11-12", "2026-11-11"), days.map { it.date.toString() })
        assertEquals(listOf(false, false, true), days.map { it.older })
        assertEquals(listOf("Médico", "Recepción"), days.first().entries.map { it.role })
        assertEquals("10:00", MyAccessRules.time("2026-11-18T16:00:00Z"))
    }

    // Short relative day without year for appointment cards and day headers.
    @Test fun appointmentDaysReadShortAndRelative() {
        assertEquals("Hoy · mié 18 nov", AppointmentAgenda.shortDay("2026-11-18", today))
        assertEquals("Mañana · jue 19 nov", AppointmentAgenda.shortDay("2026-11-19", today))
        assertEquals("Jue 26 nov", AppointmentAgenda.shortDay("2026-11-26", today))
    }

    @Test fun hospitalLocationParsesAndBuildsCallAndMapLinks() {
        val place = HospitalInfoParser.location(JSONObject("""{"nombre":"Hospital Ficticio","direccion":"Calle 1","municipio":"Santa Ana","departamento":"Santa Ana","telefono":"2440-0000","latitud":13.99,"longitud":-89.55}"""))!!
        assertEquals("tel:24400000", place.callUri)
        assertEquals("geo:13.99,-89.55?q=13.99,-89.55(Hospital%20Ficticio)", place.mapUri)
        assertNull(HospitalInfoParser.location(JSONObject("{}")))
        assertNull(HospitalInfoParser.location(JSONObject("""{"nombre":"X","telefono":""}"""))!!.callUri)
    }
}
