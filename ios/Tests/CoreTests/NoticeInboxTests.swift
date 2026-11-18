import XCTest
@testable import ClimesaCore

/// Fase 2, S11: «Avisos» en su propia área. Bandeja de `GET /me/avisos/bandeja`, aviso crítico persistente en el inicio
/// (solo `destacado`), filtros Todos / Sin leer / Críticos, audiencia en palabras y errores de «Enterado» en español.
final class NoticeInboxTests: XCTestCase {
    private func notice(_ id: String, level: String = "informativo", targeted: Bool = true, acknowledged: Bool = false, highlighted: Bool = false,
                        isPublic: Bool = false, roles: String = #"["MED"]"#, areas: String = "[]") -> String {
        #"{"id":"\#(id)","titulo":"Aviso \#(id)","cuerpo":"Texto \#(id).","desde":"2026-11-14T12:00:00.000Z","hasta":"2026-11-20T12:00:00.000Z","prioridad":"atencion","publico":\#(isPublic),"roles":\#(roles),"nivel":"\#(level)","areas":\#(areas),"publicadoEn":"2026-11-14T12:00:00.000Z","dirigido":\#(targeted),"enteradoEn":\#(acknowledged ? "\"2026-11-14T13:00:00.000Z\"" : "null"),"recordarEn":null,"destacado":\#(highlighted)}"#
    }

    private func inbox(_ items: [String], unread: Int = 0, critical: Int = 0, hours: String = "4", next: String = "null") throws -> NoticeInbox {
        let json = #"{"actualizadoEn":"2026-11-14T12:00:00.000Z","avisos":[\#(items.joined(separator: ","))],"noLeidos":\#(unread),"criticos":\#(critical),"recordatorioHoras":\#(hours),"proximoCambio":\#(next)}"#
        return try JSONDecoder().decode(NoticeInbox.self, from: Data(json.utf8))
    }

    // MARK: Decodificación

