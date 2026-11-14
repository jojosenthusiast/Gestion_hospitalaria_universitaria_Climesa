import Foundation

/// Lo que sobrevive entre un socket y el siguiente mientras dura la observación.
private struct LoopState {
    /// Cursor de `GET /eventos`; nil hasta pedir la cabeza tras la primera unión.
    var cursor: String?
    var wasDown = false
    var failures = 0
    var rejections: [String: Int] = [:]
    var dropped: Set<String> = []
}

/// Estado de un socket que comparten la lectura y el latido: referencias, canales unidos, token y latido pendiente.
private actor SocketSession {
    private var counter = 0
    private var joined = Set<String>()
    private var token: String
    private var pendingHeartbeat: String?

    init(token: String) { self.token = token }

    func nextRef() -> String { counter += 1; return String(counter) }
    func markJoined(_ channel: String) -> Bool { joined.insert(channel).inserted }
    func isJoined(_ channel: String) -> Bool { joined.contains(channel) }
    func containsAll(_ channels: [String]) -> Bool { !channels.isEmpty && channels.allSatisfy { joined.contains($0) } }
    func joinedChannels() -> [String] { joined.sorted() }

    /// Guarda el token nuevo; devuelve true solo si cambió.
    func replaceToken(_ fresh: String) -> Bool {
        guard fresh != token else { return false }
        token = fresh
        return true
    }

    func expectHeartbeat(_ ref: String) { pendingHeartbeat = ref }
    func acknowledge(_ ref: String) { if ref == pendingHeartbeat { pendingHeartbeat = nil } }
    func isPending(_ ref: String) -> Bool { pendingHeartbeat == ref }
}

/// Cliente mínimo del protocolo Phoenix de Supabase Realtime. Igual que web/src/lib/live.ts y que el repositorio
/// de Android (`SupabaseRealtimeRepository`): se une a los canales de /auth/me y emite los eventos. Tras la primera
/// unión pide la cabeza del cursor (`GET /eventos?after=0` no trae eventos) y, solo tras una caída, recupera lo
/// perdido desde ese cursor, página por página. Los únicos temporizadores son el latido del protocolo y la espera
/// creciente entre reconexiones; eso no es sondeo de datos.
///
/// - El latido espera su `phx_reply`; sin respuesta en `heartbeatTimeout` el socket se da por caído.
/// - En cada latido se comprueba el token de la sesión; si cambió (la sesión lo renovó) se manda `access_token` a los
///   canales unidos.
/// - Un canal rechazado `maxJoinRejections` veces seguidas se deja fuera y el resto sigue en vivo, con un aviso no fatal.
public struct SupabaseRealtimeService: RealtimeService {
    private let websocketURL: String
    private let accessToken: @Sendable () async -> String?
    private let catchUp: @Sendable (String) async throws -> CatchUp
    private let sockets: any RealtimeSocketFactory
    private let heartbeatInterval: TimeInterval
    private let heartbeatTimeout: TimeInterval
    private let backoff: @Sendable (Int) -> TimeInterval
    private let offlineAfterFailures: Int
    private let maxJoinRejections: Int

    public init(
        websocketURL: String,
        accessToken: @escaping @Sendable () async -> String?,
        catchUp: @escaping @Sendable (String) async throws -> CatchUp,
        sockets: any RealtimeSocketFactory,
        heartbeatInterval: TimeInterval = 25,
        heartbeatTimeout: TimeInterval = 10,
        backoff: @escaping @Sendable (Int) -> TimeInterval = SupabaseRealtimeService.defaultBackoff,
        offlineAfterFailures: Int = 3,
        maxJoinRejections: Int = 3
    ) {
        self.websocketURL = websocketURL
        self.accessToken = accessToken
        self.catchUp = catchUp
        self.sockets = sockets
        self.heartbeatInterval = heartbeatInterval
        self.heartbeatTimeout = min(heartbeatTimeout, heartbeatInterval)
        self.backoff = backoff
        self.offlineAfterFailures = offlineAfterFailures
        self.maxJoinRejections = maxJoinRejections
    }

    /// 1, 2, 4, 8, 16 y luego 30 segundos como máximo.
    public static func defaultBackoff(_ attempt: Int) -> TimeInterval {
        min(30, pow(2, Double(min(max(attempt - 1, 0), 5))))
    }

    public func observe(channels: [String]) -> AsyncStream<RealtimeSignal> {
        AsyncStream(RealtimeSignal.self) { continuation in
            let task = Task { await self.run(channels: channels, continuation: continuation) }
            continuation.onTermination = { _ in task.cancel() }
        }
    }

    private func connectionState(failures: Int) -> ConnectionState {
        failures >= offlineAfterFailures ? .offline : .reconnecting
    }

    fileprivate static func pause(_ seconds: TimeInterval) async -> Bool {
        do {
            try await Task.sleep(nanoseconds: UInt64(max(0, seconds) * 1_000_000_000))
            return true
        } catch {
            return false
        }
    }

