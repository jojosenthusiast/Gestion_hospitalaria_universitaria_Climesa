import XCTest
@testable import ClimesaCore

/// Fase 2, flujo C (S10): «Resultados por revisar», órdenes externas y lista agrupada.
final class LabFollowUpTests: XCTestCase {
    private func order(_ id: String, state: String, reviewed: Bool = false, extra: String = "") -> LabOrder {
        let json = #"{"id":"\#(id)","consultationId":"k1","patientId":"p1","doctorId":"d1","priority":"rutina","state":"\#(state)","createdAt":"2026-11-20T10:00:00Z","sampleTakenAt":null,"completedAt":null,"reviewedAt":\#(reviewed ? "\"2026-11-20T18:00:00Z\"" : "null"),"version":3,"patientName":null,"items":[{"id":"i\#(id)","examId":"e1","code":"HB","name":"Hemoglobina","unit":"g/dL","result":{"value":13.4,"text":null,"mark":"normal","observation":"Muestra hemolizada","relevant":true}}]\#(extra)}"#
        return try! JSONDecoder().decode(LabOrder.self, from: Data(json.utf8))
    }

    func testLeeOrdenExternaYObservacion() {
        let external = order("1", state: "pendiente", extra: #","external":true,"externalPlace":"Clínica Ficticia","externalInstructions":"Sin ayuno. Traiga su DUI.","externalActions":["cargar_externo"]"#)
        XCTAssertTrue(external.external)
        XCTAssertEqual(external.externalPlace, "Clínica Ficticia")
        XCTAssertEqual(external.externalInstructions, "Sin ayuno. Traiga su DUI.")
        XCTAssertTrue(external.allowsExternal(.cargarExterno))
        XCTAssertFalse(external.allowsExternal(.enviarExterno))
        XCTAssertEqual(external.items.first?.result?.observation, "Muestra hemolizada")
        XCTAssertEqual(external.items.first?.result?.relevant, true)
        XCTAssertEqual(LabExternalRules.patientNote(external), "Hazte el examen en Clínica Ficticia y trae el informe.")
    }

    func testServidorAnteriorSinCamposExternos() {
        let old = order("1", state: "pendiente")
        XCTAssertFalse(old.external)
        XCTAssertNil(old.externalPlace)
        XCTAssertEqual(old.externalActions, [])
        XCTAssertNil(LabExternalRules.patientNote(old))
    }

    func testEnviarAExternoPideLugarEInstrucciones() {
        XCTAssertNotNil(LabExternalRules.sendError(place: "ab", instructions: "Instrucciones suficientes"))
        XCTAssertNotNil(LabExternalRules.sendError(place: "Clínica Ficticia", instructions: "corto"))
        XCTAssertNil(LabExternalRules.sendError(place: "Clínica Ficticia", instructions: "Sin ayuno. Traiga su DUI."))
        XCTAssertEqual(LabExternalRules.sendPath("o1"), "/laboratorio/ordenes/o1/externa")
    }

    func testBandejaDelMedicoConCriticosPrimero() throws {
        let json = #"[{"id":"f1","orderId":"o1","patientId":"p1","patientName":"Paciente Uno","patientRecord":null,"reason":"observacion","detail":"Hemoglobina: Normal · hemolizada","createdAt":"2026-11-15T15:00:00Z","version":1},{"id":"f2","orderId":"o2","patientId":"p2","patientName":"Paciente Dos","patientRecord":"000201-1","reason":"critico","detail":"Potasio: Crítico alto","createdAt":"2026-11-15T16:00:00Z","version":3}]"#
        let items = LabFollowUpRules.sorted(try JSONDecoder().decode([LabFollowUp].self, from: Data(json.utf8)))
        XCTAssertEqual(items.map(\.id), ["f2", "f1"])
        XCTAssertTrue(items[0].critical)
        XCTAssertEqual(LabFollowUpRules.reviewPath("f2"), "/laboratorio/pendientes/f2/revisar")
    }

    func testAgrupaPorLoQueSigue() {
        let groups = LabWorkGroup.group([order("a", state: "completado", reviewed: true), order("b", state: "pendiente", extra: #","external":true"#), order("c", state: "en_proceso")])
        XCTAssertEqual(groups.map(\.group), [.enProceso, .externa, .liberada])
        XCTAssertTrue(LabWorkGroup.liberada.folded)
        XCTAssertFalse(LabWorkGroup.enProceso.folded)
    }
}
