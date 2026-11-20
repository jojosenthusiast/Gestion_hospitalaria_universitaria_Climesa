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
    /// The record (`id`) whose write is in flight, so a list shows the spinner only on that row.
    private(set) var busyId: String?
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
        busy = true; busyId = id; error = nil; notice = nil; lastFailure = nil
        defer { busy = false; busyId = nil }
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

    /// A write whose idempotency keys live elsewhere (the D-8 cancel keeps one key per body in `PatientCancelFlow`):
    /// only the screen state is kept here. A refusal before sending (`CancelRefusal`) shows its message with no failure.
    @discardableResult
    func perform(_ id: String = "form", success: String? = nil, _ work: () async throws -> Void) async -> Bool {
        guard !busy else { return false }
        busy = true; busyId = id; error = nil; notice = nil; lastFailure = nil
        defer { busy = false; busyId = nil }
        do {
            try await work()
            notice = success
            return true
        } catch is CancellationError {
            return false
        } catch {
            lastFailure = error as? APIFailure
            self.error = error.userMessage
            return false
        }
    }
}

extension Submission {
    /// Clears the last rejection and its texts, so a conflict banner goes away once the screen reloads.
    func clearFailure() { lastFailure = nil; error = nil; notice = nil }

    /// MOV-03: mensajes en español por campo del último rechazo (`errors[]` del problem+json), para mostrarlos junto al campo.
    var fieldErrors: [String: String] { lastFailure?.fieldErrors ?? [:] }
}

/// One `Submission` per row (B3, I-15): the tapped row shows pending, then done or error, in place; the other rows stay
/// usable, and each row refuses a second tap while its own write is in flight.
@MainActor @Observable
final class SubmissionBook {
    @ObservationIgnored private var rows: [String: Submission] = [:]

    nonisolated init() {}

    subscript(_ id: String) -> Submission {
        if let row = rows[id] { return row }
        let row = Submission()
        rows[id] = row
        return row
    }
}

/// Parte de un tablero que se pide por separado: si una lectura falla, solo esa tarjeta muestra el error con
/// «Reintentar» y las demás siguen visibles (CH-02: un fallo nunca se ve como "no hay datos").
enum Part<Value: Sendable>: Sendable {
    case loaded(Value)
    case failed(String)

    var value: Value? { if case let .loaded(value) = self { return value }; return nil }
    var error: String? { if case let .failed(message) = self { return message }; return nil }

    /// Ejecuta la lectura y guarda su error en español en vez de ocultarlo. Una cancelación sigue cancelando.
    static func load(_ fetch: () async throws -> Value) async throws -> Part<Value> {
        do { return .loaded(try await fetch()) }
        catch is CancellationError { throw CancellationError() }
        catch { return .failed(error.userMessage) }
    }
}

/// Revisión del PR #119: espera hasta el `proximoCambio` de los avisos (uno vence o empieza, o vuelve un recordatorio) y
/// vuelve a leer una sola vez, igual que Android y la web. Se llama desde `.task(id: proximoCambio)`, así un cambio de
/// fecha o salir de la pantalla cancela la espera. Nunca sondea.
func reloadAt(delay: TimeInterval?, reload: () async -> Void) async {
    guard let delay else { return }
    try? await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
    if !Task.isCancelled { await reload() }
}

/// Parte de un tablero que falló, con el título de su tarjeta.
struct PartFailure: Identifiable {
    let title: String
    let message: String?
    var id: String { title }
}

/// Error de una parte del tablero, dentro de su tarjeta, con «Reintentar». S8: with a 403 `failure` the message is
/// information (trying again cannot change it), so there is no «Reintentar».
struct PartError: View {
    let message: String
    var failure: APIFailure? = nil
    let retry: () async -> Void
    var body: some View {
        let retryable = failure?.offersRetry ?? true
        VStack(alignment: .leading, spacing: Spacing.s) {
            HStack(alignment: .top, spacing: Spacing.s) {
                ClimesaIcon(retryable ? .alert : .info, size: 18)
                    .foregroundStyle(retryable ? Theme.danger : Theme.muted).accessibilityHidden(true)
                Text(verbatim: message).font(Typo.small).foregroundStyle(Theme.ink).fixedSize(horizontal: false, vertical: true)
            }
            if retryable { RetryButton { Task { await retry() } } }
        }
        .accessibilityElement(children: .contain)
    }
}

/// Contador "123/500" bajo un campo con límite; en rojo fuera del rango permitido.
struct CharacterCounter: View {
    let count: Int
    let range: ClosedRange<Int>
    var body: some View {
        let ok = count == 0 || range.contains(count)
        Text(verbatim: "\(count)/\(range.upperBound)")
            .font(Typo.caption).monospacedDigit()
            .foregroundStyle(ok ? Theme.muted : Theme.danger)
            .frame(maxWidth: .infinity, alignment: .trailing)
            .accessibilityLabel(Text(verbatim: "\(count) de \(range.upperBound) caracteres"))
    }
}

