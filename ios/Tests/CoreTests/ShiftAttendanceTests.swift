import XCTest
@testable import ClimesaCore

/// I26 "Mis turnos": la entrada solo se ofrece si la API la permite y nunca se muestra un código crudo (ASIS-01).
final class ShiftAttendanceTests: XCTestCase {
    func testCheckInOnlyWhenTheServerAllowsIt() {
        XCTAssertTrue(ShiftAttendanceRules.canCheckIn(["marcar_entrada"]))
        XCTAssertFalse(ShiftAttendanceRules.canCheckIn(["editar", "cancelar"]))
        XCTAssertFalse(ShiftAttendanceRules.canCheckIn(nil))
    }

    func testStateAndAttendanceLabelsAreSpanish() {
        XCTAssertEqual(ShiftAttendanceRules.stateLabel("en_curso"), "En curso")
        XCTAssertEqual(ShiftAttendanceRules.stateLabel("ausente"), "Ausente")
        XCTAssertEqual(ShiftAttendanceRules.attendanceLabel("presente", late: true), "Entrada marcada · tarde")
        XCTAssertEqual(ShiftAttendanceRules.attendanceLabel("sin_confirmar", late: false), "Sin entrada marcada")
        XCTAssertNil(ShiftAttendanceRules.attendanceLabel(nil, late: false))
    }

    func testRefusedCheckInIsExplainedByCode() {
        XCTAssertEqual(ShiftAttendanceRules.checkInError(code: "asistencia_ya_marcada", status: 409, fallback: "x"), "Ya marcaste la entrada de este turno.")
        XCTAssertEqual(ShiftAttendanceRules.checkInError(code: "turno_ajeno", status: 403, fallback: "x"), "Solo puedes marcar la entrada de tus propios turnos.")
        XCTAssertEqual(ShiftAttendanceRules.checkInError(code: nil, status: nil, fallback: nil), "No se pudo marcar la entrada. Intenta de nuevo.")
    }
}
