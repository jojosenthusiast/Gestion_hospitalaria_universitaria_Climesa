import XCTest
@testable import ClimesaCore

/// MA-LAB-05 (cancelar con motivo, paridad con la web) y MA-LAB-04 (aviso de valor crítico al médico).
final class LabActionsTests: XCTestCase {
    private func order(_ id: String, state: String = "completado", mark: String = "normal", reviewed: Bool = false,
                       actions: String? = nil, amendedAt: String? = nil, createdAt: String = "2026-11-20T10:00:00Z") -> LabOrder {
        let actionsField = actions.map { #","allowedActions":\#($0)"# } ?? ""
        let amendedField = amendedAt.map { #","amendedAt":"\#($0)""# } ?? ""
        let json = #"{"id":"\#(id)","consultationId":"k1","patientId":"p1","doctorId":"d1","priority":"rutina","state":"\#(state)","createdAt":"\#(createdAt)","sampleTakenAt":null,"completedAt":null,"reviewedAt":\#(reviewed ? "\"2026-11-20T18:00:00Z\"" : "null"),"version":3,"patientName":null,"items":[{"id":"i\#(id)","examId":"e1","code":"K","name":"Potasio","unit":"mmol/L","result":{"value":7,"text":null,"mark":"\#(mark)"}}]\#(actionsField)\#(amendedField)}"#
        return try! JSONDecoder().decode(LabOrder.self, from: Data(json.utf8))
    }

    func testLeeAccionesPermitidasEnmiendaYUnidad() {
        let amended = order("1", actions: #"["revisar","otra_futura"]"#, amendedAt: "2026-11-20T12:00:00Z")
        XCTAssertTrue(amended.allows(.revisar))
        XCTAssertFalse(amended.allows(.cancelar))
        XCTAssertEqual(amended.amendedAt, "2026-11-20T12:00:00Z")
        XCTAssertEqual(amended.items.first?.unit, "mmol/L")
        XCTAssertTrue(ReviewRules.isAmendedPendingReview(amended))
    }

    func testSinAccionesEnServidorAnteriorNoHayBotones() {
        let old = order("1")
        XCTAssertEqual(old.allowedActions, [])
        XCTAssertNil(old.amendedAt)
        XCTAssertFalse(old.allows(.revisar))
        XCTAssertFalse(ReviewRules.isAmendedPendingReview(old))
        XCTAssertFalse(ReviewRules.isAmendedPendingReview(order("2", reviewed: true, amendedAt: "2026-11-20T12:00:00Z")))
    }

    func testCriticosPorRevisarSoloCuentaLosQueElMedicoPuedeRevisar() {
        let orders = [
            order("1", mark: "critico_alto", actions: #"["revisar"]"#),
            order("2", mark: "critico_bajo", actions: #"["revisar"]"#),
            order("3", mark: "alto", actions: #"["revisar"]"#),
            order("4", mark: "critico_alto", actions: "[]")
        ]
        XCTAssertEqual(ReviewRules.criticalToReview(orders), 2)
        XCTAssertEqual(ReviewRules.criticalToReview([]), 0)
    }

    func testCancelablesSalenDeAllowedActions() {
        let orders = [
            order("b", state: "en_proceso", actions: #"["cancelar"]"#, createdAt: "2026-11-20T11:00:00Z"),
            order("a", state: "pendiente", actions: #"["cancelar"]"#, createdAt: "2026-11-20T09:00:00Z"),
            order("c", state: "pendiente", actions: "[]")
        ]
        XCTAssertEqual(ReviewRules.cancellable(orders).map(\.id), ["a", "b"])
    }

    func testMotivoDeCancelacionDe10A500Caracteres() {
        XCTAssertNotNil(LabCancelRules.reasonError("   "))
        XCTAssertNotNil(LabCancelRules.reasonError("  corto  "))
        XCTAssertNotNil(LabCancelRules.reasonError(String(repeating: "x", count: 501)))
        XCTAssertNil(LabCancelRules.reasonError("  Paciente no se presentó  "))
    }

    func testCuerpoDeCancelacionLlevaVersionYMotivoRecortado() throws {
        let body = LabCancelRules.body(version: 3, reason: "  Paciente no se presentó \n")
        XCTAssertEqual(body, LabOrderCancelBody(version: 3, reason: "Paciente no se presentó"))
        XCTAssertEqual(LabCancelRules.path("o1"), "/laboratorio/ordenes/o1/cancelar")
        let encoded = try JSONSerialization.jsonObject(with: JSONBody.encode(body)) as? NSDictionary
        XCTAssertEqual(encoded?.allKeys.count, 2)
    }
}
