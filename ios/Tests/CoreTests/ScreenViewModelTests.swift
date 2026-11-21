import XCTest
@testable import ClimesaCore

/// S13: the API the view models talk to, without network. Each reply is JSON keyed by "METHOD path"; every call is
/// recorded with its body (sorted keys, as sent) and its `Idempotency-Key`. A call with no reply fails as `.transport`.
actor FakeClinicalAPI: ClinicalAPI {
    struct Call: Equatable {
        let method: String
        let path: String
        let body: String?
        let key: String?
    }

    private(set) var calls: [Call] = []
    private var replies: [String: Result<String, APIFailure>] = [:]

    func reply(_ method: String, _ path: String, _ json: String) { replies["\(method) \(path)"] = .success(json) }
    func fail(_ method: String, _ path: String, _ failure: APIFailure) { replies["\(method) \(path)"] = .failure(failure) }

    func get<T: Decodable>(_ path: String, as type: T.Type) async throws -> T {
        try answer("GET", path, body: nil, key: nil)
    }

    func send<Body: Encodable, T: Decodable>(_ method: String, _ path: String, body: Body, key: String, as type: T.Type) async throws -> T {
        try answer(method, path, body: JSONBody.fingerprint(body), key: key)
    }

    private func answer<T: Decodable>(_ method: String, _ path: String, body: String?, key: String?) throws -> T {
        calls.append(Call(method: method, path: path, body: body, key: key))
        switch replies["\(method) \(path)"] {
        case let .success(json)?: return try JSONDecoder().decode(T.self, from: Data(json.utf8))
        case let .failure(failure)?: throw failure
        case nil: throw APIFailure.transport
        }
    }
}

private func decode<T: Decodable>(_ type: T.Type, _ json: String) throws -> T {
    try JSONDecoder().decode(T.self, from: Data(json.utf8))
}

private let agendaJSON = #"{"appointmentId":"a1","patientId":"p1","patientName":"Paciente Ficticio","start":"2026-11-20T16:00:00.000Z","end":"2026-11-20T16:20:00.000Z","reason":null,"appointmentState":"confirmada","consultationId":null,"consultationState":null,"version":1,"signedAt":null}"#
private let unsignedJSON = #"{"id":"k9","patientId":"p1","patientName":null,"appointmentId":"a1","ticketId":null,"reason":null,"startedAt":"2026-11-19T10:00:00.000Z","version":3}"#
private let labOrdersJSON = #"[{"id":"o1","consultationId":"k1","patientId":"p1","doctorId":"d1","priority":"urgente","state":"en_proceso","createdAt":"2026-11-20T14:00:00.000Z","sampleTakenAt":null,"completedAt":null,"reviewedAt":null,"version":4,"patientName":null,"items":[]},{"id":"o2","consultationId":"k2","patientId":"p1","doctorId":"d1","priority":"rutina","state":"pendiente","createdAt":"2026-11-20T13:00:00.000Z","sampleTakenAt":null,"completedAt":null,"reviewedAt":null,"version":1,"patientName":null,"items":[]}]"#
private let ambulanceJSON = #"[{"id":"r1","state":"por_confirmar","address":"Calle 1, San Salvador","reason":"Dolor de pecho","createdAt":"2026-11-20T14:00:00.000Z","version":2,"service":null,"allowedActions":["cancelar"],"notice":"Despacho te llamará.","discardReason":null}]"#

@MainActor
final class ConsultationViewModelTests: XCTestCase {
    private let api = FakeClinicalAPI()

    private func makeModel() -> ConsultationViewModel {
        let model = ConsultationViewModel()
        let api = self.api
        model.client = { api }
        return model
    }

