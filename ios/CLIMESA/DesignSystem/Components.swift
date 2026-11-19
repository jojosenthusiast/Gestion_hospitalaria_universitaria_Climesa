import SwiftUI

// MARK: - Contenedores

/// Tarjeta de sección: superficie y borde de 1 pt (`.board-card` / `.panel` de web), sin sombra: agrupa un bloque, no
/// cada fila (I-9). Título opcional.
struct SectionCard<Content: View>: View {
    var title: String?
    var eyebrow: String?
    @ViewBuilder let content: () -> Content

    init(title: String? = nil, eyebrow: String? = nil, @ViewBuilder content: @escaping () -> Content) {
        self.title = title; self.eyebrow = eyebrow; self.content = content
    }

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.m) {
            if let eyebrow { Text(verbatim: eyebrow).font(Typo.eyebrow).foregroundStyle(Theme.primaryText).textCase(.uppercase).tracking(Typo.eyebrowTracking) }
            if let title { Text(verbatim: title).font(Typo.subheading).foregroundStyle(Theme.ink).accessibilityAddTraits(.isHeader) }
            content()
        }
        .padding(Spacing.l)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.surface, in: RoundedRectangle(cornerRadius: Radius.card))
        .overlay(RoundedRectangle(cornerRadius: Radius.card).stroke(Theme.line, lineWidth: 1))
    }
}

/// I-9: una tarjeta por grupo con sus filas separadas por una línea de 1 pt, nunca una tarjeta por fila.
struct ListCard<Data: RandomAccessCollection, Row: View>: View where Data.Element: Identifiable {
    var title: String?
    let items: Data
    let row: (Data.Element) -> Row

    init(title: String? = nil, items: Data, @ViewBuilder row: @escaping (Data.Element) -> Row) {
        self.title = title; self.items = items; self.row = row
    }

    var body: some View {
        SectionCard(title: title) {
            ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
                if index > 0 { Divider().overlay(Theme.line) }
                row(item)
            }
        }
    }
}

/// Cifra grande con su etiqueta (`.number-strip > div` de web).
struct StatTile: View {
    let value: String
    let label: String
    var unit: String?
    var title: String?
    /// I-10: dentro de otra tarjeta va sin fondo ni borde (nada de tarjeta dentro de tarjeta).
    var plain = false

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.s) {
            if let title { Text(verbatim: title).font(Typo.eyebrow).foregroundStyle(Theme.muted).textCase(.uppercase).tracking(Typo.eyebrowTracking) }
            HStack(alignment: .firstTextBaseline, spacing: Spacing.xs) {
                Text(verbatim: value).font(Typo.stat).foregroundStyle(Theme.ink)
                if let unit { Text(verbatim: unit).font(Typo.heading).foregroundStyle(Theme.muted) }
            }
            Text(verbatim: label).font(Typo.small).foregroundStyle(Theme.muted)
        }
        .padding(plain ? 0 : Spacing.l)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(plain ? Color.clear : Theme.surface, in: RoundedRectangle(cornerRadius: Radius.card))
        .overlay(RoundedRectangle(cornerRadius: Radius.card).stroke(plain ? Color.clear : Theme.line, lineWidth: 1))
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Estado y filas

/// Etiqueta de estado: código de la API a etiqueta en español (`Tag` de web). `label` la reemplaza.
struct StatusTag: View {
    let code: String
    var label: String?

    init(_ code: String, label: String? = nil) { self.code = code; self.label = label }

    /// Fase 2: se dibuja con `StatusBadge` (ícono + etiqueta + patrón); un código sin familia usa su tono de siempre.
    var body: some View {
        StatusBadge(code, label: label, fallbackTone: StatusCatalog.style(for: code).tone)
    }
}

/// Fila de lista: título, detalle y dato al final (una etiqueta de estado, una hora, etc.).
struct ListRow<Trailing: View>: View {
    let title: String
    var subtitle: String?
    var meta: String?
    @ViewBuilder let trailing: () -> Trailing
    @Environment(\.dynamicTypeSize) private var typeSize

    init(title: String, subtitle: String? = nil, meta: String? = nil, @ViewBuilder trailing: @escaping () -> Trailing) {
        self.title = title; self.subtitle = subtitle; self.meta = meta; self.trailing = trailing
    }

    var body: some View {
        // I-24: con tamaños de accesibilidad la insignia baja debajo del título en lugar de cortarlo.
        let stacked = typeSize.isAccessibilitySize
        let layout = stacked
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: Spacing.s))
            : AnyLayout(HStackLayout(alignment: .center, spacing: Spacing.m))
        layout {
            texts
            if !stacked { Spacer(minLength: Spacing.s) }
            trailing()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, Spacing.m)
        .frame(minHeight: Spacing.control)
        .accessibilityElement(children: .combine)
    }
}

private extension ListRow {
    var texts: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(verbatim: title).font(Typo.subheading).foregroundStyle(Theme.ink).fixedSize(horizontal: false, vertical: true)
            if let subtitle, !subtitle.isEmpty { Text(verbatim: subtitle).font(Typo.small).foregroundStyle(Theme.muted) }
            if let meta, !meta.isEmpty { Text(verbatim: meta).font(Typo.time).foregroundStyle(Theme.muted) }
        }
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
            .padding(.horizontal, 14).frame(minHeight: Spacing.input)
            .background(Theme.surface, in: RoundedRectangle(cornerRadius: Radius.control))
            .overlay(RoundedRectangle(cornerRadius: Radius.control).stroke(error == nil ? Theme.controlLine : Theme.danger, lineWidth: error == nil ? 1 : 2))
            if let error { Text(verbatim: error).font(Typo.caption).foregroundStyle(Theme.danger).accessibilityLabel(Text(verbatim: error)) }
            else if let hint { Text(verbatim: hint).font(Typo.small).foregroundStyle(Theme.muted) }
        }
    }
}

