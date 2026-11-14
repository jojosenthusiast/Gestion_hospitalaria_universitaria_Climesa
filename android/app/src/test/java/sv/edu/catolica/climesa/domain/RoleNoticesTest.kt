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
}
