package sv.edu.catolica.climesa.domain

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * S11: `GET /me/avisos/bandeja` read with the exact field names of the API (`api/src/public/public.service.ts`, `inbox`):
 * `actualizadoEn, avisos, noLeidos, criticos, recordatorioHoras, proximoCambio`, and per notice `nivel, areas, publicadoEn,
 * dirigido, enteradoEn, recordarEn, destacado` on top of the `/me/avisos` fields.
 */
class NoticeInboxTest {
    private fun notice(
        id: String, nivel: String = "informativo", destacado: Boolean = false, dirigido: Boolean = true, enteradoEn: String? = null,
        recordarEn: String? = null, publico: Boolean = false, roles: List<String> = listOf("MED"), areas: List<String> = emptyList(),
    ) = JSONObject()
        .put("id", id).put("titulo", "Aviso $id").put("cuerpo", "Texto de $id").put("desde", "2026-11-16T12:00:00.000Z").put("hasta", "2026-11-20T12:00:00.000Z")
        .put("prioridad", "critico").put("publico", publico).put("roles", JSONArray(roles)).put("nivel", nivel).put("areas", JSONArray(areas))
        .put("publicadoEn", "2026-11-16T11:00:00.000Z").put("dirigido", dirigido)
        .put("enteradoEn", enteradoEn ?: JSONObject.NULL).put("recordarEn", recordarEn ?: JSONObject.NULL).put("destacado", destacado)

    private fun inbox(vararg notices: JSONObject, nextChange: String? = "2026-11-16T16:00:00.000Z") = JSONObject()
        .put("actualizadoEn", "2026-11-16T12:30:00.000Z").put("avisos", JSONArray(notices.toList()))
        .put("noLeidos", 2).put("criticos", 1).put("recordatorioHoras", 4).put("proximoCambio", nextChange ?: JSONObject.NULL)

    @Test fun parsesTheInboxWithTheApiFieldNames() {
        val parsed = NoticeInboxParser.parse(inbox(
            notice("a", nivel = "critico", destacado = true, areas = listOf("EMG")),
            notice("b", nivel = "importante", enteradoEn = "2026-11-16T12:10:00.000Z", recordarEn = "2026-11-16T16:00:00.000Z", dirigido = false, publico = true),
        ))
        assertEquals("2026-11-16T12:30:00.000Z", parsed.updatedAt)
        assertEquals(2, parsed.unread)
        assertEquals(1, parsed.critical)
        assertEquals(4.0, parsed.reminderHours, 0.0)
        assertEquals("2026-11-16T16:00:00.000Z", parsed.nextChange)
        val (a, b) = parsed.notices
        assertEquals("a", a.id); assertEquals("Aviso a", a.title); assertEquals("Texto de a", a.body)
        assertEquals(NoticeLevel.CRITICAL, a.level); assertTrue(a.highlighted); assertTrue(a.targeted)
        assertEquals(listOf("EMG"), a.areas); assertEquals(listOf("MED"), a.roles); assertFalse(a.isPublic)
        assertEquals("2026-11-16T11:00:00.000Z", a.publishedAt); assertEquals("2026-11-20T12:00:00.000Z", a.until)
        assertNull(a.acknowledgedAt); assertNull(a.remindAt)
        assertEquals(NoticeLevel.IMPORTANT, b.level); assertFalse(b.highlighted); assertFalse(b.targeted); assertTrue(b.isPublic)
        assertEquals("2026-11-16T12:10:00.000Z", b.acknowledgedAt); assertEquals("2026-11-16T16:00:00.000Z", b.remindAt)
    }

    @Test fun keepsTheServerOrderAndReadsNullsAsAbsent() {
        val parsed = NoticeInboxParser.parse(inbox(notice("z"), notice("a"), nextChange = null).put("recordatorioHoras", 2.5))
        assertEquals(listOf("z", "a"), parsed.notices.map { it.id })
        assertNull(parsed.nextChange)
        assertEquals(2.5, parsed.reminderHours, 0.0)
    }

    @Test fun anUnknownLevelReadsAsInformativeAndAMalformedBodyIsEmpty() {
        assertEquals(NoticeLevel.INFORMATIVE, NoticeInboxParser.parse(inbox(notice("x", nivel = "otro"))).notices.single().level)
        val empty = NoticeInboxParser.parse(JSONArray())
        assertTrue(empty.notices.isEmpty()); assertEquals(0, empty.unread); assertNull(empty.nextChange)
    }

    @Test fun theBannerShowsOnlyHighlightedNoticesMinusTheOnesJustHandled() {
        val parsed = NoticeInboxParser.parse(inbox(
            notice("a", nivel = "critico", destacado = true), notice("b", nivel = "critico", destacado = false), notice("c", nivel = "critico", destacado = true),
        ))
        assertEquals(listOf("a", "c"), NoticeInboxRules.banner(parsed).map { it.id })
        assertEquals(listOf("c"), NoticeInboxRules.banner(parsed, hidden = setOf("a")).map { it.id })
        assertTrue(NoticeInboxRules.banner(null).isEmpty())
    }