// MARK: - Botones

enum ClimesaButtonKind {
    case primary, secondary, destructive
    /// S0 CRUD convention (`CrudKind`): one colour per action on every screen.
    case create, edit, deactivate, view

    init(_ crud: CrudKind) {
        switch crud {
        case .create: self = .create
        case .edit: self = .edit
        case .deactivate: self = .deactivate
        case .view: self = .view
        }
    }

    /// S13: the button style for an action's emphasis on its screen (one primary per screen).
    init(_ emphasis: ActionEmphasis) {
        switch emphasis {
        case .primary: self = .primary
        case .secondary: self = .secondary
        case .destructive: self = .destructive
        }
    }
}

/// Estilo de botón de 48 pt de alto con estado de carga (`.primary-button` / `.secondary-button` de web).
/// CRUD kinds follow web `crud.css`: 44 pt tall, 15/800 text with its icon, a 36 pt square when icon-only (inside a
/// 44 pt touch target), and a disabled CRUD button keeps its colours at half opacity.
struct ClimesaButtonStyle: ButtonStyle {
    var kind: ClimesaButtonKind = .primary
    var loading = false
    /// A square button that only shows its icon (CRUD actions on a row); the label goes to VoiceOver.
    var iconOnly = false
    @Environment(\.isEnabled) private var enabled
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var isCrud: Bool {
        switch kind {
        case .create, .edit, .deactivate, .view: return true
        case .primary, .secondary, .destructive: return false
        }
    }

    func makeBody(configuration: Configuration) -> some View {
        let shape = RoundedRectangle(cornerRadius: Radius.control)
        let height: CGFloat = isCrud ? 44 : Spacing.control
        let square: CGFloat = isCrud ? 36 : Spacing.control
        return HStack(spacing: Spacing.s) {
            if loading { ProgressView().tint(foreground) }
            configuration.label
                .font(isCrud ? Atkinson.text(15, .extraBold, relativeTo: .subheadline) : Typo.label)
                .lineLimit(2).multilineTextAlignment(.center)
        }
        .foregroundStyle(foreground)
        .frame(minWidth: iconOnly ? square : nil, maxWidth: iconOnly ? square : CGFloat.infinity, minHeight: iconOnly ? square : height)
        .padding(.horizontal, iconOnly ? 0 : Spacing.l)
        .background(background, in: shape)
        .overlay(shape.stroke(border, lineWidth: 1))
        .opacity(isCrud && !enabled ? 0.5 : (configuration.isPressed ? 0.85 : 1))
        .scaleEffect(configuration.isPressed && !reduceMotion ? (isCrud ? 0.96 : 0.99) : 1)
        .animation(Motion.feedback(Motion.instant, reduceMotion: reduceMotion), value: configuration.isPressed)
        .frame(minWidth: iconOnly ? 44 : nil, minHeight: iconOnly ? 44 : nil)
        .contentShape(Rectangle())
    }

    private var foreground: Color {
        if !enabled && !isCrud { return Theme.muted }
        switch kind {
        case .primary, .create: return Theme.onPrimary
        case .secondary, .view: return Theme.ink
        case .destructive, .deactivate: return Theme.danger
        case .edit: return Theme.primaryText
        }
    }
    private var background: Color {
        if !enabled && !isCrud { return Theme.disabled }
        switch kind {
        case .primary, .create: return Theme.primary
        case .secondary, .edit, .deactivate, .view: return Theme.surface
        case .destructive: return Theme.dangerSoft
        }
    }
    private var border: Color {
        if !enabled && !isCrud { return Theme.disabled }
        switch kind {
        case .primary, .create: return Theme.primary
        case .secondary, .view: return Theme.controlLine
        case .destructive, .deactivate: return Theme.danger
        case .edit: return Theme.primaryText
        }
    }
}

/// Botón con el estilo de la marca; con `loading` muestra el indicador y no admite otro toque.
/// Preconditions sweep (S0): with `blockedReason` the button is disabled and says why (and what to do) below it, before
/// the tap, instead of letting the API refuse it. Pass `ActionGate.blockedReason`.
struct ClimesaButton: View {
    let title: String
    var kind: ClimesaButtonKind = .primary
    var loading = false
    var blockedReason: String? = nil
    let action: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.xs) {
            Button(action: action) { Text(verbatim: title) }
                .buttonStyle(ClimesaButtonStyle(kind: kind, loading: loading))
                .disabled(loading || blockedReason != nil)
                .accessibilityHint(blockedReason.map { Text(verbatim: $0) } ?? Text(verbatim: ""))
            if let blockedReason { BlockedReasonLine(text: blockedReason).accessibilityHidden(true) }
        }
    }
}

