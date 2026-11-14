import XCTest
@testable import ClimesaCore

/// MOV-03: errores de validación por campo y nunca inglés crudo del servidor.
final class FieldErrorTests: XCTestCase {
    func testErroresPorCampoEnEspanolJuntoAlCampo() {
        let body = Data(#"{"type":"urn:sghu:error:validacion","title":"Datos no válidos","status":400,"codigo":"validacion","detail":"Revisa los datos marcados.","campo":"motive","requestId":"req-1","errors":[{"field":"motive","message":"El motivo debe tener entre 10 y 500 caracteres."},{"field":"pending[0].description","message":"Describe el pendiente."}]}"#.utf8)
        let failure = APIFailure.from(status: 400, body: body)
        XCTAssertEqual(failure.fieldErrors["motive"], "El motivo debe tener entre 10 y 500 caracteres.")
        XCTAssertEqual(failure.fieldErrors["pending"], "Describe el pendiente.")
        XCTAssertEqual(failure.fieldErrors["pending[0].description"], "Describe el pendiente.")
        XCTAssertEqual(failure.message, "Revisa los datos marcados. (código de soporte: req-1)")
    }

    func testElInglesDeClassValidatorNuncaSeMuestra() {
        let body = Data(#"{"type":"x","title":"Datos no válidos","status":400,"codigo":"validacion","detail":"motive must be longer than or equal to 10 characters","campo":"motive","requestId":"req-2"}"#.utf8)
        let failure = APIFailure.from(status: 400, body: body)
        XCTAssertEqual(failure.message, "Revisa los datos e inténtalo de nuevo. (código de soporte: req-2)")
        XCTAssertTrue(failure.fieldErrors.isEmpty)
    }

    func testSinErroresPorCampoElDetalleEnEspanolVaAlCampoIndicado() {
        let body = Data(#"{"type":"x","title":"Datos no válidos","status":400,"codigo":"validacion","detail":"El teléfono debe tener 8 dígitos.","campo":"phone","requestId":"req-3"}"#.utf8)
        XCTAssertEqual(APIFailure.from(status: 400, body: body).fieldErrors, ["phone": "El teléfono debe tener 8 dígitos."])
    }

    func testTextoMostrable() {
        XCTAssertTrue(ProblemText.isShowable("La cita ya empezó o pasó; no se puede cancelar."))
        XCTAssertFalse(ProblemText.isShowable("property foo should not exist"))
        XCTAssertFalse(ProblemText.isShowable("Internal server error"))
        XCTAssertFalse(ProblemText.isShowable("  "))
    }
}

/// MOV-01: indicación de hospitalización desde la consulta.
final class AdmissionRulesTests: XCTestCase {
    func testElMotivoEsObligatorioYDe10A500Caracteres() {
        XCTAssertEqual(AdmissionRules.motiveError("   "), "Escribe el motivo de la hospitalización.")
        XCTAssertEqual(AdmissionRules.motiveError("Neumonía"), "El motivo necesita al menos 10 caracteres (llevas 8).")
        XCTAssertNil(AdmissionRules.motiveError(" Neumonía grave "))
        XCTAssertNil(AdmissionRules.motiveError(String(repeating: "a", count: 500)))
        XCTAssertEqual(AdmissionRules.motiveError(String(repeating: "a", count: 501)), "El motivo admite hasta 500 caracteres (llevas 501).")
        XCTAssertEqual(AdmissionRules.motiveCount("  abc \n"), 3)
    }

    func testElCuerpoLlevaLaConsultaComoOrigenYAlMedicoComoTratante() throws {
        let body = AdmissionBody(patientId: "p", consultationId: "c", category: .vip, isolation: false, attendingDoctorId: "d", motive: " Motivo suficiente ")
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONBody.encode(body)) as? [String: Any])
        XCTAssertEqual(json["origin"] as? String, "consulta")
        XCTAssertEqual(json["originId"] as? String, "c")
        XCTAssertEqual(json["attendingDoctorId"] as? String, "d")
        XCTAssertEqual(json["motive"] as? String, "Motivo suficiente")
        XCTAssertNil(json["reason"])
    }
}

/// CITA-04 y RN-21: el paciente ve el plazo para cancelar y no se le ofrece cancelar dentro de las 2 h.
final class CancelOptionTests: XCTestCase {
    private func appointment(_ start: String, _ state: AppointmentState = .confirmada) -> Appointment {
        Appointment(id: "a", patientId: "p", patientName: nil, doctorId: "d", doctorName: "Dra. Demo", start: start, end: start, reason: nil,
                    state: state, origin: "paciente", rejectionReason: nil, version: 1)
    }
    private let now = ClimesaDates.parse("2026-11-20T14:00:00Z")!

