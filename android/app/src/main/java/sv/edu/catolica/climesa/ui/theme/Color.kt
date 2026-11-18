package sv.edu.catolica.climesa.ui

import androidx.compose.material3.ColorScheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color

// Brand constants kept for screens that paint on a fixed brand surface (login, hero banners).
internal val BrandBlue = Color(0xFF0043B2)
internal val BrandNavy = Color(0xFF0E1B33)
internal val BrandAccent = Color(0xFFE6EEFB)
internal val StateFree = Color(0xFF1D7444)

/**
 * Tokens that Material 3 has no slot for, ported 1:1 from `web/src/styles.css` (`:root` and the dark media query).
 * Read them with `MaterialTheme.climesa`.
 */
@Immutable
internal data class ClimesaColors(
    val primaryText: Color,
    val soft: Color,
    val line: Color,
    val controlLine: Color,
    val navy: Color,
    val accent: Color,
    val disabled: Color,
    val success: Color,
    val successSoft: Color,
    val warning: Color,
    val warningSoft: Color,
    val danger: Color,
    val dangerSoft: Color,
    val reserved: Color,
    val reservedSoft: Color,
    val blocked: Color,
    val blockedSoft: Color,
    val process: Color,
    val processSoft: Color,
)

internal val LightClimesaColors = ClimesaColors(
    primaryText = Color(0xFF0043B2), soft = Color(0xFFE6EEFB), line = Color(0xFFD3DBE6), controlLine = Color(0xFF8794AA),
    navy = Color(0xFF0E1B33), accent = Color(0xFF8DB3FA), disabled = Color(0xFFE3E7EE),
    success = Color(0xFF1D7444), successSoft = Color(0xFFE7F4EC),
    warning = Color(0xFF8A5300), warningSoft = Color(0xFFFFF2D9),
    danger = Color(0xFFB71C1C), dangerSoft = Color(0xFFFCEAEA),
    reserved = Color(0xFF6A45A6), reservedSoft = Color(0xFFF1EBFA),
    blocked = Color(0xFF4A5865), blockedSoft = Color(0xFFEDF0F2),
    process = Color(0xFF1F55A3), processSoft = Color(0xFFE8EFF9),
)

internal val DarkClimesaColors = ClimesaColors(
    primaryText = Color(0xFF8DB3FA), soft = Color(0xFF18284A), line = Color(0xFF28344C), controlLine = Color(0xFF65738C),
    navy = Color(0xFF0C1220), accent = Color(0xFF8DB3FA), disabled = Color(0xFF28344C),
    success = Color(0xFF6CCB92), successSoft = Color(0xFF13301F),
    warning = Color(0xFFE8B25E), warningSoft = Color(0xFF33260E),
    danger = Color(0xFFF2918A), dangerSoft = Color(0xFF3A1A17),
    reserved = Color(0xFFBCA3EE), reservedSoft = Color(0xFF2B2140),
    blocked = Color(0xFFAAB7C1), blockedSoft = Color(0xFF222B36),
    process = Color(0xFF8CB2F0), processSoft = Color(0xFF18284A),
)

internal val LocalClimesaColors = staticCompositionLocalOf { LightClimesaColors }

internal val MaterialTheme.climesa: ClimesaColors
    @Composable @ReadOnlyComposable get() = LocalClimesaColors.current

internal val LightScheme: ColorScheme = lightColorScheme(
    primary = BrandBlue, onPrimary = Color.White,
    primaryContainer = Color(0xFFE6EEFB), onPrimaryContainer = BrandNavy,
    secondary = Color(0xFF1F55A3), onSecondary = Color.White,
    secondaryContainer = Color(0xFFE8EFF9), onSecondaryContainer = BrandNavy,
    tertiary = Color(0xFF6A45A6), onTertiary = Color.White,
    background = Color(0xFFF2F5F9), onBackground = BrandNavy,
    surface = Color.White, onSurface = BrandNavy,
    surfaceVariant = Color(0xFFE6EEFB), onSurfaceVariant = Color(0xFF55617A),
    surfaceContainerLowest = Color.White, surfaceContainerLow = Color.White, surfaceContainer = Color.White,
    surfaceContainerHigh = Color(0xFFF2F5F9), surfaceContainerHighest = Color(0xFFE6EEFB),
    outline = Color(0xFF8794AA), outlineVariant = Color(0xFFD3DBE6),
    error = Color(0xFFB71C1C), onError = Color.White,
    errorContainer = Color(0xFFFCEAEA), onErrorContainer = Color(0xFF7A1212),
)