/// S0 CRUD convention (mirror of web `CrudButton`): create, edit, deactivate and view each keep one colour and one
/// symbol everywhere (`CrudKind`). With `iconOnly` only the symbol shows; the label stays for VoiceOver. A blocked
/// action is disabled and says why below it, like `ClimesaButton`.
struct CrudButton: View {
    let kind: CrudKind
    let label: String
    var iconOnly = false
    var loading = false
    var blockedReason: String? = nil
    let action: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.xs) {
            Button(action: action) { CrudLabel(kind: kind, label: label, iconOnly: iconOnly) }
                .buttonStyle(ClimesaButtonStyle(kind: ClimesaButtonKind(kind), loading: loading, iconOnly: iconOnly))
                .disabled(loading || blockedReason != nil)
                .accessibilityHint(blockedReason.map { Text(verbatim: $0) } ?? Text(verbatim: ""))
            if let blockedReason { BlockedReasonLine(text: blockedReason).accessibilityHidden(true) }
        }
    }
}

/// Symbol and text of a CRUD action, for a `NavigationLink` styled with `ClimesaButtonStyle(kind: ClimesaButtonKind(kind))`.
struct CrudLabel: View {
    let kind: CrudKind
    let label: String
    var iconOnly = false

    var body: some View {
        Group {
            if iconOnly {
                ClimesaIcon(kind.icon, size: 18).accessibilityElement().accessibilityLabel(Text(verbatim: label))
            } else {
                HStack(spacing: Spacing.s) {
                    ClimesaIcon(kind.icon, size: 18).accessibilityHidden(true)
                    Text(verbatim: label)
                }
            }
        }
        .help(Text(verbatim: label))
    }
}

/// S0 read-only cue (mirror of web `ReadOnlyBadge`): a lock pill «Solo lectura»; a tap shows what can be read and whom
/// to contact for a change. For screens that show data the account cannot change (a 403 keeps `InfoStateView`).
struct ReadOnlyBadge: View {
    let who: String
    let what: String
    @State private var open = false

    private var help: String { ReadOnlyCue.help(who: who, what: what) }

    var body: some View {
        Button { open = true } label: {
            // Web `.readonly-badge`: warning-tinted pill, ink text 14/800, lock in the warning colour, 34 pt tall.
            HStack(spacing: 6) {
                ClimesaIcon(.lock, size: 16).foregroundStyle(Theme.warning).accessibilityHidden(true)
                Text(verbatim: ReadOnlyCue.label).font(Atkinson.text(14, .extraBold, relativeTo: .subheadline)).foregroundStyle(Theme.ink)
            }
            .padding(.horizontal, Spacing.space3)
            .frame(minHeight: 34)
            .background(Theme.warningSoft, in: Capsule())
            .overlay(Capsule().stroke(Theme.warning.opacity(0.55), lineWidth: 1))
            .frame(minHeight: 44).contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text(verbatim: ReadOnlyCue.label))
        .accessibilityHint(Text(verbatim: help))
        .popover(isPresented: $open) {
            Text(verbatim: help).font(Typo.small).foregroundStyle(Theme.ink)
                .fixedSize(horizontal: false, vertical: true)
                .padding(Spacing.l).frame(maxWidth: 320)
                .presentationCompactAdaptation(.popover)
        }
    }
}

/// Owner obs. 2: live clock of the navy top bar, next to the bell (web `HospitalDate`). Time «HH:mm:ss» (24 h) in
/// sans 18/800 with tabular figures, white, over the day in #D3DBE6, both in El Salvador time: «Miércoles, 18 de
/// noviembre» with room (regular width), «Mié 18 nov» on a phone so it fits an iPhone SE (the web hides the date line on
/// a phone). `TimelineView` redraws only this view once a second; it is a display clock, never a data refresh.
struct LiveClock: View {
    @Environment(\.horizontalSizeClass) private var sizeClass

    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { context in
            let date = context.date
            VStack(alignment: .trailing, spacing: 1) {
                Text(verbatim: ClimesaDates.clockSeconds(date))
                    .font(Atkinson.text(18, .extraBold, relativeTo: .headline).monospacedDigit())
                    .tracking(0.36)
                    .foregroundStyle(Color.white)
                Text(verbatim: sizeClass == .regular ? ClimesaDates.clockDay(date) : ClimesaDates.compactDay(date))
                    .font(Typo.caption.monospacedDigit()).foregroundStyle(Color(light: 0xD3DBE6, dark: 0xD3DBE6))
            }
            .lineLimit(1)
            .fixedSize()
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(Text(verbatim: "\(ClimesaDates.longDay(date)), \(ClimesaDates.clock(date))"))
            .accessibilityAddTraits(.updatesFrequently)
        }
    }
}

/// The calm reason of a blocked action (S0): info icon and muted text, never the error colour.
struct BlockedReasonLine: View {
    let text: String
    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: Spacing.s) {
            ClimesaIcon(.info, size: 16).foregroundStyle(Theme.muted).accessibilityHidden(true).alignmentGuide(.firstTextBaseline) { $0[.bottom] - 3 }
            Text(verbatim: text).font(Typo.small).foregroundStyle(Theme.muted).fixedSize(horizontal: false, vertical: true)
        }
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Estados de pantalla

/// Sin datos (web `.section-empty`): one calm muted line (and its detail), no box, no icon, no second title.
struct EmptyStateView: View {
    var title = L.text("ds.empty.title")
    var message: String?

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.space1) {
            Text(verbatim: title).font(Typo.body).foregroundStyle(Theme.muted)
            if let message { Text(verbatim: message).font(Typo.small).foregroundStyle(Theme.muted) }
        }
        .fixedSize(horizontal: false, vertical: true)
        .padding(.vertical, Spacing.space2)
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}

