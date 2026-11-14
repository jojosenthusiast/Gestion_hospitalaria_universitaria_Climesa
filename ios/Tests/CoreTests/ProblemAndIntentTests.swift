import XCTest
@testable import ClimesaCore

final class ProblemTests: XCTestCase {
    func testLeeElProblemaDelContratoYMuestraElCodigoDeSoporte() {
        let body = Data(#"{"type":"urn:sghu:error:franja_ocupada","title":"Conflicto","status":409,"codigo":"franja_ocupada","detail":"Otra cita tomó esa franja.","requestId":"req-123"}"#.utf8)
        let failure = APIFailure.from(status: 409, body: body)
        XCTAssertEqual(failure.code, "franja_ocupada")
        XCTAssertEqual(failure.message, "Otra cita tomó esa franja. (código de soporte: req-123)")
        XCTAssertFalse(failure.isVersionConflict)
    }

    func testConflictoDeVersionTraeLaVersionActual() {
        let body = Data(#"{"type":"x","title":"Conflicto","status":409,"codigo":"version_conflicto","detail":"La versión no coincide.","requestId":"r1","versionActual":5}"#.utf8)
        let failure = APIFailure.from(status: 409, body: body)
        XCTAssertTrue(failure.isVersionConflict)
        XCTAssertEqual(failure.problem?.currentVersion, 5)
        XCTAssertTrue(failure.message.hasPrefix("Otra persona cambió este registro."))
    }

    func testUn401EsSesionVencida() {
        XCTAssertEqual(APIFailure.from(status: 401, body: Data()), .sessionExpired)
        XCTAssertEqual(APIFailure.sessionExpired.message, "Tu sesión expiró. Vuelve a ingresar.")
    }

    func testSinCuerpoUsaUnMensajeEnEspanolPorEstado() {
        XCTAssertEqual(APIFailure.from(status: 403, body: Data("no json".utf8)).message, "No tienes permiso para esta acción.")
        XCTAssertEqual(APIFailure.from(status: 503, body: Data()).message, "El servidor no está disponible. Vuelve a intentar en unos minutos.")
        XCTAssertTrue(APIFailure.from(status: 403, body: Data()).isForbidden)
    }

    func testReintentableSoloParaRedYErroresTemporales() {
        XCTAssertTrue(APIFailure.transport.isRetryable)
        XCTAssertTrue(APIFailure.http(status: 502, problem: nil).isRetryable)
        XCTAssertTrue(APIFailure.http(status: 429, problem: nil).isRetryable)
        XCTAssertFalse(APIFailure.http(status: 422, problem: nil).isRetryable)
    }
}

final class SubmissionIntentTests: XCTestCase {
    private func counter() -> @Sendable () -> String {
        let box = Counter()
        return { box.next() }
    }

    func testLaMismaIntencionReutilizaLaClaveEnCadaReintento() {
        var intent = SubmissionIntent(makeKey: counter())
        let first = intent.key(for: "a")
        intent.settle(success: false, failure: .transport, fingerprint: "a")
        XCTAssertEqual(intent.key(for: "a"), first)
        intent.settle(success: false, failure: .http(status: 503, problem: nil), fingerprint: "a")
        XCTAssertEqual(intent.key(for: "a"), first)
    }

    func testUnExitoCierraLaIntencionYLaSiguienteUsaOtraClave() {
        var intent = SubmissionIntent(makeKey: counter())
        let first = intent.key(for: "a")
        intent.settle(success: true, fingerprint: "a")
        XCTAssertNil(intent.pendingKey)
        XCTAssertNotEqual(intent.key(for: "a"), first)
    }

    func testCambiarLosDatosDespuesDeUn4xxEsOtraIntencion() {
        var intent = SubmissionIntent(makeKey: counter())
        let first = intent.key(for: "a")
        intent.settle(success: false, failure: .http(status: 422, problem: nil), fingerprint: "a")
        XCTAssertEqual(intent.key(for: "a"), first, "mismos datos tras un 4xx: la API revirtió, se reintenta con la misma clave")
        intent.settle(success: false, failure: .http(status: 422, problem: nil), fingerprint: "a")
        XCTAssertNotEqual(intent.key(for: "b"), first)
    }

    func testConflictoDeIdempotenciaGeneraClaveNueva() {
        var intent = SubmissionIntent(makeKey: counter())
        let first = intent.key(for: "a")
        let conflict = Problem(status: 409, code: "idempotencia_conflicto", detail: "x")
        intent.settle(success: false, failure: .http(status: 409, problem: conflict), fingerprint: "a")
        XCTAssertNotEqual(intent.key(for: "a"), first)
    }

    func testDosIntencionesIgualesLlevanClavesDistintas() {
        var book = IntentBook(makeKey: counter())
        let one = book.key("ticket-1")
        let two = book.key("ticket-2")
        XCTAssertNotEqual(one, two)
        XCTAssertEqual(book.key("ticket-1"), one)
        book.settle("ticket-1", success: true)
        XCTAssertNil(book.pendingKey("ticket-1"))
        XCTAssertNotEqual(book.key("ticket-1"), one)
    }

    func testLaClavePorDefectoCumpleElFormatoDeLaAPI() {
        var intent = SubmissionIntent()
        let key = intent.key()
        XCTAssertNotNil(key.range(of: #"^[a-zA-Z0-9_-]{8,128}$"#, options: .regularExpression))
    }
}

private final class Counter: @unchecked Sendable {
    private var value = 0
    private let lock = NSLock()
    func next() -> String {
        lock.lock(); defer { lock.unlock() }
        value += 1
        return "clave-\(value)"
    }
}
