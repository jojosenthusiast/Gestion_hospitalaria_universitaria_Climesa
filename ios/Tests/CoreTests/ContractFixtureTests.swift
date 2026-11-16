import XCTest
@testable import ClimesaCore

/// Cada cuerpo de escritura crítico es igual al `body` de su ejemplo en `Fixtures/contract/<nombre>.json` (`{ method, path, body }`). La API valida esos
/// mismos archivos contra `contrato/openapi.json`, así un cambio de contrato rompe una de las dos pruebas.
final class ContractFixtureTests: XCTestCase {
    private let patient = "11111111-1111-4111-8111-111111111111"
    private let consultation = "22222222-2222-4222-8222-222222222222"
    private let doctor = "33333333-3333-4333-8333-333333333333"

    func testIndicacionDeHospitalizacionDesdeLaConsulta() throws {
        let body = AdmissionBody(patientId: patient, consultationId: consultation, category: .semiprivada, isolation: true,
                                 motive: "  Neumonía con saturación de 88 %; requiere oxígeno y antibiótico intravenoso.\n")
        try assertMatches(body, fixture: "admission-indication")
    }

    func testSolicitudDeCita() throws {
        let body = AppointmentRequestBody(doctorId: doctor, start: "2026-11-20T15:00:00.000Z", end: "2026-11-20T15:30:00.000Z", reason: "Control de presión arterial")
        try assertMatches(body, fixture: "appointment-request")
    }

    func testSolicitudDeCitaPorMotivoYRetiro() throws {
        let body = CategoryRequestRules.body(picked: ["piel", "alergias"], franja: .tarde, note: " Mancha en el brazo desde hace un mes ", preferredDoctorId: doctor)
        try assertMatches(body, fixture: "appointment-category-request")
        try assertMatches(VersionBody(version: 2), fixture: "appointment-category-withdraw")
    }

    func testCancelacionDeCita() throws {
        try assertMatches(AppointmentCancelBody(version: 2, reason: "No podré asistir por un compromiso de trabajo."), fixture: "appointment-cancel")
    }

    func testCancelacionDeOrdenDeLaboratorio() throws {
        XCTAssertEqual(LabCancelRules.path("o1"), "/laboratorio/ordenes/o1/cancelar")
        try assertMatches(LabCancelRules.body(version: 2, reason: "  El paciente no se presentó a la toma "), fixture: "lab-order-cancel")
    }

    func testInicioDeConsultaDesdeUnaCita() throws {
        try assertMatches(ConsultationStartBody(appointmentId: "44444444-4444-4444-8444-444444444444"), fixture: "consultation-start")
    }

    func testInicioDeConsultaDesdeUnTicketDeLaFila() throws {
        try assertMatches(ConsultationStartBody(ticketId: "55555555-5555-4555-8555-555555555555"), fixture: "consultation-start-ticket")
    }

    func testReceta() throws {
        let body = PrescriptionBody(items: [
            PrescriptionItemBody(medication: "Amoxicilina 500 mg", dose: "1 cápsula", route: "oral", frequency: "cada 8 horas", duration: "7 días", instructions: "Tomar con alimentos"),
            PrescriptionItemBody(medication: "Acetaminofén 500 mg", dose: "1 tableta", route: "oral", frequency: "cada 6 horas si hay fiebre", duration: "3 días", instructions: nil)
        ])
        try assertMatches(body, fixture: "prescription")
    }

    func testAlta() throws {
        let body = DischargeBody(type: .medica, version: 3, summary: "Evolución favorable; afebril 48 horas y saturación normal sin oxígeno.", voluntaryConsent: nil,
                                 pending: [DischargePendingBody(description: "Control en consulta externa en 7 días", responsible: "Paciente")])
        try assertMatches(body, fixture: "discharge")
    }

    func testContactoDelPropioPaciente() throws {
        let body = PatientProfileRules.body(version: 4, phone: " 7777-7777 ", email: "paciente.demo@example.com", address: "Colonia Escalón, San Salvador\n")
        try assertMatches(body, fixture: "me-paciente")
    }

    private func assertMatches<Body: Encodable>(_ body: Body, fixture name: String, file: StaticString = #filePath, line: UInt = #line) throws {
        let url = try XCTUnwrap(Bundle.module.url(forResource: name, withExtension: "json", subdirectory: "Fixtures/contract"), "Falta Fixtures/contract/\(name).json", file: file, line: line)
        let fixture = try JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? NSDictionary
        XCTAssertNotNil(fixture?["method"] as? String, "\(name): falta method", file: file, line: line)
        XCTAssertEqual((fixture?["path"] as? String)?.hasPrefix("/api/v1/"), true, "\(name): path debe empezar con /api/v1/", file: file, line: line)
        let expected = fixture?["body"] as? NSDictionary
        let encoded = try JSONBody.encode(body)
        let actual = try JSONSerialization.jsonObject(with: encoded) as? NSDictionary
        let text = String(decoding: encoded, as: UTF8.self)
        XCTAssertNotNil(expected, file: file, line: line)
        XCTAssertEqual(actual, expected, "\(name): \(text)", file: file, line: line)
    }

    /// MA-AMB-05: cancelación de la solicitud propia (la entrega al hospital, MA-AMB-04, no lleva cuerpo).
    func testCancelacionDeSolicitudDeAmbulancia() throws {
        try assertMatches(AmbulanceCancelBody(version: 1, reason: "  Me llevó un familiar \n"), fixture: "ambulance-request-cancel")
        XCTAssertNil(AmbulanceCancelBody(version: 1, reason: "   ").reason)
    }
}
