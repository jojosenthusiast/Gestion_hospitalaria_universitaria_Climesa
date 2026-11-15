import XCTest
@testable import ClimesaCore

/// CITA-01, CITA-02, CITA-04 y FILA-01: las acciones las decide el servidor (`allowedActions`/`blockedActions`).
final class ServerActionsTests: XCTestCase {
    private func decode<T: Decodable>(_ type: T.Type, _ json: String) throws -> T {
        try JSONDecoder().decode(T.self, from: Data(json.utf8))
    }

    private let appointmentJSON = """
    {"id":"a","patientId":"p","patientName":"Paciente Ficticio","doctorId":"d","doctorName":"Dra. Demo","start":"2026-11-20T18:00:00Z",
     "end":"2026-11-20T18:20:00Z","reason":null,"state":"confirmada","origin":"paciente","rejectionReason":null,"version":3,
     "rescheduledFromId":null,"rescheduledToId":null,"cancelableUntil":"2026-11-20T16:00:00Z",
     "reschedule":{"id":"r","start":"2026-11-21T15:00:00Z","end":"2026-11-21T15:20:00Z","state":"pendiente","origin":"paciente","reason":null,"rejectionReason":null,"version":1},
     "allowedActions":["cancelar","accion_futura"],
     "blockedActions":[{"action":"reprogramar","reason":"Ya hay una solicitud de reprogramación pendiente."}]}
    """

    func testCitaConAccionesDelServidor() throws {
        let appointment = try decode(Appointment.self, appointmentJSON)
        XCTAssertEqual(appointment.allowedActions, [.cancelar, .desconocido])
        XCTAssertEqual(appointment.reschedule?.state, .pendiente)
        let now = ClimesaDates.parse("2026-11-20T14:00:00Z")!
        XCTAssertEqual(AppointmentRules.cancelOption(appointment, now: now), .allowed(deadline: ClimesaDates.parse("2026-11-20T16:00:00Z")!))
        XCTAssertFalse(AppointmentRules.canReschedule(appointment))
        XCTAssertEqual(AppointmentRules.blockedReason(appointment, .reprogramar), "Ya hay una solicitud de reprogramación pendiente.")
        XCTAssertNotNil(AppointmentRules.rescheduleText(appointment))
    }

    func testCancelarBloqueadoMuestraElMotivoDelServidor() throws {
        let json = appointmentJSON.replacingOccurrences(of: "\"allowedActions\":[\"cancelar\",\"accion_futura\"]", with: "\"allowedActions\":[]")
            .replacingOccurrences(of: "\"action\":\"reprogramar\"", with: "\"action\":\"cancelar\"")
        let appointment = try decode(Appointment.self, json)
        XCTAssertEqual(AppointmentRules.cancelOption(appointment, now: Date()), .blocked(reason: "Ya hay una solicitud de reprogramación pendiente."))
    }

    func testEstadosNuevosTienenEtiqueta() throws {
        XCTAssertEqual(AppointmentState(rawValue: "vencida")?.label, "Vencida")
        XCTAssertEqual(AppointmentState(rawValue: "reprogramada")?.label, "Reprogramada")
        XCTAssertEqual(QueueState(rawValue: "cerrado")?.label, "Cerrado sin atender")
    }

    func testNumeroDeFilaConAccionesBloqueadas() throws {
        let ticket = try decode(QueueTicket.self, """
        {"id":"t","service":"consulta_general","fecha":"2026-11-20","numero":4,"patientId":null,"patientName":null,"state":"llamado","officeId":null,
         "llamados":1,"version":2,"issuedAt":"2026-11-20T14:00:00Z","consultationId":null,"consultationState":null,"maxCalls":3,"callsForAbsence":3,
         "allowedActions":["llamar","atender"],"blockedActions":[{"action":"no_se_presento","reason":"Disponible después de 3 llamados (van 1)."}]}
        """)
        XCTAssertEqual(ticket.allowedActions, [.llamar, .atender])
        XCTAssertEqual(ticket.blockedActions?.first?.action, .noSePresento)
        XCTAssertEqual(ticket.callsForAbsence, 3)
    }

    func testRespuestaAnteriorSinAccionesSigueDecodificando() throws {
        let appointment = try decode(Appointment.self, """
        {"id":"a","patientId":"p","patientName":null,"doctorId":"d","doctorName":"Dra. Demo","start":"2026-11-20T18:00:00Z","end":"2026-11-20T18:20:00Z",
         "reason":null,"state":"confirmada","origin":"paciente","rejectionReason":null,"version":1}
        """)
        XCTAssertNil(appointment.allowedActions)
        XCTAssertNil(AppointmentRules.rescheduleText(appointment))
    }

    func testCuerposDeReprogramacionYLlamarSiguiente() throws {
        let body = try JSONSerialization.jsonObject(with: JSONEncoder().encode(AppointmentRescheduleBody(version: 3, start: "s", end: "e"))) as? [String: Any]
        XCTAssertEqual(body?["version"] as? Int, 3)
        let next = try JSONSerialization.jsonObject(with: JSONEncoder().encode(QueueCallNextBody(service: "consulta_general"))) as? [String: Any]
        XCTAssertEqual(next?["service"] as? String, "consulta_general")
    }
}