/// Carga en curso (diseño 04, «Cargando»). Fase 2: después del ingreso las secciones usan `Skeleton`; esta vista
/// queda para estados previos al ingreso.
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

/// S8 (web `.section-state-info`): an answer that trying again cannot change (403). A quiet soft box: lock on the left,
/// «No tienes acceso a esta información» and the server's message, without «Volver a intentar».
struct InfoStateView: View {
    let message: String
    var title = L.text("ds.info.title")

    var body: some View {
        StateBox(icon: .lock, tint: Theme.primaryText, background: Theme.soft, border: Theme.line, title: title, message: message)
    }
}

/// Error (web `.section-state-error`): danger-tinted box, alert on the left, «No pudimos cargar esta información», the
/// message, and «Volver a intentar» with its icon.
struct ErrorStateView: View {
    let message: String
    var title = L.text("ds.error.title")
    var retry: (() -> Void)?

    var body: some View {
        StateBox(icon: .alert, tint: Theme.danger, background: Theme.dangerSoft, border: Theme.danger.opacity(0.35), title: title, message: message) {
            if let retry { RetryButton(action: retry) }
        }
    }
}

/// «Volver a intentar» with the web retry icon (secondary look).
struct RetryButton: View {
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: Spacing.s) {
                ClimesaIcon(.retry, size: 18).accessibilityHidden(true)
                Text(verbatim: L.text("ds.retry"))
            }
        }
        .buttonStyle(ClimesaButtonStyle(kind: .secondary))
        .fixedSize(horizontal: true, vertical: false)
    }
}

/// The web section state layout: icon column on the left, then a bold title, the message in ink and the action.
private struct StateBox<Action: View>: View {
    let icon: ClimesaIconName
    let tint: Color
    let background: Color
    let border: Color
    let title: String
    let message: String
    @ViewBuilder let action: () -> Action

    init(icon: ClimesaIconName, tint: Color, background: Color, border: Color, title: String, message: String,
         @ViewBuilder action: @escaping () -> Action) {
        self.icon = icon; self.tint = tint; self.background = background; self.border = border
        self.title = title; self.message = message; self.action = action
    }

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: Radius.card)
        HStack(alignment: .top, spacing: Spacing.space3) {
            ClimesaIcon(icon, size: 20).foregroundStyle(tint).padding(.top, 2).accessibilityHidden(true)
            VStack(alignment: .leading, spacing: Spacing.space1) {
                Text(verbatim: title).font(Typo.subheading).foregroundStyle(tint)
                Text(verbatim: message).font(Typo.small).foregroundStyle(Theme.ink).fixedSize(horizontal: false, vertical: true)
                action().padding(.top, Spacing.space1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(Spacing.space4)
        .background(background, in: shape)
        .overlay(shape.strokeBorder(border, lineWidth: 1))
        .accessibilityElement(children: .contain)
    }
}

private extension StateBox where Action == EmptyView {
    init(icon: ClimesaIconName, tint: Color, background: Color, border: Color, title: String, message: String) {
        self.init(icon: icon, tint: tint, background: background, border: border, title: title, message: message) { EmptyView() }
    }
}

/// Conflicto de versión (409): conserva lo escrito y ofrece «Cerrar y recargar» (`WriteError` de web).
struct ConflictBanner: View {
    var message = L.text("ds.conflict.body")
    let reload: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.m) {
            HStack(alignment: .top, spacing: Spacing.m) {
                ClimesaIcon(.alert, size: 18).foregroundStyle(Theme.danger).accessibilityHidden(true)
                Text(verbatim: message).font(Typo.small).foregroundStyle(Theme.danger)
            }
            ClimesaButton(title: L.text("ds.reload"), kind: .secondary, action: reload)
        }
        .padding(Spacing.l)
        .background(Theme.dangerSoft, in: RoundedRectangle(cornerRadius: Radius.card))
        .overlay(RoundedRectangle(cornerRadius: Radius.card).stroke(Theme.danger, lineWidth: 1))
    }
}

// MARK: - Fase 2: sistema común (docs/diseno/fase2/02-sistema.md, espejo de web/src/components/system.tsx)

/// S1: barra compacta. Ruta pequeña, título de 20 pt, filtros y la acción principal; sin descripción.
/// En pantallas con título en la barra de navegación (`.inline`) se pasa `title: nil` y quedan solo filtros y acción.
struct CompactHeader<Filters: View, Actions: View>: View {
    var title: String?
    var breadcrumb: String?
    @ViewBuilder let filters: () -> Filters
    @ViewBuilder let actions: () -> Actions

    init(title: String? = nil, breadcrumb: String? = nil, @ViewBuilder filters: @escaping () -> Filters, @ViewBuilder actions: @escaping () -> Actions) {
        self.title = title; self.breadcrumb = breadcrumb; self.filters = filters; self.actions = actions
    }

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.space3) {
            if title != nil || breadcrumb != nil {
                VStack(alignment: .leading, spacing: 2) {
                    if let breadcrumb { Text(verbatim: breadcrumb).font(Typo.caption).foregroundStyle(Theme.muted) }
                    if let title {
                        Text(verbatim: title).font(Typo.heading).foregroundStyle(Theme.ink)
                            .fixedSize(horizontal: false, vertical: true).accessibilityAddTraits(.isHeader)
                    }
                }
            }
            ViewThatFits(in: .horizontal) {
                HStack(alignment: .center, spacing: Spacing.space3) {
                    filters()
                    Spacer(minLength: Spacing.space2)
                    actions()
                }
                VStack(alignment: .leading, spacing: Spacing.space2) {
                    filters()
                    actions()
                }
            }
        }
        .padding(.bottom, Spacing.space3)
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay(alignment: .bottom) { Rectangle().fill(Theme.line).frame(height: 1) }
    }
}

