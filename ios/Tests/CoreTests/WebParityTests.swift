import XCTest
@testable import ClimesaCore

/// Lote 4 (owner: iOS must look like web and Android): icons, status mapping, identity chips, bell and clock follow the
/// web reference (web/src/components/{ui,identity,system}.tsx, features/shell.tsx).
final class WebParityTests: XCTestCase {
    // MARK: - Icons (tools/icons/gen_ios_icons.py)

    func testEveryWebIconIsGeneratedAndDrawsOnTheGrid() {
        let webIcons = ["arrow", "shield", "mail", "user", "users", "check", "close", "eye", "eyeOff", "logout", "grid", "phone",
                        "chevron", "info", "lock", "plus", "search", "back", "home", "building", "bed", "ambulance", "calendar",
                        "audit", "lab", "inventory", "queue", "privacy", "menu", "retry", "download", "clock", "alert", "chart",
                        "userPlus", "megaphone", "steth", "drop", "pulse", "chevronsUp", "minus", "filter", "clipboard", "bell",
                        "pencil", "trash"]
        let identityGlyphs = ["desk", "hand", "heart", "flask", "layers", "door", "box", "bay", "scalpel", "pill", "cube"]
        for name in webIcons + identityGlyphs { XCTAssertNotNil(ClimesaIconName(rawValue: name), name) }
        for name in ClimesaIconName.allCases {
            let segments = ClimesaIconGeometry.segments(name)
            guard case .move = segments.first else { return XCTFail("\(name) must start with a move") }
            for segment in segments {
                let points: [Double]
                switch segment {
                case let .move(x, y), let .line(x, y): points = [x, y]
                case let .cubic(x1, y1, x2, y2, x, y): points = [x1, y1, x2, y2, x, y]
                case .close: points = []
                }
                // Arc control points may leave the drawn area slightly, never the padded grid.
                for value in points { XCTAssertTrue((-2...26).contains(value), "\(name): \(value)") }
            }
        }
    }

    func testIconPathDataParsesAbsoluteCommands() {
        XCTAssertEqual(ClimesaIconGeometry.segments(.minus), [.move(5, 12), .line(19, 12)])
        XCTAssertEqual(ClimesaIconGeometry.parse("M 1 2 C 3 4 5 6 7 8 Z bad L 9"), [.move(1, 2), .cubic(3, 4, 5, 6, 7, 8), .close])
        XCTAssertEqual(ClimesaIconGeometry.stroke, 1.7)
    }

    func testScreensUseWebConceptsNotSFSymbols() {
        XCTAssertEqual(AppTab.examenes.icon, .lab)
        XCTAssertEqual(AppTab.fila.icon, .queue)
        XCTAssertEqual(AppSection.ambulancia.icon, .ambulance)
        XCTAssertEqual(AppSection.hospital.icon, .building)
        XCTAssertNil(AppSection.ubicacion.icon)
        XCTAssertEqual(AppSection.ubicacion.symbol, "map")
        XCTAssertEqual(NoticeLevel.importante.icon, .chevronsUp)
        XCTAssertEqual(PatientHomeRules.Shortcut.ambulance.icon, .ambulance)
    }

    // MARK: - Status mapping (web system.tsx R1)

    func testValuesThatAskForAttentionShowUrgentPriority() {
        for value in ["alto", "bajo", "agotado", "vencido"] {
            let style = StatusBadgeStyle.of(value)
            XCTAssertEqual(style.priority, .urgente, value)
            XCTAssertNil(style.family, value)
            XCTAssertFalse(style.isNeutral, value)
        }
        XCTAssertEqual(StatusBadgeStyle.of("vencido").label, "Vencido")
        XCTAssertEqual(StatusBadgeStyle.of("vencida").family, .cerrado)
        XCTAssertNil(StatusBadgeStyle.of("critico_alto").priority)
        XCTAssertEqual(StatusBadgeStyle.of("critico_alto").family, .critico)
    }

    func testRequiereAtencionIsAnAttentionState() {
        XCTAssertEqual(StatusBadgeStyle.of("requiere_atencion"), StatusBadgeStyle(label: "Requiere atención", family: .atencion))
    }

    func testPriorityPassedAsStatusWearsThePriorityBadge() {
        XCTAssertEqual(StatusBadgeStyle.of("urgente"), StatusBadgeStyle(label: "Urgente", family: nil, priority: .urgente))
        XCTAssertEqual(StatusBadgeStyle.of("emergencia", label: "Sin cierre").priority, .emergencia)
        XCTAssertEqual(StatusBadgeStyle.of("emergencia", label: "Sin cierre").label, "Sin cierre")
        XCTAssertNil(StatusBadgeStyle.of("rutina").priority)
    }

