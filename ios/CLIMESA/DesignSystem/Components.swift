import SwiftUI

// MARK: - Contenedores

/// Tarjeta de sección: superficie, borde y sombra suave (`.board-card` / `.panel` de web). Título opcional en mayúsculas.
struct SectionCard<Content: View>: View {
    var title: String?
    var eyebrow: String?
    @ViewBuilder let content: () -> Content

    init(title: String? = nil, eyebrow: String? = nil, @ViewBuilder content: @escaping () -> Content) {
        self.title = title; self.eyebrow = eyebrow; self.content = content
    }

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.m) {
            if let eyebrow { Text(verbatim: eyebrow).font(Typo.eyebrow).foregroundStyle(Theme.primaryText).textCase(.uppercase) }
            if let title { Text(verbatim: title).font(Typo.subheading).foregroundStyle(Theme.ink).accessibilityAddTraits(.isHeader) }
            content()
        }
        .padding(Spacing.l)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.surface, in: RoundedRectangle(cornerRadius: Radius.card))
        .overlay(RoundedRectangle(cornerRadius: Radius.card).stroke(Theme.line, lineWidth: 1))
        .shadow(color: Theme.ink.opacity(0.07), radius: 12, y: 4)
    }
}

/// Cifra grande con su etiqueta (`.number-strip > div` de web).
struct StatTile: View {
    let value: String
    let label: String
    var unit: String?
    var title: String?

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.s) {
            if let title { Text(verbatim: title).font(Typo.eyebrow).foregroundStyle(Theme.muted).textCase(.uppercase) }
            HStack(alignment: .firstTextBaseline, spacing: Spacing.xs) {
                Text(verbatim: value).font(Typo.stat).foregroundStyle(Theme.ink)
                if let unit { Text(verbatim: unit).font(Typo.heading).foregroundStyle(Theme.muted) }
            }
            Text(verbatim: label).font(Typo.small).foregroundStyle(Theme.muted)
        }
        .padding(Spacing.l)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.surface, in: RoundedRectangle(cornerRadius: Radius.card))
        .overlay(RoundedRectangle(cornerRadius: Radius.card).stroke(Theme.line, lineWidth: 1))
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Estado y filas

/// Etiqueta de estado: código de la API a etiqueta en español y color (`Tag` de web). `label` la reemplaza.
struct StatusTag: View {
    let code: String
    var label: String?

    init(_ code: String, label: String? = nil) { self.code = code; self.label = label }

    var body: some View {
        let style = StatusCatalog.style(for: code, label: label)
        let colors = Theme.colors(for: style.tone)
        HStack(spacing: 7) {
            Circle().fill(colors.foreground).frame(width: 7, height: 7)
            Text(verbatim: style.label).font(Typo.tag).lineLimit(1)
        }
        .foregroundStyle(colors.foreground)
        .padding(.horizontal, 9).padding(.vertical, 5)
        .background(colors.background, in: Capsule())
        .overlay(Capsule().stroke(colors.foreground.opacity(0.24), lineWidth: 1))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(verbatim: style.label))
    }
}

/// Fila de lista: título, detalle y dato al final (una etiqueta de estado, una hora, etc.).
struct ListRow<Trailing: View>: View {
    let title: String
    var subtitle: String?
    var meta: String?
    @ViewBuilder let trailing: () -> Trailing

    init(title: String, subtitle: String? = nil, meta: String? = nil, @ViewBuilder trailing: @escaping () -> Trailing) {
        self.title = title; self.subtitle = subtitle; self.meta = meta; self.trailing = trailing
    }

    var body: some View {
        HStack(alignment: .center, spacing: Spacing.m) {
            VStack(alignment: .leading, spacing: 3) {
                Text(verbatim: title).font(Typo.subheading).foregroundStyle(Theme.ink)
                if let subtitle, !subtitle.isEmpty { Text(verbatim: subtitle).font(Typo.small).foregroundStyle(Theme.muted) }
                if let meta, !meta.isEmpty { Text(verbatim: meta).font(Typo.eyebrow).foregroundStyle(Theme.muted) }
            }
            Spacer(minLength: Spacing.s)
            trailing()
        }
        .padding(.vertical, Spacing.m)
        .frame(minHeight: Spacing.control)
        .accessibilityElement(children: .combine)
    }
}

extension ListRow where Trailing == EmptyView {
    init(title: String, subtitle: String? = nil, meta: String? = nil) {
        self.init(title: title, subtitle: subtitle, meta: meta) { EmptyView() }
    }
}

// MARK: - Formulario

/// Campo con rótulo, ayuda y error (`Field` de web). El error se anuncia junto al campo.
struct FormField: View {
    let label: String
    @Binding var text: String
    var placeholder = ""
    var hint: String?
    var error: String?
    var secure = false

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.s) {
            Text(verbatim: label).font(Typo.label).foregroundStyle(Theme.ink)
            Group {
                if secure { SecureField(placeholder, text: $text) } else { TextField(placeholder, text: $text) }
            }
            .font(Typo.body).foregroundStyle(Theme.ink)
            .padding(.horizontal, Spacing.m).frame(minHeight: Spacing.control)
            .background(Theme.surface, in: RoundedRectangle(cornerRadius: Radius.control))
            .overlay(RoundedRectangle(cornerRadius: Radius.control).stroke(error == nil ? Theme.controlLine : Theme.danger, lineWidth: error == nil ? 1 : 2))
            if let error { Text(verbatim: error).font(Typo.caption).foregroundStyle(Theme.danger).accessibilityLabel(Text(verbatim: error)) }
            else if let hint { Text(verbatim: hint).font(Typo.small).foregroundStyle(Theme.muted) }
        }
    }
}