extension CompactHeader where Filters == EmptyView {
    init(title: String? = nil, breadcrumb: String? = nil, @ViewBuilder actions: @escaping () -> Actions) {
        self.init(title: title, breadcrumb: breadcrumb, filters: { EmptyView() }, actions: actions)
    }
}

extension CompactHeader where Filters == EmptyView, Actions == EmptyView {
    init(title: String?, breadcrumb: String? = nil) {
        self.init(title: title, breadcrumb: breadcrumb, filters: { EmptyView() }, actions: { EmptyView() })
    }
}

/// S3: lugar reservado mientras carga una sección, del alto del contenido real. Estático, sin spinner; el texto
/// queda para VoiceOver. Reemplaza a `LoadingStateView` después del ingreso.
struct Skeleton: View {
    var rows = 3
    /// Alto de cada fila: el de una fila de lista (`ListRow`, 48 pt) salvo que la sección sea otra cosa.
    var rowHeight: CGFloat = Spacing.control
    var label = L.text("ds.skeleton")

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.space3) {
            ForEach(0..<max(rows, 1), id: \.self) { index in
                GeometryReader { proxy in
                    RoundedRectangle(cornerRadius: Radius.control)
                        .fill(Theme.line.opacity(0.7))
                        .frame(width: proxy.size.width * Skeleton.widthFraction(index))
                }
                .frame(height: rowHeight)
            }
        }
        .padding(.vertical, Spacing.space2)
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(verbatim: label))
        .accessibilityAddTraits(.updatesFrequently)
    }

    /// Mismo ritmo que web: 88 %, 100 %, 72 %.
    static func widthFraction(_ index: Int) -> CGFloat {
        switch (index + 1) % 3 {
        case 1: return 0.88
        case 0: return 0.72
        default: return 1
        }
    }
}

// MARK: Áreas

/// Chip del código de área (`AreaTag` de web); con `showName` agrega el nombre. Acepta códigos de espacio (`P3-VIP`).
struct AreaTag: View {
    let code: String
    var showName = false

    init(_ code: String, showName: Bool = false) { self.code = code; self.showName = showName }

    var body: some View {
        let area = AreaCode.of(code)
        let colors = Theme.colors(for: area)
        HStack(spacing: Spacing.space2) {
            Text(verbatim: area.rawValue)
                .font(Atkinson.mono(12, .bold, relativeTo: .caption))
                .tracking(0.5)
                .foregroundStyle(Theme.onArea)
                .padding(.horizontal, 6).padding(.vertical, 2)
                .background(colors.strong, in: RoundedRectangle(cornerRadius: Radius.chip))
            if showName { Text(verbatim: area.name).font(Typo.tag).foregroundStyle(colors.strong).lineLimit(1) }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(verbatim: "Área \(area.name)"))
    }
}

/// Superficie de área: tinte suave, borde de 1 pt al 35 % y franja superior fuerte de 3 pt (`.area-surface`).
struct AreaSurface: ViewModifier {
    let area: AreaCode

    func body(content: Content) -> some View {
        let colors = Theme.colors(for: area)
        let shape = RoundedRectangle(cornerRadius: Radius.card)
        content
            .background(colors.soft, in: shape)
            .overlay(alignment: .top) { Rectangle().fill(colors.strong).frame(height: 3) }
            .clipShape(shape)
            .overlay(shape.stroke(colors.strong.opacity(0.35), lineWidth: 1))
    }
}

extension View {
    /// Tarjeta o celda con el tono de un área (`P1-EMG`, `LAB`, ...).
    func areaSurface(_ code: String?) -> some View { modifier(AreaSurface(area: AreaCode.of(code))) }
}

// MARK: Estados

/// Filter chip (web `.cl-chip`, `ChipGroup`): a pill with a 1.5 pt border, 13/700 text and the count in a small pill.
/// Neutral: surface and line border; selected: soft fill, primary border and primary text, the count pill solid primary.
/// A chip that filters by a status wears that status's look (web `statusFilterLook`): the family colour, icon and
/// texture, solid when selected. A value without family («Todos») stays neutral.
struct StatusFilterChip: View {
    let label: String
    var count: Int?
    /// API status value whose family the chip copies (`StatusFamily.of`); nil is neutral.
    var status: String?
    /// A priority filter copies the `PriorityBadge` colour and icon instead (used when there is no status family).
    var priority: Priority?
    let selected: Bool
    let action: () -> Void