    func testDecodificaLaBandeja() throws {
        let decoded = try inbox([notice("c1", level: "critico", highlighted: true), notice("i1", acknowledged: true)], unread: 1, critical: 1, next: #""2026-11-14T16:00:00.000Z""#)
        XCTAssertEqual(decoded.unread, 1)
        XCTAssertEqual(decoded.critical, 1)
        XCTAssertEqual(decoded.reminderHours, 4)
        XCTAssertEqual(decoded.nextChange, "2026-11-14T16:00:00.000Z")
        XCTAssertEqual(decoded.notices.map(\.id), ["c1", "i1"])
        let first = try XCTUnwrap(decoded.notices.first)
        XCTAssertEqual(first.title, "Aviso c1")
        XCTAssertEqual(first.body, "Texto c1.")
        XCTAssertEqual(first.level, .critico)
        XCTAssertTrue(first.targeted)
        XCTAssertTrue(first.highlighted)
        XCTAssertNil(first.acknowledgedAt)
        XCTAssertNil(first.remindAt)
        XCTAssertEqual(first.publishedAt, "2026-11-14T12:00:00.000Z")
        XCTAssertEqual(first.until, "2026-11-20T12:00:00.000Z")
        XCTAssertEqual(decoded.notices.last?.acknowledgedAt, "2026-11-14T13:00:00.000Z")
    }

    func testNivelDesconocidoSeTrataComoInformativoYHorasConDecimales() throws {
        let decoded = try inbox([notice("x", level: "otro")], hours: "1.5")
        XCTAssertEqual(decoded.notices.first?.level, .informativo)
        XCTAssertEqual(decoded.reminderHours, 1.5)
        XCTAssertEqual(NoticeRules.hoursText(decoded.reminderHours), "1,5")
        XCTAssertEqual(NoticeRules.hoursText(4), "4")
    }

    func testVuelveALeerUnaSolaVezEnProximoCambio() throws {
        let now = try XCTUnwrap(ClimesaDates.parse("2026-11-14T15:00:00.000Z"))
        let scheduled = try inbox([], next: #""2026-11-14T16:00:00.000Z""#)
        XCTAssertEqual(try XCTUnwrap(scheduled.refreshDelay(now: now)), 3600 + PublicNotices.refreshSlack, accuracy: 0.001)
        XCTAssertNil(try inbox([]).refreshDelay(now: now))
    }

    // MARK: Aviso del inicio

    func testElInicioSoloDestacaLosAvisosDestacados() throws {
        let decoded = try inbox([
            notice("c1", level: "critico", highlighted: true),
            notice("p1", level: "critico", targeted: false, isPublic: true, roles: "[]"),
            notice("c2", level: "critico", acknowledged: true),
            notice("i1", level: "importante"),
            notice("c3", level: "critico", highlighted: true),
        ])
        XCTAssertEqual(NoticeRules.banner(decoded).map(\.id), ["c1", "c3"])
        XCTAssertEqual(NoticeRules.banner(decoded, hiding: ["c1"]).map(\.id), ["c3"])
        XCTAssertTrue(NoticeRules.banner(nil).isEmpty)
        XCTAssertTrue(NoticeRules.banner(try inbox([notice("i1", level: "importante")])).isEmpty)
    }

    func testSoloUnCriticoDirigidoSinEnteradoSePuedePosponer() throws {
        let decoded = try inbox([
            notice("c1", level: "critico"),
            notice("c2", level: "critico", acknowledged: true),
            notice("p1", level: "critico", targeted: false, isPublic: true, roles: "[]"),
            notice("i1", level: "importante"),
        ])
        XCTAssertEqual(decoded.notices.map(NoticeRules.canSnooze), [true, false, false, false])
        XCTAssertEqual(decoded.notices.map(NoticeRules.canAcknowledge), [true, false, true, true])
    }

    // MARK: Filtros

    func testFiltrosTodosSinLeerYCriticos() throws {
        let decoded = try inbox([
            notice("c1", level: "critico"),
            notice("i1", level: "importante", acknowledged: true),
            notice("c2", level: "critico", acknowledged: true),
            notice("n1"),
        ], unread: 2, critical: 1)
        XCTAssertEqual(NoticeRules.filter(decoded.notices, by: .todos).map(\.id), ["c1", "i1", "c2", "n1"])
        XCTAssertEqual(NoticeRules.filter(decoded.notices, by: .sinLeer).map(\.id), ["c1", "n1"])
        XCTAssertEqual(NoticeRules.filter(decoded.notices, by: .criticos).map(\.id), ["c1"])
        XCTAssertEqual(NoticeFilter.allCases.map(\.label), ["Todos", "Sin leer", "Críticos"])
        XCTAssertNil(NoticeRules.count(decoded, .todos))
        XCTAssertEqual(NoticeRules.count(decoded, .sinLeer), 2)
        XCTAssertEqual(NoticeRules.count(decoded, .criticos), 1)
    }

    func testCriticosListaLoMismoQueCuentaLaAPI() throws {
        let decoded = try inbox([
            notice("c1", level: "critico"),
            notice("c2", level: "critico", acknowledged: true),
            notice("c3", level: "critico", targeted: false),
            notice("i1", level: "importante"),
        ], unread: 3, critical: 1)
        let listed = NoticeRules.filter(decoded.notices, by: .criticos)
        XCTAssertEqual(listed.map(\.id), ["c1"])
        XCTAssertEqual(listed.count, NoticeRules.count(decoded, .criticos))
    }

    // MARK: Audiencia

    func testAudienciaEnPalabrasConAvisoSoloDeArea() {
        XCTAssertEqual(NoticeRules.audience(isPublic: false, roles: [], areas: []), "Tu área")
        XCTAssertEqual(NoticeRules.audience(isPublic: false, roles: [], areas: ["EMG"]), "Área EMG")
        XCTAssertEqual(NoticeRules.audience(isPublic: false, roles: [], areas: ["EMG", "CON"]), "Área EMG, CON")
        XCTAssertEqual(NoticeRules.audience(isPublic: true, roles: [], areas: []), "Pantalla pública y apps sin sesión")
        XCTAssertEqual(NoticeRules.audience(isPublic: true, roles: ["MED", "ENF"], areas: []), "Pantalla pública y apps sin sesión + Medicina, Enfermería")
        XCTAssertEqual(NoticeRules.audience(isPublic: false, roles: ["MED", "XYZ"], areas: ["LAB"]), "Medicina, XYZ + Área LAB")
    }

    func testAudienciaDeUnAvisoDeLaBandeja() throws {
        let decoded = try inbox([notice("a1", roles: "[]", areas: #"["EMG"]"#), notice("a2", roles: "[]")])
        XCTAssertEqual(decoded.notices.map { NoticeRules.audience($0) }, ["Área EMG", "Tu área"])
    }

    // MARK: Errores de «Enterado» y «Recordarme»

    func testErroresDeEnteradoEnEspanol() {
        func failure(_ status: Int, _ code: String) -> APIFailure { .http(status: status, problem: Problem(status: status, code: code, detail: "The notice was withdrawn")) }
        XCTAssertEqual(NoticeRules.actionMessage(failure(404, "no_encontrado")), "Este aviso ya no está disponible para tu cuenta. La lista se actualizó.")
        XCTAssertEqual(NoticeRules.actionMessage(failure(409, "aviso_retirado")), "Este aviso fue retirado; ya no necesita «Enterado». La lista se actualizó.")
        XCTAssertEqual(NoticeRules.actionMessage(failure(409, "aviso_vencido")), "Este aviso ya venció; ya no necesita «Enterado». La lista se actualizó.")
        XCTAssertEqual(NoticeRules.actionMessage(APIFailure.transport), APIFailure.transport.message)
        for code in ["no_encontrado", "aviso_retirado", "aviso_vencido"] {
            XCTAssertFalse(NoticeRules.actionMessage(failure(409, code)).contains(code))
        }
    }
}
