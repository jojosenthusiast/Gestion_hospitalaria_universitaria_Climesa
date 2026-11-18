package sv.edu.catolica.climesa.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Rules fixed in the final Android QA against production (2026-11-18). */
class FinalQaAndroidTest {
    @Test fun llamarSiguienteSigueVisibleAunqueHayaUnaConsultaSinFirmar() {
        // The unsigned consultation stays the primary action...
        assertEquals(ConsultationPrimary.ResumeUnsigned("c1"), ConsultationPrimary.pick(emptyList(), unsigned = listOf("c1"), canCallNext = false, canCallWaiting = true))
        // ...but the waiting queue keeps its call.
        assertTrue(ConsultationPrimary.showsCallWaiting(hasHandoff = false, canCall = true, waitingGeneral = true))
        assertFalse(ConsultationPrimary.showsCallWaiting(hasHandoff = true, canCall = true, waitingGeneral = true))
        assertFalse(ConsultationPrimary.showsCallWaiting(hasHandoff = false, canCall = false, waitingGeneral = true))
        assertFalse(ConsultationPrimary.showsCallWaiting(hasHandoff = false, canCall = true, waitingGeneral = false))
        assertFalse(ConsultationPrimary.showsCallWaiting(hasHandoff = false, canCall = true, waitingGeneral = true, officeBusy = true))
    }

    @Test fun lasFechasDelHistorialSonDelDiaDelHospitalYSeLeenConAnio() {
        // 02:00 UTC of the 17th is still the 16th in San Salvador (UTC-6).
        assertEquals("2026-10-16", ClinicalHistoryParser.localDay("2026-10-17T02:00:00Z"))
        assertEquals("2026-11-10", ClinicalHistoryParser.localDay("2026-11-10"))
        assertEquals("16 oct 2026", ClinicalHistoryParser.label("2026-10-16"))
    }
}
