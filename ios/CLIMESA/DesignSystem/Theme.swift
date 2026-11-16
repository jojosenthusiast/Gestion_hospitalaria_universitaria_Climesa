import CoreText
import SwiftUI
import UIKit

/// Tokens de diseño portados de web/src/styles.css (:root claro y prefers-color-scheme: dark) y de la tabla de la
/// sección 7 de docs/diseno/fase2/02-sistema.md (los valores viven en `Core/DesignTokens.swift`, probados).
/// Cada color cambia solo con el modo de la interfaz; no hay conjunto de colores aparte para el modo oscuro.
extension UIColor {
    fileprivate convenience init(hex: UInt32) {
        self.init(red: CGFloat((hex >> 16) & 0xFF) / 255, green: CGFloat((hex >> 8) & 0xFF) / 255, blue: CGFloat(hex & 0xFF) / 255, alpha: 1)
    }
}

extension Color {
    /// Color dinámico: `light` en modo claro, `dark` en modo oscuro (valores hexadecimales RGB).
    init(light: UInt32, dark: UInt32) {
        self.init(uiColor: UIColor { traits in UIColor(hex: traits.userInterfaceStyle == .dark ? dark : light) })
    }

    /// Color dinámico a partir de un par de la tabla de tokens (`Core/DesignTokens.swift`).
    init(_ pair: ColorPair) { self.init(light: pair.light, dark: pair.dark) }
}

enum Theme {
    // Texto y superficies
    static let ink = Color(light: 0x0E1B33, dark: 0xE4EAF3)
    static let muted = Color(light: 0x55617A, dark: 0x9AA6BA)
    static let bg = Color(light: 0xF2F5F9, dark: 0x0C1220)
    static let surface = Color(light: 0xFFFFFF, dark: 0x141C2D)
    static let navy = Color(light: 0x0E1B33, dark: 0x0C1220)
    static let line = Color(light: 0xD3DBE6, dark: 0x28344C)
    static let controlLine = Color(light: 0x8794AA, dark: 0x65738C)
    static let disabled = Color(light: 0xE3E7EE, dark: 0x28344C)
    // Marca
    static let primary = Color(light: 0x0043B2, dark: 0x1D4FB8)
    static let primaryText = Color(light: 0x0043B2, dark: 0x8DB3FA)
    static let primaryStrong = Color(light: 0x00358F, dark: 0x163F96)
    static let onPrimary = Color(light: 0xFFFFFF, dark: 0xFFFFFF)
    static let soft = Color(light: 0xE6EEFB, dark: 0x18284A)
    static let accent = Color(light: 0x8DB3FA, dark: 0x8DB3FA)
    // Avisos y estados
    static let danger = Color(light: 0xB71C1C, dark: 0xF2918A)
    static let dangerSoft = Color(light: 0xFCEAEA, dark: 0x3A1A17)
    static let success = Color(light: 0x1D7444, dark: 0x6CCB92)
    static let successSoft = Color(light: 0xE7F4EC, dark: 0x13301F)
    static let warning = Color(light: 0x8A5300, dark: 0xE8B25E)
    static let warningSoft = Color(light: 0xFFF2D9, dark: 0x33260E)
    static let reserved = Color(light: 0x6A45A6, dark: 0xBCA3EE)
    static let reservedSoft = Color(light: 0xF1EBFA, dark: 0x2B2140)
    static let blocked = Color(light: 0x4A5865, dark: 0xAAB7C1)
    static let blockedSoft = Color(light: 0xEDF0F2, dark: 0x222B36)
    static let process = Color(light: 0x1F55A3, dark: 0x8CB2F0)
    static let processSoft = Color(light: 0xE8EFF9, dark: 0x18284A)

    /// Primer plano y fondo de cada tono de estado (clases `.status-*` de modules.css).
    static func colors(for tone: StatusTone) -> (foreground: Color, background: Color) {
        switch tone {
        case .success: return (success, successSoft)
        case .process: return (process, processSoft)
        case .reserved: return (reserved, reservedSoft)
        case .warning: return (warning, warningSoft)
        case .blocked: return (blocked, blockedSoft)
        case .danger: return (danger, dangerSoft)
        case .neutral: return (muted, bg)
        }
    }