internal val DarkScheme: ColorScheme = darkColorScheme(
    primary = Color(0xFF1D4FB8), onPrimary = Color.White,
    primaryContainer = Color(0xFF18284A), onPrimaryContainer = Color(0xFF8DB3FA),
    secondary = Color(0xFF8CB2F0), onSecondary = Color(0xFF0C1220),
    secondaryContainer = Color(0xFF18284A), onSecondaryContainer = Color(0xFF8CB2F0),
    tertiary = Color(0xFFBCA3EE), onTertiary = Color(0xFF0C1220),
    background = Color(0xFF0C1220), onBackground = Color(0xFFE4EAF3),
    surface = Color(0xFF141C2D), onSurface = Color(0xFFE4EAF3),
    surfaceVariant = Color(0xFF18284A), onSurfaceVariant = Color(0xFF9AA6BA),
    surfaceContainerLowest = Color(0xFF0C1220), surfaceContainerLow = Color(0xFF141C2D), surfaceContainer = Color(0xFF141C2D),
    surfaceContainerHigh = Color(0xFF1B2538), surfaceContainerHighest = Color(0xFF28344C),
    outline = Color(0xFF65738C), outlineVariant = Color(0xFF28344C),
    error = Color(0xFFF2918A), onError = Color(0xFF0C1220),
    errorContainer = Color(0xFF3A1A17), onErrorContainer = Color(0xFFF2918A),
)

/**
 * Fase 2 system tokens (docs/diseno/fase2/02-sistema.md, section 7): area, status family and priority colours, light and
 * dark, copied 1:1 from the table (web `--area-*`, `--status-*`, `--critical`, `--priority-*`). Material's `ColorScheme`
 * stays as it is; these travel as an extension. Read them with `MaterialTheme.system`.
 */
