import XCTest
@testable import ClimesaCore

/// Fase 2R U9-ios: the admission indication comes from the server, and the diagnosis code from the CIE-10 search.
final class ConsultationSweepTests: XCTestCase {
    private func admission(_ id: String, patient: String = "p1", state: String, originId: String? = "k1") -> Admission {
        let originJSON = originId.map { "\"\($0)\"" } ?? "null"
        let json = #"{"id":"\#(id)","patientId":"\#(patient)","patientName":"Paciente Uno","origin":"consulta","originId":\#(originJSON),"requestedCategory":"semiprivada","state":"\#(state)","isolation":false,"scheduledAt":null,"attendingDoctorId":"d1","version":2,"bed":"","allowedActions":[]}"#
        return try! JSONDecoder().decode(Admission.self, from: Data(json.utf8))
    }

    // MARK: admission indication

    func testLaIndicacionDeEstaConsultaYaHechaSeMuestraHecha() {
        let rows = [admission("a1", state: "pendiente_cama")]
        XCTAssertEqual(rows[0].originId, "k1")
        let found = AdmissionIndicationRules.existing(rows, patientId: "p1", consultationId: "k1")
        XCTAssertEqual(found?.id, "a1")
        XCTAssertEqual(found.map { AdmissionIndicationRules.fromThisConsultation($0, consultationId: "k1") }, true)
    }

    func testOtraAdmisionActivaDelPacienteTambienImpideIndicar() {
        let rows = [admission("a2", state: "hospitalizado", originId: "otra")]
        let found = AdmissionIndicationRules.existing(rows, patientId: "p1", consultationId: "k1")
        XCTAssertEqual(found?.id, "a2")
        XCTAssertEqual(found.map { AdmissionIndicationRules.fromThisConsultation($0, consultationId: "k1") }, false)
    }

    func testPrefiereLaDeEstaConsultaEIgnoraCerradasYOtrosPacientes() {
        let rows = [
            admission("closed", state: "egresado"),
            admission("cancelled", state: "cancelada"),
            admission("other", patient: "p2", state: "pendiente_cama"),
        ]
        XCTAssertNil(AdmissionIndicationRules.existing(rows, patientId: "p1", consultationId: "k1"))
        let mixed = [admission("x", state: "alta_firmada", originId: "otra"), admission("mine", state: "pendiente_cama")]
        XCTAssertEqual(AdmissionIndicationRules.existing(mixed, patientId: "p1", consultationId: "k1")?.id, "mine")
    }

    func testServidorAnteriorSinOrigenSigueLeyendo() {
        let old = admission("a1", state: "hospitalizado", originId: nil)
        XCTAssertNil(old.originId)
        XCTAssertEqual(AdmissionIndicationRules.existing([old], patientId: "p1", consultationId: "k1")?.id, "a1")
    }

    // MARK: CIE-10

    func testBuscaDesdeDosCaracteres() {
        XCTAssertNil(Cie10SearchRules.query(" j "))
        XCTAssertEqual(Cie10SearchRules.query("  J4 "), "J4")
        XCTAssertEqual(Cie10SearchRules.path("J45"), "/consultas/cie10?q=J45")
        XCTAssertEqual(Cie10SearchRules.path("dolor de cabeza"), "/consultas/cie10?q=dolor%20de%20cabeza")
        XCTAssertEqual(Cie10SearchRules.path("a&b=c+d#"), "/consultas/cie10?q=a%26b%3Dc%2Bd%23")
        XCTAssertEqual(Cie10SearchRules.path("cefalea ñ"), "/consultas/cie10?q=cefalea%20%C3%B1")
    }

    func testLeeLaRespuestaYElTituloDelResultado() throws {
        let rows = try JSONDecoder().decode([Cie10Entry].self, from: Data(#"[{"code":"J45.9","description":"Asma no especificada"}]"#.utf8))
        XCTAssertEqual(rows.first?.id, "J45.9")
        XCTAssertEqual(rows.first.map(Cie10SearchRules.title), "J45.9 · Asma no especificada")
    }

    func testElDiagnosticoSaleDeUnResultadoElegido() {
        XCTAssertEqual(ConsultationRules.diagnosisSelectionError(nil), "Busca y elige el diagnóstico CIE-10.")
        XCTAssertNil(ConsultationRules.diagnosisSelectionError(Cie10Entry(code: "J45.9", description: "Asma no especificada")))
    }
}
