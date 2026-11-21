import Foundation

/// Identity palette of roles and areas (web `components/identity.css`): text and soft background with AA contrast in
/// light and dark mode. The colour never goes alone: a chip always carries its glyph and its text (or, compact, an
/// accessible name).
public enum IdentityTone: String, CaseIterable, Sendable {
    case indigo, teal, blue, orange, green, magenta, cyan, purple, red, slate, amber

    /// Text and border colour (`--id-fg`).
    public var foreground: ColorPair {
        switch self {
        case .indigo: return ColorPair(light: 0x3F37A0, dark: 0xB8B3F5)
        case .teal: return ColorPair(light: 0x0B6161, dark: 0x7FD6D3)
        case .blue: return ColorPair(light: 0x00358F, dark: 0x8DB3FA)
        case .orange: return ColorPair(light: 0x8F3F06, dark: 0xF2B27A)
        case .green: return ColorPair(light: 0x17633A, dark: 0x6CCB92)
        case .magenta: return ColorPair(light: 0x8F1F5B, dark: 0xF0A1CB)
        case .cyan: return ColorPair(light: 0x0A5A85, dark: 0x8CCBEE)
        case .purple: return ColorPair(light: 0x5B3A99, dark: 0xC4A8F0)
        case .red: return ColorPair(light: 0xA31515, dark: 0xF5A29A)
        case .slate: return ColorPair(light: 0x3F4B5B, dark: 0xB9C3D1)
        case .amber: return ColorPair(light: 0x7A4B00, dark: 0xF2B65A)
        }
    }

    /// Soft background (`--id-bg`).
    public var background: ColorPair {
        switch self {
        case .indigo: return ColorPair(light: 0xECEBFA, dark: 0x25224A)
        case .teal: return ColorPair(light: 0xE0F3F2, dark: 0x123433)
        case .blue: return ColorPair(light: 0xE6EEFB, dark: 0x18284A)
        case .orange: return ColorPair(light: 0xFDEBDD, dark: 0x3A2410)
        case .green: return ColorPair(light: 0xE4F3EA, dark: 0x13301F)
        case .magenta: return ColorPair(light: 0xFBE6F1, dark: 0x3D1830)
        case .cyan: return ColorPair(light: 0xE1F1FA, dark: 0x112F42)
        case .purple: return ColorPair(light: 0xF1EBFA, dark: 0x2E2147)
        case .red: return ColorPair(light: 0xFCEAEA, dark: 0x3E1816)
        case .slate: return ColorPair(light: 0xEDF0F2, dark: 0x222B38)
        case .amber: return ColorPair(light: 0xFFF2D9, dark: 0x33240C)
        }
    }
}

/// One role or area as the chips draw it: key, label, glyph and tone (web `Identity`).
public struct Identity: Equatable, Sendable {
    public let key: String
    public let label: String
    public let icon: ClimesaIconName
    public let tone: IdentityTone

    public init(key: String, label: String, icon: ClimesaIconName, tone: IdentityTone) {
        self.key = key; self.label = label; self.icon = icon; self.tone = tone
    }
}

/// Mirror of web `roleIdentity` and `areaIdentity` (components/identity.tsx), the same codes, glyphs and tones.
public enum IdentityRules {
    private static let roles: [String: Identity] = [
        "ADM": Identity(key: "ADM", label: "Administración", icon: .shield, tone: .indigo),
        "DPD": Identity(key: "DPD", label: "Protección de datos", icon: .lock, tone: .teal),
        "JOP": Identity(key: "JOP", label: "Jefatura de operaciones", icon: .idClipboard, tone: .blue),
        "REC": Identity(key: "REC", label: "Recepción", icon: .desk, tone: .orange),
        "AST": Identity(key: "AST", label: "Asistencia", icon: .hand, tone: .green),
        "ENF": Identity(key: "ENF", label: "Enfermería", icon: .heart, tone: .magenta),
        "MED": Identity(key: "MED", label: "Medicina", icon: .steth, tone: .cyan),
        "LAB": Identity(key: "LAB", label: "Laboratorio", icon: .flask, tone: .purple),
        "PAR": Identity(key: "PAR", label: "Paramedicina", icon: .ambulance, tone: .red),
        "PAC": Identity(key: "PAC", label: "Paciente", icon: .user, tone: .slate)
    ]

