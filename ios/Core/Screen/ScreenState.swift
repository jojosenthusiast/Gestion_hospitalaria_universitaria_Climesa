import Foundation
import Observation

// Screen state shared by the view models (moved from CLIMESA/Support.swift so the view models in Core and their tests
// can use it; the app compiles Core in the same target, so nothing changes for the views).

/// Lectura de una pantalla: valor, carga y error en español. Las vistas la llaman desde `.task(id:)` con el contador
/// del tiempo real, así vuelven a pedir los datos al llegar un evento (sin temporizadores).
@MainActor @Observable
public final class Loader<Value: Sendable> {
    public private(set) var value: Value?
    public private(set) var loading = false
    public private(set) var error: String?
    public private(set) var failure: APIFailure?

    nonisolated public init() {}

    public func load(_ fetch: () async throws -> Value) async {
        loading = true; error = nil; failure = nil
        do { value = try await fetch() }
        catch is CancellationError {}
        catch {
            failure = error as? APIFailure
            self.error = error.userMessage
        }
        loading = false
    }

    public func clear() { value = nil; error = nil; failure = nil }
}

/// Escrituras de una pantalla. Cada registro (`id`) tiene su intención y su `Idempotency-Key` (convenciones-api.md);
/// un formulario sin registro usa el id por defecto.
@MainActor @Observable
public final class Submission {
    public private(set) var busy = false
    /// The record (`id`) whose write is in flight, so a list shows the spinner only on that row.
    public private(set) var busyId: String?
    public var error: String?
    public var notice: String?
    public private(set) var lastFailure: APIFailure?
    private var intents = IntentBook()

    nonisolated public init() {}

    /// Envía la intención; devuelve true si la API la aceptó. Tras cualquier resultado la pantalla vuelve a pedir
    /// sus datos (en un `version_conflicto` así se muestra la versión vigente).
    @discardableResult
    public func run<Body: Encodable>(_ id: String = "form", body: Body, success: String? = nil, _ send: (String) async throws -> Void) async -> Bool {
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
    public func perform(_ id: String = "form", success: String? = nil, _ work: () async throws -> Void) async -> Bool {
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

public extension Submission {
    /// Clears the last rejection and its texts, so a conflict banner goes away once the screen reloads.
    func clearFailure() { lastFailure = nil; error = nil; notice = nil }

    /// MOV-03: mensajes en español por campo del último rechazo (`errors[]` del problem+json), para mostrarlos junto al campo.
    var fieldErrors: [String: String] { lastFailure?.fieldErrors ?? [:] }
}

/// One `Submission` per row (B3, I-15): the tapped row shows pending, then done or error, in place; the other rows stay
/// usable, and each row refuses a second tap while its own write is in flight.
@MainActor @Observable
public final class SubmissionBook {
    @ObservationIgnored private var rows: [String: Submission] = [:]

    nonisolated public init() {}

    public subscript(_ id: String) -> Submission {
        if let row = rows[id] { return row }
        let row = Submission()
        rows[id] = row
        return row
    }
}

/// Parte de un tablero que se pide por separado: si una lectura falla, solo esa tarjeta muestra el error con
/// «Reintentar» y las demás siguen visibles (CH-02: un fallo nunca se ve como "no hay datos").
public enum Part<Value: Sendable>: Sendable {
    case loaded(Value)
    case failed(String)

    public var value: Value? { if case let .loaded(value) = self { return value }; return nil }
    public var error: String? { if case let .failed(message) = self { return message }; return nil }

    /// Ejecuta la lectura y guarda su error en español en vez de ocultarlo. Una cancelación sigue cancelando.
    public static func load(_ fetch: () async throws -> Value) async throws -> Part<Value> {
        do { return .loaded(try await fetch()) }
        catch is CancellationError { throw CancellationError() }
        catch { return .failed(error.userMessage) }
    }
}
