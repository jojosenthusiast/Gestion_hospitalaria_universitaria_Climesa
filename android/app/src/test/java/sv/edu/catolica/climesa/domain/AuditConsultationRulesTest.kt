package sv.edu.catolica.climesa.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** Flow audit 2026-11-20: doctor consultation rules on Android. */
class AuditConsultationRulesTest {
    // D35/S5: zero counts are flagged (amber in the dialog) but the summary text is unchanged and signing is not blocked.
    @Test fun conteosEnCeroSeMarcanSinBloquear() {
        val counts = ConsultationRecordRules.signCounts(null)
        assertEquals(listOf("0 diagnósticos", "0 medicamentos", "0 exámenes"), counts.map { it.text })
        assertEquals(listOf(true, true, true), counts.map { it.empty })
        assertEquals("0 diagnósticos · 0 medicamentos · 0 exámenes", ConsultationRecordRules.signSummary(null))
        assertNull(ConsultationRecordRules.signBlocker("Dolor", "Reposo"))
    }

    // D35: "cita atendida" only when the consultation came from an appointment.
    @Test fun avisoDeFirmaSegunOrigen() {
        assertEquals("Consulta firmada y cita marcada como atendida.", ConsultationRecordRules.signedNotice(true))
        assertEquals("Consulta firmada.", ConsultationRecordRules.signedNotice(false))
    }

    // D78: consultation vitals use the API ranges inline.
    @Test fun signosDeConsultaFueraDeRango() {
        assertEquals("Fuera de rango: 40 a 100 %.", VitalsRules.fieldError(VitalMeasure.OXYGEN, "150"))
        assertNull(VitalsRules.fieldError(VitalMeasure.TEMPERATURE, "37,5"))
        assertEquals("98", VitalsRules.sanitize(VitalMeasure.HEART_RATE, "9a8"))
    }
}
