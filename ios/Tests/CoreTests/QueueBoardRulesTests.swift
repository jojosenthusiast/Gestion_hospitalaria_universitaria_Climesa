import XCTest
@testable import ClimesaCore

/// Fase 2, flow B (S9): per-area code, priority, cited vs walk-in, board moves backed by server actions, and the
/// "who goes next" proposal from the API (also returned when signing a consultation).
final class QueueBoardRulesTests: XCTestCase {
    private func ticket(_ extra: String, state: String = "en_espera", number: Int = 7, service: String = "consulta_general") -> QueueTicket {
        let json = #"{"id":"t7","service":"\#(service)","fecha":"2026-11-20","numero":\#(number),"patientId":null,"patientName":"Paciente Ficticio","state":"\#(state)","officeId":null,"llamados":1,"version":3,"issuedAt":"2026-11-20T14:00:00Z"\#(extra)}"#
        return try! JSONDecoder().decode(QueueTicket.self, from: Data(json.utf8))
    }

    func testCodigoDeAreaPrioridadYCita() {
        let cited = ticket(#","area":"CON","priority":"urgente","appointmentAt":"2026-11-20T16:30:00Z","walkIn":false"#)
        XCTAssertEqual(QueueBoardRules.code(cited), "CON 7")
        XCTAssertEqual(QueueBoardRules.priorityLabel(QueueBoardRules.priority(cited)), "Urgente")
        XCTAssertEqual(QueueBoardRules.arrival(cited), "Cita 10:30")
        // An older API without the new fields: area from the service, routine, walk-in.
        let old = ticket("", service: "laboratorio")
        XCTAssertEqual(QueueBoardRules.code(old), "LAB 7")
        XCTAssertEqual(QueueBoardRules.priority(old), "rutina")
        XCTAssertEqual(QueueBoardRules.arrival(old), "Sin cita")
    }

    func testMovimientosSoloConAccionDelServidor() {
        let called = ticket(#","allowedActions":["atender"],"undoActions":["deshacer_llamado"]"#, state: "llamado")
        XCTAssertEqual(QueueBoardRules.destinations(called).map(\.column), [.espera, .atencion])
        XCTAssertEqual(QueueBoardRules.move(called, to: .cerrado), nil)
        XCTAssertEqual(QueueBoardRules.path(called, .deshacerLlamado), "/fila/t7/deshacer-llamado")
        let waiting = ticket(#","allowedActions":["llamar"]"#)
        XCTAssertEqual(QueueBoardRules.move(waiting, to: .atencion), nil, "waiting cannot jump to attention: call first")
        XCTAssertEqual(QueueBoardRules.move(waiting, to: .llamado), .llamar)
        XCTAssertEqual(QueueBoardRules.priorityChoices(waiting), ["emergencia", "urgente"])
        XCTAssertEqual(QueueBoardRules.priorityChoices(ticket("", state: "en_atencion")), [])
    }

    func testPropuestaAlFirmar() throws {
        let json = #"{"id":"c1","version":5,"state":"firmada","nextProposal":{"service":"consulta_general","area":"CON","rule":"Emergencias primero.","proposal":{"id":"t4","numero":4,"area":"CON","patientName":"Paciente Cuatro","priority":"emergencia","appointmentAt":null,"version":1,"reason":"emergencia","reasonText":"Emergencia: pasa antes que todos."}}}"#
        let signed = try JSONDecoder().decode(ConsultationCommandResult.self, from: Data(json.utf8))
        XCTAssertEqual(signed.nextProposal?.proposal?.code, "CON 4")
        XCTAssertEqual(signed.nextProposal?.proposal?.reasonText, "Emergencia: pasa antes que todos.")
        let none = try JSONDecoder().decode(ConsultationCommandResult.self, from: Data(#"{"id":"c1","version":5,"state":"firmada","nextProposal":null}"#.utf8))
        XCTAssertNil(none.nextProposal)
    }

    func testCuerposDeLaFila() throws {
        let callNext = try JSONSerialization.jsonObject(with: JSONEncoder().encode(QueueCallNextBody(service: "consulta_general"))) as? [String: Any]
        XCTAssertEqual(callNext?.keys.sorted(), ["service"], "without a consultorio the body stays as before")
        let priority = try JSONSerialization.jsonObject(with: JSONEncoder().encode(QueuePriorityBody(version: 2, priority: "emergencia"))) as? [String: Any]
        XCTAssertEqual(priority?["priority"] as? String, "emergencia")
    }
}