@Immutable
internal data class SystemColors(
    val areaEmg: Color, val areaEmgSoft: Color,
    val areaCon: Color, val areaConSoft: Color,
    val areaLab: Color, val areaLabSoft: Color,
    val areaHos: Color, val areaHosSoft: Color,
    val areaRec: Color, val areaRecSoft: Color,
    val areaAmb: Color, val areaAmbSoft: Color,
    val areaGen: Color, val areaGenSoft: Color,
    val onArea: Color,
    val statusEspera: Color, val statusEsperaSoft: Color,
    val statusLlamado: Color, val statusLlamadoSoft: Color,
    val statusAtencion: Color, val statusAtencionSoft: Color,
    val statusListo: Color, val statusListoSoft: Color,
    val statusCerrado: Color, val statusCerradoSoft: Color,
    val onStatus: Color,
    val critical: Color, val criticalSoft: Color,
    val priorityUrgente: Color, val priorityUrgenteSoft: Color,
    val priorityRutina: Color, val priorityRutinaSoft: Color,
) {
    /** Strong colour (top stripe, code chip, text) and soft tint (card background) of an area. */
    fun area(area: Area): Pair<Color, Color> = when (area) {
        Area.EMG -> areaEmg to areaEmgSoft
        Area.CON -> areaCon to areaConSoft
        Area.LAB -> areaLab to areaLabSoft
        Area.HOS -> areaHos to areaHosSoft
        Area.REC -> areaRec to areaRecSoft
        Area.AMB -> areaAmb to areaAmbSoft
        Area.GEN -> areaGen to areaGenSoft
    }

    /**
 * Text and background of a family badge as [FamilyBadge] draws it: the solid family (atención) puts [onStatus] text on the
 * strong colour, outline and dashed sit on the [surface], the rest put the strong colour on the soft tint. Tested for
 * WCAG AA (4.5:1) in both themes, so a solid badge never shows blue text on blue.
 */
fun badge(family: StatusFamily, surface: Color): Pair<Color, Color> {
    val (strong, soft) = status(family)
    return when (family.pattern) {
        StatusPattern.SOLID -> onStatus to strong
        StatusPattern.OUTLINE, StatusPattern.DASHED -> strong to surface
        else -> strong to soft
    }
}

/** Strong and soft colour of a status family. Red belongs only to the critical family. */
    fun status(family: StatusFamily): Pair<Color, Color> = when (family) {
        StatusFamily.ESPERA -> statusEspera to statusEsperaSoft
        StatusFamily.LLAMADO -> statusLlamado to statusLlamadoSoft
        StatusFamily.ATENCION -> statusAtencion to statusAtencionSoft
        StatusFamily.LISTO -> statusListo to statusListoSoft
        StatusFamily.CERRADO -> statusCerrado to statusCerradoSoft
        StatusFamily.CRITICO -> critical to criticalSoft
    }

    /** Foreground and background of a priority badge: emergency is solid critical red with light text. */
    fun priority(priority: Priority): Pair<Color, Color> = when (priority) {
        Priority.EMERGENCIA -> critical to onStatus
        Priority.URGENTE -> priorityUrgente to priorityUrgenteSoft
        Priority.RUTINA -> priorityRutina to priorityRutinaSoft
    }

    /** Strong and soft colour of a filter chip tone: the family colours, or the priority ones (emergency is critical red). */
    fun tone(tone: ChipTone): Pair<Color, Color> = when (tone) {
        is ChipTone.Family -> status(tone.family)
        is ChipTone.Level -> if (tone.priority == Priority.EMERGENCIA) critical to criticalSoft else priority(tone.priority)
    }

    /**
     * Text and background of a status filter chip. Unselected it is the badge it filters (strong on the soft tint, or on the
     * [surface] for outline and dashed families); selected it fills with the strong colour and [onStatus] text. Tested for
     * WCAG AA (4.5:1) in both themes.
     */
    fun chip(tone: ChipTone, selected: Boolean, surface: Color): Pair<Color, Color> {
        val (strong, soft) = tone(tone)
        return when {
            selected -> onStatus to strong
            tone.pattern == StatusPattern.OUTLINE || tone.pattern == StatusPattern.DASHED -> strong to surface
            else -> strong to soft
        }
    }

    /** Tokens by their Kotlin name in the section 7 table (`AreaEmg`, `StatusListoSoft`...), for checks against the doc. */
    fun byName(): Map<String, Color> = linkedMapOf(
        "AreaEmg" to areaEmg, "AreaEmgSoft" to areaEmgSoft, "AreaCon" to areaCon, "AreaConSoft" to areaConSoft,
        "AreaLab" to areaLab, "AreaLabSoft" to areaLabSoft, "AreaHos" to areaHos, "AreaHosSoft" to areaHosSoft,
        "AreaRec" to areaRec, "AreaRecSoft" to areaRecSoft, "AreaAmb" to areaAmb, "AreaAmbSoft" to areaAmbSoft,
        "AreaGen" to areaGen, "AreaGenSoft" to areaGenSoft, "OnArea" to onArea,
        "StatusEspera" to statusEspera, "StatusEsperaSoft" to statusEsperaSoft, "StatusLlamado" to statusLlamado,
        "StatusLlamadoSoft" to statusLlamadoSoft, "StatusAtencion" to statusAtencion, "StatusAtencionSoft" to statusAtencionSoft,
        "StatusListo" to statusListo, "StatusListoSoft" to statusListoSoft, "StatusCerrado" to statusCerrado,
        "StatusCerradoSoft" to statusCerradoSoft, "OnStatus" to onStatus, "Critical" to critical, "CriticalSoft" to criticalSoft,
        "PriorityUrgente" to priorityUrgente, "PriorityUrgenteSoft" to priorityUrgenteSoft,
        "PriorityRutina" to priorityRutina, "PriorityRutinaSoft" to priorityRutinaSoft,
    )
}

