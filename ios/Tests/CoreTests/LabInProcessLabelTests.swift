import XCTest
@testable import ClimesaCore

/// S12: the lab state `en_proceso` reads "En Proceso" (course wording) everywhere it is labelled.
final class LabInProcessLabelTests: XCTestCase {
    func testInProcessLabel() {
        XCTAssertEqual(LabOrderState.enProceso.label, "En Proceso")
        XCTAssertEqual(LabWorkGroup.enProceso.label, "En Proceso")
        XCTAssertEqual(StatusCatalog.style(for: "en_proceso").label, "En Proceso")
    }
}
