package sv.edu.catolica.climesa.ui

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** Fase 2 system (docs/diseno/fase2/02-sistema.md, sections 1-4 and 7). */
class DesignSystemTest {
    private fun hex(color: Color) = String.format("#%06X", color.toArgb() and 0xFFFFFF)

    @Test fun `system colors copy the section 7 table, light and dark`() {
        // token, light, dark — verbatim from 02-sistema.md section 7.
        val table = listOf(
            Triple("AreaEmg", "#9B2C6F", "#F09AC9"), Triple("AreaEmgSoft", "#FAEAF3", "#3A1A2D"),
            Triple("AreaCon", "#0B6B63", "#6FD1C3"), Triple("AreaConSoft", "#E0F2EF", "#10302C"),
            Triple("AreaLab", "#5A3EA6", "#BBA8F2"), Triple("AreaLabSoft", "#EEEAFA", "#2A2142"),
            Triple("AreaHos", "#1D5C9A", "#8DB9EC"), Triple("AreaHosSoft", "#E4EEF8", "#16273D"),
            Triple("AreaRec", "#2D6B33", "#8CCF93"), Triple("AreaRecSoft", "#E4F1E5", "#172F1A"),
            Triple("AreaAmb", "#5C6213", "#CCD27A"), Triple("AreaAmbSoft", "#F0F2DA", "#2C2E12"),
            Triple("AreaGen", "#4A5865", "#AAB7C1"), Triple("AreaGenSoft", "#EDF0F2", "#222B36"),
            Triple("OnArea", "#FFFFFF", "#0C1220"),
            Triple("StatusEspera", "#6A45A6", "#BCA3EE"), Triple("StatusEsperaSoft", "#F1EBFA", "#2B2140"),
            Triple("StatusLlamado", "#8A5300", "#E8B25E"), Triple("StatusLlamadoSoft", "#FFF2D9", "#33260E"),
            Triple("StatusAtencion", "#1F55A3", "#8CB2F0"), Triple("StatusAtencionSoft", "#E8EFF9", "#18284A"),
            Triple("StatusListo", "#1D7444", "#6CCB92"), Triple("StatusListoSoft", "#E7F4EC", "#13301F"),
            Triple("StatusCerrado", "#4A5865", "#AAB7C1"), Triple("StatusCerradoSoft", "#EDF0F2", "#222B36"),
            Triple("OnStatus", "#FFFFFF", "#0C1220"),
            Triple("Critical", "#B71C1C", "#F2918A"), Triple("CriticalSoft", "#FCEAEA", "#3A1A17"),
            Triple("PriorityUrgente", "#A3480A", "#F0A36B"), Triple("PriorityUrgenteSoft", "#FDEBDD", "#3A2314"),
            Triple("PriorityRutina", "#55617A", "#9AA6BA"), Triple("PriorityRutinaSoft", "#EEF1F5", "#1B2538"),
        )
        val light = LightSystemColors.byName()
        val dark = DarkSystemColors.byName()
        assertEquals(table.map { it.first }.toSet(), light.keys)
        table.forEach { (name, l, d) ->
            assertEquals("$name light", l, hex(light.getValue(name)))
            assertEquals("$name dark", d, hex(dark.getValue(name)))
        }
    }

    @Test fun `area codes and building spaces map to their area, unknown falls back to GEN`() {
        assertEquals(Area.EMG, Area.of("P1-EMG"))
        assertEquals(Area.CON, Area.of("con"))
        assertEquals(Area.LAB, Area.of("BOD-LAB"))
        assertEquals(Area.CON, Area.of("C-101"))
        assertEquals(Area.EMG, Area.of("E-01"))
        assertEquals(Area.HOS, Area.of("HAB-201-A"))
        assertEquals(Area.GEN, Area.of("C-ABC"))
        assertEquals(Area.GEN, Area.of("E-X"))
        assertEquals(Area.HOS, Area.of("P3-VIP"))
        assertEquals(Area.REC, Area.of("P1-ESP"))
        assertEquals(Area.AMB, Area.of("P1-AMB"))
        assertEquals(Area.GEN, Area.of("BOD-CEN"))
        assertEquals(Area.GEN, Area.of("xyz"))
        assertEquals(Area.GEN, Area.of(null))
        assertEquals("Hospitalización", Area.HOS.label)
    }