    // Fase 2, sección 7 de docs/diseno/fase2/02-sistema.md: áreas, estados y prioridad (claro y oscuro).
    static let areaEmg = Color(Palette.areaEmg)
    static let areaEmgSoft = Color(Palette.areaEmgSoft)
    static let areaCon = Color(Palette.areaCon)
    static let areaConSoft = Color(Palette.areaConSoft)
    static let areaLab = Color(Palette.areaLab)
    static let areaLabSoft = Color(Palette.areaLabSoft)
    static let areaHos = Color(Palette.areaHos)
    static let areaHosSoft = Color(Palette.areaHosSoft)
    static let areaRec = Color(Palette.areaRec)
    static let areaRecSoft = Color(Palette.areaRecSoft)
    static let areaAmb = Color(Palette.areaAmb)
    static let areaAmbSoft = Color(Palette.areaAmbSoft)
    static let areaGen = Color(Palette.areaGen)
    static let areaGenSoft = Color(Palette.areaGenSoft)
    static let onArea = Color(Palette.onArea)
    static let statusEspera = Color(Palette.statusEspera)
    static let statusEsperaSoft = Color(Palette.statusEsperaSoft)
    static let statusLlamado = Color(Palette.statusLlamado)
    static let statusLlamadoSoft = Color(Palette.statusLlamadoSoft)
    static let statusAtencion = Color(Palette.statusAtencion)
    static let statusAtencionSoft = Color(Palette.statusAtencionSoft)
    static let statusListo = Color(Palette.statusListo)
    static let statusListoSoft = Color(Palette.statusListoSoft)
    static let statusCerrado = Color(Palette.statusCerrado)
    static let statusCerradoSoft = Color(Palette.statusCerradoSoft)
    static let onStatus = Color(Palette.onStatus)
    static let critical = Color(Palette.critical)
    static let criticalSoft = Color(Palette.criticalSoft)
    static let priorityUrgente = Color(Palette.priorityUrgente)
    static let priorityUrgenteSoft = Color(Palette.priorityUrgenteSoft)
    static let priorityRutina = Color(Palette.priorityRutina)
    static let priorityRutinaSoft = Color(Palette.priorityRutinaSoft)

    /// Color fuerte y tinte de un área (franja, chip y texto; fondo de tarjeta).
    static func colors(for area: AreaCode) -> (strong: Color, soft: Color) { (Color(area.strong), Color(area.soft)) }
    /// Color fuerte y tinte de una familia de estado.
    static func colors(for family: StatusFamily) -> (strong: Color, soft: Color) { (Color(family.strong), Color(family.soft)) }
    /// Color fuerte y tinte de una prioridad (emergencia usa el rojo crítico como relleno).
    static func colors(for priority: Priority) -> (strong: Color, soft: Color) { (Color(priority.strong), Color(priority.soft)) }
}

/// Escala de espaciado (múltiplos de 4 puntos). `space1`...`space12` son los tokens de la sección 7; los nombres cortos
/// (`xs`...`xxl`) quedan como alias para las pantallas sin migrar.
enum Spacing {
    static let space1 = CGFloat(SpaceToken.space1)
    static let space2 = CGFloat(SpaceToken.space2)
    static let space3 = CGFloat(SpaceToken.space3)
    static let space4 = CGFloat(SpaceToken.space4)
    static let space5 = CGFloat(SpaceToken.space5)
    static let space6 = CGFloat(SpaceToken.space6)
    static let space8 = CGFloat(SpaceToken.space8)
    static let space10 = CGFloat(SpaceToken.space10)
    static let space12 = CGFloat(SpaceToken.space12)
    static let xs: CGFloat = space1
    static let s: CGFloat = space2
    static let m: CGFloat = space3
    static let l: CGFloat = space4
    static let xl: CGFloat = space6
    static let xxl: CGFloat = space8
    /// Alto mínimo de un control táctil (min-height: 48px en web; HIG pide al menos 44 pt).
    static let control: CGFloat = 48
}

/// Radios de esquina: chip 4, control 6, tarjeta 10, panel 16. Anidados: interno = externo − padding.
enum Radius {
    static let chip = CGFloat(RadiusToken.chip)
    static let control = CGFloat(RadiusToken.control)
    static let card = CGFloat(RadiusToken.card)
    static let panel = CGFloat(RadiusToken.panel)
}

/// Movimiento solo como respuesta (100-200 ms, curva `cubic-bezier(0.2, 0, 0, 1)`). Con «Reducir movimiento»
/// (`accessibilityReduceMotion`) devuelve `nil`: el cambio ocurre sin animación.
enum Motion {
    static let instant = MotionToken.instant
    static let fast = MotionToken.fast
    static let standard = MotionToken.standard

    static func feedback(_ duration: Double = MotionToken.fast, reduceMotion: Bool) -> Animation? {
        guard let value = MotionToken.duration(duration, reduceMotion: reduceMotion) else { return nil }
        return .timingCurve(0.2, 0, 0, 1, duration: value)
    }
}

