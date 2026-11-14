import Foundation
import Network
import Observation

/// Consume el flujo de tiempo real y expone el estado de conexión y los contadores de invalidación.
/// Las vistas usan esos contadores como `id` de `.task(id:)` para volver a pedir sus datos (sin temporizadores).
/// También reacciona al volver a primer plano y al recuperar la red (`LiveWakePolicy`).
@MainActor @Observable
final class LiveViewModel {
    private(set) var snapshot = LiveSnapshot()
    /// Sube para que la vista abra un socket nuevo ya (es parte del `id` de su `.task`).
    private(set) var connectionGeneration = 0
    @ObservationIgnored private var backgroundedAt: Date?
    @ObservationIgnored private var path = NetworkPathTracker()

    // Se crea desde un @State de la vista, fuera del actor principal.
    nonisolated init() {}

    /// Se llama desde `.task {}`: termina cuando SwiftUI cancela la tarea (salir de la sesión, otros canales o
    /// reconexión inmediata), y eso cierra la conexión y deja de vigilar la red.
    func run(service: (any RealtimeService)?, channels: [String]) async {
        guard let service, !channels.isEmpty else {
            snapshot.connection = .offline
            return
        }
        // Los contadores no vuelven a cero: así cada vista ve un `id` nuevo al resincronizar.
        snapshot.connection = .reconnecting
        let monitor = NWPathMonitor()
        monitor.pathUpdateHandler = { [weak self] update in
            let satisfied = update.status == .satisfied
            Task { @MainActor in self?.networkChanged(satisfied: satisfied) }
        }
        monitor.start(queue: DispatchQueue(label: "sv.edu.catolica.climesa.live.path"))
        defer { monitor.cancel() }
        for await signal in service.observe(channels: channels) {
            snapshot = LiveReducer.apply(signal, to: snapshot)
        }
    }

    /// Deslizar para actualizar: la persona pide los datos de nuevo (no es un temporizador).
    func refreshAll() {
        snapshot = LiveReducer.apply(.resync, to: snapshot)
    }

    func sceneEnteredBackground() {
        backgroundedAt = Date()
    }

    func sceneBecameActive() {
        let seconds = backgroundedAt.map { Date().timeIntervalSince($0) }
        backgroundedAt = nil
        perform(LiveWakePolicy.action(for: .sceneActive(backgroundSeconds: seconds), connection: snapshot.connection))
    }

    private func networkChanged(satisfied: Bool) {
        guard let wake = path.update(satisfied: satisfied) else { return }
        perform(LiveWakePolicy.action(for: wake, connection: snapshot.connection))
    }

    private func perform(_ action: LiveWakeAction) {
        switch action {
        case .none: break
        case .refetch: refreshAll()
        case .reconnect: connectionGeneration += 1
        }
    }
}
