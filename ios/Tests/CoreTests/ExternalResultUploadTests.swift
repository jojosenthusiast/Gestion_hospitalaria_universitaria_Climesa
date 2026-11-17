import XCTest
@testable import ClimesaCore

/// C2 (Fase 2R U9-ios): the doctor loads the result of an external order on iOS. The values and the file reference go
/// first (`POST /laboratorio/ordenes/{id}/resultado-externo`), then the file itself as multipart in `archivo`
/// (`POST /laboratorio/adjuntos/{id}/archivo`), the same two steps as Android and the web.
final class ExternalResultUploadTests: XCTestCase {
    private func order(state: String = "pendiente", external: Bool = true, actions: [String] = ["cargar_externo"], items: String? = nil) -> LabOrder {
        let rows = items ?? #"[{"id":"i1","examId":"e1","code":"HB","name":"Hemoglobina","unit":"g/dL","resultType":"numerico","result":null},{"id":"i2","examId":"e2","code":"EGO","name":"Examen de orina","unit":null,"resultType":"texto","result":null}]"#
        let list = actions.map { "\"\($0)\"" }.joined(separator: ",")
        let json = #"{"id":"o1","consultationId":"k1","patientId":"p1","doctorId":"d1","priority":"rutina","state":"\#(state)","createdAt":"2026-11-20T10:00:00Z","sampleTakenAt":null,"completedAt":null,"reviewedAt":null,"version":4,"patientName":"Paciente Uno","items":\#(rows),"external":\#(external),"externalPlace":"Clínica Ficticia","externalActions":[\#(list)]}"#
        return try! JSONDecoder().decode(LabOrder.self, from: Data(json.utf8))
    }

    private let pdf = Data("%PDF-1.7 informe".utf8)
    private func file(_ data: Data? = nil, name: String = "informe.pdf") -> LabExternalFile? {
        LabExternalFile.make(data: data ?? pdf, fileName: name, sha256: String(repeating: "a", count: 64))
    }

    // MARK: send to external

    func testUnaOrdenYaEnviadaAExternoNoOfreceEnviarOtraVez() {
        let pending = order(external: false, actions: ["enviar_externo"])
        XCTAssertTrue(LabExternalRules.canSend(pending, sentHere: false))
        // The answer of the first send arrived: the stale copy must not offer a second send (it would hit version_conflicto).
        XCTAssertFalse(LabExternalRules.canSend(pending, sentHere: true))
        // Once reloaded the order is external, even if an older server still listed the action.
        XCTAssertFalse(LabExternalRules.canSend(order(external: true, actions: ["enviar_externo"]), sentHere: false))
        XCTAssertFalse(LabExternalRules.canSend(order(external: false, actions: []), sentHere: false))
    }

    func testCargarResultadoExternoSaleDeLaAccionDeLaAPI() {
        XCTAssertTrue(LabExternalRules.canLoadResult(order()))
        XCTAssertFalse(LabExternalRules.canLoadResult(order(actions: [])))
        XCTAssertFalse(LabExternalRules.canLoadResult(order(state: "completado")))
    }

    // MARK: picked file

    func testReconoceElTipoPorLosBytesComoLaAPI() {
        XCTAssertEqual(LabAttachmentRules.detectType(pdf), "application/pdf")
        XCTAssertEqual(LabAttachmentRules.detectType(Data([0xFF, 0xD8, 0xFF, 0xE0, 0x00])), "image/jpeg")
        XCTAssertEqual(LabAttachmentRules.detectType(Data([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00])), "image/png")
        XCTAssertEqual(LabAttachmentRules.detectType(Data("RIFF\u{0}\u{0}\u{0}\u{0}WEBPVP8 ".utf8)), "image/webp")
        XCTAssertEqual(LabAttachmentRules.detectType(Data([0x00, 0x00, 0x00, 0x18] + Array("ftypheic".utf8))), "image/heic")
        XCTAssertEqual(LabAttachmentRules.detectType(Data([0x00, 0x00, 0x00, 0x18] + Array("ftypmif1".utf8))), "image/heic")
        XCTAssertNil(LabAttachmentRules.detectType(Data("hola, no soy un PDF".utf8)))
        XCTAssertNil(LabAttachmentRules.detectType(Data()))
    }