/// Atkinson Hyperlegible Next (texto) y Mono (códigos, horas, números de ficha), fuentes variables declaradas en
/// `Info.plist` (`UIAppFonts`). Cada peso usa su instancia con nombre; si iOS no la expone, se pide el peso a la
/// familia. `relativeTo:` respeta Dynamic Type.
enum Atkinson {
    enum Weight: String {
        case regular = "Regular", medium = "Medium", semibold = "SemiBold", bold = "Bold"

        var swiftUI: Font.Weight {
            switch self {
            case .regular: return .regular
            case .medium: return .medium
            case .semibold: return .semibold
            case .bold: return .bold
            }
        }

        /// Value on the variable font's `wght` axis (200-800).
        var axisValue: Double {
            switch self {
            case .regular: return 400
            case .medium: return 500
            case .semibold: return 600
            case .bold: return 700
            }
        }
    }

    static func text(_ size: CGFloat, _ weight: Weight = .regular, relativeTo style: Font.TextStyle = .body) -> Font {
        font(prefix: "AtkinsonHyperlegibleNext", base: "AtkinsonHyperlegibleNext-Regular", size: size, weight: weight, style: style)
    }

    /// Mono con cifras tabulares (horas, contadores, números de ficha y de expediente).
    static func mono(_ size: CGFloat, _ weight: Weight = .regular, relativeTo style: Font.TextStyle = .body) -> Font {
        font(prefix: "AtkinsonHyperlegibleMono", base: "AtkinsonHyperlegibleMono-ExtraLight", size: size, weight: weight, style: style).monospacedDigit()
    }

    /// The bundled files are variable fonts whose named instances have no PostScript names, and the Mono default
    /// instance is ExtraLight. The weight is therefore set on the `wght` axis of the base font, and the result is scaled
    /// with Dynamic Type for its text style. The scale is taken when the font is built (the `Typo` fonts are static), so
    /// a text-size change applies after the app is relaunched.
    private static func font(prefix: String, base: String, size: CGFloat, weight: Weight, style: Font.TextStyle) -> Font {
        guard let baseFont = UIFont(name: base, size: size) else { return .system(size: size, weight: weight.swiftUI) }
        let variation = UIFontDescriptor.AttributeName(rawValue: kCTFontVariationAttribute as String)
        let wghtAxis = NSNumber(value: 0x7767_6874) // 'wght'
        let descriptor = baseFont.fontDescriptor.addingAttributes([variation: [wghtAxis: NSNumber(value: weight.axisValue)]])
        let weighted = UIFont(descriptor: descriptor, size: size)
        return Font(UIFontMetrics(forTextStyle: style.uiKitStyle).scaledFont(for: weighted))
    }
}

/// Estilos de texto. Escalan con Dynamic Type. Título de módulo: 20 pt, peso 700 (`heading`).
/// Contadores, horas y números de registro usan cifras tabulares (`.monospacedDigit()`).
enum Typo {
    static let display = Atkinson.text(34, .bold, relativeTo: .largeTitle)
    static let title = Atkinson.text(26, .bold, relativeTo: .title)
    static let heading = Atkinson.text(20, .bold, relativeTo: .title3)
    static let subheading = Atkinson.text(16, .bold, relativeTo: .headline)
    static let body = Atkinson.text(16, .regular, relativeTo: .body)
    static let label = Atkinson.text(14, .bold, relativeTo: .subheadline)
    static let small = Atkinson.text(13, .regular, relativeTo: .footnote)
    static let caption = Atkinson.text(12, .regular, relativeTo: .caption)
    static let tag = Atkinson.text(12, .bold, relativeTo: .caption).monospacedDigit()
    static let stat = Atkinson.text(38, .bold, relativeTo: .largeTitle).monospacedDigit()
    static let eyebrow = Atkinson.mono(12, .regular, relativeTo: .caption)
    static let mono = Atkinson.mono(13, .regular, relativeTo: .footnote)
    /// Número de turno o ficha en grande.
    static func number(_ size: CGFloat) -> Font { Atkinson.text(size, .bold, relativeTo: .largeTitle).monospacedDigit() }
}

private extension Font.TextStyle {
    /// UIKit text style used to scale an Atkinson font with Dynamic Type.
    var uiKitStyle: UIFont.TextStyle {
        switch self {
        case .largeTitle: return .largeTitle
        case .title: return .title1
        case .title2: return .title2
        case .title3: return .title3
        case .headline: return .headline
        case .subheadline: return .subheadline
        case .callout: return .callout
        case .footnote: return .footnote
        case .caption: return .caption1
        case .caption2: return .caption2
        case .body: return .body
        @unknown default: return .body
        }
    }
}
