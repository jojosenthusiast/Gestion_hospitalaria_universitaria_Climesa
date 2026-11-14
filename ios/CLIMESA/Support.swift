import SwiftUI
import Observation

/// Lectura de una pantalla: valor, carga y error en español. Las vistas la llaman desde `.task(id:)` con el contador
/// del tiempo real, así vuelven a pedir los datos al llegar un evento (sin temporizadores).
@MainActor @Observable
final class Loader<Value: Sendable> {
    private(set) var value: Value?
    private(set) var loading = false
    private(set) var error: String?
    private(set) var failure: APIFailure?

    nonisolated init() {}

    func load(_ fetch: () async throws -> Value) async {
        loading = true; error = nil; failure = nil
        do { value = try await fetch() }
        catch is CancellationError {}
        catch {
            failure = error as? APIFailure
            self.error = error.userMessage
        }
        loading = false
    }

    func clear() { value = nil; error = nil; failure = nil }
}

/// Escrituras de una pantalla. Cada registro (`id`) tiene su intención y su `Idempotency-Key` (convenciones-api.md);
/// un formulario sin registro usa el id por defecto.
@MainActor @Observable
final class Submission {
    private(set) var busy = false
    var error: String?
    var notice: String?
    private(set) var lastFailure: APIFailure?
    private var intents = IntentBook()

    nonisolated init() {}

    /// Envía la intención; devuelve true si la API la aceptó. Tras cualquier resultado la pantalla vuelve a pedir
    /// sus datos (en un `version_conflicto` así se muestra la versión vigente).
    @discardableResult
    func run<Body: Encodable>(_ id: String = "form", body: Body, success: String? = nil, _ send: (String) async throws -> Void) async -> Bool {
        guard !busy else { return false }
        busy = true; error = nil; notice = nil; lastFailure = nil
        defer { busy = false }
        let fingerprint = JSONBody.fingerprint(body)
        let key = intents.key(id, fingerprint: fingerprint)
        do {
            try await send(key)
            intents.settle(id, success: true, fingerprint: fingerprint)
            notice = success
            return true
        } catch is CancellationError {
            return false
        } catch {
            let failure = (error as? APIFailure) ?? .transport
            intents.settle(id, success: false, failure: failure, fingerprint: fingerprint)
            lastFailure = failure
            self.error = error.userMessage
            return false
        }
    }
}

// MARK: - Componentes

struct Card<Content: View>: View {
    @ViewBuilder let content: () -> Content
    var body: some View { SectionCard(content: content) }
}

struct SectionTitle: View {
    let key: LocalizedStringKey
    init(_ key: LocalizedStringKey) { self.key = key }
    var body: some View { Text(key).font(Typo.eyebrow).foregroundStyle(Theme.primaryText).textCase(.uppercase).padding(.top, 6).accessibilityAddTraits(.isHeader) }
}

enum PillTone { case neutral, good, warning, danger }

struct Pill: View {
    let text: String
    var tone: PillTone = .neutral
    var body: some View {
        let colors = Theme.colors(for: statusTone)
        Text(verbatim: text).font(Typo.tag).padding(.horizontal, 9).padding(.vertical, 5)
            .background(colors.background, in: Capsule()).foregroundStyle(colors.foreground)
            .overlay(Capsule().stroke(colors.foreground.opacity(0.24), lineWidth: 1))
    }
    private var statusTone: StatusTone {
        switch tone {
        case .neutral: return .neutral
        case .good: return .success
        case .warning: return .warning
        case .danger: return .danger
        }
    }
}

struct FieldError: View {
    let text: String?
    var body: some View {
        if let text { Text(verbatim: text).font(Typo.caption).foregroundStyle(Theme.danger) }
    }
}

struct EmptyNote: View {
    let key: LocalizedStringKey
    init(_ key: LocalizedStringKey) { self.key = key }
    var body: some View { Text(key).font(Typo.small).foregroundStyle(Theme.muted) }
}

/// Estado de una lectura: cargando, error con reintento, o el contenido.
struct LoadState<Value: Sendable, Content: View>: View {
    let loader: Loader<Value>
    let retry: () async -> Void
    @ViewBuilder let content: (Value) -> Content
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            if let error = loader.error { ErrorStateView(message: error) { Task { await retry() } } }
            if let value = loader.value { content(value) }
            else if loader.loading { LoadingStateView() }
        }
    }
}

/// Mensajes de una escritura (error o confirmación).
struct SubmissionNotice: View {
    let submission: Submission
    var body: some View {
        if let error = submission.error { Notice(text: error, failure: true) }
        if let notice = submission.notice { Notice(text: notice) }
    }
}

/// Pantalla secundaria con el mismo marco que las pestañas.
struct ScreenFrame<Content: View>: View {
    let title: LocalizedStringKey
    @ViewBuilder let content: () -> Content
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                Text(title).font(Typo.title).foregroundStyle(Theme.ink).fixedSize(horizontal: false, vertical: true)
                content()
            }.padding(24).frame(maxWidth: 760, alignment: .leading).frame(maxWidth: .infinity)
        }.background(Theme.bg).navigationTitle(title).navigationBarTitleDisplayMode(.inline)
    }
}

extension AccountModel {
    func can(_ permission: String) -> Bool { profile?.hasPermission(permission) ?? false }
    /// Cliente de la API; sin configuración del servidor la llamada falla con un mensaje en español.
    func client() throws -> APIClient {
        guard let api else { throw APIFailure.transport }
        return api
    }
}