    /// API staff type (`medico`, `enfermero`...) to the role code it is identified with.
    private static let staffRole: [String: String] = [
        "medico": "MED", "enfermero": "ENF", "asistente": "AST", "recepcionista": "REC", "laboratorista": "LAB",
        "paramedico": "PAR", "administrativo": "ADM", "motorista": "PAR"
    ]
    private static let staffLabel: [String: String] = [
        "medico": "Médico", "enfermero": "Enfermería", "asistente": "Asistencia", "recepcionista": "Recepción",
        "laboratorista": "Laboratorio", "paramedico": "Paramédico", "motorista": "Motorista", "limpieza": "Limpieza",
        "administrativo": "Administración", "otro": "Otro"
    ]
    private static let neutral = Identity(key: "otro", label: "Otro", icon: .user, tone: .slate)

    private static let areaTypes: [String: Identity] = [
        "hospital": Identity(key: "hospital", label: "Hospital", icon: .building, tone: .blue),
        "planta": Identity(key: "planta", label: "Planta", icon: .layers, tone: .indigo),
        "area": Identity(key: "area", label: "Área", icon: .cube, tone: .teal),
        "habitacion": Identity(key: "habitacion", label: "Habitación", icon: .bed, tone: .cyan),
        "cama": Identity(key: "cama", label: "Cama", icon: .bed, tone: .cyan),
        "consultorio": Identity(key: "consultorio", label: "Consultorio", icon: .steth, tone: .green),
        "cubiculo": Identity(key: "cubiculo", label: "Cubículo", icon: .door, tone: .slate),
        "bodega": Identity(key: "bodega", label: "Bodega", icon: .box, tone: .amber),
        "bahia": Identity(key: "bahia", label: "Bahía", icon: .bay, tone: .orange)
    ]

    /// Areas known by their name win over the generic type, in this order (web `AREA_NAMES`).
    private static let areaNames: [([String], Identity)] = [
        (["emergenc", "urgenc", "trauma"], Identity(key: "emergencia", label: "Emergencia", icon: .alert, tone: .red)),
        (["laborator"], Identity(key: "laboratorio", label: "Laboratorio", icon: .flask, tone: .purple)),
        (["farmaci", "medicament"], Identity(key: "farmacia", label: "Farmacia", icon: .pill, tone: .amber)),
        (["quirofan", "cirug", "sala de operaci"], Identity(key: "quirofano", label: "Quirófano", icon: .scalpel, tone: .indigo)),
        (["hospitaliz", "internamiento", "encamad"], Identity(key: "hospitalizacion", label: "Hospitalización", icon: .bed, tone: .blue)),
        (["consult", "ambulator"], Identity(key: "consulta", label: "Consulta", icon: .steth, tone: .green)),
        (["recepci", "admision", "citas"], Identity(key: "recepcion", label: "Recepción", icon: .desk, tone: .orange)),
        (["ambulanc", "transporte"], Identity(key: "ambulancia", label: "Ambulancia", icon: .ambulance, tone: .red)),
        (["bodega", "almacen", "inventario"], Identity(key: "bodega", label: "Bodega", icon: .box, tone: .amber)),
        (["cuidado", "intensiv", "uci"], Identity(key: "cuidados", label: "Cuidados intensivos", icon: .heart, tone: .magenta))
    ]

    /// Lowercased, without accents, trimmed (web `fold`).
    static func fold(_ value: String) -> String {
        value.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: Locale(identifier: "es"))
            .lowercased().trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// Accepts the role code (`MED`) or the API staff type (`medico`). An unknown value gets the neutral identity
    /// with its own text as label.
    public static func role(_ code: String?) -> Identity {
        let text = (code ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if let identity = roles[text.uppercased()] { return identity }
        let key = fold(text)
        if let roleCode = staffRole[key], let base = roles[roleCode] {
            return Identity(key: base.key, label: staffLabel[key] ?? base.label, icon: base.icon, tone: base.tone)
        }
        if let label = staffLabel[key] { return Identity(key: key, label: label, icon: neutral.icon, tone: neutral.tone) }
        return text.isEmpty ? neutral : Identity(key: key, label: text, icon: neutral.icon, tone: neutral.tone)
    }

    /// By area name (`Emergencia`, `Laboratorio`) or, as a fallback, by space type (`area`, `planta`...).
    public static func area(_ name: String?, type: String? = nil) -> Identity {
        let folded = fold(name ?? "")
        if let match = areaNames.first(where: { entry in entry.0.contains { folded.contains($0) } }) { return match.1 }
        if let byType = areaTypes[fold(type ?? "")] ?? areaTypes[folded] { return byType }
        let trimmed = (name ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        return Identity(key: "area", label: trimmed.isEmpty ? "Área" : trimmed, icon: .cube, tone: .slate)
    }
}
