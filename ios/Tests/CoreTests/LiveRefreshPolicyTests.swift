import XCTest
@testable import ClimesaCore

final class LiveRefreshPolicyTests: XCTestCase {
    func testVolverPocoDespuesConLaConexionEnVivoSoloVuelveAPedirDatos() {
        XCTAssertEqual(LiveWakePolicy.action(for: .sceneActive(backgroundSeconds: 5), connection: .live), .refetch)
    }

    func testVolverTrasUnRatoEnSegundoPlanoReconectaDeInmediato() {
        XCTAssertEqual(LiveWakePolicy.action(for: .sceneActive(backgroundSeconds: LiveWakePolicy.staleAfterBackground), connection: .live), .reconnect)
        XCTAssertEqual(LiveWakePolicy.action(for: .sceneActive(backgroundSeconds: 600), connection: .live), .reconnect)
    }

    func testVolverSinConexionReconectaSinEsperarLaEspera() {
        XCTAssertEqual(LiveWakePolicy.action(for: .sceneActive(backgroundSeconds: 2), connection: .reconnecting), .reconnect)
        XCTAssertEqual(LiveWakePolicy.action(for: .sceneActive(backgroundSeconds: nil), connection: .offline), .reconnect)
    }

    func testUnaInterrupcionSinSegundoPlanoNoHaceNada() {
        XCTAssertEqual(LiveWakePolicy.action(for: .sceneActive(backgroundSeconds: nil), connection: .live), .none)
    }

    func testRecuperarLaRedReconectaYPerderlaNoHaceNada() {
        XCTAssertEqual(LiveWakePolicy.action(for: .networkRegained, connection: .live), .reconnect)
        XCTAssertEqual(LiveWakePolicy.action(for: .networkRegained, connection: .offline), .reconnect)
        XCTAssertEqual(LiveWakePolicy.action(for: .networkLost, connection: .live), .none)
    }

    func testLaRutaDeRedSoloAvisaCuandoCambia() {
        var tracker = NetworkPathTracker()
        XCTAssertNil(tracker.update(satisfied: true), "la primera lectura no es un cambio")
        XCTAssertNil(tracker.update(satisfied: true), "la misma lectura repetida no es un cambio")
        XCTAssertEqual(tracker.update(satisfied: false), .networkLost)
        XCTAssertNil(tracker.update(satisfied: false))
        XCTAssertEqual(tracker.update(satisfied: true), .networkRegained)
    }

    func testEmpezarSinRedYLuegoTenerlaCuentaComoRecuperacion() {
        var tracker = NetworkPathTracker()
        XCTAssertNil(tracker.update(satisfied: false))
        XCTAssertEqual(tracker.update(satisfied: true), .networkRegained)
    }
}
