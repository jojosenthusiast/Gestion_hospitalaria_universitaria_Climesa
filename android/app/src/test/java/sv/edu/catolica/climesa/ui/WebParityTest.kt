package sv.edu.catolica.climesa.ui

import androidx.compose.ui.graphics.Color
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import sv.edu.catolica.climesa.domain.InboxNotice
import sv.edu.catolica.climesa.domain.NoticeInbox
import sv.edu.catolica.climesa.domain.NoticeInboxRules
import sv.edu.catolica.climesa.domain.NoticeLevel
import sv.edu.catolica.climesa.domain.NoticeState
import sv.edu.catolica.climesa.ui.icons.ClimesaIcons

/** Lote 4: Android matches the web in identity glyphs, bell colour and the mono rule. */
class WebParityTest {
    @Test fun rolesUseTheWebGlyphs() {
        val glyphs = IdentityCatalog.roleCodes.associateWith { IdentityCatalog.role(it).glyph }
        assertEquals(
            mapOf("ADM" to "shield", "DPD" to "lock", "JOP" to "clipboard", "REC" to "desk", "AST" to "hand", "ENF" to "heart", "MED" to "steth", "LAB" to "flask", "PAR" to "ambulance", "PAC" to "user"),
            glyphs,
        )
        // JOP draws the identity clipboard, not the toolbar one.
        assertTrue(IdentityCatalog.role("JOP").icon === ClimesaIcons.GlyphClipboard)
        assertTrue(IdentityCatalog.role("MED").icon === ClimesaIcons.Steth)
    }

    @Test fun areasUseTheWebGlyphsAndTheAmbulanceRule() {
        assertEquals("bay", IdentityCatalog.area("Bahía 3", "bahia").glyph)
        assertEquals("ambulancia", IdentityCatalog.area("Ambulancias").key)
        assertEquals("ambulance", IdentityCatalog.area("Transporte sanitario").glyph)
        assertEquals("red", IdentityCatalog.area("Ambulancias").tone.name.lowercase())
        // Recepción still wins over a later rule, as in the web order.
        assertEquals("recepcion", IdentityCatalog.area("Recepción de ambulancias").key)
        assertEquals("cube", IdentityCatalog.area("Sin pista").glyph)
    }

    private fun notice(id: String, level: NoticeLevel, state: NoticeState = NoticeState.CURRENT, acknowledgedAt: String? = null) = InboxNotice(
        id = id, title = "Aviso $id", body = "", from = null, until = null, isPublic = false, roles = listOf("ENF"), level = level, areas = emptyList(),
        publishedAt = null, targeted = true, acknowledgedAt = acknowledgedAt, remindAt = null, highlighted = false, state = state,
    )

    private fun inbox(vararg n: InboxNotice) = NoticeInbox(null, n.toList(), unread = n.size, critical = 0, reminderHours = 4.0, nextChange = null)

    @Test fun theBellIsRedOnlyWhileACriticalNoticeInForceIsUnread() {
        assertFalse(NoticeInboxRules.bellCritical(null))
        assertFalse(NoticeInboxRules.bellCritical(inbox(notice("a", NoticeLevel.IMPORTANT))))
        assertTrue(NoticeInboxRules.bellCritical(inbox(notice("c", NoticeLevel.CRITICAL))))
        assertFalse(NoticeInboxRules.bellCritical(inbox(notice("c", NoticeLevel.CRITICAL, acknowledgedAt = "2026-11-18T10:00:00Z"))))
        assertFalse(NoticeInboxRules.bellCritical(inbox(notice("c", NoticeLevel.CRITICAL, NoticeState.EXPIRED))))
        assertFalse(NoticeInboxRules.bellCritical(inbox(notice("c", NoticeLevel.CRITICAL)), hidden = setOf("c")))
    }

    @Test fun theBellCountIsAWhitePillWithPrimaryTextAndRedOnlyWhenCritical() {
        val surface = Color.White
        val primaryText = Color(0xFF0043B2)
        val red = Color(0xFFB71C1C)
        assertEquals(surface to primaryText, bellCountColors(false, surface, primaryText, red))
        assertEquals(red to Color.White, bellCountColors(true, surface, primaryText, red))
    }

    @Test fun monoIsOnlyForCodes() {
        val t = ClimesaTypography
        val styles = listOf(t.displaySmall, t.headlineLarge, t.headlineMedium, t.headlineSmall, t.titleLarge, t.titleMedium, t.titleSmall, t.bodyLarge, t.bodyMedium, t.bodySmall, t.labelLarge, t.labelMedium, t.labelSmall)
        assertTrue(styles.all { it.fontFamily == ClimesaSans })
        assertEquals(ClimesaMono, CodeText.fontFamily)
        // Eyebrows: sans 12/700 with 0.08em tracking.
        assertEquals(12f, t.labelSmall.fontSize.value)
        assertEquals(0.96f, t.labelSmall.letterSpacing.value, 0.001f)
    }
}