    @Test fun `each area uses its strong and soft tokens`() {
        val c = LightSystemColors
        assertEquals(c.areaEmg to c.areaEmgSoft, c.area(Area.EMG))
        assertEquals(c.areaCon to c.areaConSoft, c.area(Area.CON))
        assertEquals(c.areaLab to c.areaLabSoft, c.area(Area.LAB))
        assertEquals(c.areaHos to c.areaHosSoft, c.area(Area.HOS))
        assertEquals(c.areaRec to c.areaRecSoft, c.area(Area.REC))
        assertEquals(c.areaAmb to c.areaAmbSoft, c.area(Area.AMB))
        assertEquals(c.areaGen to c.areaGenSoft, c.area(Area.GEN))
        // Red is never an area colour.
        Area.entries.forEach { assert(c.area(it).first != c.critical) }
    }

    @Test fun `status values map to a family with its own icon, label and pattern`() {
        assertEquals(StatusFamily.ESPERA, StatusFamily.of("en_espera"))
        assertEquals(StatusFamily.LLAMADO, StatusFamily.of("llamado"))
        assertEquals(StatusFamily.ATENCION, StatusFamily.of("en_atencion"))
        assertEquals(StatusFamily.LISTO, StatusFamily.of("completado"))
        assertEquals(StatusFamily.CERRADO, StatusFamily.of("cancelado"))
        assertEquals(StatusFamily.CRITICO, StatusFamily.of("critico_alto"))
        assertEquals(StatusFamily.CERRADO, StatusFamily.of("no_asistio"))
        assertEquals(StatusFamily.ESPERA, StatusFamily.of("reprogramada"))

        assertEquals(StatusIcon.SCHEDULE, StatusFamily.ESPERA.icon)
        assertEquals(StatusPattern.STRIPED, StatusFamily.ESPERA.pattern)
        assertEquals("En espera", StatusFamily.ESPERA.label)
        assertEquals(StatusIcon.CAMPAIGN, StatusFamily.LLAMADO.icon)
        assertEquals(StatusPattern.DOTTED, StatusFamily.LLAMADO.pattern)
        assertEquals(StatusIcon.MONITOR_HEART, StatusFamily.ATENCION.icon)
        assertEquals(StatusPattern.SOLID, StatusFamily.ATENCION.pattern)
        assertEquals(StatusIcon.CHECK, StatusFamily.LISTO.icon)
        assertEquals(StatusPattern.OUTLINE, StatusFamily.LISTO.pattern)
        assertEquals(StatusIcon.CLOSE, StatusFamily.CERRADO.icon)
        assertEquals(StatusPattern.DASHED, StatusFamily.CERRADO.pattern)
        assertEquals(StatusIcon.WARNING, StatusFamily.CRITICO.icon)
        assertEquals(StatusPattern.DOUBLE, StatusFamily.CRITICO.pattern)

        // Never colour alone: icons and patterns are unique per family.
        assertEquals(StatusFamily.entries.size, StatusFamily.entries.map { it.icon }.toSet().size)
        assertEquals(StatusFamily.entries.size, StatusFamily.entries.map { it.pattern }.toSet().size)
    }

    @Test fun `unknown status falls back to the catalog tone, then to neutral`() {
        assertNull(StatusFamily.of("alto"))
        assertNull(StatusFamily.resolve("estado_raro", null))
        assertEquals(StatusFamily.LISTO, StatusFamily.resolve("atendido", StatusTone.SUCCESS))
        // A warning tone is not the queue "Llamado" family: the badge stays neutral with its own text.
        assertNull(StatusFamily.resolve("sin_traslado", StatusTone.WARNING))
        // The API value wins over a legacy tone so every platform shows the same family.
        assertEquals(StatusFamily.CERRADO, StatusFamily.resolve("cancelada", StatusTone.DANGER))
    }

