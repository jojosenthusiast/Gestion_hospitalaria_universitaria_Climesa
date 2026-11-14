import XCTest
@testable import ClimesaCore

/// Doble de prueba del socket: guarda lo que se envía y deja empujar eventos a mano.
/// Con `acknowledgeHeartbeats` responde cada latido como lo haría el servidor.
private final class FakeSocket: RealtimeSocket, @unchecked Sendable {
    let events: AsyncStream<SocketEvent>
    private let continuation: AsyncStream<SocketEvent>.Continuation
    private let lock = NSLock()
    private var storedSent: [String] = []
    private var storedClosed = false
    private let acknowledgeHeartbeats: Bool

    init(acknowledgeHeartbeats: Bool) {
        self.acknowledgeHeartbeats = acknowledgeHeartbeats
        var captured: AsyncStream<SocketEvent>.Continuation?
        events = AsyncStream(SocketEvent.self) { captured = $0 }
        continuation = captured!
    }

    private func record(_ text: String) {
        lock.lock(); defer { lock.unlock() }
        storedSent.append(text)
    }

    var sent: [String] { lock.lock(); defer { lock.unlock() }; return storedSent }
    var isClosed: Bool { lock.lock(); defer { lock.unlock() }; return storedClosed }

    func send(_ text: String) async -> Bool {
        record(text)
        if acknowledgeHeartbeats,
           let object = (try? JSONSerialization.jsonObject(with: Data(text.utf8))) as? [String: Any],
           object["event"] as? String == "heartbeat", let ref = object["ref"] as? String {
            push(.text(#"{"topic":"phoenix","event":"phx_reply","payload":{"status":"ok","response":{}},"ref":"\#(ref)"}"#))
        }
        return true
    }

    func close() {
        lock.lock(); storedClosed = true; lock.unlock()
        continuation.finish()
    }

    func push(_ event: SocketEvent) { continuation.yield(event) }
}

private final class FakeSocketFactory: RealtimeSocketFactory, @unchecked Sendable {
    private let lock = NSLock()
    private var storedSockets: [FakeSocket] = []
    private let closeOnOpen: Bool
    private let acknowledgeHeartbeats: Bool

    init(closeOnOpen: Bool = false, acknowledgeHeartbeats: Bool = false) {
        self.closeOnOpen = closeOnOpen
        self.acknowledgeHeartbeats = acknowledgeHeartbeats
    }

    var sockets: [FakeSocket] { lock.lock(); defer { lock.unlock() }; return storedSockets }

    func open(url: String) -> RealtimeSocket {
        let socket = FakeSocket(acknowledgeHeartbeats: acknowledgeHeartbeats)
        socket.push(.opened)
        if closeOnOpen { socket.push(.closed("caída")) }
        lock.lock(); storedSockets.append(socket); lock.unlock()
        return socket
    }
}

private actor SignalRecorder {
    private(set) var signals: [RealtimeSignal] = []
    func add(_ signal: RealtimeSignal) { signals.append(signal) }
}

/// Registra cada consulta a `/eventos` y responde con las páginas dadas, en orden; después repite `fallback`.
private actor CatchUpLog {
    private(set) var cursors: [String] = []
    private var pages: [CatchUp]
    private let fallback: CatchUp
    init(pages: [CatchUp] = [], fallback: CatchUp) { self.pages = pages; self.fallback = fallback }
    func answer(_ cursor: String) -> CatchUp {
        cursors.append(cursor)
        return pages.isEmpty ? fallback : pages.removeFirst()
    }
}

/// Token de la sesión que la prueba puede cambiar (como cuando la sesión lo renueva).
private actor TokenBox {
    private var value: String?
    init(_ value: String?) { self.value = value }
    func current() -> String? { value }
    func set(_ next: String) { value = next }
}

private func joined(_ channel: String) -> String {
    #"{"topic":"realtime:\#(channel)","event":"phx_reply","payload":{"status":"ok"},"ref":"1"}"#
}

private func rejected(_ channel: String) -> String {
    #"{"topic":"realtime:\#(channel)","event":"phx_reply","payload":{"status":"error","response":{"reason":"Unauthorized"}},"ref":"2"}"#
}

private func bedEvent(_ channel: String, _ id: String) -> String {
    #"{"topic":"realtime:\#(channel)","event":"broadcast","payload":{"event":"cama.estado_cambiado","type":"broadcast","payload":{"tipo":"cama.estado_cambiado","entidad":"cama","id":"\#(id)","version":2}}}"#
}

private func lost(_ id: String) -> DomainEvent {
    DomainEvent(type: "cama.estado_cambiado", entity: "cama", id: id, version: 1)
}

final class SupabaseRealtimeServiceTests: XCTestCase {
    private let channels = ["publico", "rol:ENF"]
    private let recovered = CatchUp(cursor: "9", events: [lost("perdida")])

    private func makeService(
        _ factory: FakeSocketFactory,
        log: CatchUpLog,
        token: TokenBox = TokenBox("token-ejemplo"),
        heartbeat: TimeInterval = 1_000,
        heartbeatTimeout: TimeInterval = 10,
        maxJoinRejections: Int = 3
    ) -> SupabaseRealtimeService {
        SupabaseRealtimeService(
            websocketURL: "wss://ejemplo.test/socket",
            accessToken: { await token.current() },
            catchUp: { cursor in await log.answer(cursor) },
            sockets: factory,
            heartbeatInterval: heartbeat,
            heartbeatTimeout: heartbeatTimeout,
            backoff: { _ in 0.01 },
            maxJoinRejections: maxJoinRejections
        )
    }

    private func consume(_ service: SupabaseRealtimeService, into recorder: SignalRecorder) -> Task<Void, Never> {
        let channels = self.channels
        return Task {
            for await signal in service.observe(channels: channels) { await recorder.add(signal) }
        }
    }

    private func eventually(_ message: String, timeout: TimeInterval = 3, file: StaticString = #filePath, line: UInt = #line, _ condition: () async -> Bool) async {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if await condition() { return }
            try? await Task.sleep(nanoseconds: 5_000_000)
        }
        XCTFail(message, file: file, line: line)
    }

    private func joinAll(_ socket: FakeSocket) {
        for channel in channels { socket.push(.text(joined(channel))) }
    }

    func testSeUneATodosLosCanalesYAvisaCuandoQuedaEnVivo() async throws {
        let factory = FakeSocketFactory(), recorder = SignalRecorder(), log = CatchUpLog(fallback: recovered)
        let consumer = consume(makeService(factory, log: log), into: recorder)
        defer { consumer.cancel() }

        await eventually("debe abrir un socket y enviar dos uniones") { factory.sockets.first?.sent.count == 2 }
        let socket = try XCTUnwrap(factory.sockets.first)
        socket.push(.text(joined("publico")))
        try await Task.sleep(nanoseconds: 50_000_000)
        let beforeAll = await recorder.signals
        XCTAssertFalse(beforeAll.contains(.resync), "con un solo canal unido aún no hay resincronización")

        socket.push(.text(joined("rol:ENF")))
        await eventually("debe resincronizar y quedar en vivo") { await recorder.signals.last == RealtimeSignal.state(.live) }
        let signals = await recorder.signals
        XCTAssertTrue(signals.contains(.resync))
        let cursors = await log.cursors
        XCTAssertEqual(cursors, ["0"], "sin caída previa solo se pide la cabeza del cursor")
        XCTAssertFalse(signals.contains(.event(lost("perdida"))), "la cabeza del cursor no reenvía eventos viejos")
    }

    func testReenviaLosEventosDeLosCanales() async throws {
        let factory = FakeSocketFactory(), recorder = SignalRecorder(), log = CatchUpLog(fallback: recovered)
        let consumer = consume(makeService(factory, log: log), into: recorder)
        defer { consumer.cancel() }

        await eventually("debe abrir el socket") { factory.sockets.count == 1 }
        try XCTUnwrap(factory.sockets.first).push(.text(bedEvent("rol:ENF", "cama-1")))
        let esperado = RealtimeSignal.event(DomainEvent(type: "cama.estado_cambiado", entity: "cama", id: "cama-1", version: 2))
        await eventually("debe reenviar el evento") { await recorder.signals.contains(esperado) }
    }

    func testTrasUnaCaidaReconectaYRecuperaDesdeElCursor() async throws {
        let factory = FakeSocketFactory(), recorder = SignalRecorder(), log = CatchUpLog(fallback: recovered)
        let consumer = consume(makeService(factory, log: log), into: recorder)
        defer { consumer.cancel() }

        await eventually("debe abrir el primer socket") { factory.sockets.count == 1 }
        let first = try XCTUnwrap(factory.sockets.first)
        joinAll(first)
        await eventually("debe quedar en vivo") { await recorder.signals.last == RealtimeSignal.state(.live) }

        first.push(.closed("red"))
        await eventually("debe abrir un segundo socket") { factory.sockets.count == 2 }
        let afterDrop = await recorder.signals
        XCTAssertTrue(afterDrop.contains(RealtimeSignal.state(.reconnecting)))

        joinAll(factory.sockets[1])
        await eventually("debe emitir el evento recuperado") { await recorder.signals.contains(.event(lost("perdida"))) }
        await eventually("debe volver a quedar en vivo") { await recorder.signals.last == RealtimeSignal.state(.live) }
        let cursors = await log.cursors
        XCTAssertEqual(cursors, ["0", "9"], "cabeza al unirse y una recuperación desde ese cursor tras la caída")
        XCTAssertTrue(first.isClosed, "el primer socket se cerró")
    }

    func testLaRecuperacionPideOtraPaginaSiLaPrimeraVieneLlena() async throws {
        let full = CatchUp(cursor: "205", events: (0..<RealtimeProtocol.catchUpPageSize).map { lost("p\($0)") })
        let last = CatchUp(cursor: "206", events: [lost("ultima")])
        let log = CatchUpLog(pages: [CatchUp(cursor: "5", events: []), full, last], fallback: CatchUp(cursor: "206", events: []))
        let factory = FakeSocketFactory(), recorder = SignalRecorder()
        let consumer = consume(makeService(factory, log: log), into: recorder)
        defer { consumer.cancel() }

        await eventually("debe abrir el primer socket") { factory.sockets.count == 1 }
        joinAll(factory.sockets[0])
        await eventually("debe quedar en vivo") { await recorder.signals.last == RealtimeSignal.state(.live) }
        factory.sockets[0].push(.closed("red"))
        await eventually("debe abrir un segundo socket") { factory.sockets.count == 2 }
        joinAll(factory.sockets[1])
        await eventually("debe emitir el evento de la segunda página") { await recorder.signals.contains(.event(lost("ultima"))) }
        let cursors = await log.cursors
        XCTAssertEqual(cursors, ["0", "5", "205"])
    }

    func testConVariasCaidasSeguidasPasaASinConexion() async throws {
        let factory = FakeSocketFactory(closeOnOpen: true), recorder = SignalRecorder(), log = CatchUpLog(fallback: recovered)
        let consumer = consume(makeService(factory, log: log), into: recorder)
        defer { consumer.cancel() }

        await eventually("debe llegar a sin conexión") { await recorder.signals.contains(RealtimeSignal.state(.offline)) }
        let cursors = await log.cursors
        XCTAssertTrue(cursors.isEmpty, "nunca se unió un canal, así que no hay consulta a /eventos")
    }

    func testSinTokenNoAbreSocketYReintenta() async throws {
        let factory = FakeSocketFactory(), recorder = SignalRecorder(), log = CatchUpLog(fallback: recovered)
        let consumer = consume(makeService(factory, log: log, token: TokenBox(nil)), into: recorder)
        defer { consumer.cancel() }

        await eventually("debe llegar a sin conexión") { await recorder.signals.contains(RealtimeSignal.state(.offline)) }
        XCTAssertTrue(factory.sockets.isEmpty)
    }

    func testEnviaElLatidoDelProtocoloAlAbrir() async throws {
        let factory = FakeSocketFactory(acknowledgeHeartbeats: true), recorder = SignalRecorder(), log = CatchUpLog(fallback: recovered)
        let consumer = consume(makeService(factory, log: log, heartbeat: 0.02, heartbeatTimeout: 0.01), into: recorder)
        defer { consumer.cancel() }

        await eventually("debe enviar al menos un latido") { factory.sockets.first?.sent.contains { $0.contains("\"heartbeat\"") } == true }
    }

    func testUnLatidoRespondidoMantieneElSocket() async throws {
        let factory = FakeSocketFactory(acknowledgeHeartbeats: true), recorder = SignalRecorder(), log = CatchUpLog(fallback: recovered)
        let consumer = consume(makeService(factory, log: log, heartbeat: 0.03, heartbeatTimeout: 0.02), into: recorder)
        defer { consumer.cancel() }

        await eventually("debe enviar varios latidos") { (factory.sockets.first?.sent.filter { $0.contains("\"heartbeat\"") }.count ?? 0) >= 3 }
        XCTAssertEqual(factory.sockets.count, 1, "con respuesta al latido no se reconecta")
        XCTAssertFalse(try XCTUnwrap(factory.sockets.first).isClosed)
    }

    func testSinRespuestaAlLatidoDaElSocketPorCaidoYReconecta() async throws {
        let factory = FakeSocketFactory(), recorder = SignalRecorder(), log = CatchUpLog(fallback: recovered)
        let consumer = consume(makeService(factory, log: log, heartbeat: 0.03, heartbeatTimeout: 0.02), into: recorder)
        defer { consumer.cancel() }

        await eventually("debe abrir un socket nuevo") { factory.sockets.count >= 2 }
        XCTAssertTrue(factory.sockets[0].isClosed, "el socket sin respuesta al latido se cerró")
        let signals = await recorder.signals
        XCTAssertTrue(signals.contains(RealtimeSignal.state(.reconnecting)))
    }

    func testSiLaSesionRenuevaElTokenLoMandaALosCanalesUnidos() async throws {
        let token = TokenBox("token-1")
        let factory = FakeSocketFactory(acknowledgeHeartbeats: true), recorder = SignalRecorder(), log = CatchUpLog(fallback: recovered)
        let consumer = consume(makeService(factory, log: log, token: token, heartbeat: 0.03, heartbeatTimeout: 0.01), into: recorder)
        defer { consumer.cancel() }

        await eventually("debe abrir el socket") { factory.sockets.count == 1 }
        let socket = factory.sockets[0]
        joinAll(socket)
        await eventually("debe quedar en vivo") { await recorder.signals.last == RealtimeSignal.state(.live) }
        await token.set("token-2")
        await eventually("debe mandar el token nuevo a los dos canales") {
            socket.sent.filter { $0.contains("\"access_token\"") && $0.contains("token-2") && !$0.contains("phx_join") }.count == 2
        }
        XCTAssertEqual(factory.sockets.count, 1, "renovar el token no reabre el socket")
    }

    func testUnRechazoDeUnionReconectaAntesDelLimite() async throws {
        let factory = FakeSocketFactory(), recorder = SignalRecorder(), log = CatchUpLog(fallback: recovered)
        let consumer = consume(makeService(factory, log: log, maxJoinRejections: 3), into: recorder)
        defer { consumer.cancel() }

        await eventually("debe abrir el socket") { factory.sockets.count == 1 }
        factory.sockets[0].push(.text(rejected("rol:ENF")))
        await eventually("debe reintentar con otro socket") { factory.sockets.count == 2 }
        let signals = await recorder.signals
        XCTAssertFalse(signals.contains { if case .channelsDropped = $0 { return true } else { return false } })
    }

    func testUnCanalRechazadoAlLimiteSeDejaFueraYElRestoSigueEnVivo() async throws {
        let factory = FakeSocketFactory(), recorder = SignalRecorder(), log = CatchUpLog(fallback: recovered)
        let consumer = consume(makeService(factory, log: log, maxJoinRejections: 1), into: recorder)
        defer { consumer.cancel() }

        await eventually("debe abrir el socket") { factory.sockets.count == 1 }
        let socket = factory.sockets[0]
        socket.push(.text(joined("publico")))
        socket.push(.text(rejected("rol:ENF")))
        await eventually("debe avisar el canal dejado fuera") { await recorder.signals.contains(.channelsDropped(["rol:ENF"])) }
        await eventually("debe quedar en vivo con el canal restante") { await recorder.signals.last == RealtimeSignal.state(.live) }
        XCTAssertEqual(factory.sockets.count, 1)
    }

    func testCancelarElConsumoCierraElSocket() async throws {
        let factory = FakeSocketFactory(), recorder = SignalRecorder(), log = CatchUpLog(fallback: recovered)
        let consumer = consume(makeService(factory, log: log), into: recorder)

        await eventually("debe abrir el socket") { factory.sockets.count == 1 }
        consumer.cancel()
        await eventually("debe cerrar el socket al cancelar") { factory.sockets.first?.isClosed == true }
    }

    func testLaEsperaEntreReconexionesCreceYTieneTope() {
        XCTAssertEqual(SupabaseRealtimeService.defaultBackoff(1), 1)
        XCTAssertEqual(SupabaseRealtimeService.defaultBackoff(2), 2)
        XCTAssertEqual(SupabaseRealtimeService.defaultBackoff(5), 16)
        XCTAssertEqual(SupabaseRealtimeService.defaultBackoff(6), 30)
        XCTAssertEqual(SupabaseRealtimeService.defaultBackoff(50), 30)
    }
}
