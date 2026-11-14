import Foundation

/// `Idempotency-Key` de una intención del usuario (convenciones-api.md, CON-07):
/// 1. la clave nace al primer envío de la intención (UUID v4);
/// 2. se reutiliza en cada reintento de esa misma intención (red, tiempo de espera, 5xx, refresco del token);
/// 3. se descarta con 2xx, o cuando la persona cambia los datos después de un 4xx (eso ya es otra intención);
/// 4. tras 409 `idempotencia_conflicto` se usa una clave nueva;
/// 5. nunca se calcula a partir de método, ruta y cuerpo: la huella solo detecta si cambiaron los datos.
public struct SubmissionIntent: Sendable {
    public private(set) var pendingKey: String?
    private var rejectedFingerprint: String?
    private let makeKey: @Sendable () -> String

    public init(makeKey: @escaping @Sendable () -> String = { UUID().uuidString.lowercased() }) {
        self.makeKey = makeKey
    }

    /// Clave para enviar los datos con huella `fingerprint`.
    public mutating func key(for fingerprint: String = "") -> String {
        if let rejected = rejectedFingerprint, rejected != fingerprint { pendingKey = nil }
        rejectedFingerprint = nil
        if let pendingKey { return pendingKey }
        let created = makeKey()
        pendingKey = created
        return created
    }

    /// Resultado del envío con huella `fingerprint`.
    public mutating func settle(success: Bool, failure: APIFailure? = nil, fingerprint: String = "") {
        if success { reset(); return }
        guard let failure else { return }
        if failure.code == "idempotencia_conflicto" { reset(); return }
        if failure.isRetryable { return }
        // 4xx definitivo: la API revirtió el intento. Mismos datos, misma clave; datos distintos, clave nueva.
        rejectedFingerprint = fingerprint
    }

    /// La persona cerró el formulario sin enviarlo.
    public mutating func reset() {
        pendingKey = nil
        rejectedFingerprint = nil
    }
}

/// Intenciones de acciones sobre filas de una lista (llamar un número, cancelar una cita, revisar una orden):
/// cada registro tiene su propia intención.
public struct IntentBook: Sendable {
    private var intents: [String: SubmissionIntent] = [:]
    private let makeKey: @Sendable () -> String

    public init(makeKey: @escaping @Sendable () -> String = { UUID().uuidString.lowercased() }) {
        self.makeKey = makeKey
    }

    public mutating func key(_ id: String, fingerprint: String = "") -> String {
        var intent = intents[id] ?? SubmissionIntent(makeKey: makeKey)
        let key = intent.key(for: fingerprint)
        intents[id] = intent
        return key
    }

    public mutating func settle(_ id: String, success: Bool, failure: APIFailure? = nil, fingerprint: String = "") {
        guard var intent = intents[id] else { return }
        intent.settle(success: success, failure: failure, fingerprint: fingerprint)
        intents[id] = intent.pendingKey == nil ? nil : intent
    }

    public func pendingKey(_ id: String) -> String? { intents[id]?.pendingKey }
}
