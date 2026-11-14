import XCTest
@testable import ClimesaCore

final class HospitalRulesTests: XCTestCase {
    private func decode<T: Decodable>(_ type: T.Type, _ json: String) throws -> T {
        try JSONDecoder().decode(T.self, from: Data(json.utf8))
    }

    private func order(_ id: String, state: String, created: String) -> String {
        #"{"id":"\#(id)","consultationId":"c1","patientId":"p1","doctorId":"d1","priority":"rutina","state":"\#(state)","createdAt":"\#(created)","sampleTakenAt":null,"completedAt":null,"reviewedAt":null,"version":1,"patientName":null,"items":[]}"#
    }

    private func orders() throws -> [LabOrder] {
        try decode([LabOrder].self, "[" + [
            order("a", state: "pendiente", created: "2026-11-10T10:00:00Z"),
            order("b", state: "en_proceso", created: "2026-11-11T10:00:00Z"),
            order("c", state: "completado", created: "2026-11-12T10:00:00Z"),
            order("d", state: "cancelado", created: "2026-11-09T10:00:00Z")
        ].joined(separator: ",") + "]")
    }

    func testLabFilterSeparatesStatesAndSortsNewestFirst() throws {
        let list = try orders()
        XCTAssertEqual(LabFilter.all.apply(list).map(\.id), ["c", "b", "a", "d"])
        XCTAssertEqual(LabFilter.pendiente.apply(list).map(\.id), ["a"])
        XCTAssertEqual(LabFilter.enProceso.apply(list).map(\.id), ["b"])
        XCTAssertEqual(LabFilter.completado.apply(list).map(\.id), ["c"])
        XCTAssertEqual(LabFilter.all.count(in: list), 4)
        XCTAssertEqual(LabFilter.completado.titleKey, "exams.filter.completado")
    }

    private let occupancyJSON = #"{"actualizadoEn":"2026-11-14T10:00:00Z","ocupacion":[{"planta":2,"categoria":"vip","camas":4,"libres":1,"ocupadas":3},{"planta":1,"categoria":"semiprivada","camas":10,"libres":5,"ocupadas":5},{"planta":2,"categoria":"semiprivada","camas":6,"libres":6,"ocupadas":0},{"planta":null,"categoria":"vip","camas":2,"libres":2,"ocupadas":0}]}"#

    func testOccupancyTotalsFloorsAndTone() throws {
        let occupancy = try decode(PublicOccupancy.self, occupancyJSON)
        let totals = OccupancyRules.totals(occupancy.rows)
        XCTAssertEqual(totals.beds, 22)
        XCTAssertEqual(totals.free, 14)
        XCTAssertEqual(totals.occupied, 8)
        let floors = OccupancyRules.floors(occupancy.rows)
        XCTAssertEqual(floors.map(\.floor), [1, 2, nil])
        XCTAssertEqual(floors[1].beds, 10)
        XCTAssertEqual(floors[1].percent, 30)
        XCTAssertEqual(OccupancyRules.percent(occupied: 0, beds: 0), 0)
        XCTAssertEqual(OccupancyRules.tone(percent: 69), .success)
        XCTAssertEqual(OccupancyRules.tone(percent: 70), .warning)
        XCTAssertEqual(OccupancyRules.tone(percent: 90), .danger)
    }

    private func admission(_ id: String, patient: String, state: String, bed: String) -> String {
        #"{"id":"\#(id)","patientId":"\#(patient)","patientName":null,"origin":"consulta","requestedCategory":"vip","state":"\#(state)","isolation":false,"scheduledAt":null,"attendingDoctorId":"d1","version":1,"bed":"\#(bed)"}"#
    }

    func testRoomIsTheCurrentHospitalizationWithABed() throws {
        let list = try decode([Admission].self, "[" + [
            admission("a1", patient: "p1", state: "egresado", bed: "101"),
            admission("a2", patient: "p2", state: "hospitalizado", bed: "202"),
            admission("a3", patient: "p1", state: "hospitalizado", bed: "303"),
            admission("a4", patient: "p3", state: "pendiente_cama", bed: "")
        ].joined(separator: ",") + "]")
        XCTAssertEqual(RoomRules.current(list, patientId: "p1")?.bed, "303")
        XCTAssertEqual(RoomRules.current(list, patientId: "p2")?.bed, "202")
        XCTAssertNil(RoomRules.current(list, patientId: "p3"))
        XCTAssertEqual(RoomRules.waiting(list, patientId: "p3")?.id, "a4")
        XCTAssertNil(RoomRules.waiting(list, patientId: "p1"))
    }

    func testProfileRulesValidateContactAndReason() {
        XCTAssertTrue(PatientProfileRules.errors(phone: "7777-7777", email: "ejemplo@example.test", address: "Calle ficticia", reason: "Cambio de número").isEmpty)
        XCTAssertTrue(PatientProfileRules.errors(phone: "", email: "", address: "", reason: "Actualización de datos").isEmpty)
        let errors = PatientProfileRules.errors(phone: "123", email: "no", address: String(repeating: "x", count: 501), reason: "corto")
        XCTAssertEqual(Set(errors.keys), ["phone", "email", "address", "reason"])
    }

