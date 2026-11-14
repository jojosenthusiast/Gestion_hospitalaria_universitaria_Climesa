import Foundation

/// Algo que pasó fuera del socket y que puede dejar la pantalla desactualizada.
public enum LiveWake: Equatable, Sendable {
    /// La app volvió a primer plano. `backgroundSeconds` es nil si no llegó a pasar a segundo plano (por ejemplo, el
    /// centro de control tapó la pantalla un momento).
    case sceneActive(backgroundSeconds: TimeInterval?)
    /// Volvió la red tras haberse perdido.
    case networkRegained
    case networkLost
}

public enum LiveWakeAction: Equatable, Sendable {
    case none
    /// Volver a pedir los datos de todas las vistas con la conexión actual.
    case refetch
    /// Abrir un socket nuevo ya, sin esperar la espera entre reconexiones; al unirse se vuelve a pedir todo.
    case reconnect
}

/// Qué hacer al volver a primer plano o al recuperar la red. No es sondeo: solo reacciona a esos cambios.
public enum LiveWakePolicy {
    /// En segundo plano iOS suspende la app y el socket deja de recibir; tras este tiempo se da por perdido.
    public static let staleAfterBackground: TimeInterval = 20

    public static func action(for wake: LiveWake, connection: ConnectionState) -> LiveWakeAction {
        switch wake {
        case .networkLost:
            return .none
        case .networkRegained:
            // Al cambiar de red el socket anterior suele quedar muerto aunque aún no lo sepa.
            return .reconnect
        case .sceneActive(let seconds):
            if connection != .live { return .reconnect }
            guard let seconds else { return .none }
            return seconds >= staleAfterBackground ? .reconnect : .refetch
        }
    }
}

/// Convierte las lecturas de la ruta de red (NWPathMonitor) en cambios: la primera lectura y las repetidas no cuentan.
public struct NetworkPathTracker: Equatable, Sendable {
    private var satisfied: Bool?

    public init() {}

    public mutating func update(satisfied now: Bool) -> LiveWake? {
        defer { satisfied = now }
        guard let before = satisfied, before != now else { return nil }
        return now ? .networkRegained : .networkLost
    }
}