    func testArchivoElegidoSeRevisaAntesDeEnviar() {
        let ok = file()
        XCTAssertEqual(ok?.mimeType, "application/pdf")
        XCTAssertEqual(ok?.sizeBytes, pdf.count)
        XCTAssertNil(LabExternalRules.attachmentError(ok))
        XCTAssertEqual(LabExternalRules.attachmentError(nil), "Adjunta la foto o el PDF del informe externo.")
        XCTAssertEqual(LabExternalRules.attachmentError(file(Data("texto".utf8), name: "nota.txt")), "El informe debe ser PDF o una foto (JPG, PNG, HEIC o WEBP).")
        XCTAssertEqual(LabExternalRules.attachmentError(file(Data(), name: "vacio.pdf")), "El archivo está vacío.")
        let big = Data("%PDF-".utf8) + Data(count: LabAttachmentRules.maxBytes)
        XCTAssertEqual(LabExternalRules.attachmentError(file(big)), "El archivo pasa de 10 MB; toma una foto más liviana o comprime el PDF.")
    }

    func testNombreVacioUsaUnNombreSegunElTipo() {
        XCTAssertEqual(file(name: "  ")?.fileName, "informe.pdf")
        XCTAssertEqual(file(Data([0xFF, 0xD8, 0xFF, 0xE0]), name: "")?.fileName, "foto.jpg")
        XCTAssertEqual(file(Data([0x00, 0x00, 0x00, 0x18] + Array("ftypheic".utf8)), name: "")?.fileName, "foto.heic")
    }

    // MARK: values

    func testPideElValorDeCadaExamenYNumerosDondeTocan() {
        let items = order().items
        XCTAssertTrue(items[0].numeric)
        XCTAssertFalse(items[1].numeric)
        XCTAssertEqual(LabExternalRules.valuesError(items: items, values: ["i1": "13,4"]), "Falta el valor de 1 examen(es).")
        XCTAssertEqual(LabExternalRules.valuesError(items: items, values: ["i1": "alto", "i2": "Normal"]), "El valor de Hemoglobina debe ser un número.")
        XCTAssertNil(LabExternalRules.valuesError(items: items, values: ["i1": " 13,4 ", "i2": "Normal"]))
        XCTAssertEqual(LabExternalRules.number("13,4"), 13.4)
    }

