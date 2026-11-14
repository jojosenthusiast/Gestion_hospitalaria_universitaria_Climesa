import SwiftUI
import UIKit

/// Tokens de diseño portados de web/src/styles.css (:root claro y prefers-color-scheme: dark).
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
}

/// Escala de espaciado (múltiplos de 4 puntos).
enum Spacing {
    static let xs: CGFloat = 4
    static let s: CGFloat = 8
    static let m: CGFloat = 12
    static let l: CGFloat = 16
    static let xl: CGFloat = 24
    static let xxl: CGFloat = 32
    /// Alto mínimo de un control táctil (min-height: 48px en web).
    static let control: CGFloat = 48
}

/// Radios de esquina: --radius-control, --radius-card y --radius-panel.
enum Radius {
    static let control: CGFloat = 6
    static let card: CGFloat = 10
    static let panel: CGFloat = 16
}

/// Estilos de texto. Escalan con Dynamic Type; DM Sans y IBM Plex Mono vienen en el paquete de la app.
enum Typo {
    static let display = Font.custom("DMSans-Bold", size: 34, relativeTo: .largeTitle)
    static let title = Font.custom("DMSans-Bold", size: 26, relativeTo: .title)
    static let heading = Font.custom("DMSans-Bold", size: 20, relativeTo: .title3)
    static let subheading = Font.custom("DMSans-Bold", size: 16, relativeTo: .headline)
    static let body = Font.custom("DMSans-Regular", size: 16, relativeTo: .body)
    static let label = Font.custom("DMSans-Bold", size: 14, relativeTo: .subheadline)
    static let small = Font.custom("DMSans-Regular", size: 13, relativeTo: .footnote)
    static let caption = Font.custom("DMSans-Regular", size: 12, relativeTo: .caption)
    static let tag = Font.custom("DMSans-Bold", size: 12, relativeTo: .caption)
    static let stat = Font.custom("DMSans-Bold", size: 38, relativeTo: .largeTitle)
    static let eyebrow = Font.custom("IBMPlexMono-Regular", size: 12, relativeTo: .caption)
    static let mono = Font.custom("IBMPlexMono-Regular", size: 13, relativeTo: .footnote)
}
