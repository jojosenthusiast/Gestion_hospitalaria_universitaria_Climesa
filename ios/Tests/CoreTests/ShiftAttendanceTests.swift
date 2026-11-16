import XCTest
@testable import ClimesaCore

/// I26 "Mis turnos": la entrada se confirma sola (ASIS-01), nunca se muestra un código crudo y los turnos se agrupan por
/// el día asignado con Hoy / Mañana / día y fecha.
final class ShiftAttendanceTests: XCTestCase {
    func testStateAndAttendanceLabelsAreSpanish() {
        XCTAssertEqual(ShiftAttendanceRules.stateLabel("en_curso"), "En curso")
        XCTAssertEqual(ShiftAttendanceRules.stateLabel("ausente"), "Ausente")
        XCTAssertEqual(ShiftAttendanceRules.attendanceLabel("presente", late: false), "Entrada confirmada")
        XCTAssertEqual(ShiftAttendanceRules.attendanceLabel("presente", late: true), "Entrada corregida · llegó tarde")
        XCTAssertEqual(ShiftAttendanceRules.attendanceLabel("pendiente", late: false), "Se confirma sola al iniciar")
        XCTAssertNil(ShiftAttendanceRules.attendanceLabel(nil, late: false))
    }

    func testHoursMarkTheNextDayAndTheTwentyFourHourGuard() {
        let start = ShiftAttendanceRules.date("2026-11-10T13:00:00.000Z"), end = ShiftAttendanceRules.date("2026-11-11T13:00:00Z")
        XCTAssertEqual(ShiftAttendanceRules.hours(start: start, end: end, type: "guardia"), "07:00 a 07:00 del día siguiente · Guardia 24 h")
        XCTAssertEqual(ShiftAttendanceRules.hours(start: start, end: ShiftAttendanceRules.date("2026-11-10T21:00:00Z"), type: "diurno"), "07:00 a 15:00")
        XCTAssertEqual(ShiftAttendanceRules.hours(start: nil, end: end, type: nil), "Sin hora")
    }

    func testShiftsAreGroupedByAssignedDayInStartOrder() {
        let today = ShiftAttendanceRules.date("2026-11-10T15:00:00Z")!
        let starts: [(String, String?)] = [("tarde", "2026-11-12T21:00:00Z"), ("guardia", "2026-11-10T13:00:00Z"), ("x", nil), ("manana", "2026-11-11T14:00:00Z"), ("temprano", "2026-11-12T13:00:00Z")]
        let days = ShiftAttendanceRules.byDay(starts, start: { ShiftAttendanceRules.date($0.1) }, today: today)
        XCTAssertEqual(days.map { $0.title }, ["Hoy · martes, 10 de noviembre", "Mañana · miércoles, 11 de noviembre", "Jueves, 12 de noviembre", "Sin fecha"])
        XCTAssertEqual(days.map { $0.items.map { $0.0 } }, [["guardia"], ["manana"], ["temprano", "tarde"], ["x"]])
    }
}
