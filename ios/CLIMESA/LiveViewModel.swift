import Foundation
import Observation

/// Consume el flujo de tiempo real y expone el estado de conexión y los contadores de invalidación.
/// Las vistas usan esos contadores como `id` de `.task(id:)` para volver a pedir sus datos (sin temporizadores).
@MainActor @Observable
final class LiveViewModel {
    private(set) var snapshot = LiveSnapshot()

    // Se crea desde un @State de la vista, fuera del actor principal.
    nonisolated init() {}

    /// Se llama desde `.task {}`: termina cuando SwiftUI cancela la tarea, y eso cierra la conexión.
    func run(service: (any RealtimeService)?, channels: [String]) async {
        guard let service, !channels.isEmpty else {
            snapshot.connection = .offline
            return
        }
        snapshot = LiveSnapshot()
        for await signal in service.observe(channels: channels) {
            snapshot = LiveReducer.apply(signal, to: snapshot)
        }
    }
}