    private func run(channels requested: [String], continuation: AsyncStream<RealtimeSignal>.Continuation) async {
        var seen = Set<String>()
        let channels = requested.filter { seen.insert($0).inserted }
        var progress = LoopState()
        while !Task.isCancelled {
            let active = channels.filter { !progress.dropped.contains($0) }
            if active.isEmpty {
                // Sin canales que escuchar no hay nada que reintentar: se espera a que la vista cancele.
                continuation.yield(.state(.offline))
                while await Self.pause(3_600) {}
                break
            }
            continuation.yield(.state(connectionState(failures: progress.failures)))
            guard let token = await accessToken() else {
                progress.failures += 1
                progress.wasDown = true
                let resumed = await Self.pause(backoff(progress.failures))
                if !resumed { break }
                continue
            }
            let socket = sockets.open(url: websocketURL)
            await drive(socket: socket, token: token, channels: active, progress: &progress, continuation: continuation)
            socket.close()
            if Task.isCancelled { break }
            progress.wasDown = true
            progress.failures += 1
            continuation.yield(.state(connectionState(failures: progress.failures)))
            let resumed = await Self.pause(backoff(progress.failures))
            if !resumed { break }
        }
        continuation.finish()
    }

    /// Atiende un socket hasta que se cae, el servidor cierra un canal, el latido no recibe respuesta o se cancela.
    private func drive(
        socket: any RealtimeSocket,
        token: String,
        channels: [String],
        progress: inout LoopState,
        continuation: AsyncStream<RealtimeSignal>.Continuation
    ) async {
        let session = SocketSession(token: token)
        var liveReported = false
        var heartbeat: Task<Void, Never>?
        loop: for await event in socket.events {
            switch event {
            case .opened:
                for channel in channels {
                    let ref = await session.nextRef()
                    _ = await socket.send(RealtimeProtocol.join(channel: channel, ref: ref, accessToken: token))
                }
                heartbeat?.cancel()
                heartbeat = startHeartbeat(socket: socket, session: session)
            case .closed:
                break loop
            case .text(let text):
                switch RealtimeProtocol.parse(text) {
                case .heartbeatReply(let ref):
                    await session.acknowledge(ref)
                case .joinReply(let channel, let ok):
                    guard channels.contains(channel) else { break }
                    if ok {
                        guard await session.markJoined(channel) else { break }
                        progress.rejections[channel] = nil
                    } else if await session.isJoined(channel) {
                        break loop
                    } else {
                        let count = progress.rejections[channel, default: 0] + 1
                        progress.rejections[channel] = count
                        if count < maxJoinRejections { break loop }
                        progress.dropped.insert(channel)
                        continuation.yield(.channelsDropped(progress.dropped))
                        if channels.allSatisfy({ progress.dropped.contains($0) }) { break loop }
                    }
                    let needed = channels.filter { !progress.dropped.contains($0) }
                    if !liveReported, await session.containsAll(needed) {
                        liveReported = true
                        let recovered = await reportLive(progress: &progress, continuation: continuation)
                        if !recovered { break loop }
                    }
                case .broadcast(_, let domainEvent):
                    continuation.yield(.event(domainEvent))
                case .channelClosed:
                    break loop
                case .ignored:
                    break
                }
            }
        }
        heartbeat?.cancel()
    }

    /// Todos los canales quedaron unidos: pide la cabeza del cursor la primera vez o recupera lo perdido tras una
    /// caída, invalida las vistas y avisa que está en vivo. Devuelve false si la consulta falla (se reconecta).
    private func reportLive(progress: inout LoopState, continuation: AsyncStream<RealtimeSignal>.Continuation) async -> Bool {
        progress.failures = 0
        do {
            if let known = progress.cursor {
                if progress.wasDown {
                    var from = known
                    while true {
                        let page = try await catchUp(from)
                        let before = from
                        from = page.cursor
                        progress.cursor = from
                        for recovered in page.events { continuation.yield(.event(recovered)) }
                        if page.events.count < RealtimeProtocol.catchUpPageSize || from == before { break }
                    }
                }
            } else {
                // La cabeza no trae eventos viejos: la vista de todos modos vuelve a pedir su estado completo.
                progress.cursor = try await catchUp("0").cursor
            }
        } catch {
            return false
        }
        progress.wasDown = false
        continuation.yield(.resync)
        continuation.yield(.state(.live))
        return true
    }

    /// Latido del protocolo: renueva el token si la sesión lo cambió, manda el latido y cierra el socket si el
    /// servidor no responde a tiempo (así la lectura termina y el bucle reconecta).
    private func startHeartbeat(socket: any RealtimeSocket, session: SocketSession) -> Task<Void, Never> {
        let interval = heartbeatInterval
        let timeout = heartbeatTimeout
        let accessToken = self.accessToken
        return Task {
            while !Task.isCancelled {
                guard await SupabaseRealtimeService.pause(interval - timeout) else { return }
                if let fresh = await accessToken(), await session.replaceToken(fresh) {
                    for channel in await session.joinedChannels() {
                        let ref = await session.nextRef()
                        _ = await socket.send(RealtimeProtocol.accessToken(channel: channel, ref: ref, accessToken: fresh))
                    }
                }
                let ref = await session.nextRef()
                await session.expectHeartbeat(ref)
                guard await socket.send(RealtimeProtocol.heartbeat(ref: ref)) else { socket.close(); return }
                guard await SupabaseRealtimeService.pause(timeout) else { return }
                if await session.isPending(ref) { socket.close(); return }
            }
        }
    }
}