    func testProfileBodyKeepsNamesAndOmitsEmptyContact() throws {
        let profile = try decode(PatientProfile.self, #"{"id":"p1","record":"EXP-1","fullName":"Cuenta Ficticia","givenNames":"Cuenta","surnames":"Ficticia","sex":"femenino","version":3,"birth":"1990-01-01","dui":null,"phone":"7000-0000","email":null,"address":null}"#)
        let body = PatientProfileRules.body(profile: profile, phone: " 7111-1111 ", email: "", address: "", reason: " Cambio de número ")
        XCTAssertEqual(body.version, 3)
        XCTAssertEqual(body.givenNames, "Cuenta")
        XCTAssertEqual(body.phone, "7111-1111")
        XCTAssertNil(body.email)
        XCTAssertEqual(body.reason, "Cambio de número")
        let json = try JSONSerialization.jsonObject(with: JSONEncoder().encode(body)) as? [String: Any]
        XCTAssertNil(json?["email"])
        XCTAssertEqual(json?["sex"] as? String, "femenino")
    }

    func testAgendaGroupsByLocalDay() throws {
        func entry(_ id: String, _ start: String) -> String {
            #"{"appointmentId":"\#(id)","patientId":"p1","patientName":"Cuenta Ficticia","start":"\#(start)","end":"\#(start)","reason":null,"appointmentState":"confirmada","consultationId":null,"consultationState":null,"version":null,"signedAt":null}"#
        }
        let entries = try decode([AgendaEntry].self, "[" + [
            entry("x1", "2026-11-16T16:00:00Z"), entry("x2", "2026-11-16T15:00:00Z"),
            entry("x3", "2026-11-18T15:00:00Z"), entry("x4", "2026-11-10T15:00:00Z")
        ].joined(separator: ",") + "]")
        let now = ClimesaDates.parse("2026-11-14T18:00:00Z") ?? Date()
        let upcoming = AgendaRules.upcoming(entries, now: now)
        XCTAssertEqual(upcoming.map(\.day), ["2026-11-16", "2026-11-18"])
        XCTAssertEqual(upcoming[0].entries.map(\.appointmentId), ["x2", "x1"])
        XCTAssertEqual(AgendaRules.past(entries, now: now).map(\.day), ["2026-11-10"])
    }

    func testRecordAccessExplainsForbiddenForDoctorAndPatient() {
        let forbidden = APIFailure.http(status: 403, problem: nil)
        XCTAssertTrue(RecordAccess.deniedMessage(for: forbidden, viewerIsPatient: false)?.hasPrefix("Solo el médico tratante") == true)
        XCTAssertEqual(RecordAccess.deniedMessage(for: forbidden, viewerIsPatient: true), "Solo puedes ver tu propio expediente.")
        XCTAssertNil(RecordAccess.deniedMessage(for: .transport, viewerIsPatient: false))
        XCTAssertNil(RecordAccess.deniedMessage(for: nil, viewerIsPatient: false))
    }

    func testAmbulanceLogQueryBuildsPathAndCountsFilters() {
        var query = AmbulanceLogQuery()
        XCTAssertEqual(query.path, "/ambulancia/bitacora")
        XCTAssertEqual(query.activeCount, 0)
        query.text = " san salvador & centro "
        query.from = "2026-11-01"
        query.to = "2026-11-14"
        query.priority = .roja
        query.finalState = .sinTraslado
        XCTAssertEqual(query.activeCount, 5)
        XCTAssertEqual(query.path, "/ambulancia/bitacora?q=san%20salvador%20%26%20centro&from=2026-11-01&to=2026-11-14&priority=roja&finalState=sin_traslado")
        XCTAssertNil(query.rangeError)
        query.from = "2026-12-01"
        XCTAssertNotNil(query.rangeError)
    }

    func testAmbulanceLogEntryAndStatusDecode() throws {
        let entry = try decode(AmbulanceLogEntry.self, #"{"id":"s1","type":"emergencia_domicilio","priority":"roja","origin":"Colonia Ficticia","destination":"Hospital","municipality":null,"dispatchedAt":"2026-11-14T10:00:00Z","finishedAt":null,"finalState":null,"crew":[{"staffId":"u1","role":"paramedico","name":"Persona Ficticia"}],"responseMinutes":7.4,"milestones":[{"type":"salida","occurredAt":"2026-11-14T10:01:00Z"}],"patientRef":null}"#)
        XCTAssertEqual(AmbulanceLogRules.finalStateLabel(entry.finalState), "En curso")
        XCTAssertEqual(AmbulanceLogRules.finalStateLabel("rechaza_traslado"), "Rechaza traslado")
        XCTAssertEqual(AmbulanceLogRules.responseText(entry.responseMinutes), "Respuesta en 7 min")
        XCTAssertEqual(AmbulanceLogRules.typeLabel(entry.type), "Emergencia a domicilio")
        XCTAssertEqual(entry.crew.first?.role, "paramedico")
        let status = try decode(AmbulanceStatus.self, #"{"unit":{"id":"u1","plate":"P-000","state":"en_mantenimiento","version":1,"stateReason":"Revisión","stateSince":null},"activeService":null,"paramedicOnDuty":false,"dispatchBlock":{"code":"sin_paramedico","message":"No hay paramédico de turno.","action":"Publica un turno de paramédico."}}"#)
        XCTAssertEqual(status.dispatchBlock?.code, "sin_paramedico")
        XCTAssertEqual(status.paramedicOnDuty, false)
        let block = try XCTUnwrap(status.dispatchBlock)
        XCTAssertEqual(AmbulanceLogRules.blockAdvice(block, canPlanShifts: true), "Publica un turno de paramédico.")
        XCTAssertTrue(AmbulanceLogRules.blockAdvice(block, canPlanShifts: false).hasSuffix("Avisa a quien planifica los turnos."))
        let old = try decode(AmbulanceStatus.self, #"{"unit":{"id":"u1","plate":"P-000","state":"disponible"},"activeService":null}"#)
        XCTAssertNil(old.dispatchBlock)
    }
}
