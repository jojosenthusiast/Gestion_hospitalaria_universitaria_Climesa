package sv.edu.catolica.climesa.ui

import androidx.compose.ui.graphics.Color
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import sv.edu.catolica.climesa.domain.LabFilter
import sv.edu.catolica.climesa.domain.LabStage
import sv.edu.catolica.climesa.domain.NoticeFilter

/** A status filter chip copies the badge of the status it filters; "Todos" stays neutral. */
class StatusFilterChipTest {
    @Test fun `notice filters copy the unread and critical badges`() {
        assertNull(FilterTones.notice(NoticeFilter.ALL))
        assertEquals(ChipTone.Family(StatusFamily.ESPERA), FilterTones.notice(NoticeFilter.UNREAD))
        assertEquals(StatusPattern.STRIPED, FilterTones.notice(NoticeFilter.UNREAD)!!.pattern)
        assertEquals(ChipTone.Level(Priority.EMERGENCIA), FilterTones.notice(NoticeFilter.CRITICAL))
        assertEquals(StatusPattern.DOUBLE, FilterTones.notice(NoticeFilter.CRITICAL)!!.pattern)
        assertEquals(LightSystemColors.critical, LightSystemColors.tone(FilterTones.notice(NoticeFilter.CRITICAL)!!).first)
    }

    @Test fun `lab filters copy the stage pill of the card`() {
        assertNull(FilterTones.lab(LabFilter.ALL))
        assertEquals(ChipTone.Family(labStageFamily(LabStage.PENDING)), FilterTones.lab(LabFilter.REQUESTED))
        assertEquals(ChipTone.Family(StatusFamily.ATENCION), FilterTones.lab(LabFilter.IN_PROCESS))
        assertEquals(ChipTone.Family(StatusFamily.ESPERA), FilterTones.lab(LabFilter.TO_REVIEW))
        assertEquals(ChipTone.Family(StatusFamily.LISTO), FilterTones.lab(LabFilter.RELEASED))
    }

    @Test fun `state filters resolve like the status badge`() {
        assertNull(FilterTones.state(""))
        assertEquals(ChipTone.Family(StatusFamily.LISTO), FilterTones.state("completado"))
        assertEquals(ChipTone.Family(StatusFamily.CERRADO), FilterTones.state("cancelado"))
        assertEquals(ChipTone.Level(Priority.URGENTE), FilterTones.state("agotado"))
        assertEquals(ChipTone.Family(StatusFamily.ESPERA), ChipTone.of("solicitada"))
        assertEquals(ChipTone.Family(StatusFamily.LISTO), FilterTones.patientActivity(0))
        assertEquals(ChipTone.Family(StatusFamily.CERRADO), FilterTones.patientActivity(1))
        assertNull(FilterTones.patientActivity(2))
    }

    @Test fun `every chip tone has AA contrast selected and unselected in both themes`() {
        fun channel(v: Float) = if (v <= 0.03928f) v / 12.92 else Math.pow((v + 0.055) / 1.055, 2.4)
        fun lum(c: Color) = 0.2126 * channel(c.red) + 0.7152 * channel(c.green) + 0.0722 * channel(c.blue)
        fun ratio(a: Color, b: Color): Double { val (hi, lo) = listOf(lum(a), lum(b)).sortedDescending(); return (hi + 0.05) / (lo + 0.05) }
        val tones = StatusFamily.entries.map { ChipTone.Family(it) } + Priority.entries.map { ChipTone.Level(it) }
        listOf(LightSystemColors to LightScheme.surface, DarkSystemColors to DarkScheme.surface).forEach { (colors, surface) ->
            tones.forEach { tone ->
                listOf(false, true).forEach { selected ->
                    val (text, background) = colors.chip(tone, selected, surface)
                    val r = ratio(text, background)
                    assert(r >= 4.5) { "$tone selected=$selected: contrast $r" }
                }
            }
        }
    }
}