/// Aviso fijo abajo mientras una llamada tarda más de 5 s: el servidor gratuito despierta (MA-OPS-01).
struct ServerWakeBanner: View {
    var body: some View {
        if ServerWake.shared.waking {
            HStack(spacing: Spacing.m) {
                ProgressView().tint(Theme.warning)
                Text(verbatim: ColdStartPolicy.wakingMessage).font(Typo.small).foregroundStyle(Theme.ink).fixedSize(horizontal: false, vertical: true)
            }
            .padding(Spacing.l).frame(maxWidth: .infinity, alignment: .leading)
            .background(Theme.warningSoft)
            .overlay(alignment: .top) { Rectangle().fill(Theme.warning.opacity(0.4)).frame(height: 1) }
            .accessibilityElement(children: .combine)
            .accessibilityAddTraits(.updatesFrequently)
            .transition(.move(edge: .bottom).combined(with: .opacity))
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
    var body: some View { Text(key).font(Typo.eyebrow).foregroundStyle(Theme.primaryText).textCase(.uppercase).tracking(Typo.eyebrowTracking).padding(.top, 6).accessibilityAddTraits(.isHeader) }
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
        VStack(alignment: .leading, spacing: Spacing.space4) {
            // Con datos en caché, una revalidación fallida es una línea compacta; el contenido válido sigue visible.
            if let error = loader.error {
                if loader.value != nil { PartError(message: error, failure: loader.failure, retry: retry) }
                else if loader.failure?.offersRetry == false { InfoStateView(message: error) }
                else { ErrorStateView(message: error) { Task { await retry() } } }
            }
            if let value = loader.value { content(value) }
            // S3: después del ingreso no hay spinner; la sección reserva su lugar con un esqueleto.
            else if loader.loading { Skeleton() }
        }
    }
}

/// Mensajes de una escritura (error o confirmación).
struct SubmissionNotice: View {
    let submission: Submission
    var body: some View {
        if let error = submission.error { PatientNotice(text: error, failure: true) }
        if let notice = submission.notice { PatientNotice(text: notice) }
    }
}

/// Pantalla secundaria (detalle empujado u hoja) con el mismo marco y la misma barra azul marino que las pestañas.
/// En una hoja, `onClose` pone «Cerrar» en la barra (HIG), no como botón de ancho completo al final del contenido.
struct ScreenFrame<Content: View>: View {
    let title: LocalizedStringKey
    var onClose: (() -> Void)?
    let content: () -> Content

    init(title: LocalizedStringKey, onClose: (() -> Void)? = nil, @ViewBuilder content: @escaping () -> Content) {
        self.title = title; self.onClose = onClose; self.content = content
    }

    var body: some View {
        ScrollView {
            // S1: sin título gigante; el título va en línea en la barra de navegación (HIG).
            VStack(alignment: .leading, spacing: Spacing.gap) {
                content()
            }.padding(Spacing.gutter).frame(maxWidth: 760, alignment: .leading).frame(maxWidth: .infinity)
        }
        .dismissibleKeyboard()
        .background(Theme.bg).navigationTitle(title).navigationBarTitleDisplayMode(.inline)
        .climesaNavBar()
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                if let onClose { Button(L.text("common.close"), action: onClose) }
            }
            // Owner obs. 2: the live clock stays in the bar on pushed screens and sheets too.
            ToolbarItem(placement: .topBarTrailing) { LiveClock() }
        }
    }
}

extension View {
    /// The keyboard always has a way out (owner report: on the patient search it covered the tab bar and nothing
    /// closed it): dragging the content down hides it, and «Listo» sits above the keys on every tab, pushed screen and sheet.
    func dismissibleKeyboard() -> some View {
        scrollDismissesKeyboard(.interactively)
            .toolbar {
                ToolbarItemGroup(placement: .keyboard) {
                    Spacer()
                    Button(L.text("common.done")) {
                        UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
                    }.font(Typo.label)
                }
            }
    }

    /// D79 / D101: keeps `visible` in step with the software keyboard, from the system notifications (no timer, no
    /// Combine). A screen with a docked action bar uses it to move the actions into the form while the keyboard is up.
    func trackingKeyboard(_ visible: Binding<Bool>) -> some View {
        self
            .task {
                for await _ in NotificationCenter.default.notifications(named: UIResponder.keyboardWillShowNotification) { visible.wrappedValue = true }
            }
            .task {
                for await _ in NotificationCenter.default.notifications(named: UIResponder.keyboardWillHideNotification) { visible.wrappedValue = false }
            }
    }

    /// Barra de navegación azul marino con texto claro: pestañas, detalles empujados y hojas (I-6).
    func climesaNavBar() -> some View {
        toolbarBackground(Theme.navy, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
            .toolbarColorScheme(.dark, for: .navigationBar)
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