    var body: some View {
        let family = status.flatMap(StatusFamily.of)
        let spoken = count.map { "\(label) (\($0))" } ?? label
        let colors = look(family)
        let icon = lookIcon(family)
        Button(action: action) {
            HStack(spacing: 6) {
                if let icon { ClimesaIcon(icon, size: 14).accessibilityHidden(true) }
                Text(verbatim: label).lineLimit(1)
                if let count { countPill(count, colors: colors) }
            }
            .font(Atkinson.text(13, .bold, relativeTo: .footnote))
            .foregroundStyle(foreground(colors, family: family))
            .padding(.horizontal, Spacing.space3)
            .frame(minHeight: 36)
            .background { background(colors, family: family).clipShape(Capsule()) }
            .overlay { border(colors, family: family) }
            .frame(minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(verbatim: spoken))
        .accessibilityAddTraits(selected ? [.isButton, .isSelected] : .isButton)
    }

    /// The status family colours, or the priority's (urgent, emergency); nil is the neutral chip («Rutina» included).
    private func look(_ family: StatusFamily?) -> (strong: Color, soft: Color)? {
        if let family { return Theme.colors(for: family) }
        if let priority, priority != .rutina { return Theme.colors(for: priority) }
        return nil
    }

    private func lookIcon(_ family: StatusFamily?) -> ClimesaIconName? {
        if let family { return family.icon }
        if let priority, priority != .rutina { return priority.icon }
        return nil
    }

    private func countPill(_ count: Int, colors: (strong: Color, soft: Color)?) -> some View {
        let fill: Color
        let text: Color
        if let colors {
            fill = selected ? Theme.onStatus : Theme.surface
            text = colors.strong
        } else {
            fill = selected ? Theme.primary : Theme.bg
            text = selected ? Theme.onPrimary : Theme.muted
        }
        return Text(verbatim: String(count))
            .font(Atkinson.text(12, .extraBold, relativeTo: .caption).monospacedDigit())
            .foregroundStyle(text)
            .padding(.horizontal, 6).frame(minWidth: 20)
            .background(fill, in: Capsule())
    }

    private func foreground(_ colors: (strong: Color, soft: Color)?, family: StatusFamily?) -> Color {
        guard let colors else { return selected ? Theme.primaryText : Theme.ink }
        return selected || family?.pattern == .solido || priority == .emergencia ? Theme.onStatus : colors.strong
    }

    @ViewBuilder private func background(_ colors: (strong: Color, soft: Color)?, family: StatusFamily?) -> some View {
        if let colors {
            if selected || family?.pattern == .solido || (family == nil && priority == .emergencia) {
                switch family?.pattern {
                case .rayado?: ZStack { colors.strong; DiagonalStripes().fill(Theme.onStatus.opacity(0.22)) }
                case .punteado?: ZStack { colors.strong; DotGrid().fill(Theme.onStatus.opacity(0.4)) }
                default: colors.strong
                }
            } else if let family {
                PatternFill(pattern: family.pattern, strong: colors.strong, soft: colors.soft)
            } else {
                colors.soft
            }
        } else {
            selected ? Theme.soft : Theme.surface
        }
    }

    @ViewBuilder private func border(_ colors: (strong: Color, soft: Color)?, family: StatusFamily?) -> some View {
        if let colors {
            if let family, !selected {
                PatternBorder(pattern: family.pattern, color: colors.strong, radius: 999)
            } else {
                Capsule().strokeBorder(colors.strong, lineWidth: 1.5)
            }
        } else {
            Capsule().strokeBorder(selected ? Theme.primary : Theme.line, lineWidth: 1.5)
        }
    }
}

/// R4a segmented control (web `Segmented` + segmented.css): one bordered group 44 tall, segments split by a 1 pt line,
/// 14/600 text; the selected segment has the soft fill and primary text, its count pill solid primary.
struct ClimesaSegmented<Value: Hashable>: View {
    struct Option {
        let value: Value
        let label: String
        var count: Int? = nil

        init(_ value: Value, _ label: String, count: Int? = nil) { self.value = value; self.label = label; self.count = count }
    }

    let title: String
    let options: [Option]
    @Binding var selection: Value

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: Radius.control)
        HStack(spacing: 0) {
            ForEach(Array(options.enumerated()), id: \.offset) { index, option in
                segment(option, first: index == 0)
            }
        }
        .background(Theme.surface)
        .clipShape(shape)
        .overlay(shape.strokeBorder(Theme.controlLine, lineWidth: 1))
        .accessibilityElement(children: .contain)
        .accessibilityLabel(Text(verbatim: title))
    }

    private func segment(_ option: Option, first: Bool) -> some View {
        let selected = option.value == selection
        return Button { selection = option.value } label: {
            HStack(spacing: Spacing.space2) {
                Text(verbatim: option.label).lineLimit(1).minimumScaleFactor(0.8)
                if let count = option.count {
                    Text(verbatim: String(count))
                        .font(Atkinson.text(12, .bold, relativeTo: .caption).monospacedDigit())
                        .foregroundStyle(selected ? Theme.onPrimary : Theme.muted)
                        .padding(.horizontal, 6).frame(minWidth: 20)
                        .background(selected ? Theme.primary : Theme.bg, in: Capsule())
                }
            }
            .font(Atkinson.text(14, .semibold, relativeTo: .subheadline))
            .foregroundStyle(selected ? Theme.primaryText : Theme.ink)
            .padding(.horizontal, Spacing.space3)
            .frame(maxWidth: .infinity, minHeight: 44)
            .background(selected ? Theme.soft : Color.clear)
            .overlay(alignment: .leading) { if !first { Rectangle().fill(Theme.line).frame(width: 1) } }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text(verbatim: option.count.map { "\(option.label) (\($0))" } ?? option.label))
        .accessibilityAddTraits(selected ? [.isButton, .isSelected] : .isButton)
    }
}

/// Category marks of an appointment born from a request by reason (web `CategoryBadges`, Android `CategoryMarks`):
/// one small icon per category next to the title, each named for VoiceOver. Draws nothing without categories.
struct CategoryMarks: View {
    let categories: [AppointmentCategoryRef]?