    func testStartPostsTheAppointmentAndOpensTheNewConsultation() async throws {
        await api.reply("POST", "/consultas", #"{"id":"k1","appointmentId":"a1","ticketId":null,"version":1,"state":"abierta"}"#)
        let model = makeModel()
        let id = await model.start(.appointment(try decode(AgendaEntry.self, agendaJSON)))
        XCTAssertEqual(id, "k1")
        let calls = await api.calls
        XCTAssertEqual(calls.map(\.method), ["POST"])
        XCTAssertEqual(calls.first?.path, "/consultas")
        XCTAssertEqual(calls.first?.body, #"{"appointmentId":"a1"}"#)
        XCTAssertFalse(calls.first?.key?.isEmpty ?? true)
        XCTAssertFalse(model.starting.busy)
        XCTAssertNil(model.starting.error)
    }

    func testStartResumesTheConsultationThisDoctorAlreadyStarted() async throws {
        let started = APIFailure.http(status: 409, problem: Problem(status: 409, code: "consulta_ya_iniciada", detail: nil, consultationId: "k7"))
        await api.fail("POST", "/consultas", started)
        let model = makeModel()
        let id = await model.start(.appointment(try decode(AgendaEntry.self, agendaJSON)))
        XCTAssertEqual(id, "k7")
        XCTAssertNil(model.starting.error)
    }

    func testResumeNeverStartsAgain() async throws {
        let model = makeModel()
        let id = await model.start(.resume(try decode(UnsignedConsultation.self, unsignedJSON)))
        XCTAssertEqual(id, "k9")
        let calls = await api.calls
        XCTAssertTrue(calls.isEmpty)
    }

    func testFailedStartShowsTheErrorAndReturnsNil() async throws {
        let model = makeModel()
        let id = await model.start(.appointment(try decode(AgendaEntry.self, agendaJSON)))
        XCTAssertNil(id)
        XCTAssertEqual(model.starting.error, APIFailure.transport.userMessage)
        XCTAssertEqual(model.starting.lastFailure, .transport)
    }

    func testSaveSendsTheVersionAndTheRetryKeepsTheKey() async {
        await api.fail("PATCH", "/consultas/k1", .transport)
        let model = makeModel()
        let failed = await model.save(consultationId: "k1", version: 4, reason: "Tos", exam: "Normal", plan: "Reposo")
        XCTAssertNil(failed)
        await api.reply("PATCH", "/consultas/k1", #"{"id":"k1","version":5,"state":"abierta"}"#)
        let saved = await model.save(consultationId: "k1", version: 4, reason: "Tos", exam: "Normal", plan: "Reposo")
        XCTAssertEqual(saved?.version, 5)
        let calls = await api.calls
        XCTAssertEqual(calls.map(\.method), ["PATCH", "PATCH"])
        XCTAssertEqual(calls.first?.body, #"{"physicalExam":"Normal","plan":"Reposo","reason":"Tos","version":4}"#)
        // Same intent after a failure without an answer: the retry sends the same Idempotency-Key.
        XCTAssertEqual(calls[0].key, calls[1].key)
    }

    func testAutosaveUsesItsOwnSubmission() async {
        await api.reply("PATCH", "/consultas/k1", #"{"id":"k1","version":2,"state":"abierta"}"#)
        let model = makeModel()
        let saved = await model.autosave(consultationId: "k1", version: 1, reason: "Tos", exam: "", plan: "Reposo")
        XCTAssertEqual(saved?.version, 2)
        XCTAssertNil(model.saving.lastFailure)
        XCTAssertNil(model.autosaving.error)
    }

    func testDiagnosisPrescriptionAndLabOrderGoToTheirEndpoints() async {
        await api.reply("POST", "/consultas/k1/diagnosticos", #"{"id":"g1","code":"J00","principal":true,"description":"Rinofaringitis aguda"}"#)
        await api.reply("POST", "/consultas/k1/receta", #"{"id":"rx1","issuedAt":"2026-11-20T14:00:00.000Z","items":[]}"#)
        await api.reply("POST", "/laboratorio/ordenes", #"{"id":"o9","version":1,"state":"pendiente","itemCount":2}"#)
        let model = makeModel()
        let created = await model.addDiagnosis(consultationId: "k1", code: "J00", principal: true, note: nil)
        XCTAssertEqual(created?.description, "Rinofaringitis aguda")
        let line = PrescriptionItemBody(medication: "Paracetamol", dose: "500 mg", route: "oral", frequency: "cada 8 h", duration: "3 días", instructions: nil)
        let prescribed = await model.prescribe(consultationId: "k1", items: [line], success: "Receta emitida.")
        XCTAssertTrue(prescribed)
        XCTAssertEqual(model.prescribing.notice, "Receta emitida.")
        let ordered = await model.orderLab(consultationId: "k1", exams: ["e2", "e1"], priority: .urgente, success: nil)
        XCTAssertTrue(ordered)
        let calls = await api.calls
        XCTAssertEqual(calls.map(\.path), ["/consultas/k1/diagnosticos", "/consultas/k1/receta", "/laboratorio/ordenes"])
        XCTAssertEqual(calls[0].body, #"{"code":"J00","principal":true}"#)
        XCTAssertEqual(calls[2].body, #"{"consultationId":"k1","exams":["e2","e1"],"priority":"urgente"}"#)
    }

    func testSignSendsTheVersionAndAConflictIsKept() async {
        let conflict = APIFailure.http(status: 409, problem: Problem(status: 409, code: "version_conflicto", detail: nil))
        await api.fail("POST", "/consultas/k1/firmar", conflict)
        let model = makeModel()
        let signed = await model.sign(consultationId: "k1", version: 6, success: "Consulta firmada.")
        XCTAssertNil(signed)
        XCTAssertEqual(model.signing.lastFailure?.isVersionConflict, true)
        XCTAssertNil(model.signing.notice)
        let calls = await api.calls
        XCTAssertEqual(calls.first?.body, #"{"version":6}"#)
    }

    func testLabOrdersKeepOnlyThisConsultationAndAFailureIsNotAnEmptyList() async {
        let model = makeModel()
        await model.loadLabOrders(consultationId: "k1")
        XCTAssertEqual(model.labOrders?.error, APIFailure.transport.userMessage)
        XCTAssertNil(model.labOrders?.value)
        await api.reply("GET", "/laboratorio/ordenes", labOrdersJSON)
        await model.loadLabOrders(consultationId: "k1")
        XCTAssertEqual(model.labOrders?.value?.map(\.id), ["o1"])
    }

    func testCieSearchNeedsTwoCharacters() async {
        let model = makeModel()
        await model.searchCie("j")
        let calls = await api.calls
        XCTAssertTrue(calls.isEmpty)
        XCTAssertNil(model.cieResults.value)
    }

    func testWithoutAClientEveryCallFailsAsTransport() async {
        let model = ConsultationViewModel()
        await model.loadCatalog()
        XCTAssertEqual(model.catalog.failure, .transport)
        XCTAssertFalse(model.catalog.loading)
    }
}

@MainActor
final class PatientExamsViewModelTests: XCTestCase {
    func testLoadReadsOwnResultsAndMarksThemSeen() async {
        let api = FakeClinicalAPI()
        await api.reply("GET", "/me/laboratorio", labOrdersJSON)
        let model = PatientExamsViewModel()
        model.client = { api }
        var seen: [String] = []
        model.markSeen = { user, _ in seen.append(user) }
        await model.load(user: "u1")
        XCTAssertEqual(model.loader.value?.count, 2)
        XCTAssertEqual(model.loader.value?.first?.state.label, "En Proceso")
        XCTAssertEqual(seen, ["u1"])
        let calls = await api.calls
        XCTAssertEqual(calls, [FakeClinicalAPI.Call(method: "GET", path: "/me/laboratorio", body: nil, key: nil)])
    }

    func testAFailedReadIsNotSeen() async {
        let model = PatientExamsViewModel()
        model.client = { FakeClinicalAPI() }
        var seen = 0
        model.markSeen = { _, _ in seen += 1 }
        await model.load(user: "u1")
        XCTAssertEqual(model.loader.error, APIFailure.transport.userMessage)
        XCTAssertEqual(seen, 0)
    }
}

@MainActor
final class AmbulanceRequestViewModelTests: XCTestCase {
    private let api = FakeClinicalAPI()

    private func makeModel() -> AmbulanceRequestViewModel {
        let model = AmbulanceRequestViewModel()
        let api = self.api
        model.client = { api }
        return model
    }

    func testInvalidFormIsNotSent() async {
        let model = makeModel()
        model.address = "x"
        await model.send()
        XCTAssertNotNil(model.errors["address"])
        XCTAssertNotNil(model.errors["reason"])
        XCTAssertNotNil(model.errors["contactPhone"])
        let calls = await api.calls
        XCTAssertTrue(calls.isEmpty)
    }

    func testSendPostsTheTrimmedRequestThenReloads() async {
        await api.reply("POST", "/ambulancia/solicitudes", #"{"id":"r1","state":"por_confirmar","version":1,"createdAt":"2026-11-20T14:00:00.000Z","notice":"Despacho te llamará."}"#)
        await api.reply("GET", "/ambulancia/solicitudes/mias", ambulanceJSON)
        let model = makeModel()
        model.address = "  Calle 1, San Salvador "
        model.municipality = " "
        model.reason = "Dolor de pecho"
        model.phone = "7000 0000"
        await model.send()
        XCTAssertTrue(model.errors.isEmpty)
        let calls = await api.calls
        XCTAssertEqual(calls.map(\.path), ["/ambulancia/solicitudes", "/ambulancia/solicitudes/mias"])
        XCTAssertEqual(calls.first?.body, #"{"address":"Calle 1, San Salvador","contactPhone":"7000 0000","reason":"Dolor de pecho"}"#)
        XCTAssertEqual(model.loader.value?.first?.canCancel, true)
    }

    func testRejectedRequestShowsTheErrorAndDoesNotReload() async {
        await api.fail("POST", "/ambulancia/solicitudes", .http(status: 422, problem: Problem(status: 422, code: "sin_expediente", detail: "Vincula tu expediente.")))
        let model = makeModel()
        model.address = "Calle 1, San Salvador"
        model.reason = "Dolor de pecho"
        model.phone = "70000000"
        await model.send()
        XCTAssertNotNil(model.submission.error)
        XCTAssertEqual(model.submission.lastFailure?.status, 422)
        let calls = await api.calls
        XCTAssertEqual(calls.count, 1)
    }

    func testCancelSendsVersionAndReasonThenClosesTheSheet() async throws {
        await api.reply("POST", "/ambulancia/solicitudes/r1/cancelar", #"{"id":"r1","state":"cancelada","version":3}"#)
        let request = try decode([OwnAmbulanceRequest].self, ambulanceJSON)[0]
        let model = makeModel()
        model.askCancel(request)
        XCTAssertEqual(model.cancelling?.id, "r1")
        model.cancelReason = "Ya no hace falta"
        await model.cancel(request, success: "Solicitud cancelada.")
        XCTAssertNil(model.cancelling)
        XCTAssertEqual(model.submission.notice, "Solicitud cancelada.")
        let calls = await api.calls
        XCTAssertEqual(calls.first?.body, #"{"reason":"Ya no hace falta","version":2}"#)
        XCTAssertEqual(calls.last?.path, "/ambulancia/solicitudes/mias")
    }

    func testPrefillFillsOnlyEmptyFieldsOnce() async {
        await api.reply("GET", "/me/paciente", #"{"id":"p1","record":"EXP-1","fullName":"Paciente Ficticio","givenNames":"Paciente","surnames":"Ficticio","sex":"F","version":1,"birth":null,"dui":null,"phone":"7111 1111","email":null,"address":"Colonia Escalón"}"#)
        let model = makeModel()
        model.phone = "7222 2222"
        await model.prefill(allowed: true)
        XCTAssertEqual(model.address, "Colonia Escalón")
        XCTAssertEqual(model.phone, "7222 2222")
        XCTAssertEqual(model.prefillNotice, "ambulance.prefilled.address")
        model.address = ""
        await model.prefill(allowed: true)
        XCTAssertEqual(model.address, "")
        let calls = await api.calls
        XCTAssertEqual(calls.count, 1)
    }

    func testPrefillNotAllowedReadsNothing() async {
        let model = makeModel()
        await model.prefill(allowed: false)
        let calls = await api.calls
        XCTAssertTrue(calls.isEmpty)
        XCTAssertNil(model.prefillNotice)
    }
}