    @Test fun `legacy tones map onto families`() {
        assertEquals(StatusFamily.LISTO, StatusFamily.fromTone(StatusTone.SUCCESS))
        assertEquals(StatusFamily.ATENCION, StatusFamily.fromTone(StatusTone.PROCESS))
        assertEquals(StatusFamily.ESPERA, StatusFamily.fromTone(StatusTone.RESERVED))
        assertEquals(StatusFamily.CERRADO, StatusFamily.fromTone(StatusTone.BLOCKED))
        assertNull(StatusFamily.fromTone(StatusTone.NEUTRAL))
    }

    @Test fun `a free-text warning or danger pill never becomes called or critical`() {
        // 02-sistema sections 2-3: red and the critical family are for critical values only (stock below minimum,
        // out of stock or isolation are not); "Llamado" is a queue state, not a generic warning.
        assertNull(StatusFamily.fromTone(StatusTone.DANGER))
        assertNull(StatusFamily.fromTone(StatusTone.WARNING))
        assert(StatusFamily.resolve("bajo_minimo", StatusTone.DANGER) != StatusFamily.CRITICO)
        assert(StatusFamily.resolve("agotado", StatusTone.DANGER) != StatusFamily.CRITICO)
        assertEquals(StatusFamily.CRITICO, StatusFamily.resolve("critico_alto", StatusTone.DANGER))
    }

    @Test fun `priorities keep red for emergencies only`() {
        assertEquals(StatusIcon.WARNING, Priority.EMERGENCIA.icon)
        assertEquals(StatusIcon.DOUBLE_ARROW_UP, Priority.URGENTE.icon)
        assertEquals(StatusIcon.DASH, Priority.RUTINA.icon)
        assertEquals("Urgente", Priority.URGENTE.label)
        assertEquals(Priority.URGENTE, Priority.of("urgente"))
        assertEquals(Priority.RUTINA, Priority.of("desconocida"))
        val c = LightSystemColors
        assertEquals(c.critical to c.onStatus, c.priority(Priority.EMERGENCIA))
        assertEquals(c.priorityUrgente to c.priorityUrgenteSoft, c.priority(Priority.URGENTE))
        assertEquals(c.priorityRutina to c.priorityRutinaSoft, c.priority(Priority.RUTINA))
    }

    @Test fun `motion tokens are 100 to 200 ms and drop to zero with reduced motion`() {
        assertEquals(100, Motion.INSTANT)
        assertEquals(160, Motion.FAST)
        assertEquals(200, Motion.STANDARD)
        assertEquals(160, Motion.duration(Motion.FAST, animatorScale = 1f))
        assertEquals(0, Motion.duration(Motion.FAST, animatorScale = 0f))
        assertEquals(0, Motion.duration(Motion.STANDARD, animatorScale = 0f))
        // Developer "slow animations" settings still play the token, never longer than the cap.
        assertEquals(200, Motion.duration(Motion.STANDARD, animatorScale = 5f))
    }

    @Test fun `spacing and radii follow the 4 dp scale`() {
        assertEquals(listOf(4f, 8f, 12f, 16f, 20f, 24f, 32f, 40f, 48f), listOf(Space1, Space2, Space3, Space4, Space5, Space6, Space8, Space10, Space12).map { it.value })
        assertEquals(listOf(4f, 6f, 10f, 16f), listOf(RadiusChip, RadiusControl, RadiusCard, RadiusPanel).map { it.value })
    }

    @Test fun `stock and link-check states have a family and are never critical`() {
        // S13: inventory and account-link screens use the shared families instead of hand-picked tones.
        assert(StatusFamily.urgent("agotado"))
        assertEquals(StatusFamily.ESPERA, StatusFamily.of("bajo_minimo"))
        assertEquals(StatusFamily.ESPERA, StatusFamily.of("por_vencer"))
        assertEquals(StatusFamily.LISTO, StatusFamily.of("coincide"))
        assertEquals(StatusFamily.ESPERA, StatusFamily.of("revisar"))
        assertEquals("Agotado", StatusCatalog.label("agotado"))
        assertEquals("Por vencer", StatusCatalog.label("por_vencer"))
        assertEquals("Coincide", StatusCatalog.label("coincide"))
        assertEquals("Revisar", StatusCatalog.label("revisar"))
    }
}