    func testServidorAnteriorSinTipoDeResultadoUsaLaUnidad() {
        let items = order(items: #"[{"id":"i1","examId":"e1","code":"HB","name":"Hemoglobina","unit":"g/dL","result":null},{"id":"i2","examId":"e2","code":"EGO","name":"Orina","unit":null,"result":null}]"#).items
        XCTAssertTrue(items[0].numeric)
        XCTAssertFalse(items[1].numeric)
    }

    func testCuerpoDelResultadoExternoSegunElContrato() throws {
        let body = LabExternalRules.resultBody(version: 4, file: try XCTUnwrap(file()), items: order().items, values: ["i1": "13,4", "i2": " Normal "], note: "  Informe de Clínica Ficticia ")
        let json = String(decoding: try JSONBody.encode(body), as: UTF8.self)
        XCTAssertEqual(json, #"{"attachment":{"fileName":"informe.pdf","mimeType":"application\/pdf","sha256":"\#(String(repeating: "a", count: 64))","sizeBytes":\#(pdf.count)},"note":"Informe de Clínica Ficticia","results":[{"orderItemId":"i1","value":13.4},{"orderItemId":"i2","text":"Normal"}],"version":4}"#)
        let noNote = LabExternalRules.resultBody(version: 4, file: try XCTUnwrap(file()), items: order().items, values: ["i1": "1", "i2": "x"], note: "   ")
        XCTAssertFalse(String(decoding: try JSONBody.encode(noNote), as: UTF8.self).contains("note"))
        XCTAssertEqual(LabExternalRules.resultPath("o1"), "/laboratorio/ordenes/o1/resultado-externo")
        XCTAssertEqual(LabAttachmentRules.filePath("a1"), "/laboratorio/adjuntos/a1/archivo")
    }

    func testLeeLaRespuestaConElAdjuntoCreado() throws {
        let saved = try JSONDecoder().decode(LabExternalResultSaved.self, from: Data(#"{"id":"o1","state":"completado","version":5,"completedAt":"2026-11-20T11:00:00Z","attachmentId":"a1"}"#.utf8))
        XCTAssertEqual(saved.attachmentId, "a1")
        XCTAssertEqual(saved.version, 5)
        let none = try JSONDecoder().decode(LabExternalResultSaved.self, from: Data(#"{"id":"o1","state":"completado","version":5,"completedAt":"2026-11-20T11:00:00Z","attachmentId":null}"#.utf8))
        XCTAssertNil(none.attachmentId)
    }

    // MARK: multipart

    func testMultipartConUnSoloArchivoEnElCampoArchivo() {
        let body = LabAttachmentRules.multipartBody(boundary: "b1", fileName: "in\"fo\r\nrme.pdf", mimeType: "application/pdf", data: Data("%PDF-x".utf8))
        let text = String(decoding: body, as: UTF8.self)
        XCTAssertEqual(text, "--b1\r\nContent-Disposition: form-data; name=\"archivo\"; filename=\"in_fo__rme.pdf\"\r\nContent-Type: application/pdf\r\n\r\n%PDF-x\r\n--b1--\r\n")
        XCTAssertEqual(LabAttachmentRules.multipartContentType(boundary: "b1"), "multipart/form-data; boundary=b1")
    }

    func testErroresDeSubidaEnEspanol() {
        func failure(_ status: Int, _ code: String) -> APIFailure { .http(status: status, problem: Problem(status: status, code: code, detail: "x")) }
        XCTAssertEqual(LabAttachmentRules.uploadMessage(failure(415, "adjunto_tipo_invalido")), "El archivo no es un PDF ni una foto JPG, PNG, HEIC o WEBP.")
        XCTAssertEqual(LabAttachmentRules.uploadMessage(failure(413, "adjunto_muy_grande")), "El archivo pasa de 10 MB; toma una foto más liviana o comprime el PDF.")
        XCTAssertEqual(LabAttachmentRules.uploadMessage(failure(409, "adjunto_ya_almacenado")), "Este adjunto ya tiene su archivo guardado; no se reemplaza.")
        XCTAssertEqual(LabAttachmentRules.uploadMessage(failure(409, "adjunto_no_coincide")), "El archivo no coincide con el que se adjuntó al resultado; sube el mismo archivo.")
        XCTAssertEqual(LabAttachmentRules.uploadMessage(APIFailure.transport), APIFailure.transport.message)
    }

    // MARK: two-step flow

    func testFlujoCompletoValoresYLuegoArchivo() {
        var flow = ExternalResultFlow()
        XCTAssertEqual(flow.next, .saveValues)
        XCTAssertTrue(flow.canEdit)
        flow.begin()
        XCTAssertEqual(flow.status, .saving)
        XCTAssertTrue(flow.busy)
        flow.valuesSaved(attachmentId: "a1")
        XCTAssertEqual(flow.next, .upload(attachmentId: "a1"))
        XCTAssertEqual(flow.status, .uploading)
        XCTAssertFalse(flow.canEdit, "the reference (with its SHA-256) is saved: the file and values can no longer change")
        flow.fileStored()
        XCTAssertEqual(flow.status, .done(withFile: true))
        XCTAssertEqual(flow.next, .finished)
    }

    func testSiFallaLaSubidaElReintentoSoloSubeElArchivo() {
        var flow = ExternalResultFlow()
        flow.begin()
        flow.valuesSaved(attachmentId: "a1")
        flow.fail("Sin conexión")
        XCTAssertEqual(flow.status, .failed("Sin conexión"))
        XCTAssertTrue(flow.filePending)
        // The values are already saved: retrying never posts them again (the order is no longer pending).
        XCTAssertEqual(flow.next, .upload(attachmentId: "a1"))
        XCTAssertFalse(flow.canEdit)
        flow.begin()
        XCTAssertEqual(flow.status, .uploading)
    }

    func testSiFallanLosValoresSePuedenCorregirYReintentar() {
        var flow = ExternalResultFlow()
        flow.begin()
        flow.fail("Falta el valor")
        XCTAssertEqual(flow.next, .saveValues)
        XCTAssertFalse(flow.filePending)
        XCTAssertTrue(flow.canEdit)
        XCTAssertFalse(flow.busy)
    }

    func testSinAdjuntoCreadoTerminaSinSubir() {
        var flow = ExternalResultFlow()
        flow.begin()
        flow.valuesSaved(attachmentId: nil)
        XCTAssertEqual(flow.status, .done(withFile: false))
        XCTAssertEqual(flow.next, .finished)
    }
}
