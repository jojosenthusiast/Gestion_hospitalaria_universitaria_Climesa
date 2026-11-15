import XCTest
@testable import ClimesaCore

/// BL-03 / MA-HOS-02: el médico ve la solicitud de alta, firma o revoca según `allowedActions`, y ve el alta firmada.
final class DischargeCycleTests: XCTestCase {
    private func decode(_ json: String) throws -> [Admission] {
        try JSONDecoder().decode([Admission].self, from: Data(json.utf8))
    }

    private let base = #""id":"a1","patientId":"p1","patientName":"Paciente Ficticio","origin":"consulta","requestedCategory":"semiprivada","isolation":false,"scheduledAt":null,"attendingDoctorId":"d1","version":4,"bed":"201-A""#

    func testLosCamposNuevosSeLeenCompletos() throws {
        let list = try decode(#"[{"# + base + #","state":"alta_firmada","allowedActions":["revocar_alta","registrar_salida"],"attendingDoctorName":"Dra. Ficticia","attendingDoctorHasAccount":true,"dischargeRequestedAt":null,"bedCategory":"vip","authorized":true,"discharge":{"type":"voluntaria","signedAt":"2026-11-15T10:00:00.000Z","signedByName":"Dra. Ficticia","pending":[{"description":"Control en 7 días","responsible":"Paciente"}]}}]"#)
        let admission = try XCTUnwrap(list.first)
        XCTAssertEqual(admission.allowedActions, ["revocar_alta", "registrar_salida"])
        XCTAssertTrue(admission.allows(.revocarAlta))
        XCTAssertFalse(admission.allows(.firmarAlta))
        XCTAssertEqual(admission.attendingDoctorName, "Dra. Ficticia")
        XCTAssertEqual(admission.attendingDoctorHasAccount, true)
        XCTAssertEqual(admission.bedCategory, "vip")
        XCTAssertEqual(admission.authorized, true)
        XCTAssertEqual(admission.discharge?.kind, .voluntaria)
        XCTAssertEqual(admission.discharge?.pending, [Admission.Discharge.Pending(description: "Control en 7 días", responsible: "Paciente")])
    }

    func testUnServidorAnteriorOCamposMalFormadosNoRompenLaLista() throws {
        let old = try decode(#"[{"# + base + #","state":"hospitalizado"}]"#)
        XCTAssertEqual(old.first?.allowedActions, [])
        XCTAssertNil(old.first?.discharge)
        let odd = try decode(#"[{"# + base + #","state":"hospitalizado","allowedActions":"firmar_alta","discharge":{"signedAt":1},"authorized":"si"}]"#)
        XCTAssertEqual(odd.first?.allowedActions, [])
        XCTAssertNil(odd.first?.discharge)
        XCTAssertNil(odd.first?.authorized)
    }

    func testLosBotonesSalenSoloDeAllowedActions() throws {
        let now = try XCTUnwrap(ClimesaDates.parse("2026-11-15T12:00:00.000Z"))
        let list = try decode("[" + [
            #"{"# + base + #","state":"hospitalizado","allowedActions":["firmar_alta"],"dischargeRequestedAt":"2026-11-15T11:55:00.000Z"}"#,
            #"{"# + base.replacingOccurrences(of: "\"a1\"", with: "\"a2\"") + #","state":"hospitalizado","allowedActions":[]}"#
        ].joined(separator: ",") + "]")
        let signable = HospitalizedRowActions.of(list[0], now: now)
        XCTAssertTrue(signable.sign)
        XCTAssertFalse(signable.revoke)
        XCTAssertEqual(signable.requestHint, "Recepción pidió el alta hace 5 min.")
        let none = HospitalizedRowActions.of(list[1], now: now)
        XCTAssertFalse(none.sign)
        XCTAssertFalse(none.revoke)
        XCTAssertNil(none.requestHint)
    }

    func testLaListaIncluyeLasAltasFirmadasSinSalida() throws {
        let list = try decode("[" + ["hospitalizado", "pendiente_cama", "alta_firmada", "egresado", "cancelada"].enumerated().map { index, state in
            #"{"# + base.replacingOccurrences(of: "\"a1\"", with: "\"a\(index)\"") + #","state":"\#(state)"}"#
        }.joined(separator: ",") + "]")
        XCTAssertEqual(DischargeRules.listed(list).map(\.state), [.hospitalizado, .pendienteCama, .altaFirmada])
        XCTAssertEqual(DischargeRules.current(list).count, 2)
    }

    func testTiempoRelativo() throws {
        let now = try XCTUnwrap(ClimesaDates.parse("2026-11-15T12:00:00.000Z"))
        XCTAssertEqual(RelativeTime.text(now.addingTimeInterval(-20), now: now), "hace un momento")
        XCTAssertEqual(RelativeTime.text(now.addingTimeInterval(-3 * 3600), now: now), "hace 3 h")
        XCTAssertEqual(RelativeTime.text(now.addingTimeInterval(-86_400), now: now), "hace 1 día")
        XCTAssertEqual(RelativeTime.text(now.addingTimeInterval(-3 * 86_400), now: now), "hace 3 días")
        XCTAssertEqual(RelativeTime.text(now.addingTimeInterval(60), now: now), "hace un momento")
    }

    func testMotivoDeRevocacion() {
        XCTAssertEqual(DischargeRevocationRules.reasonError(""), "Escribe el motivo para revocar el alta.")
        XCTAssertEqual(DischargeRevocationRules.reasonError(" corto "), "El motivo necesita al menos 10 caracteres (llevas 5).")
        XCTAssertNil(DischargeRevocationRules.reasonError("El paciente presentó fiebre de nuevo."))
        XCTAssertNotNil(DischargeRevocationRules.reasonError(String(repeating: "a", count: 501)))
        let body = DischargeRevocationBody(version: 4, reason: "  El paciente presentó fiebre de nuevo.\n")
        XCTAssertEqual(body, DischargeRevocationBody(version: 4, reason: "El paciente presentó fiebre de nuevo."))
    }

    func testAltaVoluntariaYPendientesConResponsable() {
        XCTAssertNotNil(DischargeRules.errors(type: .voluntaria, summary: "", voluntaryConsent: false, pending: [])["voluntaryConsent"])
        XCTAssertNotNil(DischargeRules.errors(type: .traslado, summary: "corto", voluntaryConsent: false, pending: [])["summary"])
        XCTAssertNotNil(DischargeRules.errors(type: .medica, summary: "", voluntaryConsent: false, pending: [DischargePendingBody(description: "Control", responsible: " ")])["pending"])
        XCTAssertTrue(DischargeRules.errors(type: .defuncion, summary: "", voluntaryConsent: false, pending: []).isEmpty)
    }

    func testCodigosDelServidorEnEspanol() {
        let transition = APIFailure.from(status: 409, body: Data(#"{"status":409,"codigo":"transicion_invalida","detail":"Invalid transition from alta_firmada"}"#.utf8))
        XCTAssertEqual(transition.message, "La admisión cambió de estado; vuelve a cargar.")
        let spanish = APIFailure.from(status: 409, body: Data(#"{"status":409,"codigo":"transicion_invalida","detail":"La admisión ya no está hospitalizada."}"#.utf8))
        XCTAssertEqual(spanish.message, "La admisión ya no está hospitalizada.")
        let field = APIFailure.from(status: 400, body: Data(#"{"status":400,"codigo":"validacion","detail":"reason must be longer than or equal to 10 characters","campo":"reason"}"#.utf8))
        XCTAssertEqual(field.message, "Revisa el dato «motivo» e inténtalo de nuevo.")
        XCTAssertEqual(field.fieldErrors["reason"], "Revisa este dato.")
        let version = APIFailure.from(status: 409, body: Data(#"{"status":409,"codigo":"version_conflicto","detail":"Version mismatch"}"#.utf8))
        XCTAssertTrue(version.message.hasPrefix("Otra persona cambió este registro."))
    }
}

final class ProblemFieldLabelTests: XCTestCase {
    func testUnCampoDesconocidoNoMuestraSuNombreEnIngles() {
        let failure = APIFailure.from(status: 400, body: Data(#"{"status":400,"codigo":"validacion","detail":"foo must be a string","campo":"foo"}"#.utf8))
        XCTAssertEqual(failure.message, "Revisa los datos e inténtalo de nuevo.")
        XCTAssertEqual(ProblemText.fieldLabel("pending[0].responsible"), "pendientes")
        XCTAssertNil(ProblemText.fieldLabel("foo"))
    }
}
