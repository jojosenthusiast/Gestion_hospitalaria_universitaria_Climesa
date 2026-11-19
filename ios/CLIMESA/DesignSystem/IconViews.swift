import SwiftUI
import UIKit

/// The web icon (`Icon` in web/src/components/ui.tsx) as a SwiftUI shape: the generated path of
/// `Core/ClimesaIcons.swift`, scaled from the 24 grid to the smaller side of the rect and centred.
struct ClimesaIconShape: Shape {
    let name: ClimesaIconName

    func path(in rect: CGRect) -> Path {
        let side = min(rect.width, rect.height)
        let scale = side / CGFloat(ClimesaIconGeometry.grid)
        let originX = rect.midX - side / 2
        let originY = rect.midY - side / 2
        func point(_ x: Double, _ y: Double) -> CGPoint {
            CGPoint(x: originX + CGFloat(x) * scale, y: originY + CGFloat(y) * scale)
        }
        var path = Path()
        for segment in ClimesaIconGeometry.segments(name) {
            switch segment {
            case let .move(x, y): path.move(to: point(x, y))
            case let .line(x, y): path.addLine(to: point(x, y))
            case let .cubic(x1, y1, x2, y2, x, y): path.addCurve(to: point(x, y), control1: point(x1, y1), control2: point(x2, y2))
            case .close: path.closeSubpath()
            }
        }
        return path
    }
}

/// A web icon: outline stroked 1.7 on the 24 grid (scaled with the size), round caps and joins, in the current
/// foreground style. The size follows Dynamic Type. Decorative by default; the caller names it when it stands alone.
struct ClimesaIcon: View {
    let name: ClimesaIconName
    var size: CGFloat
    @ScaledMetric(relativeTo: .body) private var scale: CGFloat = 1

    init(_ name: ClimesaIconName, size: CGFloat = 20) {
        self.name = name
        self.size = size
    }

    var body: some View {
        let side = size * scale
        ClimesaIconShape(name: name)
            .stroke(style: StrokeStyle(lineWidth: CGFloat(ClimesaIconGeometry.stroke) * side / CGFloat(ClimesaIconGeometry.grid), lineCap: .round, lineJoin: .round))
            .frame(width: side, height: side)
    }
}

/// A web icon when the concept has one; otherwise the SF Symbol outline (no web icon for it).
struct SectionIcon: View {
    let icon: ClimesaIconName?
    let symbol: String
    var size: CGFloat = 20

    var body: some View {
        if let icon { ClimesaIcon(icon, size: size) } else { Image(systemName: symbol).font(.system(size: size * 0.85)) }
    }
}

extension ClimesaIconName {
    /// Template image of the icon for UIKit-backed places that only take an `Image` (tab bar items).
    func templateImage(size: CGFloat = 24) -> UIImage {
        let bounds = CGRect(x: 0, y: 0, width: size, height: size)
        let renderer = UIGraphicsImageRenderer(size: bounds.size)
        let image = renderer.image { context in
            let cg = context.cgContext
            cg.addPath(ClimesaIconShape(name: self).path(in: bounds).cgPath)
            cg.setLineWidth(CGFloat(ClimesaIconGeometry.stroke) * size / CGFloat(ClimesaIconGeometry.grid))
            cg.setLineCap(.round)
            cg.setLineJoin(.round)
            cg.setStrokeColor(UIColor.black.cgColor)
            cg.strokePath()
        }
        return image.withRenderingMode(.alwaysTemplate)
    }
}

// MARK: - Identity chips (web components/identity.tsx + identity.css)

/// Role or area chip: pill with the identity glyph and its text, tone foreground on its soft background, a 1 pt border
/// at 35 %, 13/600 sans. Compact shows only the glyph in a circle and keeps the name for VoiceOver.
struct IdentityChip: View {
    let identity: Identity
    var label: String?
    var compact = false

    var body: some View {
        let text = label ?? identity.label
        let foreground = Color(identity.tone.foreground)
        let background = Color(identity.tone.background)
        Group {
            if compact {
                ClimesaIcon(identity.icon, size: 18)
                    .padding(4)
                    .background(background, in: Circle())
                    .overlay(Circle().strokeBorder(foreground.opacity(0.35), lineWidth: 1))
            } else {
                HStack(spacing: 6) {
                    ClimesaIcon(identity.icon, size: 15)
                    Text(verbatim: text).lineLimit(1).truncationMode(.tail)
                }
                .font(Atkinson.text(13, .semibold, relativeTo: .footnote))
                .padding(.leading, 8).padding(.trailing, 10).padding(.vertical, 3)
                .background(background, in: Capsule())
                .overlay(Capsule().strokeBorder(foreground.opacity(0.35), lineWidth: 1))
            }
        }
        .foregroundStyle(foreground)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(verbatim: text))
    }
}

/// `code`: `MED`, `ENF`... or the API staff type (`medico`).
struct RoleChip: View {
    let code: String?
    var label: String?
    var compact = false

    var body: some View { IdentityChip(identity: IdentityRules.role(code), label: label, compact: compact) }
}

/// `name`: area name (`Emergencia`); `type`: space type as a fallback (`area`, `planta`...).
struct AreaChip: View {
    let name: String?
    var type: String?
    var label: String?
    var compact = false

    var body: some View {
        let identity = IdentityRules.area(name, type: type)
        let trimmed = (name ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        IdentityChip(identity: identity, label: label ?? (trimmed.isEmpty ? identity.label : trimmed), compact: compact)
    }
}