// MARK: - Botones

enum ClimesaButtonKind { case primary, secondary, destructive }

/// Estilo de botón de 48 pt de alto con estado de carga (`.primary-button` / `.secondary-button` de web).
struct ClimesaButtonStyle: ButtonStyle {
    var kind: ClimesaButtonKind = .primary
    var loading = false
    @Environment(\.isEnabled) private var enabled

    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: Spacing.s) {
            if loading { ProgressView().tint(foreground) }
            configuration.label.font(Typo.label).lineLimit(2).multilineTextAlignment(.center)
        }
        .foregroundStyle(foreground)
        .frame(maxWidth: .infinity, minHeight: Spacing.control)
        .padding(.horizontal, Spacing.l)
        .background(background, in: RoundedRectangle(cornerRadius: Radius.control))
        .overlay(RoundedRectangle(cornerRadius: Radius.control).stroke(border, lineWidth: 1))
        .opacity(configuration.isPressed ? 0.85 : 1)
        .scaleEffect(configuration.isPressed ? 0.99 : 1)
    }

    private var foreground: Color {
        if !enabled { return Theme.muted }
        switch kind {
        case .primary: return Theme.onPrimary
        case .secondary: return Theme.ink
        case .destructive: return Theme.danger
        }
    }
    private var background: Color {
        if !enabled { return Theme.disabled }
        switch kind {
        case .primary: return Theme.primary
        case .secondary: return Theme.surface
        case .destructive: return Theme.dangerSoft
        }
    }
    private var border: Color {
        if !enabled { return Theme.disabled }
        switch kind {
        case .primary: return Theme.primary
        case .secondary: return Theme.controlLine
        case .destructive: return Theme.danger
        }
    }
}

/// Botón con el estilo de la marca; con `loading` muestra el indicador y no admite otro toque.
struct ClimesaButton: View {
    let title: String
    var kind: ClimesaButtonKind = .primary
    var loading = false
    let action: () -> Void

    var body: some View {
        Button(action: action) { Text(verbatim: title) }
            .buttonStyle(ClimesaButtonStyle(kind: kind, loading: loading))
            .disabled(loading)
    }
}

// MARK: - Estados de pantalla

/// Sin datos (diseño 04, «Vacío»).
struct EmptyStateView: View {
    var title = L.text("ds.empty.title")
    var message: String?
    var symbol = "tray"

    var body: some View {
        StateLayout(symbol: symbol, tint: Theme.primaryText, tintSoft: Theme.soft) {
            Text(verbatim: title).font(Typo.subheading).foregroundStyle(Theme.ink)
            if let message { Text(verbatim: message).font(Typo.small).foregroundStyle(Theme.muted) }
        }
    }
}

/// Carga en curso (diseño 04, «Cargando»).
struct LoadingStateView: View {
    var message = L.text("ds.loading")

    var body: some View {
        VStack(spacing: Spacing.m) {
            ProgressView().tint(Theme.primaryText)
            Text(verbatim: message).font(Typo.small).foregroundStyle(Theme.muted)
        }
        .frame(maxWidth: .infinity).padding(Spacing.xl)
        .accessibilityElement(children: .combine)
    }
}

/// Error con acción «Reintentar» (diseño 04, «Error»).
struct ErrorStateView: View {
    let message: String
    var retry: (() -> Void)?

    var body: some View {
        StateLayout(symbol: "exclamationmark.triangle", tint: Theme.danger, tintSoft: Theme.dangerSoft) {
            Text(verbatim: message).font(Typo.body).foregroundStyle(Theme.ink)
            if let retry { ClimesaButton(title: L.text("ds.retry"), kind: .secondary, action: retry) }
        }
    }
}

private struct StateLayout<Body: View>: View {
    let symbol: String
    let tint: Color
    let tintSoft: Color
    @ViewBuilder let content: () -> Body

    var body: some View {
        VStack(spacing: Spacing.m) {
            Image(systemName: symbol).font(.system(size: 26, weight: .semibold)).foregroundStyle(tint)
                .frame(width: 64, height: 64).background(tintSoft, in: Circle()).accessibilityHidden(true)
            content()
        }
        .multilineTextAlignment(.center)
        .frame(maxWidth: .infinity).padding(Spacing.xl)
    }
}

/// Conflicto de versión (409): conserva lo escrito y ofrece «Cerrar y recargar» (`WriteError` de web).
struct ConflictBanner: View {
    var message = L.text("ds.conflict.body")
    let reload: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.m) {
            HStack(alignment: .top, spacing: Spacing.m) {
                Image(systemName: "exclamationmark.circle.fill").foregroundStyle(Theme.danger).accessibilityHidden(true)
                Text(verbatim: message).font(Typo.small).foregroundStyle(Theme.danger)
            }
            ClimesaButton(title: L.text("ds.reload"), kind: .secondary, action: reload)
        }
        .padding(Spacing.l)
        .background(Theme.dangerSoft, in: RoundedRectangle(cornerRadius: Radius.card))
        .overlay(RoundedRectangle(cornerRadius: Radius.card).stroke(Theme.danger, lineWidth: 1))
    }
}