    var body: some View {
        if let categories, !categories.isEmpty {
            HStack(spacing: 4) {
                ForEach(categories, id: \.code) { category in
                    // Web `CategoryBadges`: the category glyph on its identity tone (`categoryTone`).
                    let tone = CategoryRequestRules.tone(category.icon)
                    ClimesaIcon(CategoryRequestRules.icon(category.icon), size: 14)
                        .foregroundStyle(Color(tone.foreground))
                        .frame(width: 22, height: 22)
                        .background(Color(tone.background), in: Circle())
                }
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(Text(verbatim: "Motivo: \(categories.map(\.name).joined(separator: ", "))"))
        }
    }
}

/// «Ver N pendientes más» / «Ver menos» under a folded list (`AttentionFold`).
struct AttentionFoldToggle: View {
    let count: Int
    @Binding var expanded: Bool

    var body: some View {
        if let title = AttentionFold.toggleTitle(count, expanded: expanded) {
            Button { expanded.toggle() } label: {
                HStack(spacing: Spacing.space1) {
                    Text(verbatim: title).font(Typo.label)
                    Image(systemName: expanded ? "chevron.up" : "chevron.down").font(Typo.small).accessibilityHidden(true)
                }
                .foregroundStyle(Theme.primaryText)
                .frame(minHeight: 44)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
    }
}

/// S7: estado con ícono + etiqueta + patrón; el color acompaña, nunca va solo. Los patrones (rayado, punteado,
/// sólido, contorno, discontinuo, doble) se distinguen en escala de grises. Un valor sin familia se muestra con un
/// punto, su texto y `fallbackTone` (neutro por defecto).
struct StatusBadge: View {
    let value: String
    var label: String?
    var fallbackTone: StatusTone = .neutral

    init(_ value: String, label: String? = nil, fallbackTone: StatusTone = .neutral) {
        self.value = value; self.label = label; self.fallbackTone = fallbackTone
    }

    var body: some View {
        let style = StatusBadgeStyle.of(value, label: label)
        Group {
            // R1 (web `StatusBadge`): a value that asks for attention (`alto`, `agotado`...) wears the urgent priority.
            if let priority = style.priority { PriorityBadge(priority, label: style.label) }
            else if let family = style.family { FamilyBadge(family: family, text: style.label) }
            else { NeutralBadge(tone: fallbackTone, text: style.label) }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(verbatim: style.label))
    }
}

private struct FamilyBadge: View {
    let family: StatusFamily
    let text: String

    var body: some View {
        let colors = Theme.colors(for: family)
        let shape = RoundedRectangle(cornerRadius: Radius.chip)
        let solid = family.pattern == .solido
        HStack(spacing: 6) {
            ClimesaIcon(family.icon, size: 14).accessibilityHidden(true)
            Text(verbatim: text).lineLimit(2).fixedSize(horizontal: false, vertical: true)
        }
        .font(Typo.tag)
        .foregroundStyle(solid ? Theme.onStatus : colors.strong)
        .padding(.horizontal, 8).padding(.vertical, family.pattern == .doble ? 4 : 3)
        .background { PatternFill(pattern: family.pattern, strong: colors.strong, soft: colors.soft).clipShape(shape) }
        .overlay { PatternBorder(pattern: family.pattern, color: colors.strong) }
    }
}

private struct NeutralBadge: View {
    let tone: StatusTone
    let text: String

    var body: some View {
        let colors = Theme.colors(for: tone)
        HStack(spacing: 6) {
            Circle().fill(colors.foreground).frame(width: 7, height: 7).accessibilityHidden(true)
            Text(verbatim: text).lineLimit(2).fixedSize(horizontal: false, vertical: true)
        }
        .font(Typo.tag)
        .foregroundStyle(colors.foreground)
        .padding(.horizontal, 8).padding(.vertical, 3)
        .background(colors.background, in: RoundedRectangle(cornerRadius: Radius.chip))
        .overlay(RoundedRectangle(cornerRadius: Radius.chip).stroke(colors.foreground.opacity(0.3), lineWidth: 1))
    }
}

/// Fondo de cada patrón (mismas reglas que `.pattern-*` de web/src/modules.css).
private struct PatternFill: View {
    let pattern: StatusPattern
    let strong: Color
    let soft: Color

    var body: some View {
        switch pattern {
        case .rayado: ZStack { soft; DiagonalStripes().fill(strong.opacity(0.18)) }
        case .punteado: ZStack { soft; DotGrid().fill(strong.opacity(0.32)) }
        case .solido: strong
        case .contorno: Theme.surface
        case .discontinuo: Color.clear
        case .doble: soft
        }
    }
}

/// Borde de cada patrón: continuo, punteado, discontinuo o doble.
private struct PatternBorder: View {
    let pattern: StatusPattern
    let color: Color
    var radius: CGFloat = Radius.chip

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: radius)
        switch pattern {
        case .rayado, .solido: shape.strokeBorder(color, lineWidth: 1)
        case .punteado: shape.strokeBorder(color, style: StrokeStyle(lineWidth: 1, lineCap: .round, dash: [0.5, 2.5]))
        case .contorno: shape.strokeBorder(color, lineWidth: 1.5)
        case .discontinuo: shape.strokeBorder(color, style: StrokeStyle(lineWidth: 1.5, dash: [4, 3]))
        case .doble:
            ZStack {
                shape.strokeBorder(color, lineWidth: 1)
                RoundedRectangle(cornerRadius: radius == Radius.chip ? CGFloat(RadiusToken.inner(outer: RadiusToken.chip, padding: 2)) : radius).strokeBorder(color, lineWidth: 1).padding(2)
            }
        }
    }
}

/// Rayas a 45°: 3 pt de raya cada 7 pt.
private struct DiagonalStripes: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        var x = -rect.height
        while x < rect.width {
            path.move(to: CGPoint(x: x, y: rect.maxY))
            path.addLine(to: CGPoint(x: x + rect.height, y: rect.minY))
            path.addLine(to: CGPoint(x: x + rect.height + 3, y: rect.minY))
            path.addLine(to: CGPoint(x: x + 3, y: rect.maxY))
            path.closeSubpath()
            x += 7
        }
        return path
    }
}

