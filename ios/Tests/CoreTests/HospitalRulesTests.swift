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

    // D7: el paciente ve el resumen de su alta firmada (en cama o cerrada); sin la parte clínica no hay resumen.
    func testDischargeSummaryIsTheOwnSignedOrClosedStay() throws {
        let clinical = #"{"type":"medica","signedAt":"2026-11-18T16:30:00Z","signedByName":"Dra. Ficticia","pending":[{"description":"Retirar puntos","responsible":"Consulta externa"}],"pendingCount":1,"specialHandling":false,"summary":"Reposo y dieta blanda.","diagnoses":[{"code":"K35.8","description":"Apendicitis aguda","principal":false},{"code":"A09","description":"Diarrea","principal":true}],"followUp":{"at":"2026-11-21T16:00:00Z","state":"solicitada","doctorName":"Dr. Ficticio","specialty":"Cirugía"}}"#
        let operational = #"{"type":null,"signedAt":"2026-11-18T16:30:00Z","signedByName":null,"pending":null,"pendingCount":1,"specialHandling":false,"summary":null,"diagnoses":null,"followUp":null}"#
        func row(_ id: String, patient: String, state: String, bed: String, discharge: String) -> String {
            #"{"id":"\#(id)","patientId":"\#(patient)","patientName":null,"origin":"consulta","requestedCategory":"vip","state":"\#(state)","isolation":false,"scheduledAt":null,"attendingDoctorId":"d1","version":1,"bed":"\#(bed)","discharge":\#(discharge)}"#
        }
        let list = try decode([Admission].self, "[" + [
            row("e", patient: "p1", state: "egresado", bed: "", discharge: clinical),
            row("s", patient: "p2", state: "alta_firmada", bed: "202", discharge: clinical),
            row("r", patient: "p3", state: "alta_firmada", bed: "303", discharge: operational)
        ].joined(separator: ",") + "]")
        XCTAssertEqual(DischargeSummaryRules.summary(list, patientId: "p1")?.id, "e")
        XCTAssertEqual(DischargeSummaryRules.summary(list, patientId: "p2")?.id, "s")
        XCTAssertNil(DischargeSummaryRules.summary(list, patientId: "p3"))
        // Con el alta firmada la cama sigue asignada hasta la salida física.
        XCTAssertEqual(RoomRules.current(list, patientId: "p2")?.bed, "202")
        XCTAssertNil(RoomRules.current(list, patientId: "p1"))

        let discharge = try XCTUnwrap(list[1].discharge)
        XCTAssertEqual(discharge.summary, "Reposo y dieta blanda.")
        XCTAssertEqual(DischargeSummaryRules.typeLabel(discharge), "Alta médica")
        XCTAssertEqual(DischargeSummaryRules.diagnoses(discharge).map(\.code), ["A09", "K35.8"])
        XCTAssertEqual(DischargeSummaryRules.diagnosisLine(DischargeSummaryRules.diagnoses(discharge)[0]), "A09 · Diarrea (principal)")
        XCTAssertEqual(DischargeSummaryRules.pendingLine(try XCTUnwrap(discharge.pending?.first)), "Retirar puntos — Responsable: Consulta externa")
        let followUp = DischargeSummaryRules.followUpLine(try XCTUnwrap(discharge.followUp))
        XCTAssertTrue(followUp.hasSuffix(" · Dr. Ficticio · Cirugía (por confirmar)"), followUp)
        XCTAssertNil(list[2].discharge?.summary)
    }

    // Final QA: the signature reads like Android ("Firmada el … por …"); without a name there is no " por".
    func testDischargeSignedLineMatchesAndroidWording() {
        let at = "2026-11-18T16:30:00Z"
        let signed = Admission.Discharge(type: "medica", signedAt: at, signedByName: "Dra. Ficticia", pending: [])
        XCTAssertEqual(DischargeSummaryRules.signedLine(signed), "Firmada el \(ClimesaDates.display(at)) por Dra. Ficticia")
        let anonymous = Admission.Discharge(type: "medica", signedAt: at, signedByName: " ", pending: [])
        XCTAssertEqual(DischargeSummaryRules.signedLine(anonymous), "Firmada el \(ClimesaDates.display(at))")
    }

    func testProfileRulesValidateContactLikeTheAPI() {
        XCTAssertTrue(PatientProfileRules.errors(phone: "7777-7777", address: "Calle ficticia").isEmpty)
        XCTAssertTrue(PatientProfileRules.errors(phone: "", address: "").isEmpty)
        XCTAssertNotNil(PatientProfileRules.errors(phone: "5777-7777", address: "")["phone"])
        let errors = PatientProfileRules.errors(phone: "123", address: String(repeating: "x", count: 501))
        XCTAssertEqual(Set(errors.keys), ["phone", "address"])
    }

    /// U12: the email links the account with the record, so the patient's own save never sends it.
    func testSelfUpdateBodySendsVersionClearsWithEmptyTextAndNeverTheEmail() throws {
        let body = PatientProfileRules.body(version: 3, phone: " 7111-1111 ", address: "Calle ficticia ")
        XCTAssertEqual(body, PatientSelfUpdateBody(version: 3, phone: "7111-1111", email: nil, address: "Calle ficticia"))
        let json = try JSONSerialization.jsonObject(with: JSONEncoder().encode(body)) as? [String: Any]
        XCTAssertEqual(Set(json?.keys.map { $0 } ?? []), ["version", "phone", "address"])
        XCTAssertEqual(json?["version"] as? Int, 3)
        XCTAssertEqual(PatientProfileRules.body(version: 3, phone: "", address: "").phone, "")
    }

    /// U12: a 403 `correo_lo_gestiona_recepcion` says who changes the email; other refusals keep their own notice.
    func testEmailManagedByReceptionMessage() throws {
        let body = Data(#"{"type":"about:blank","title":"Prohibido","status":403,"detail":"Otro texto","codigo":"correo_lo_gestiona_recepcion"}"#.utf8)
        let failure = APIFailure.from(status: 403, body: body)
        XCTAssertEqual(PatientProfileRules.failureMessage(code: failure.code), "Tu correo lo actualiza Recepción. Pídelo en ventanilla.")
        XCTAssertNil(PatientProfileRules.failureMessage(code: "version_conflicto"))
        XCTAssertNil(PatientProfileRules.failureMessage(code: nil))
    }

    func testHospitalLocationDecodesPublicContractAndBuildsLinks() throws {
        let place = try decode(HospitalLocation.self, #"{"nombre":"Hospital Ficticio","direccion":"Calle de prueba 1","municipio":"San Salvador Centro","departamento":"San Salvador","telefono":"2222-3333","latitud":13.6929,"longitud":-89.2182}"#)
        XCTAssertEqual(place.name, "Hospital Ficticio")
        XCTAssertEqual(place.municipality, "San Salvador Centro")
        XCTAssertEqual(place.latitude, 13.6929, accuracy: 0.0001)
        XCTAssertEqual(HospitalLocationRules.callURL(place)?.absoluteString, "tel:22223333")
        let maps = try XCTUnwrap(HospitalLocationRules.mapsURL(place, fallbackQuery: "Hospital CLIMESA")?.absoluteString)
        XCTAssertTrue(maps.hasPrefix("https://maps.apple.com/?ll=13.6929,-89.2182"), maps)
        XCTAssertTrue(maps.contains("q=Hospital%20Ficticio"), maps)
    }

    func testLocationFallsBackToNameSearchWithoutCoordinates() throws {
        let url = try XCTUnwrap(HospitalLocationRules.mapsURL(nil, fallbackQuery: "Hospital CLIMESA")?.absoluteString)
        XCTAssertEqual(url, "https://maps.apple.com/?q=Hospital%20CLIMESA")
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
        XCTAssertNil(old.driverOnDuty)
        XCTAssertNil(AmbulanceLogRules.crewNotice(old))
    }

    func testAmbulanceNeedsDriverToo() throws {
        let noDriver = try decode(AmbulanceStatus.self, #"{"unit":{"id":"u1","plate":"P-000","state":"disponible"},"activeService":null,"paramedicOnDuty":true,"driverOnDuty":false,"dispatchBlock":{"code":"sin_motorista_de_turno","message":"No hay motorista con turno en curso.","action":"Publica un turno de motorista que cubra la hora actual; la unidad no puede despacharse sin quien la conduzca (RN-30)."}}"#)
        XCTAssertEqual(noDriver.driverOnDuty, false)
        let block = try XCTUnwrap(noDriver.dispatchBlock)
        XCTAssertTrue(AmbulanceLogRules.blockAdvice(block, canPlanShifts: true).hasPrefix("Publica un turno de motorista"))
        XCTAssertEqual(AmbulanceLogRules.blockAdvice(block, canPlanShifts: false), "Falta el turno del motorista: avisa a la Jefatura de Operaciones.")
        XCTAssertNil(AmbulanceLogRules.crewNotice(noDriver))
        let both = AmbulanceStatus.DispatchBlock(code: "sin_tripulacion_de_turno", message: "No hay paramédico ni motorista con turno en curso.", action: "Publica un turno de paramédico y otro de motorista.")
        XCTAssertTrue(AmbulanceLogRules.blockAdvice(both, canPlanShifts: false).contains("Jefatura de Operaciones"))
        let busy = try decode(AmbulanceStatus.self, #"{"unit":{"id":"u1","plate":"P-000","state":"en_servicio"},"activeService":null,"paramedicOnDuty":true,"driverOnDuty":false,"dispatchBlock":{"code":"en_servicio","message":"La unidad está en servicio.","action":"Espera a que termine."}}"#)
        XCTAssertEqual(AmbulanceLogRules.crewNotice(busy), "Sin motorista con turno en curso.")
    }

    func testBitacoraDeAmbulanciaPorDiaPrioridadYCierre() throws {
        func entry(_ id: String, _ at: String, final: String? = "completado", admin: Bool? = nil) throws -> AmbulanceLogEntry {
            let adminJSON = admin.map { $0 ? "true" : "false" } ?? "null"
            let finalJSON = final.map { "\"\($0)\"" } ?? "null"
            return try decode(AmbulanceLogEntry.self, #"{"id":"\#(id)","type":"emergencia_domicilio","priority":"roja","origin":"A","destination":"B","municipality":null,"dispatchedAt":"\#(at)","finishedAt":null,"finalState":\#(finalJSON),"crew":[],"responseMinutes":null,"milestones":[],"patientRef":null,"administrativeClose":\#(adminJSON)}"#)
        }
        let now = try XCTUnwrap(ClimesaDates.parse("2026-11-18T18:00:00Z"))
        // 2026-11-18T03:00Z is still 17 Nov in El Salvador (UTC-6).
        let days = AmbulanceLogRules.days([try entry("a", "2026-11-18T15:00:00Z"), try entry("b", "2026-11-18T03:00:00Z"), try entry("c", "2026-11-16T15:00:00Z"), try entry("d", "2026-11-17T20:00:00Z")], now: now)
        XCTAssertEqual(days.today?.map(\.id), ["a"])
        XCTAssertEqual(days.past.map(\.day), ["2026-11-17", "2026-11-16"])
        XCTAssertEqual(days.past[0].entries.map(\.id), ["b", "d"])
        XCTAssertNil(AmbulanceLogRules.days([try entry("c", "2026-11-16T15:00:00Z")], now: now).today)

        XCTAssertEqual(AmbulanceLogRules.finalTag(try entry("x", "2026-11-18T15:00:00Z", final: "cancelado", admin: true)).label, "Cierre administrativo")
        XCTAssertEqual(AmbulanceLogRules.finalTag(try entry("y", "2026-11-18T15:00:00Z", final: "cancelado")).label, "Cancelado")
        XCTAssertEqual(AmbulanceLogRules.finalTag(try entry("z", "2026-11-18T15:00:00Z", final: nil)).value, "en_curso")

        XCTAssertEqual(AmbulanceLogRules.priorityLevel(.roja), .emergencia)
        XCTAssertEqual(AmbulanceLogRules.priorityLevel(.naranja), .urgente)
        XCTAssertEqual(AmbulanceLogRules.priorityLevel(.amarilla), .urgente)
        XCTAssertEqual(AmbulanceLogRules.priorityLevel(.verde), .rutina)

        XCTAssertTrue(AmbulanceLogRules.isUnclosed(dispatchedAt: "2026-11-18T05:00:00Z", now: now))
        XCTAssertFalse(AmbulanceLogRules.isUnclosed(dispatchedAt: "2026-11-18T07:00:00Z", now: now))

        let status = try decode(AmbulanceStatus.self, #"{"unit":{"id":"u1","plate":"P-000","state":"en_servicio"},"activeService":{"id":"s1","priority":"roja","origin":"A","destination":"B","dispatchedAt":"2026-11-18T15:00:00Z","hasPrehospital":false,"milestones":[{"type":"salida","occurredAt":"2026-11-18T15:02:00Z"}]}}"#)
        XCTAssertEqual(status.activeService?.milestones?.map(\.type), ["salida"])
    }
}
