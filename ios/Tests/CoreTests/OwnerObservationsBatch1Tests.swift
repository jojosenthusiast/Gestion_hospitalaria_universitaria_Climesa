import XCTest
@testable import ClimesaCore

/// Owner observations of 2026-11-18 on iOS: CRUD convention, read-only cue, live clock, ambulance header and the
/// doctor's patient search row.
final class OwnerObservationsBatch1Tests: XCTestCase {
    private func decode<T: Decodable>(_ type: T.Type, _ json: String) throws -> T {
        try JSONDecoder().decode(T.self, from: Data(json.utf8))
    }

    /// Wednesday 18 November 2026, 14:05:09 in El Salvador (UTC-6).
    private let now = ClimesaDates.parse("2026-11-18T20:05:09Z")!

    // MARK: - CRUD convention (S0)

    func testEachCrudActionKeepsOneSymbolAndOnlyCreateIsFilled() {
        XCTAssertEqual(CrudKind.allCases.map(\.symbol), ["plus", "pencil", "trash", "eye"])
        XCTAssertEqual(CrudKind.allCases.filter(\.filled), [.create])
    }

    // MARK: - Read-only cue

    func testReadOnlyCueSaysWhatCanBeReadAndWhomToAsk() {
        XCTAssertEqual(ReadOnlyCue.label, "Solo lectura")
        XCTAssertEqual(ReadOnlyCue.help(who: "Recepción", what: "tus datos"),
                       "Puedes consultar tus datos. Para hacer cambios, contacta a Recepción.")
    }

    // MARK: - Live clock (obs. 2)

    func testClockShowsSecondsInTwentyFourHoursOfElSalvador() {
        XCTAssertEqual(ClimesaDates.clockSeconds(now), "14:05:09")
        XCTAssertEqual(ClimesaDates.clockSeconds(ClimesaDates.parse("2026-11-19T05:00:00Z")!), "23:00:00")
        XCTAssertEqual(ClimesaDates.clockSeconds(ClimesaDates.parse("2026-11-19T06:00:07Z")!), "00:00:07")
    }

    func testClockDayIsLongWithRoomAndCompactOnAPhone() {
        XCTAssertEqual(ClimesaDates.longDay(now), "Miércoles 18 de noviembre")
        XCTAssertEqual(ClimesaDates.compactDay(now), "Mié 18 nov")
        // 23:30 local on the 18th is still the 18th, although it is the 19th in UTC.
        XCTAssertEqual(ClimesaDates.longDay(ClimesaDates.parse("2026-11-19T05:30:00Z")!), "Miércoles 18 de noviembre")
    }

    // MARK: - Ambulance header (obs. 19)

    func testBlockedUnitReadsCannotDispatchInsteadOfAvailable() throws {
        let blocked = try decode(AmbulanceStatus.self, #"{"unit":{"id":"u1","plate":"P-000","state":"disponible"},"activeService":null,"paramedicOnDuty":true,"driverOnDuty":false,"dispatchBlock":{"code":"sin_motorista_de_turno","message":"No hay motorista con turno en curso.","action":"Publica un turno de motorista."}}"#)
        let tag = AmbulanceLogRules.unitTag(blocked)
        XCTAssertEqual(tag.value, "bloqueada")
        XCTAssertEqual(tag.label, "No se puede despachar")
        XCTAssertEqual(StatusFamily.of(tag.value), .cerrado)
        XCTAssertEqual(AmbulanceLogRules.serviceLine(blocked), "Sin servicio activo")
    }

    func testFreeUnitKeepsItsStateAndAnActiveServiceHasNoServiceLine() throws {
        let free = try decode(AmbulanceStatus.self, #"{"unit":{"id":"u1","plate":"P-000","state":"disponible"},"activeService":null}"#)
        XCTAssertEqual(AmbulanceLogRules.unitTag(free).value, "disponible")
        XCTAssertNil(AmbulanceLogRules.unitTag(free).label)
        let busy = try decode(AmbulanceStatus.self, #"{"unit":{"id":"u1","plate":"P-000","state":"en_servicio"},"activeService":{"id":"s1","priority":"roja","origin":"Colonia Escalón","destination":"Hospital","dispatchedAt":"2026-11-18T19:00:00Z","hasPrehospital":false}}"#)
        XCTAssertEqual(AmbulanceLogRules.unitTag(busy).value, "en_servicio")
        XCTAssertNil(AmbulanceLogRules.serviceLine(busy))
    }

    // MARK: - Patient search row (obs. 15)

    private func candidate(birth: String?, sex: String?) throws -> PatientCandidate {
        let birthField = birth.map { #""\#($0)""# } ?? "null"
        let sexField = sex.map { #","sex":"\#($0)""# } ?? ""
        return try decode(PatientCandidate.self, #"{"id":"p1","record":"9900001","fullName":"[DEMO] Paciente","active":true,"birth":\#(birthField),"matchReason":"nombre"\#(sexField)}"#)
    }

    func testAgeCountsWholeYearsOnTheLocalDay() {
        XCTAssertEqual(ClimesaDates.age(birthDay: "1992-11-18", now: now), 34)
        XCTAssertEqual(ClimesaDates.age(birthDay: "1992-11-19", now: now), 33)
        XCTAssertEqual(ClimesaDates.age(birthDay: "2026-11-18", now: now), 0)
        XCTAssertNil(ClimesaDates.age(birthDay: "2027-01-01", now: now))
        XCTAssertNil(ClimesaDates.age(birthDay: nil, now: now))
        XCTAssertNil(ClimesaDates.age(birthDay: "sin fecha", now: now))
    }

    func testSearchRowShowsRecordAgeAndSexWithoutTheDui() throws {
        XCTAssertEqual(RecordAccess.rowMeta(try candidate(birth: "1992-11-18", sex: "femenino"), now: now), "9900001 · 34 años · F")
        XCTAssertEqual(RecordAccess.rowMeta(try candidate(birth: "2025-11-01", sex: "masculino"), now: now), "9900001 · 1 año · M")
        XCTAssertEqual(RecordAccess.rowMeta(try candidate(birth: nil, sex: "no_registrado"), now: now), "9900001")
        // An older payload without `sex` still decodes and keeps the record alone.
        XCTAssertEqual(RecordAccess.rowMeta(try candidate(birth: nil, sex: nil), now: now), "9900001")
    }
}
