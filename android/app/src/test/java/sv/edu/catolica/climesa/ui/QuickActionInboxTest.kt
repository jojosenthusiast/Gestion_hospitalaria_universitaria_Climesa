package sv.edu.catolica.climesa.ui

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import sv.edu.catolica.climesa.domain.AndroidSection
import sv.edu.catolica.climesa.domain.QuickAction
import sv.edu.catolica.climesa.domain.QuickActionRequest

class QuickActionInboxTest {
    @Test fun aPostedActionIsOnlyVisibleToItsSectionAndConsumedOnce() {
        val inbox = QuickActionInbox()
        inbox.post(QuickActionRequest(AndroidSection.SAMPLE, QuickAction.TAKE_SAMPLE))
        assertNull(inbox.actionFor(AndroidSection.LAB))
        assertEquals(QuickAction.TAKE_SAMPLE, inbox.actionFor(AndroidSection.SAMPLE))
        inbox.consume(AndroidSection.LAB)
        assertEquals(QuickAction.TAKE_SAMPLE, inbox.actionFor(AndroidSection.SAMPLE))
        inbox.consume(AndroidSection.SAMPLE)
        assertNull(inbox.actionFor(AndroidSection.SAMPLE))
    }

    @Test fun leavingTheTargetSectionDropsTheRequest() {
        val inbox = QuickActionInbox(QuickActionRequest(AndroidSection.QUEUE, QuickAction.ISSUE_NUMBER))
        inbox.dropUnless(AndroidSection.QUEUE)
        assertEquals(QuickAction.ISSUE_NUMBER, inbox.actionFor(AndroidSection.QUEUE))
        inbox.dropUnless(AndroidSection.HOME)
        assertNull(inbox.actionFor(AndroidSection.QUEUE))
    }

    @Test fun theRequestSurvivesRotationThroughTheSaver() {
        val saved = with(QuickActionInbox.Saver) {
            val scope = androidx.compose.runtime.saveable.SaverScope { true }
            scope.save(QuickActionInbox(QuickActionRequest(AndroidSection.PATIENTS, QuickAction.REGISTER_PATIENT)))
        }
        val restored = QuickActionInbox.Saver.restore(saved!!)
        assertEquals(QuickAction.REGISTER_PATIENT, restored?.actionFor(AndroidSection.PATIENTS))
        assertNull(QuickActionInbox.Saver.restore("")?.request)
    }
}
