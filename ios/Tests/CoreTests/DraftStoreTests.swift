import XCTest
@testable import ClimesaCore

/// Borradores locales por cuenta y clave (consulta en curso que sobrevive a salir de la pantalla).
final class DraftStoreTests: XCTestCase {
    private struct Draft: Codable, Equatable { var reason: String; var plan: String }
    private var base: URL!
    private var store: DraftStore!

    override func setUp() {
        super.setUp()
        base = FileManager.default.temporaryDirectory.appendingPathComponent("borradores-\(UUID().uuidString)", isDirectory: true)
        store = DraftStore(baseURL: base)
    }

    override func tearDown() {
        try? FileManager.default.removeItem(at: base)
        super.tearDown()
    }

    func testGuardaYRecuperaElBorrador() {
        XCTAssertTrue(store.save(Draft(reason: "Dolor", plan: "Reposo"), user: "u-1", key: "consulta-c1"))
        XCTAssertEqual(store.load(Draft.self, user: "u-1", key: "consulta-c1"), Draft(reason: "Dolor", plan: "Reposo"))
        XCTAssertNil(store.load(Draft.self, user: "u-1", key: "consulta-c2"))
    }

    func testOtraCuentaNoVeElBorrador() {
        store.save(Draft(reason: "Dolor", plan: ""), user: "u-1", key: "consulta-c1")
        XCTAssertNil(store.load(Draft.self, user: "u-2", key: "consulta-c1"))
        XCTAssertNil(store.load(Draft.self, user: "../u-1", key: "consulta-c1"))
    }

    func testBorrarUnoYTodos() {
        store.save(Draft(reason: "a", plan: ""), user: "u-1", key: "consulta-c1")
        store.save(Draft(reason: "b", plan: ""), user: "u-1", key: "consulta-c2")
        store.save(Draft(reason: "c", plan: ""), user: "u-2", key: "consulta-c3")
        store.clear(user: "u-1", key: "consulta-c1")
        XCTAssertNil(store.load(Draft.self, user: "u-1", key: "consulta-c1"))
        XCTAssertNotNil(store.load(Draft.self, user: "u-1", key: "consulta-c2"))
        store.clearAll()
        XCTAssertNil(store.load(Draft.self, user: "u-1", key: "consulta-c2"))
        XCTAssertNil(store.load(Draft.self, user: "u-2", key: "consulta-c3"))
        XCTAssertTrue(store.save(Draft(reason: "d", plan: ""), user: "u-1", key: "consulta-c4"), "después de borrar todo se puede volver a guardar")
    }
}
