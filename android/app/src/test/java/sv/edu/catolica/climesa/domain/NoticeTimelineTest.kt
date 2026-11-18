package sv.edu.catolica.climesa.domain

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Owner: "Avisos" reads like "Citas": in force first, scheduled by day, expired (last 30 days) folded at the bottom. */
class NoticeTimelineTest {
    private fun notice(id: String, state: NoticeState, from: String, until: String, acknowledgedAt: String? = null, level: NoticeLevel = NoticeLevel.INFORMATIVE) = InboxNotice(
        id = id, title = "Aviso $id", body = "", from = from, until = until, isPublic = false, roles = listOf("ENF"), level = level, areas = emptyList(),
        publishedAt = from, targeted = true, acknowledgedAt = acknowledgedAt, remindAt = null, highlighted = false, state = state,
    )

    private val sample = listOf(
        notice("v1", NoticeState.CURRENT, "2026-11-17T12:00:00Z", "2026-11-19T12:00:00Z"),
        notice("p2", NoticeState.SCHEDULED, "2026-11-25T15:00:00Z", "2026-11-26T15:00:00Z"),
        notice("p1", NoticeState.SCHEDULED, "2026-11-20T15:00:00Z", "2026-11-21T15:00:00Z"),
        notice("p0", NoticeState.SCHEDULED, "2026-11-20T18:00:00Z", "2026-11-21T15:00:00Z"),
        notice("x1", NoticeState.EXPIRED, "2026-11-01T12:00:00Z", "2026-11-05T15:00:00Z"),
        notice("x2", NoticeState.EXPIRED, "2026-11-10T12:00:00Z", "2026-11-15T15:00:00Z", acknowledgedAt = "2026-11-11T12:00:00Z"),
        notice("x3", NoticeState.EXPIRED, "2026-11-10T12:00:00Z", "2026-11-15T18:00:00Z"),
    )

    @Test fun groupsInForceFirstThenScheduledByStartDayThenExpiredLatestFirst() {
        val t = NoticeInboxRules.timeline(sample)
        assertEquals(listOf("v1"), t.current.map { it.id })
        assertEquals(listOf("2026-11-20", "2026-11-25"), t.upcoming.map { it.first })
        assertEquals(listOf("p1", "p0"), t.upcoming.first().second.map { it.id })
        assertEquals(listOf("2026-11-15", "2026-11-05"), t.past.map { it.first })
        assertEquals(listOf("x3", "x2"), t.past.first().second.map { it.id })
        assertEquals(3, t.pastCount)
    }

    @Test fun parsesEstadoAndAMissingOneIsInForce() {
        val row = { id: String, estado: String? -> JSONObject().put("id", id).put("titulo", id).put("cuerpo", "").put("nivel", "critico").put("estado", estado ?: JSONObject.NULL) }
        val parsed = NoticeInboxParser.parse(JSONObject().put("avisos", JSONArray(listOf(row("a", "vencido"), row("b", "programado"), row("c", null), row("d", "vigente")))))
        assertEquals(listOf(NoticeState.EXPIRED, NoticeState.SCHEDULED, NoticeState.CURRENT, NoticeState.CURRENT), parsed.notices.map { it.state })
    }

    @Test fun onlyNoticesInForceTakeEnteradoSnoozeOrCountAsUnread() {
        val expired = notice("x", NoticeState.EXPIRED, "2026-11-01T12:00:00Z", "2026-11-05T15:00:00Z", level = NoticeLevel.CRITICAL)
        val scheduled = notice("p", NoticeState.SCHEDULED, "2026-11-25T15:00:00Z", "2026-11-26T15:00:00Z", level = NoticeLevel.CRITICAL)
        val current = notice("v", NoticeState.CURRENT, "2026-11-17T12:00:00Z", "2026-11-19T12:00:00Z", level = NoticeLevel.CRITICAL)
        assertFalse(NoticeInboxRules.canAcknowledge(expired))
        assertFalse(NoticeInboxRules.canAcknowledge(scheduled))
        assertTrue(NoticeInboxRules.canAcknowledge(current))
        assertFalse(NoticeInboxRules.canSnooze(expired))
        assertTrue(NoticeInboxRules.canSnooze(current))
        assertEquals(listOf("v"), NoticeInboxRules.filter(listOf(expired, scheduled, current), NoticeFilter.UNREAD).map { it.id })
        assertEquals(listOf("v"), NoticeInboxRules.filter(listOf(expired, scheduled, current), NoticeFilter.CRITICAL).map { it.id })
    }

    @Test fun badgeKeepsTheServerUnreadCount() {
        val inbox = NoticeInbox(null, sample, unread = 1, critical = 0, reminderHours = 4.0, nextChange = null)
        assertEquals(1, NoticeInboxRules.badge(inbox))
    }

    @Test fun aFailedRefetchKeepsTheExpiredHistory() {
        val inbox = NoticeInbox(null, sample, 1, 0, 4.0, null)
        val kept = NoticeInboxRules.afterFailedRefetch(inbox, null, java.time.Instant.parse("2026-11-18T00:00:00Z").toEpochMilli())
        assertEquals(sample.map { it.id }.toSet(), kept.notices.map { it.id }.toSet())
    }
}
