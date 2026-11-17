import XCTest
@testable import ClimesaCore

/// D-3 on iOS: "No se presentó" waits 8 s with «Deshacer», with the hard lessons of Android's `UndoWindow`.
@MainActor
final class DeferredQueueTests: XCTestCase {
    private var clock = Date(timeIntervalSince1970: 1_800_000_000)
    private var stored: [DeferredRequest] = []
    private var sent: [(key: String, body: String)] = []
    private var reports: [String] = []
    private var failures: [APIFailure] = []
    private var keys = 0
    private var rebaseBody: Data? = Data(#"{"version":4}"#.utf8)

    private func makeQueue(stored initial: [DeferredRequest] = []) -> DeferredQueue {
        let queue = DeferredQueue(stored: initial, autoTimers: false, now: { [unowned self] in self.clock },
                                  makeKey: { [unowned self] in self.keys += 1; return "k\(self.keys)" },
                                  save: { [unowned self] in self.stored = $0 },
                                  send: { [unowned self] item in
                                      self.sent.append((item.id, String(decoding: item.body, as: UTF8.self)))
                                      if !self.failures.isEmpty { throw self.failures.removeFirst() }
                                  },
                                  rebase: { [unowned self] _ in self.rebaseBody })
        queue.onReport = { [unowned self] in self.reports.append($0) }
        return queue
    }

    private func body(_ version: Int) -> Data { Data(#"{"version":\#(version)}"#.utf8) }
    private func conflict() -> APIFailure { .http(status: 409, problem: Problem(status: 409, code: "version_conflicto", detail: nil)) }

    func testSeGuardaAlTocarYDeshacerAntesDe8sNoEnviaNada() async {
        let queue = makeQueue()
        await queue.start(subject: "t7", label: "CON 7", path: "/fila/t7/no-se-presento", body: body(3))
        XCTAssertEqual(stored.count, 1, "persisted at the tap")
        XCTAssertTrue(queue.isPending("t7"))
        clock += 5
        XCTAssertTrue(queue.undo("t7"))
        clock += 10
        await queue.tick()
        XCTAssertTrue(sent.isEmpty)
        XCTAssertTrue(stored.isEmpty)
    }

    func testAlVencerSeEnviaUnaVez() async {
        let queue = makeQueue()
        await queue.start(subject: "t7", label: "CON 7", path: "/p", body: body(3))
        clock += 7
        await queue.tick()
        XCTAssertTrue(sent.isEmpty, "still inside the window")
        clock += 1
        await queue.tick()
        XCTAssertEqual(sent.map(\.key), ["k1"])
        XCTAssertTrue(stored.isEmpty)
        XCTAssertFalse(queue.undo("t7"))
    }

    func testReintentoEsRepeticionExactaMismaClaveYCuerpo() async {
        failures = [.transport]
        let queue = makeQueue()
        await queue.start(subject: "t7", label: "CON 7", path: "/p", body: body(3))
        clock += 8
        await queue.tick()
        XCTAssertEqual(queue.failed.count, 1)
        XCTAssertEqual(stored.first?.error, APIFailure.transport.message)
        await queue.resume()
        XCTAssertEqual(sent.map(\.key), ["k1", "k1"])
        XCTAssertEqual(sent.map(\.body), [#"{"version":3}"#, #"{"version":3}"#])
        XCTAssertTrue(stored.isEmpty)
    }

    func testUn4xxDefinitivoSeDescartaYSeAvisaUnaVez() async {
        failures = [.http(status: 422, problem: Problem(status: 422, code: "transicion_invalida", detail: "El número ya no está llamado."))]
        let queue = makeQueue()
        await queue.start(subject: "t7", label: "CON 7", path: "/p", body: body(3))
        clock += 8
        await queue.tick()
        await queue.resume()
        XCTAssertEqual(sent.count, 1)
        XCTAssertTrue(stored.isEmpty)
        XCTAssertEqual(reports, ["CON 7: El número ya no está llamado."])
    }

    func testRetryables401_408_429SeConservan() {
        for status in [401, 408, 429, 500, 503] {
            XCTAssertEqual(DeferredRules.classify(.http(status: status, problem: nil), rebased: false), .keep, "\(status)")
        }
        XCTAssertEqual(DeferredRules.classify(.sessionExpired, rebased: false), .keep)
        XCTAssertEqual(DeferredRules.classify(.http(status: 403, problem: nil), rebased: false), .drop)
    }

    func testConflictoDeVersionReleeYEnviaCuerpoNuevoConClaveNueva() async {
        failures = [conflict()]
        let queue = makeQueue()
        await queue.start(subject: "t7", label: "CON 7", path: "/p", body: body(3))
        clock += 8
        await queue.tick()
        XCTAssertEqual(sent.map(\.key), ["k1", "k2"])
        XCTAssertEqual(sent.map(\.body), [#"{"version":3}"#, #"{"version":4}"#])
        XCTAssertTrue(stored.isEmpty)
    }

    func testConflictoCuandoYaNoAplicaSeDescartaConAviso() async {
        failures = [conflict()]
        rebaseBody = nil
        let queue = makeQueue()
        await queue.start(subject: "t7", label: "CON 7", path: "/p", body: body(3))
        clock += 8
        await queue.tick()
        XCTAssertEqual(sent.count, 1)
        XCTAssertTrue(stored.isEmpty)
        XCTAssertEqual(reports, ["CON 7: ya cambió y no se envió."])
    }

    func testOtraAccionSoloLiquidaElMismoNumero() async {
        let queue = makeQueue()
        await queue.start(subject: "a", label: "CON 7", path: "/a", body: body(1))
        await queue.start(subject: "b", label: "CON 8", path: "/b", body: body(1))
        XCTAssertTrue(sent.isEmpty, "another number keeps its own undo")
        XCTAssertTrue(queue.isPending("a"))
        await queue.start(subject: "a", label: "CON 7", path: "/a", body: body(2))
        XCTAssertEqual(sent.map(\.key), ["k1"], "the waiting action of the same number goes first")
        XCTAssertTrue(queue.isPending("b"))
        await queue.settle("b")
        XCTAssertEqual(sent.map(\.key), ["k1", "k2"])
        XCTAssertTrue(queue.isPending("a"))
    }

    func testCaducaPorLaHoraDelToque() async {
        let old = DeferredRequest(id: "viejo", subject: "t1", label: "CON 1", path: "/p", body: body(1), tappedAt: clock.addingTimeInterval(-DeferredRules.maxAge - 1),
                                  dueAt: clock.addingTimeInterval(-DeferredRules.maxAge + 7), error: "Sin conexión")
        let recent = DeferredRequest(id: "nuevo", subject: "t2", label: "CON 2", path: "/p", body: body(1), tappedAt: clock.addingTimeInterval(-60), dueAt: clock.addingTimeInterval(-52))
        let queue = makeQueue(stored: [old, recent])
        await queue.resume()
        XCTAssertEqual(reports, ["CON 1: no se envió a tiempo y se descartó."])
        XCTAssertEqual(sent.map(\.key), ["nuevo"], "a stored request is sent with the key stored at the tap")
        XCTAssertTrue(stored.isEmpty)
    }

    func testAlVolverUnaAccionDentroDeSuVentanaEsperaElResto() async {
        let waiting = DeferredRequest(id: "w", subject: "t1", label: "CON 1", path: "/p", body: body(1), tappedAt: clock.addingTimeInterval(-3), dueAt: clock.addingTimeInterval(5))
        let queue = makeQueue(stored: [waiting])
        await queue.resume()
        XCTAssertTrue(sent.isEmpty)
        XCTAssertTrue(queue.isPending("t1"))
        clock += 5
        await queue.tick()
        XCTAssertEqual(sent.map(\.key), ["w"])
    }
}
