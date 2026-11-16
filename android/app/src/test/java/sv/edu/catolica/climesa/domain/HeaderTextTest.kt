package sv.edu.catolica.climesa.domain

import org.junit.Assert.assertEquals
import org.junit.Test

class HeaderTextTest {
    @Test fun singlePhraseTitleLosesItsClosingPeriod() {
        assertEquals("Camas", headerText("Camas."))
        assertEquals("Agenda propia y registro clínico", headerText("Agenda propia y registro clínico."))
    }

    @Test fun severalSentencesKeepTheirPunctuation() {
        assertEquals("Primera oración. Segunda oración.", headerText("Primera oración. Segunda oración."))
    }

    @Test fun textWithoutPeriodOrWithEllipsisIsUnchanged() {
        assertEquals("Mis citas", headerText("Mis citas"))
        assertEquals("Cargando…", headerText("Cargando…"))
        assertEquals("Espera...", headerText("Espera..."))
    }
}
