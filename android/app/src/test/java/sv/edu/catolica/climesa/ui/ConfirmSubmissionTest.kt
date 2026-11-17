package sv.edu.catolica.climesa.ui

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** R3 A-19: a confirmation closes only when its write succeeds; an error keeps it open with the typed reason. */
class ConfirmSubmissionTest {
    @Test fun `closes after the write answers without an error`() {
        val s = ConfirmSubmission()
        s.confirm()
        assertFalse("still sending", s.settle(busy = true, error = null))
        assertTrue(s.settle(busy = false, error = null))
        assertFalse(s.sent)
    }

    @Test fun `stays open after an error and closes on the next success`() {
        val s = ConfirmSubmission()
        s.confirm()
        assertFalse(s.settle(busy = true, error = null))
        assertFalse("error keeps the dialog open", s.settle(busy = false, error = "No se pudo cancelar la cita."))
        assertFalse("nothing sent again yet", s.settle(busy = false, error = null))
        s.confirm()
        assertFalse(s.settle(busy = true, error = null))
        assertTrue(s.settle(busy = false, error = null))
    }

    @Test fun `a change before confirming never closes`() {
        val s = ConfirmSubmission()
        assertFalse(s.settle(busy = false, error = null))
        assertFalse(s.settle(busy = true, error = "x"))
    }
}