/// Puntos de 1,4 pt cada 5 pt.
private struct DotGrid: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        var y = rect.minY + 2.5
        while y < rect.maxY {
            var x = rect.minX + 2.5
            while x < rect.maxX {
                path.addEllipse(in: CGRect(x: x - 0.7, y: y - 0.7, width: 1.4, height: 1.4))
                x += 5
            }
            y += 5
        }
        return path
    }
}

// MARK: Prioridad

/// Prioridad con ícono y texto. El rojo crítico solo en emergencia (relleno sólido).
struct PriorityBadge: View {
    let priority: Priority
    /// Text instead of the level name (for example «Sin cierre» on the urgent look), like the web `label`.
    var label: String?

    init(_ priority: Priority, label: String? = nil) { self.priority = priority; self.label = label }
    /// Valor de la API; lo desconocido se muestra como rutina.
    init(_ value: String?) { self.priority = Priority.of(value) }

    var body: some View {
        let colors = Theme.colors(for: priority)
        let emergency = priority == .emergencia
        let shape = RoundedRectangle(cornerRadius: Radius.chip)
        HStack(spacing: 6) {
            ClimesaIcon(priority.icon, size: 14).accessibilityHidden(true)
            Text(verbatim: label ?? priority.label).lineLimit(1)
        }
        .font(Typo.tag)
        .foregroundStyle(emergency ? Theme.onStatus : colors.strong)
        .padding(.horizontal, 8).padding(.vertical, 3)
        .background(colors.soft, in: shape)
        .overlay(shape.strokeBorder(colors.strong, lineWidth: 1))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(verbatim: label ?? "Prioridad \(priority.label)"))
    }
}

// MARK: Leyenda

/// Leyenda con exactamente las mismas piezas que las tarjetas y los filtros.
struct StatusLegend: View {
    var areas = true
    var statuses = true
    var priorities = true

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.space4) {
            if areas {
                LegendGroup(title: L.text("ds.legend.areas")) {
                    ForEach(AreaCode.allCases, id: \.self) { area in AreaTag(area.rawValue, showName: true) }
                }
            }
            if statuses {
                LegendGroup(title: L.text("ds.legend.statuses")) {
                    ForEach(StatusFamily.allCases, id: \.self) { family in StatusBadge(family.sample, label: family.label) }
                }
            }
            if priorities {
                LegendGroup(title: L.text("ds.legend.priority")) {
                    ForEach(Priority.allCases, id: \.self) { priority in PriorityBadge(priority) }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .contain)
        .accessibilityLabel(Text(verbatim: L.text("ds.legend.title")))
    }
}

private struct LegendGroup<Items: View>: View {
    let title: String
    @ViewBuilder let items: () -> Items

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.space2) {
            Text(verbatim: title).font(Typo.eyebrow).foregroundStyle(Theme.muted).textCase(.uppercase).tracking(Typo.eyebrowTracking).accessibilityAddTraits(.isHeader)
            FlowLayout(spacing: Spacing.space2) { items() }
        }
    }
}

/// Acomoda las piezas en filas y pasa a la siguiente cuando no caben (texto grande incluido).
struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let rows = arrange(width: proposal.width ?? .infinity, subviews: subviews)
        let height = rows.reduce(CGFloat(0)) { $0 + $1.height } + spacing * CGFloat(max(rows.count - 1, 0))
        let width = rows.map(\.width).max() ?? 0
        return CGSize(width: proposal.width ?? width, height: height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var y = bounds.minY
        for row in arrange(width: bounds.width, subviews: subviews) {
            var x = bounds.minX
            for index in row.indices {
                let size = subviews[index].sizeThatFits(.unspecified)
                subviews[index].place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(width: min(size.width, bounds.width), height: size.height))
                x += size.width + spacing
            }
            y += row.height + spacing
        }
    }

    private struct Row { var indices: [Int] = []; var width: CGFloat = 0; var height: CGFloat = 0 }

    private func arrange(width: CGFloat, subviews: Subviews) -> [Row] {
        var rows: [Row] = []
        var current = Row()
        for index in subviews.indices {
            let size = subviews[index].sizeThatFits(.unspecified)
            let needed = current.indices.isEmpty ? size.width : current.width + spacing + size.width
            if !current.indices.isEmpty && needed > width {
                rows.append(current)
                current = Row()
            }
            current.width = current.indices.isEmpty ? size.width : current.width + spacing + size.width
            current.height = max(current.height, size.height)
            current.indices.append(index)
        }
        if !current.indices.isEmpty { rows.append(current) }
        return rows
    }
}
