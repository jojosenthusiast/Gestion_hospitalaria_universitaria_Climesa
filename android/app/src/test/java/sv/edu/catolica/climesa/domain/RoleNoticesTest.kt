package sv.edu.catolica.climesa.domain

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class RoleNoticesTest {
    private fun notice(id: String, title: String, priority: String?, publico: Boolean = true, roles: List<String> = emptyList()) = JSONObject()
        .put("id", id).put("titulo", title).put("cuerpo", "Texto").put("hasta", "2026-11-20T12:00:00.000Z").put("publico", publico)
        .put("roles", JSONArray(roles)).apply { if (priority != null) put("prioridad", priority) }

    @Test fun ordersByPriorityAndKeepsAudience() {
        val body = JSONObject().put("avisos", JSONArray()
            .put(notice("1", "Visitas", "atencion"))
            .put(notice("2", "Corte de agua", "critico"))
            .put(notice("3", "Simulacro", "urgente", publico = false, roles = listOf("MED", "ENF"))))
        val list = RoleNoticeParser.parse(body)
        assertEquals(listOf("Corte de agua", "Simulacro", "Visitas"), list.map { it.title })
        assertEquals(NoticePriority.URGENT, list[1].priority)
        assertEquals(false, list[1].isPublic)
        assertEquals(listOf("MED", "ENF"), list[1].roles)
    }

    @Test fun unknownPriorityFallsBackToAttentionAndBlankTitlesAreDropped() {
        val body = JSONObject().put("avisos", JSONArray().put(notice("1", "Sin prioridad", null)).put(notice("2", " ", "critico")))
        val list = RoleNoticeParser.parse(body)
        assertEquals(1, list.size)
        assertEquals(NoticePriority.ATTENTION, list[0].priority)
    }

    @Test fun anythingButAnObjectIsEmpty() {
        assertTrue(RoleNoticeParser.parse(JSONArray()).isEmpty())
        assertTrue(RoleNoticeParser.parse(null).isEmpty())
    }

    @Test fun noticeEventsMatchTheAvisoEntity() {
        assertTrue(NoticeEvents.matches(EventoDominio(type = "aviso.publicado", entity = "aviso", id = "x", version = 1)))
    }

    /** MA-AVI-02: editar o retirar un aviso llega como `aviso.actualizado`; Información del hospital también se actualiza. */
    @Test fun editedOrWithdrawnNoticesRefreshTheHospitalInfo() {
        val edited = EventoDominio(type = "aviso.actualizado", entity = "aviso", id = "x", version = 2)
        assertTrue(NoticeEvents.matches(edited))
        assertTrue(HospitalInfoEvents.matches(edited))
    }

    @Test fun feedCarriesTheNextChangeAndTheRefreshIsScheduledThere() {
        val body = JSONObject().put("avisos", JSONArray().put(notice("1", "Visitas", "atencion"))).put("proximoCambio", "2026-11-20T12:00:00.000Z")
        val feed = RoleNoticeParser.parseFeed(body)
        assertEquals(listOf("Visitas"), feed.notices.map { it.title })
        assertEquals("2026-11-20T12:00:00.000Z", feed.nextChange)
        val now = java.time.Instant.parse("2026-11-20T11:00:00.000Z").toEpochMilli()
        assertEquals(3_600_000L + NoticeRefresh.SLACK_MS, NoticeRefresh.delayMs(feed.nextChange, now))
        assertEquals(NoticeRefresh.SLACK_MS, NoticeRefresh.delayMs("2026-11-20T10:00:00.000Z", now))
        assertEquals(null, NoticeRefresh.delayMs(null, now))
        assertEquals(null, NoticeRefresh.delayMs("no es fecha", now))
        assertEquals(null, RoleNoticeParser.parseFeed(JSONObject().put("avisos", JSONArray()).put("proximoCambio", JSONObject.NULL)).nextChange)
    }

    @Test fun aFailedRefetchDropsTheChangedNoticeAndTheExpiredOnesInsteadOfShowingThemStale() {
        val list = RoleNoticeParser.parse(JSONObject().put("avisos", JSONArray()
            .put(notice("1", "Retirado", "critico"))
            .put(notice("2", "Sigue", "atencion").put("hasta", "2026-11-21T12:00:00.000Z"))))
        val withdrawn = EventoDominio(type = "aviso.actualizado", entity = "aviso", id = "1", version = 2)
        assertEquals(listOf("Sigue"), NoticeRefresh.afterFailedRefetch(list, withdrawn, nowMs = 0).map { it.title })
        val atNoon = java.time.Instant.parse("2026-11-20T12:00:00.000Z").toEpochMilli()
        assertEquals(listOf("Sigue"), NoticeRefresh.afterFailedRefetch(list, null, atNoon).map { it.title })
    }
}