    func testCancelaHastaDosHorasAntes() {
        let option = AppointmentRules.cancelOption(appointment("2026-11-20T18:00:00Z"), now: now)
        XCTAssertEqual(option, .allowed(deadline: ClimesaDates.parse("2026-11-20T16:00:00Z")!))
    }

    func testDentroDelPlazoQuedaDesactivada() {
        XCTAssertEqual(AppointmentRules.cancelOption(appointment("2026-11-20T15:30:00Z"), now: now), .tooLate(deadline: ClimesaDates.parse("2026-11-20T13:30:00Z")!))
    }

    func testCitaPasadaOFinalNoOfreceCancelar() {
        XCTAssertEqual(AppointmentRules.cancelOption(appointment("2026-11-20T13:00:00Z"), now: now), .hidden)
        XCTAssertEqual(AppointmentRules.cancelOption(appointment("2026-11-21T18:00:00Z", .cancelada), now: now), .hidden)
    }

    func testElPlazoSeMuestraEnHoraDeElSalvador() {
        // 16:00 UTC son las 10:00 en El Salvador; mismo día local que `now` (08:00 local).
        let text = AppointmentRules.cancelDeadlineText(ClimesaDates.parse("2026-11-20T16:00:00Z")!, now: now)
        XCTAssertTrue(text.hasPrefix("Puedes cancelar hasta las "), text)
        XCTAssertTrue(text.contains("10:00"), text)
        XCTAssertFalse(text.contains(" del "), text)
        let otherDay = AppointmentRules.cancelDeadlineText(ClimesaDates.parse("2026-11-22T16:00:00Z")!, now: now)
        XCTAssertTrue(otherDay.contains(" del "), otherDay)
    }
}

/// MA-OPS-01: arranque en frío del servidor.
final class ColdStartPolicyTests: XCTestCase {
    private let now = Date(timeIntervalSince1970: 1_800_000_000)

    func testSinRespuestasRecientesSeEsperaHasta90Segundos() {
        XCTAssertEqual(ColdStartPolicy.timeout(path: "/citas", lastSuccess: nil, now: now), 90)
        XCTAssertEqual(ColdStartPolicy.timeout(path: "/citas", lastSuccess: now.addingTimeInterval(-15 * 60), now: now), 90)
        XCTAssertEqual(ColdStartPolicy.timeout(path: "/citas", lastSuccess: now.addingTimeInterval(-60), now: now), 30)
        XCTAssertEqual(ColdStartPolicy.timeout(path: "/auth/me", lastSuccess: now, now: now), 90)
    }

    func testSoloLasLecturasSeReintentanConEsperaCreciente() {
        XCTAssertTrue(ColdStartPolicy.shouldRetry(method: "GET", failure: .transport, attempt: 0))
        XCTAssertTrue(ColdStartPolicy.shouldRetry(method: "GET", failure: .http(status: 503, problem: nil), attempt: 2))
        XCTAssertFalse(ColdStartPolicy.shouldRetry(method: "GET", failure: .transport, attempt: 3))
        XCTAssertFalse(ColdStartPolicy.shouldRetry(method: "POST", failure: .transport, attempt: 0))
        XCTAssertFalse(ColdStartPolicy.shouldRetry(method: "GET", failure: .http(status: 400, problem: nil), attempt: 0))
        XCTAssertFalse(ColdStartPolicy.shouldRetry(method: "GET", failure: .sessionExpired, attempt: 0))
        XCTAssertEqual((0..<3).map(ColdStartPolicy.delay(beforeRetry:)), [2, 5, 10])
        XCTAssertEqual(ColdStartPolicy.wakingMessage, "El servidor se está activando, puede tardar hasta un minuto.")
    }
}

/// El día de una cita es el de El Salvador aunque el teléfono esté en otra zona horaria.
final class LocalDayTests: XCTestCase {
    func testElDiaLocalEsElDeElSalvador() {
        // 05:30 UTC del 20 son las 23:30 del 19 en El Salvador.
        XCTAssertEqual(ClimesaDates.localDay(ClimesaDates.parse("2026-11-20T05:30:00Z")!), "2026-11-19")
        XCTAssertEqual(ClimesaDates.localDay(ClimesaDates.parse("2026-11-20T06:00:00Z")!), "2026-11-20")
    }

    func testElCalendarioDeLosSelectoresUsaLaZonaDelHospital() {
        let calendar = ClimesaDates.calendar
        XCTAssertEqual(calendar.timeZone.identifier, "America/El_Salvador")
        // Medianoche del día elegido en ese calendario siempre da ese mismo día local.
        let picked = calendar.date(from: DateComponents(year: 2026, month: 11, day: 20))!
        XCTAssertEqual(ClimesaDates.localDay(picked), "2026-11-20")
    }
}