internal val LightSystemColors = SystemColors(
    areaEmg = Color(0xFF9B2C6F), areaEmgSoft = Color(0xFFFAEAF3),
    areaCon = Color(0xFF0B6B63), areaConSoft = Color(0xFFE0F2EF),
    areaLab = Color(0xFF5A3EA6), areaLabSoft = Color(0xFFEEEAFA),
    areaHos = Color(0xFF1D5C9A), areaHosSoft = Color(0xFFE4EEF8),
    areaRec = Color(0xFF2D6B33), areaRecSoft = Color(0xFFE4F1E5),
    areaAmb = Color(0xFF5C6213), areaAmbSoft = Color(0xFFF0F2DA),
    areaGen = Color(0xFF4A5865), areaGenSoft = Color(0xFFEDF0F2),
    onArea = Color(0xFFFFFFFF),
    statusEspera = Color(0xFF6A45A6), statusEsperaSoft = Color(0xFFF1EBFA),
    statusLlamado = Color(0xFF8A5300), statusLlamadoSoft = Color(0xFFFFF2D9),
    statusAtencion = Color(0xFF1F55A3), statusAtencionSoft = Color(0xFFE8EFF9),
    statusListo = Color(0xFF1D7444), statusListoSoft = Color(0xFFE7F4EC),
    statusCerrado = Color(0xFF4A5865), statusCerradoSoft = Color(0xFFEDF0F2),
    onStatus = Color(0xFFFFFFFF),
    critical = Color(0xFFB71C1C), criticalSoft = Color(0xFFFCEAEA),
    priorityUrgente = Color(0xFFA3480A), priorityUrgenteSoft = Color(0xFFFDEBDD),
    priorityRutina = Color(0xFF55617A), priorityRutinaSoft = Color(0xFFEEF1F5),
)

internal val DarkSystemColors = SystemColors(
    areaEmg = Color(0xFFF09AC9), areaEmgSoft = Color(0xFF3A1A2D),
    areaCon = Color(0xFF6FD1C3), areaConSoft = Color(0xFF10302C),
    areaLab = Color(0xFFBBA8F2), areaLabSoft = Color(0xFF2A2142),
    areaHos = Color(0xFF8DB9EC), areaHosSoft = Color(0xFF16273D),
    areaRec = Color(0xFF8CCF93), areaRecSoft = Color(0xFF172F1A),
    areaAmb = Color(0xFFCCD27A), areaAmbSoft = Color(0xFF2C2E12),
    areaGen = Color(0xFFAAB7C1), areaGenSoft = Color(0xFF222B36),
    onArea = Color(0xFF0C1220),
    statusEspera = Color(0xFFBCA3EE), statusEsperaSoft = Color(0xFF2B2140),
    statusLlamado = Color(0xFFE8B25E), statusLlamadoSoft = Color(0xFF33260E),
    statusAtencion = Color(0xFF8CB2F0), statusAtencionSoft = Color(0xFF18284A),
    statusListo = Color(0xFF6CCB92), statusListoSoft = Color(0xFF13301F),
    statusCerrado = Color(0xFFAAB7C1), statusCerradoSoft = Color(0xFF222B36),
    onStatus = Color(0xFF0C1220),
    critical = Color(0xFFF2918A), criticalSoft = Color(0xFF3A1A17),
    priorityUrgente = Color(0xFFF0A36B), priorityUrgenteSoft = Color(0xFF3A2314),
    priorityRutina = Color(0xFF9AA6BA), priorityRutinaSoft = Color(0xFF1B2538),
)

internal val LocalSystemColors = staticCompositionLocalOf { LightSystemColors }

internal val MaterialTheme.system: SystemColors
    @Composable @ReadOnlyComposable get() = LocalSystemColors.current
