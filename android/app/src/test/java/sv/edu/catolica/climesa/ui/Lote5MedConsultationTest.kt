package sv.edu.catolica.climesa.ui

import java.time.Instant
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import sv.edu.catolica.climesa.domain.CategoryRef
import sv.edu.catolica.climesa.domain.ConsultationAutosave
import sv.edu.catolica.climesa.domain.ConsultationContext
import sv.edu.catolica.climesa.domain.ConsultationForm
import sv.edu.catolica.climesa.domain.ConsultationGuard
import sv.edu.catolica.climesa.domain.ConsultationRecordRules
import sv.edu.catolica.climesa.domain.ConsultationVital
import sv.edu.catolica.climesa.domain.MedicalAppointment
import sv.edu.catolica.climesa.domain.QueueConsultation
import sv.edu.catolica.climesa.domain.UnsignedConsultation

/** Lote 5 S12/S3: what signing needs, the full clinical names, autosave and what the patient asked for. */
class Lote5MedConsultationTest {
    private val appt = MedicalAppointment("a1", "p1", "Ana", "2026-11-18T15:00:00Z", "2026-11-18T15:20:00Z", "confirmada", "Dolor de cabeza", "k1", "abierta", "Cefalea", "", "", 3,
        categories = listOf(CategoryRef("cabeza", "Cabeza", "cabeza")))

    @Test fun signNeedsMotiveAndPlanAndTheBarSaysWhatIsMissing() {
        assertEquals(listOf("reason", "plan"), ConsultationForm.missing(" ", ""))
        assertEquals("Falta: motivo de consulta y plan", FormCopy.missingSummary(ConsultationForm.missingNames("", "")))
        assertEquals("Falta: plan", FormCopy.missingSummary(ConsultationForm.missingNames("Tos", " ")))
        assertNull(FormCopy.missingSummary(ConsultationForm.missingNames("Tos", "Reposo")))
        assertEquals(setOf("reason"), ConsultationForm.errors("", "Reposo").keys)
        assertTrue(ConsultationForm.errors("Tos", "Reposo").isEmpty())
    }

    @Test fun vitalLabelsHaveNoAbbreviations() {
        val banned = Regex("""\b(FC|FR|PA|PAS|PAD|Temp|Sat|SpO2|SpO₂|DC|T)\b\.?""")
        ConsultationVital.entries.forEach { assertFalse(it.fullLabel, banned.containsMatchIn(it.label)) }
        assertEquals("Frecuencia cardiaca (latidos por minuto)", ConsultationVital.HEART_RATE.fullLabel)
        assertEquals("Temperatura (°C)", ConsultationVital.TEMPERATURE.fullLabel)
        val detail = JSONObject("""{"vitalSigns":[{"id":"v","takenAt":"2026-11-18T15:00:00Z","systolic":120,"diastolic":80,"heartRate":72,"temperature":36.8,"oxygenSaturation":98}]}""")
        val names = ConsultationRecordRules.vitals(detail).single().parts.map { it.first }
        assertEquals(listOf("Presión arterial", "Frecuencia cardiaca", "Temperatura", "Saturación de oxígeno"), names)
        names.forEach { assertFalse(it, banned.containsMatchIn(it)) }
    }

    @Test fun vitalRangesAreCheckedWhileTyping() {
        assertNull(ConsultationVital.HEART_RATE.error(""))
        assertNull(ConsultationVital.HEART_RATE.error("72"))
        assertEquals("Debe estar entre 20 y 250 latidos por minuto.", ConsultationVital.HEART_RATE.error("300"))
        assertEquals("Escribe un número entero.", ConsultationVital.SYSTOLIC.error("120.5"))
        assertNull(ConsultationVital.TEMPERATURE.error("36,8"))
        assertEquals("Escribe solo números.", ConsultationVital.OXYGEN.error("abc"))
    }

    @Test fun autosaveSendsOnlyChangesWithTheDraftBody() {
        assertFalse(ConsultationAutosave.changed(appt, "Cefalea ", "", ""))
        assertTrue(ConsultationAutosave.changed(appt, "Cefalea", "", "Reposo"))
        val body = ConsultationAutosave.body(3, " Cefalea ", "", "Reposo")
        assertEquals(3, body.getInt("version")); assertEquals("Cefalea", body.getString("reason")); assertEquals("Reposo", body.getString("plan"))
        assertEquals("Borrador guardado automáticamente a las 09:00", ConsultationAutosave.savedText(Instant.parse("2026-11-18T15:00:00Z")))
    }

    @Test fun contextShowsWhatThePatientAskedFor() {
        val fromAppointment = ConsultationContext.of(appt, emptyList(), null)!!
        assertEquals("Cita de las 09:00", fromAppointment.origin)
        assertEquals("Dolor de cabeza", fromAppointment.reason)
        assertEquals(listOf("cabeza"), fromAppointment.categories.map { it.code })
        // A consultation reopened by id finds its appointment in the agenda.
        val resumed = appt.copy(appointmentId = "", reason = null, categories = emptyList())
        assertEquals("Dolor de cabeza", ConsultationContext.of(resumed, listOf(appt), null)?.reason)
        val ticket = QueueConsultation("t", 4, "Ana", "en_atencion", "k9", "abierta", "emergencia", priority = "urgente")
        val walkIn = ConsultationContext.of(resumed.copy(consultationId = "k9"), emptyList(), ticket)!!
        assertEquals("Número EMG 4 · Emergencia · Llegó sin cita", walkIn.origin)
        assertEquals("urgente", walkIn.priority)
        assertNull(ConsultationContext.of(resumed.copy(consultationId = "k9"), emptyList(), null))
    }

    @Test fun anotherUnsignedConsultationIsFlaggedBeforeStarting() {
        val open = UnsignedConsultation("k1", "p1", "Ana", null, null, null, "2026-11-18T14:00:00Z", 1)
        assertEquals("k1", ConsultationGuard.unsignedOther(listOf(open), null)?.id)
        assertNull(ConsultationGuard.unsignedOther(listOf(open), "k1"))
        assertNull(ConsultationGuard.unsignedOther(emptyList(), null))
    }
}