    @Test fun filtersAreAllUnreadAndCritical() {
        val parsed = NoticeInboxParser.parse(inbox(
            notice("a", nivel = "critico"), notice("b", nivel = "informativo", enteradoEn = "2026-11-16T12:10:00.000Z"), notice("c", nivel = "critico", enteradoEn = "2026-11-16T12:10:00.000Z"),
        ))
        assertEquals(listOf("Todos", "Sin leer", "Críticos"), NoticeFilter.entries.map { it.label })
        assertEquals(listOf("a", "b", "c"), NoticeInboxRules.filter(parsed.notices, NoticeFilter.ALL).map { it.id })
        assertEquals(listOf("a"), NoticeInboxRules.filter(parsed.notices, NoticeFilter.UNREAD).map { it.id })
        // Same rule as the API `criticos`: in force, addressed to the account, without "Enterado".
        assertEquals(listOf("a"), NoticeInboxRules.filter(parsed.notices, NoticeFilter.CRITICAL).map { it.id })
        assertNull(NoticeInboxRules.count(parsed, NoticeFilter.ALL))
        assertEquals(2, NoticeInboxRules.count(parsed, NoticeFilter.UNREAD))
        assertEquals(1, NoticeInboxRules.count(parsed, NoticeFilter.CRITICAL))
    }

    @Test fun criticalListAgreesWithTheCriticalCount() {
        val parsed = NoticeInboxParser.parse(inbox(
            notice("crit", nivel = "critico"), notice("public", nivel = "critico", dirigido = false),
            notice("done", nivel = "critico", enteradoEn = "2026-11-16T12:10:00.000Z"), notice("info", nivel = "informativo"),
        ))
        val listed = NoticeInboxRules.filter(parsed.notices, NoticeFilter.CRITICAL)
        assertEquals(listOf("crit"), listed.map { it.id })
        assertEquals(parsed.notices.count(NoticeInboxRules::isPendingCritical), listed.size)
    }

    @Test fun acknowledgeForAnyUnreadNoticeAndSnoozeOnlyForATargetedCriticalOne() {
        val parsed = NoticeInboxParser.parse(inbox(
            notice("crit", nivel = "critico"), notice("public", nivel = "critico", dirigido = false), notice("info", nivel = "informativo"),
            notice("done", nivel = "critico", enteradoEn = "2026-11-16T12:10:00.000Z"),
        )).notices.associateBy { it.id }
        assertTrue(NoticeInboxRules.canAcknowledge(parsed.getValue("crit")))
        assertTrue(NoticeInboxRules.canAcknowledge(parsed.getValue("public")))
        assertTrue(NoticeInboxRules.canAcknowledge(parsed.getValue("info")))
        assertFalse(NoticeInboxRules.canAcknowledge(parsed.getValue("done")))
        assertTrue(NoticeInboxRules.canSnooze(parsed.getValue("crit")))
        assertFalse(NoticeInboxRules.canSnooze(parsed.getValue("public")))
        assertFalse(NoticeInboxRules.canSnooze(parsed.getValue("info")))
        assertFalse(NoticeInboxRules.canSnooze(parsed.getValue("done")))
    }

    @Test fun theAudienceIsWordedAndAnAreaOnlyNoticeSaysTuArea() {
        assertEquals("Tu área", NoticeInboxRules.audience(isPublic = false, roles = emptyList(), areas = emptyList()))
        assertEquals("Área EMG, LAB", NoticeInboxRules.audience(isPublic = false, roles = emptyList(), areas = listOf("EMG", "LAB")))
        assertEquals("Medicina, Enfermería", NoticeInboxRules.audience(isPublic = false, roles = listOf("MED", "ENF"), areas = emptyList()))
        assertEquals("Pantalla pública y apps sin sesión + Recepción + Área EMG", NoticeInboxRules.audience(isPublic = true, roles = listOf("REC"), areas = listOf("EMG")))
        assertEquals("XYZ", NoticeInboxRules.audience(isPublic = false, roles = listOf("XYZ"), areas = emptyList()))
    }

    @Test fun reminderHoursAreWholeOrWithADecimalComma() {
        assertEquals("4", NoticeInboxRules.hoursText(4.0))
        assertEquals("1,5", NoticeInboxRules.hoursText(1.5))
    }

    @Test fun actionPathsAreTheAcknowledgeAndSnoozeEndpoints() {
        assertEquals("/me/avisos/n1/enterado", NoticeInboxRules.acknowledgePath("n1"))
        assertEquals("/me/avisos/n1/posponer", NoticeInboxRules.snoozePath("n1"))
    }

    @Test fun rejectedActionsAreClearSpanishNeverRawCodes() {
        assertEquals("Este aviso ya no está disponible para tu cuenta. La lista se actualizó.", NoticeInboxRules.actionMessage("no_encontrado"))
        assertEquals("Este aviso fue retirado; ya no necesita «Enterado». La lista se actualizó.", NoticeInboxRules.actionMessage("aviso_retirado"))
        assertEquals("Este aviso ya venció; ya no necesita «Enterado». La lista se actualizó.", NoticeInboxRules.actionMessage("aviso_vencido"))
        assertNull(NoticeInboxRules.actionMessage("version_conflicto"))
        assertNull(NoticeInboxRules.actionMessage(null))
    }

    @Test fun aFailedRefetchDropsTheNoticeThatChangedAndTheExpiredOnes() {
        val parsed = NoticeInboxParser.parse(inbox(
            notice("gone"), notice("live"),
            notice("old").put("hasta", "2026-11-16T10:00:00.000Z"),
        ))
        val now = java.time.Instant.parse("2026-11-16T12:00:00.000Z").toEpochMilli()
        val kept = NoticeInboxRules.afterFailedRefetch(parsed, EventoDominio("aviso.retirado", "aviso", "gone", 1), now)
        assertEquals(listOf("live"), kept.notices.map { it.id })
    }

    @Test fun datesShowInElSalvadorTime() {
        assertEquals("16 nov, 06:00", NoticeInboxRules.dateText("2026-11-16T12:00:00.000Z").replace(".", ""))
        assertEquals("", NoticeInboxRules.dateText(null))
    }
}
