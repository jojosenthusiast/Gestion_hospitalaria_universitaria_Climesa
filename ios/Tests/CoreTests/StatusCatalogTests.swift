import XCTest
@testable import ClimesaCore

final class StatusCatalogTests: XCTestCase {
    func testKnownCodeHasSpanishLabelAndTone() {
        XCTAssertEqual(StatusCatalog.style(for: "alta_firmada"), StatusStyle(label: "Alta firmada", tone: .neutral))
        XCTAssertEqual(StatusCatalog.style(for: "libre"), StatusStyle(label: "Libre", tone: .success))
        XCTAssertEqual(StatusCatalog.style(for: "limpieza").tone, .warning)
        XCTAssertEqual(StatusCatalog.style(for: "cancelado").tone, .danger)
        XCTAssertEqual(StatusCatalog.style(for: "pendiente").label, "Pendiente de iniciar")
    }

    func testUnknownCodeFallsBackToSpacedCodeAndNeutral() {
        XCTAssertEqual(StatusCatalog.style(for: "en_revision"), StatusStyle(label: "en revision", tone: .neutral))
    }

    func testExplicitLabelOverridesDefault() {
        XCTAssertEqual(StatusCatalog.style(for: "pendiente", label: "Por tomar muestra"), StatusStyle(label: "Por tomar muestra", tone: .reserved))
    }
}