    // MARK: - Identity chips (web identity.tsx)

    func testRoleIdentityByCodeAndStaffType() {
        XCTAssertEqual(IdentityRules.role("MED"), Identity(key: "MED", label: "Medicina", icon: .steth, tone: .cyan))
        XCTAssertEqual(IdentityRules.role("med").tone, .cyan)
        XCTAssertEqual(IdentityRules.role("médico"), Identity(key: "MED", label: "Médico", icon: .steth, tone: .cyan))
        XCTAssertEqual(IdentityRules.role("motorista"), Identity(key: "PAR", label: "Motorista", icon: .ambulance, tone: .red))
        XCTAssertEqual(IdentityRules.role("REC").icon, .desk)
        XCTAssertEqual(IdentityRules.role("ENF").icon, .heart)
        XCTAssertEqual(IdentityRules.role("limpieza"), Identity(key: "limpieza", label: "Limpieza", icon: .user, tone: .slate))
        XCTAssertEqual(IdentityRules.role("Voluntario"), Identity(key: "voluntario", label: "Voluntario", icon: .user, tone: .slate))
        XCTAssertEqual(IdentityRules.role(nil), Identity(key: "otro", label: "Otro", icon: .user, tone: .slate))
    }

    func testAreaIdentityByNameWinsOverType() {
        XCTAssertEqual(IdentityRules.area("Emergencia adultos", type: "area").key, "emergencia")
        XCTAssertEqual(IdentityRules.area("Laboratorio clínico").icon, .flask)
        XCTAssertEqual(IdentityRules.area("Transporte sanitario"), Identity(key: "ambulancia", label: "Ambulancia", icon: .ambulance, tone: .red))
        XCTAssertEqual(IdentityRules.area("Cuidados intensivos").tone, .magenta)
        XCTAssertEqual(IdentityRules.area("Bahía 2", type: "bahia").icon, .bay)
        XCTAssertEqual(IdentityRules.area("Planta 3", type: "planta").icon, .layers)
        XCTAssertEqual(IdentityRules.area("Sala B"), Identity(key: "area", label: "Sala B", icon: .cube, tone: .slate))
        XCTAssertEqual(IdentityRules.area(nil).label, "Área")
    }

    func testIdentityTonesMatchWebPalette() {
        XCTAssertEqual(IdentityTone.cyan.foreground, ColorPair(light: 0x0A5A85, dark: 0x8CCBEE))
        XCTAssertEqual(IdentityTone.cyan.background, ColorPair(light: 0xE1F1FA, dark: 0x112F42))
        XCTAssertEqual(IdentityTone.red.foreground, ColorPair(light: 0xA31515, dark: 0xF5A29A))
    }

    // MARK: - Bell and clock

    private func inbox(_ notices: String, unread: Int) throws -> NoticeInbox {
        let json = #"{"actualizadoEn":"2026-11-18T14:00:00.000Z","avisos":[\#(notices)],"noLeidos":\#(unread),"criticos":0,"recordatorioHoras":4,"proximoCambio":null}"#
        return try JSONDecoder().decode(NoticeInbox.self, from: Data(json.utf8))
    }

    private func notice(_ id: String, level: String) -> String {
        #"{"id":"\#(id)","titulo":"Aviso","cuerpo":"Texto.","desde":"2026-11-14T12:00:00.000Z","hasta":"2026-11-20T12:00:00.000Z","prioridad":"atencion","publico":false,"roles":["MED"],"nivel":"\#(level)","areas":[],"publicadoEn":"2026-11-14T12:00:00.000Z","dirigido":true,"enteradoEn":null,"recordarEn":null,"destacado":false}"#
    }

    func testBellCountIsWhiteAndOnlyRedWhileACriticalIsUnread() throws {
        XCTAssertNil(NoticeRules.bellBadgeTone(nil))
        XCTAssertEqual(NoticeRules.bellBadgeTone(try inbox(notice("a", level: "informativo"), unread: 1)), .neutral)
        XCTAssertEqual(NoticeRules.bellBadgeTone(try inbox(notice("c", level: "critico"), unread: 1)), .critical)
        XCTAssertEqual(NoticeRules.bellBadgeTone(try inbox(notice("c", level: "critico"), unread: 1), hiding: ["c"]), nil)
        XCTAssertNil(NoticeRules.bellBadgeTone(try inbox(notice("a", level: "informativo"), unread: 0)))
    }

    func testClockDateReadsLikeTheWebHeader() {
        let now = ClimesaDates.parse("2026-11-18T20:05:09Z")!
        XCTAssertEqual(ClimesaDates.clockSeconds(now), "14:05:09")
        XCTAssertEqual(ClimesaDates.clockDay(now), "Miércoles, 18 de noviembre")
    }
}
