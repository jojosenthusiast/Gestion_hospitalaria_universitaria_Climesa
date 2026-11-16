import XCTest
@testable import ClimesaCore

/// Fase 2, S10 (T07c): adjuntos privados de un resultado externo. El médico abre el archivo con un enlace firmado de
/// 5 minutos (`GET /laboratorio/adjuntos/{id}/enlace`); el paciente nunca lo recibe.
final class LabAttachmentTests: XCTestCase {
    private func decode<T: Decodable>(_ type: T.Type, _ json: String) throws -> T {
        try JSONDecoder().decode(T.self, from: Data(json.utf8))
    }

    func testLeeLosAdjuntosDelDetalleDeLaOrden() throws {
        let detail = try decode(LabOrderAttachments.self, #"{"id":"o1","version":3,"attachments":[{"id":"a1","fileName":"informe.pdf","mimeType":"application/pdf","sizeBytes":2621440,"sha256":"abc","stored":true,"note":"Hemograma externo","uploadedAt":"2026-11-14T12:00:00.000Z","uploadedByName":"Lab Uno"},{"id":"a2","fileName":"foto.jpg","mimeType":"image/jpeg","sizeBytes":900,"sha256":null,"stored":false,"note":null,"uploadedAt":"2026-11-14T12:00:00.000Z","uploadedByName":null}]}"#)
        XCTAssertEqual(detail.attachments.map(\.id), ["a1", "a2"])
        let pdf = try XCTUnwrap(detail.attachments.first)
        XCTAssertEqual(pdf.fileName, "informe.pdf")
        XCTAssertTrue(pdf.stored)
        XCTAssertEqual(pdf.note, "Hemograma externo")
        XCTAssertEqual(pdf.uploadedByName, "Lab Uno")
        XCTAssertEqual(LabAttachmentRules.kindLabel(pdf), "PDF")
        XCTAssertEqual(LabAttachmentRules.sizeText(pdf.sizeBytes), "2,5 MB")
        let photo = try XCTUnwrap(detail.attachments.last)
        XCTAssertFalse(photo.stored)
        XCTAssertEqual(LabAttachmentRules.kindLabel(photo), "Foto")
        XCTAssertEqual(LabAttachmentRules.sizeText(photo.sizeBytes), "900 B")
        XCTAssertEqual(LabAttachmentRules.sizeText(1536), "1,5 kB")
    }

    func testServidorAnteriorSinAdjuntos() throws {
        XCTAssertTrue(try decode(LabOrderAttachments.self, #"{"id":"o1","version":3}"#).attachments.isEmpty)
    }

    func testEnlaceFirmadoSoloSeAbreSiEsHttp() throws {
        let link = try decode(LabAttachmentLink.self, #"{"url":"https://storage.example.test/obj/informe.pdf?token=t","expiresAt":"2026-11-14T12:05:00.000Z","expiresInSeconds":300,"fileName":"informe.pdf","mimeType":"application/pdf","sizeBytes":2048}"#)
        XCTAssertEqual(link.expiresInSeconds, 300)
        XCTAssertEqual(LabAttachmentRules.openableURL(link)?.host, "storage.example.test")
        let unsafe = try decode(LabAttachmentLink.self, #"{"url":"javascript:alert(1)","expiresAt":"2026-11-14T12:05:00.000Z","expiresInSeconds":300,"fileName":"x","mimeType":"application/pdf","sizeBytes":1}"#)
        XCTAssertNil(LabAttachmentRules.openableURL(unsafe))
    }

    func testErroresDelEnlaceEnEspanol() {
        func failure(_ status: Int, _ code: String?) -> APIFailure { .http(status: status, problem: Problem(status: status, code: code, detail: "Not found")) }
        XCTAssertEqual(LabAttachmentRules.linkMessage(failure(409, "adjunto_sin_archivo")), "Solo hay la referencia del archivo: no se guardó en el sistema.")
        XCTAssertEqual(LabAttachmentRules.linkMessage(failure(404, "no_encontrado")), "No encontramos este archivo. Vuelve a cargar la orden.")
        XCTAssertEqual(LabAttachmentRules.linkMessage(failure(403, "sin_permiso")), "Tu cuenta no puede abrir este archivo.")
        XCTAssertEqual(LabAttachmentRules.linkMessage(APIFailure.transport), APIFailure.transport.message)
        XCTAssertEqual(LabAttachmentRules.linkMessage(LabAttachmentRules.LinkError.unopenable), "No se pudo abrir el archivo en este equipo. Vuelve a intentar.")
        XCTAssertFalse(LabAttachmentRules.linkMessage(failure(409, "adjunto_sin_archivo")).contains("adjunto_sin_archivo"))
    }
}
