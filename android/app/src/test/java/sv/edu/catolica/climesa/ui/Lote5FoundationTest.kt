package sv.edu.catolica.climesa.ui

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import sv.edu.catolica.climesa.domain.AppointmentAction

/** Lote 5 T0 (S1-S3): shared Android foundation rules. */
class Lote5FoundationTest {
    // S1: the bell count fits one to three characters.
    @Test fun bellBadgeTextCapsAtNinetyNinePlus() {
        assertNull(bellBadgeText(0))
        assertNull(bellBadgeText(-3))
        assertEquals("9", bellBadgeText(9))
        assertEquals("99", bellBadgeText(99))
        assertEquals("99+", bellBadgeText(100))
        assertEquals("99+", bellBadgeText(4321))
    }

    // S1: "Tamaño de letra" steps and how they are stored.
    @Test fun textScaleStepsAreNormalLargeExtraLarge() {
        assertEquals(listOf(1f, 1.15f, 1.3f), TextScale.entries.map { it.factor })
        assertEquals(listOf("Normal", "Grande", "Muy grande"), TextScale.entries.map { it.label })
        assertEquals("Grande (115 %)", TextScale.LARGE.percentLabel)
    }

    @Test fun textScaleRoundTripsThroughItsStoredValueAndDefaultsToNormal() {
        TextScale.entries.forEach { assertEquals(it, TextScale.fromStored(it.stored)) }
        assertEquals(TextScale.NORMAL, TextScale.fromStored(null))
        assertEquals(TextScale.NORMAL, TextScale.fromStored("enorme"))
    }

    @Test fun effectiveFontScaleMultipliesTheSystemScaleAndCapsIt() {
        assertEquals(1f, TextScale.effectiveFontScale(1f, TextScale.NORMAL), 0.0001f)
        assertEquals(1.15f, TextScale.effectiveFontScale(1f, TextScale.LARGE), 0.0001f)
        assertEquals(1.3f, TextScale.effectiveFontScale(1f, TextScale.EXTRA_LARGE), 0.0001f)
        // System already large: the product is capped at 1.5 so layouts keep working.
        assertEquals(1.5f, TextScale.effectiveFontScale(1.3f, TextScale.EXTRA_LARGE), 0.0001f)
        // Never smaller than the person's own system setting, and Normal leaves it untouched.
        assertEquals(1.8f, TextScale.effectiveFontScale(1.8f, TextScale.LARGE), 0.0001f)
        assertEquals(2f, TextScale.effectiveFontScale(2f, TextScale.NORMAL), 0.0001f)
    }

    // S2: role to look, like the web crud.css.
    @Test fun actionRolesMapToTheirCrudLook() {
        assertEquals(ActionStyle(filled = true, tone = ActionTone.Primary, border = ActionTone.Primary), ActionRole.Primary.style())
        assertEquals(ActionStyle(filled = false, tone = ActionTone.PrimaryText, border = ActionTone.PrimaryText), ActionRole.Edit.style())
        assertEquals(ActionStyle(filled = false, tone = ActionTone.Danger, border = ActionTone.Danger), ActionRole.Danger.style())
        assertEquals(ActionStyle(filled = false, tone = ActionTone.Ink, border = ActionTone.Ink), ActionRole.Neutral.style())
    }

    @Test fun appointmentCommandsGetTheOwnerColours() {
        assertEquals(ActionRole.Primary, appointmentActionRole(AppointmentAction.CONFIRM))
        assertEquals(ActionRole.Primary, appointmentActionRole(AppointmentAction.START_CONSULTATION))
        assertEquals(ActionRole.Primary, appointmentActionRole(AppointmentAction.ACCEPT_RESCHEDULE))
        assertEquals(ActionRole.Edit, appointmentActionRole(AppointmentAction.RESCHEDULE))
        assertEquals(ActionRole.Danger, appointmentActionRole(AppointmentAction.CANCEL))
        assertEquals(ActionRole.Danger, appointmentActionRole(AppointmentAction.REJECT))
        assertEquals(ActionRole.Danger, appointmentActionRole(AppointmentAction.REJECT_RESCHEDULE))
        assertEquals(ActionRole.Neutral, appointmentActionRole(AppointmentAction.NO_SHOW))
    }

    @Test fun appointmentCardActionsKeepTheServerOrderAndCallTheirCommand() {
        var called: AppointmentAction? = null
        val actions = appointmentCardActions(listOf(AppointmentAction.RESCHEDULE, AppointmentAction.CANCEL)) { called = it }
        assertEquals(listOf("Reprogramar", "Cancelar cita"), actions.map { it.label })
        actions[1].onClick()
        assertEquals(AppointmentAction.CANCEL, called)
    }

    // S3: the "Falta: ..." line of the sticky bar.
    @Test fun missingSummaryListsTheMissingRequiredItems() {
        assertNull(FormCopy.missingSummary(emptyList()))
        assertNull(FormCopy.missingSummary(listOf(" ", "")))
        assertEquals("Falta: motivo de consulta", FormCopy.missingSummary(listOf("motivo de consulta")))
        assertEquals("Falta: motivo de consulta y plan", FormCopy.missingSummary(listOf("motivo de consulta", "plan")))
        assertEquals("Falta: motivo, plan y diagnóstico", FormCopy.missingSummary(listOf("motivo", "plan", "diagnóstico", "plan")))
        assertEquals("Falta: motivo, plan, diagnóstico y 2 más", FormCopy.missingSummary(listOf("motivo", "plan", "diagnóstico", "peso", "talla")))
    }

    @Test fun formErrorFocusPicksTheFirstFieldWithAnErrorInScreenOrder() {
        val focus = FormErrorFocus()
        listOf("nombre", "motivo", "plan").forEach { focus.register(it, androidx.compose.ui.focus.FocusRequester(), androidx.compose.foundation.relocation.BringIntoViewRequester()) }
        assertEquals("motivo", focus.firstError(setOf("plan", "motivo")))
        assertNull(focus.firstError(setOf("otro")))
        focus.unregister("motivo")
        assertEquals("plan", focus.firstError(setOf("plan", "motivo")))
        assertTrue(FormCopy.LEGEND.contains("*"))
        assertFalse(FormCopy.REQUIRED_SPOKEN.isBlank())
    }
}
