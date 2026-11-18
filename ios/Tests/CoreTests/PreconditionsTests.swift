import XCTest
@testable import ClimesaCore

/// Preconditions sweep: no action is offered that the API would refuse for a precondition the client can know.
final class PreconditionsTests: XCTestCase {
    private func decode<T: Decodable>(_ type: T.Type, _ json: String) throws -> T {
        try JSONDecoder().decode(T.self, from: Data(json.utf8))
    }

    private func profile(_ codes: [String], patientId: String? = nil, roles: [String] = ["MED"]) -> AccessProfile {
        AccessProfile(id: "u1", email: "ejemplo@example.test", name: "Cuenta ficticia", roles: roles, platforms: ["ios"],
                      permissions: codes.map { Permission(code: $0, context: "propio") }, patientId: patientId)
    }

    private func candidate(_ id: String, careRelation: String?) throws -> PatientCandidate {
        let field = careRelation.map { #","careRelation":\#($0)"# } ?? ""
        return try decode(PatientCandidate.self, #"{"id":"\#(id)","record":"9900001","fullName":"[DEMO] Paciente \#(id)","active":true,"birth":null,"matchReason":"nombre"\#(field)}"#)
    }

    private func history(_ allowed: String?) throws -> ClinicalHistory {
        let field = allowed.map { #","allowedActions":\#($0)"# } ?? ""
        return try decode(ClinicalHistory.self, #"{"patient":{"id":"p1","record":"9900001","fullName":"[DEMO] Paciente"},"access":"relacion","consultations":[],"laboratory":[],"admissions":[]\#(field)}"#)
    }

    // MARK: Shared gate

    func testActionGateSaysWhetherItShowsAndWhy() {
        XCTAssertFalse(ActionGate.hidden.isVisible)
        XCTAssertTrue(ActionGate.available.isAvailable)
        XCTAssertEqual(ActionGate.blocked(reason: "Motivo.").blockedReason, "Motivo.")
        XCTAssertTrue(ActionGate.blocked(reason: "Motivo.").isVisible)
        XCTAssertFalse(ActionGate.blocked(reason: "Motivo.").isAvailable)
        XCTAssertNil(ActionGate.available.blockedReason)
    }

    func testCancelOptionMapsToTheSharedGateWithItsReason() {
        let now = Date()
        XCTAssertEqual(AppointmentRules.CancelOption.hidden.gate, .hidden)
        XCTAssertEqual(AppointmentRules.CancelOption.allowed(deadline: now).gate, .available)
        XCTAssertEqual(AppointmentRules.CancelOption.tooLate(deadline: now).gate, .blocked(reason: AppointmentRules.cancelTooLateText()))
        XCTAssertEqual(AppointmentRules.CancelOption.blocked(reason: "Recepción ya la atendió.").gate, .blocked(reason: "Recepción ya la atendió."))
    }

    // MARK: S2 · MED Expediente

    func testUnrelatedCandidatesAreBlockedWithTheReasonAndListedAfterRelatedOnes() throws {
        let unrelated = try candidate("a", careRelation: "false")
        let related = try candidate("b", careRelation: "true")
        let older = try candidate("c", careRelation: nil)
        XCTAssertEqual(RecordAccess.gate(unrelated), .blocked(reason: "Se habilita cuando hay una cita, consulta u hospitalización a tu cargo."))
        XCTAssertEqual(RecordAccess.gate(related), .available)
        XCTAssertEqual(RecordAccess.ordered([unrelated, related, older]).map(\.id), ["b", "c", "a"])
    }

    func testACandidateWithoutCareRelationFromAnOlderServerStillOpens() throws {
        let older = try candidate("c", careRelation: nil)
        XCTAssertNil(older.careRelation)
        XCTAssertEqual(RecordAccess.gate(older), .available)
    }

    // MARK: S4 · external result from allowedActions

    func testTheHistoryAllowedActionsDecideTheExternalResult() throws {
        let doctor = profile(["expediente.ver", "laboratorio.ordenar"])
        XCTAssertTrue(ExternalRecordRules.canOffer(doctor, history: try history(#"["resultado_externo"]"#)))
        XCTAssertFalse(ExternalRecordRules.canOffer(doctor, history: try history("[]")))
        XCTAssertEqual(try history("[]").allowedActions, [])
    }

    func testWithoutAllowedActionsTheClientGateStays() throws {
        let old = try history(nil)
        XCTAssertNil(old.allowedActions)
        XCTAssertTrue(ExternalRecordRules.canOffer(profile(["expediente.ver", "laboratorio.ordenar"]), history: old))
        XCTAssertFalse(ExternalRecordRules.canOffer(profile(["expediente.ver"]), history: old))
    }

    // MARK: S6 · PAC without a linked record

    func testAnUnlinkedPatientSeesWhyInsteadOfTheAmbulanceForm() {
        let unlinked = profile(["ambulancia.solicitar"], roles: ["PAC"])
        XCTAssertEqual(AmbulanceRules.requestGate(unlinked),
                       .blocked(reason: "Vincula tu expediente para pedir una ambulancia. En una emergencia llama al 911."))
        XCTAssertEqual(AmbulanceRules.requestGate(profile(["ambulancia.solicitar"], patientId: "p1", roles: ["PAC"])), .available)
        XCTAssertEqual(AmbulanceRules.requestGate(profile([], patientId: "p1", roles: ["PAC"])), .hidden)
        XCTAssertEqual(AmbulanceRules.requestGate(nil), .hidden)
    }

    // MARK: S7 · Firmar consulta

    func testSigningIsBlockedWithTheReasonWhileReasonOrPlanIsEmpty() {
        XCTAssertEqual(ConsultationRecordRules.signBlocker(reason: " ", plan: ""), "Completa el motivo y el plan para firmar.")
        XCTAssertEqual(ConsultationRecordRules.signBlocker(reason: "", plan: "Reposo"), "Completa el motivo para firmar.")
        XCTAssertEqual(ConsultationRecordRules.signBlocker(reason: "Tos", plan: "\n"), "Completa el plan para firmar.")
        XCTAssertNil(ConsultationRecordRules.signBlocker(reason: "Tos", plan: "Reposo"))
    }

    // MARK: S8 · 403 as info

    func testAForbiddenAnswerNeverOffersRetry() {
        let problem = Problem.decode(Data(#"{"type":"about:blank","title":"Prohibido","status":403,"code":"sin_permiso","detail":"No tienes permiso para ver esto."}"#.utf8))
        XCTAssertFalse(APIFailure.http(status: 403, problem: problem).offersRetry)
        XCTAssertFalse(APIFailure.http(status: 403, problem: nil).offersRetry)
        XCTAssertTrue(APIFailure.http(status: 500, problem: nil).offersRetry)
        XCTAssertTrue(APIFailure.transport.offersRetry)
    }
}
