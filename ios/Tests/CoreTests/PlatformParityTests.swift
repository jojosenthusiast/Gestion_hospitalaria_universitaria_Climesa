import XCTest
@testable import ClimesaCore

/// Fase 2, T16: rules ported from the web so iOS shows the same states and texts as the reference platform.
final class PlatformParityTests: XCTestCase {
    private func order(state: String, reviewed: Bool = false, actions: String = "[]", amendedAt: String? = nil) -> LabOrder {
        let amended = amendedAt.map { #","amendedAt":"\#($0)""# } ?? ""
        let json = #"{"id":"o1","consultationId":"k1","patientId":"p1","doctorId":"d1","priority":"rutina","state":"\#(state)","createdAt":"2026-11-20T10:00:00Z","sampleTakenAt":null,"completedAt":null,"reviewedAt":\#(reviewed ? "\"2026-11-20T18:00:00Z\"" : "null"),"version":3,"patientName":null,"items":[],"allowedActions":\#(actions)\#(amended)}"#
        return try! JSONDecoder().decode(LabOrder.self, from: Data(json.utf8))
    }

    // MARK: - Status families (web components/system.tsx)

    func testFamiliasDeEstadoIgualesALaWeb() {
        let expected: [String: StatusFamily] = [
            "por_vencer": .espera, "revisar": .espera, "bajo_minimo": .espera,
            "ok": .listo, "coincide": .listo, "atendido": .listo
        ]
        for (value, family) in expected { XCTAssertEqual(StatusFamily.of(value), family, value) }
        // R1: «agotado» asks for attention: urgent priority, never a closed (grey) family.
        XCTAssertNil(StatusFamily.of("agotado"))
        XCTAssertEqual(StatusBadgeStyle.of("agotado").priority, .urgente)
        let labels = ["atendido": "Atendido", "agotado": "Agotado", "por_vencer": "Por vencer", "ok": "En orden",
                      "coincide": "Coincide", "revisar": "Revisar"]
        for (value, label) in labels { XCTAssertEqual(StatusBadgeStyle.of(value).label, label, value) }
    }

    func testTransicionInvalidaNoNombraLaAdmision() {
        let failure = APIFailure.from(status: 409, body: Data(#"{"status":409,"codigo":"transicion_invalida","detail":"Invalid transition from en_espera"}"#.utf8))
        XCTAssertEqual(failure.message, "El registro cambió de estado; vuelve a cargar.")
    }

    // MARK: - Laboratory (web laboratory.tsx)

    func testOrdenSinRevisarNoSeVeTerminada() {
        XCTAssertEqual(PatientLabRules.badgeValue(order(state: "completado")), "en_espera")
        XCTAssertEqual(StatusFamily.of(PatientLabRules.badgeValue(order(state: "completado"))), .espera)
        XCTAssertEqual(PatientLabRules.badgeValue(order(state: "completado", reviewed: true)), "firmada")
        XCTAssertEqual(PatientLabRules.badgeValue(order(state: "cancelado")), "cancelado")
        XCTAssertEqual(PatientLabRules.badgeValue(order(state: "en_proceso")), "en_proceso")
    }

    func testSoloUnaOrdenCompletadaSinRevisarEsperaAlMedico() {
        XCTAssertTrue(PatientLabRules.awaitsReview(order(state: "completado")))
        XCTAssertFalse(PatientLabRules.awaitsReview(order(state: "cancelado")))
        XCTAssertFalse(PatientLabRules.awaitsReview(order(state: "pendiente")))
        XCTAssertFalse(PatientLabRules.awaitsReview(order(state: "completado", reviewed: true)))
    }

    func testExamenesPendientesSoloCuentaLosQueSiguenEnLaboratorio() {
        let orders = [order(state: "pendiente"), order(state: "en_proceso"), order(state: "completado"),
                      order(state: "cancelado"), order(state: "completado", reviewed: true)]
        XCTAssertEqual(PatientLabRules.pendingCount(orders), 2)
    }

    func testPorRevisarSoloSiElMedicoPuedeRevisar() {
        XCTAssertEqual(ReviewRules.rowStatusKey(order(state: "completado", actions: #"["revisar"]"#)), "results.toReview")
        XCTAssertEqual(ReviewRules.rowStatusKey(order(state: "completado")), "results.awaitingReview")
        XCTAssertEqual(ReviewRules.rowStatusKey(order(state: "completado", actions: #"["revisar"]"#, amendedAt: "2026-11-20T12:00:00Z")), "results.amended")
        XCTAssertEqual(ReviewRules.rowStatusKey(order(state: "completado", amendedAt: "2026-11-20T12:00:00Z")), "results.awaitingReview")
    }

    // MARK: - Category requests (web appointments.tsx REQUEST_STATE)

    func testEstadoDeSolicitudComoLaWeb() {
        XCTAssertEqual(StatusFamily.of(CategoryRequestRules.badgeValue("pendiente")), .espera)
        XCTAssertEqual(CategoryRequestRules.badgeValue("asignada"), "confirmada")
        XCTAssertEqual(StatusFamily.of(CategoryRequestRules.badgeValue("rechazada")), .cerrado)
        XCTAssertEqual(StatusFamily.of(CategoryRequestRules.badgeValue("cancelada")), .cerrado)
        XCTAssertEqual(CategoryRequestRules.badgeValue("estado_futuro"), "estado_futuro")
        XCTAssertEqual(CategoryRequestRules.stateKey("asignada"), "appointments.category.state.asignada")
    }

    // MARK: - Queue moves

    func testConfirmacionDeMovimientoEnPasado() {
        XCTAssertEqual(QueueBoardRules.moveDone("CON 7", .llamar), "CON 7 llamado")
        XCTAssertEqual(QueueBoardRules.moveDone("CON 7", .deshacerLlamado), "CON 7 devuelto a espera")
        XCTAssertEqual(QueueBoardRules.moveDone("CON 7", .noSePresento), "CON 7 marcado como no se presentó")
    }

    // MARK: - Shifts (web shifts/week.ts displayState)

    func testTurnoPublicadoSeVeSegunSuHorario() {
        let start = ShiftAttendanceRules.date("2026-11-10T13:00:00Z"), end = ShiftAttendanceRules.date("2026-11-10T21:00:00Z")
        let before = ShiftAttendanceRules.date("2026-11-10T12:00:00Z")!
        let during = ShiftAttendanceRules.date("2026-11-10T15:00:00Z")!
        let after = ShiftAttendanceRules.date("2026-11-10T22:00:00Z")!
        XCTAssertEqual(ShiftAttendanceRules.displayState("publicado", start: start, end: end, now: before), "publicado")
        XCTAssertEqual(ShiftAttendanceRules.displayState("publicado", start: start, end: end, now: during), "en_curso")
        XCTAssertEqual(ShiftAttendanceRules.displayState("publicado", start: start, end: end, now: after), "completado")
        XCTAssertEqual(ShiftAttendanceRules.displayState("cancelado", start: start, end: end, now: during), "cancelado")
        XCTAssertEqual(ShiftAttendanceRules.displayState("publicado", start: nil, end: end, now: during), "publicado")
    }

    // MARK: - Area by space name (web components/identity.tsx AREA_NAMES)

    func testAreaPorNombreDelEspacioComoLaWeb() {
        let expected: [String: AreaCode] = [
            "Emergencia": .emg, "Laboratorio": .lab, "Hospitalización semiprivada": .hos, "Consulta externa": .con,
            "Recepción": .rec, "Ambulancia": .amb, "Bodega central": .gen, "P1-EMG": .emg, "C-101": .con
        ]
        for (name, area) in expected { XCTAssertEqual(AreaCode.of(name: name), area, name) }
        XCTAssertEqual(AreaCode.of(name: nil), .gen)
    }
}
