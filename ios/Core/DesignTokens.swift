import Foundation

/// Fase 2 (docs/diseno/fase2/02-sistema.md): qué token, ícono, patrón y texto lleva cada área, estado y prioridad.
/// Swift puro para probarlo sin UIKit; `DesignSystem/Theme.swift` convierte los pares de color en `Color` dinámicos.
/// Mismos valores y reglas que `web/src/components/system.tsx`. Nada comunica solo con color.

/// Color en modo claro y en modo oscuro (RGB hexadecimal), tal cual la tabla de la sección 7.
public struct ColorPair: Equatable, Sendable {
    public let light: UInt32
    public let dark: UInt32
    public init(light: UInt32, dark: UInt32) { self.light = light; self.dark = dark }
}

/// Tabla de tokens de la sección 7 (nombres Swift de la columna `Swift`).
public enum Palette {
    public static let areaEmg = ColorPair(light: 0x9B2C6F, dark: 0xF09AC9)
    public static let areaEmgSoft = ColorPair(light: 0xFAEAF3, dark: 0x3A1A2D)
    public static let areaCon = ColorPair(light: 0x0B6B63, dark: 0x6FD1C3)
    public static let areaConSoft = ColorPair(light: 0xE0F2EF, dark: 0x10302C)
    public static let areaLab = ColorPair(light: 0x5A3EA6, dark: 0xBBA8F2)
    public static let areaLabSoft = ColorPair(light: 0xEEEAFA, dark: 0x2A2142)
    public static let areaHos = ColorPair(light: 0x1D5C9A, dark: 0x8DB9EC)
    public static let areaHosSoft = ColorPair(light: 0xE4EEF8, dark: 0x16273D)
    public static let areaRec = ColorPair(light: 0x2D6B33, dark: 0x8CCF93)
    public static let areaRecSoft = ColorPair(light: 0xE4F1E5, dark: 0x172F1A)
    public static let areaAmb = ColorPair(light: 0x5C6213, dark: 0xCCD27A)
    public static let areaAmbSoft = ColorPair(light: 0xF0F2DA, dark: 0x2C2E12)
    public static let areaGen = ColorPair(light: 0x4A5865, dark: 0xAAB7C1)
    public static let areaGenSoft = ColorPair(light: 0xEDF0F2, dark: 0x222B36)
    public static let onArea = ColorPair(light: 0xFFFFFF, dark: 0x0C1220)

    public static let statusEspera = ColorPair(light: 0x6A45A6, dark: 0xBCA3EE)
    public static let statusEsperaSoft = ColorPair(light: 0xF1EBFA, dark: 0x2B2140)
    public static let statusLlamado = ColorPair(light: 0x8A5300, dark: 0xE8B25E)
    public static let statusLlamadoSoft = ColorPair(light: 0xFFF2D9, dark: 0x33260E)
    public static let statusAtencion = ColorPair(light: 0x1F55A3, dark: 0x8CB2F0)
    public static let statusAtencionSoft = ColorPair(light: 0xE8EFF9, dark: 0x18284A)
    public static let statusListo = ColorPair(light: 0x1D7444, dark: 0x6CCB92)
    public static let statusListoSoft = ColorPair(light: 0xE7F4EC, dark: 0x13301F)
    public static let statusCerrado = ColorPair(light: 0x4A5865, dark: 0xAAB7C1)
    public static let statusCerradoSoft = ColorPair(light: 0xEDF0F2, dark: 0x222B36)
    public static let onStatus = ColorPair(light: 0xFFFFFF, dark: 0x0C1220)

    public static let critical = ColorPair(light: 0xB71C1C, dark: 0xF2918A)
    public static let criticalSoft = ColorPair(light: 0xFCEAEA, dark: 0x3A1A17)

    public static let priorityUrgente = ColorPair(light: 0xA3480A, dark: 0xF0A36B)
    public static let priorityUrgenteSoft = ColorPair(light: 0xFDEBDD, dark: 0x3A2314)
    public static let priorityRutina = ColorPair(light: 0x55617A, dark: 0x9AA6BA)
    public static let priorityRutinaSoft = ColorPair(light: 0xEEF1F5, dark: 0x1B2538)
}

// MARK: - Áreas (S7)

/// Seis tonos de área más un neutro. El rojo es del acento crítico y nunca es color de área.
public enum AreaCode: String, CaseIterable, Sendable {
    case emg = "EMG", con = "CON", lab = "LAB", hos = "HOS", rec = "REC", amb = "AMB", gen = "GEN"

    public var name: String {
        switch self {
        case .emg: return "Emergencia"
        case .con: return "Consulta general"
        case .lab: return "Laboratorio"
        case .hos: return "Hospitalización"
        case .rec: return "Recepción y admisión"
        case .amb: return "Ambulancia"
        case .gen: return "General"
        }
    }

    /// Color fuerte: franja superior, chip del código y texto del área.
    public var strong: ColorPair {
        switch self {
        case .emg: return Palette.areaEmg
        case .con: return Palette.areaCon
        case .lab: return Palette.areaLab
        case .hos: return Palette.areaHos
        case .rec: return Palette.areaRec
        case .amb: return Palette.areaAmb
        case .gen: return Palette.areaGen
        }
    }

    /// Tinte suave: fondo de tarjeta o celda.
    public var soft: ColorPair {
        switch self {
        case .emg: return Palette.areaEmgSoft
        case .con: return Palette.areaConSoft
        case .lab: return Palette.areaLabSoft
        case .hos: return Palette.areaHosSoft
        case .rec: return Palette.areaRecSoft
        case .amb: return Palette.areaAmbSoft
        case .gen: return Palette.areaGenSoft
        }
    }

    /// Códigos de espacio del edificio que comparten el tono de otra área.
    private static let aliases: [String: AreaCode] = ["ESP": .rec, "VIP": .hos, "BOD": .gen]

    /// Área de un código de espacio o de área (`P1-EMG` → EMG, `P3-VIP` → HOS); lo desconocido cae en el neutro.
    public static func of(_ code: String?) -> AreaCode {
        let parts = (code ?? "").uppercased().split(separator: "-").map { $0.trimmingCharacters(in: .whitespaces) }
        // A real area code wins over an alias: `BOD-LAB` is LAB, `BOD-CEN` falls back to the BOD alias (GEN).
        if let area = parts.lazy.compactMap({ AreaCode(rawValue: $0) }).first { return area }
        // Consulting rooms are coded `C-101`: 02-sistema section 1 lists them under CON.
        if parts.first == "C", parts.count > 1, let room = parts.dropFirst().first, !room.isEmpty, room.allSatisfy(\.isNumber) { return .con }
        return parts.lazy.compactMap({ aliases[$0] }).first ?? .gen
    }
}

// MARK: - Estados (S7)

/// Patrón de cada familia: se distingue en escala de grises.
public enum StatusPattern: String, CaseIterable, Sendable {
    case rayado, punteado, solido, contorno, discontinuo, doble
}

/// Seis familias de estado, cada una con ícono y patrón propios.
public enum StatusFamily: String, CaseIterable, Sendable {
    case espera, llamado, atencion, listo, cerrado, critico

    public var label: String {
        switch self {
        case .espera: return "En espera"
        case .llamado: return "Llamado o en proceso"
        case .atencion: return "En atención o en uso"
        case .listo: return "Terminado o disponible"
        case .cerrado: return "Cancelado o fuera de servicio"
        case .critico: return "Crítico"
        }
    }

    /// SF Symbol (sección 7): reloj, megáfono, pulso, check, cruz, alerta.
    public var symbol: String {
        switch self {
        case .espera: return "clock"
        case .llamado: return "megaphone"
        case .atencion: return "waveform.path.ecg"
        case .listo: return "checkmark"
        case .cerrado: return "xmark"
        case .critico: return "exclamationmark.triangle"
        }
    }

    public var pattern: StatusPattern {
        switch self {
        case .espera: return .rayado
        case .llamado: return .punteado
        case .atencion: return .solido
        case .listo: return .contorno
        case .cerrado: return .discontinuo
        case .critico: return .doble
        }
    }

    public var strong: ColorPair {
        switch self {
        case .espera: return Palette.statusEspera
        case .llamado: return Palette.statusLlamado
        case .atencion: return Palette.statusAtencion
        case .listo: return Palette.statusListo
        case .cerrado: return Palette.statusCerrado
        case .critico: return Palette.critical
        }
    }

    public var soft: ColorPair {
        switch self {
        case .espera: return Palette.statusEsperaSoft
        case .llamado: return Palette.statusLlamadoSoft
        case .atencion: return Palette.statusAtencionSoft
        case .listo: return Palette.statusListoSoft
        case .cerrado: return Palette.statusCerradoSoft
        case .critico: return Palette.criticalSoft
        }
    }

    /// Valor de ejemplo de cada familia para la leyenda.
    public var sample: String {
        switch self {
        case .espera: return "en_espera"
        case .llamado: return "llamado"
        case .atencion: return "en_atencion"
        case .listo: return "completado"
        case .cerrado: return "cancelado"
        case .critico: return "critico_alto"
        }
    }

    private static let byValue: [String: StatusFamily] = [
        "en_espera": .espera, "solicitada": .espera, "pendiente": .espera, "pendiente_cama": .espera, "borrador": .espera,
        "publicado": .espera, "reservada": .espera, "provisional": .espera,
        "llamado": .llamado, "confirmada": .llamado, "en_proceso": .llamado, "limpieza": .llamado, "reprogramada": .llamado,
        "en_atencion": .atencion, "en_curso": .atencion, "ocupada": .atencion, "hospitalizado": .atencion,
        "en_servicio": .atencion, "abierta": .atencion,
        "atendida": .listo, "atendido": .listo, "completado": .listo, "firmada": .listo, "alta_firmada": .listo, "egresado": .listo, "libre": .listo,
        "disponible": .listo, "activo": .listo, "exito": .listo, "normal": .listo, "aprobada": .listo,
        "cancelado": .cerrado, "cancelada": .cerrado, "no_asistio": .cerrado, "no_se_presento": .cerrado, "cerrado": .cerrado,
        "rechazada": .cerrado, "vencida": .cerrado, "vencido": .cerrado, "bloqueada": .cerrado, "inactivo": .cerrado,
        "desactivado": .cerrado, "denegado": .cerrado, "fallido": .cerrado, "en_mantenimiento": .cerrado,
        "critico_alto": .critico, "critico_bajo": .critico
    ]

    /// Familia de un valor de la API; `nil` para los valores sin familia (`alto`, `bajo`, `sin_rango`, ...).
    public static func of(_ value: String) -> StatusFamily? { byValue[value] }
}

/// Lo que dibuja una insignia de estado: texto y, si la tiene, su familia (ícono + patrón + color).
public struct StatusBadgeStyle: Equatable, Sendable {
    public let label: String
    public let family: StatusFamily?

    /// Valor sin familia: se muestra neutro, con un punto y su texto.
    public var isNeutral: Bool { family == nil }

    /// `label` reemplaza la etiqueta común; un valor desconocido usa el código con espacios.
    public static func of(_ value: String, label: String? = nil) -> StatusBadgeStyle {
        StatusBadgeStyle(label: StatusCatalog.style(for: value, label: label).label, family: StatusFamily.of(value))
    }
}

// MARK: - Prioridad (S7)

/// El rojo crítico es solo de emergencia y de valores críticos.
public enum Priority: String, CaseIterable, Sendable {
    case emergencia, urgente, rutina

    public var label: String {
        switch self {
        case .emergencia: return "Emergencia"
        case .urgente: return "Urgente"
        case .rutina: return "Rutina"
        }
    }

    public var symbol: String {
        switch self {
        case .emergencia: return "exclamationmark.triangle"
        case .urgente: return "chevron.up.2"
        case .rutina: return "minus"
        }
    }

    public var strong: ColorPair {
        switch self {
        case .emergencia: return Palette.critical
        case .urgente: return Palette.priorityUrgente
        case .rutina: return Palette.priorityRutina
        }
    }

    public var soft: ColorPair {
        switch self {
        case .emergencia: return Palette.critical
        case .urgente: return Palette.priorityUrgenteSoft
        case .rutina: return Palette.priorityRutinaSoft
        }
    }

    /// Valor desconocido: rutina, igual que web.
    public static func of(_ value: String?) -> Priority { Priority(rawValue: value ?? "") ?? .rutina }
}

// MARK: - Espaciado, radios y movimiento (sección 4)

public enum SpaceToken {
    public static let space1: Double = 4
    public static let space2: Double = 8
    public static let space3: Double = 12
    public static let space4: Double = 16
    public static let space5: Double = 20
    public static let space6: Double = 24
    public static let space8: Double = 32
    public static let space10: Double = 40
    public static let space12: Double = 48
}

public enum RadiusToken {
    public static let chip: Double = 4
    public static let control: Double = 6
    public static let card: Double = 10
    public static let panel: Double = 16

    /// Radio de una capa interna: externo − padding (sección 4), nunca negativo.
    public static func inner(outer: Double, padding: Double) -> Double { max(0, outer - padding) }
}

/// Duraciones en segundos. Solo para confirmar una acción o mostrar a dónde fue algo.
public enum MotionToken {
    public static let instant: Double = 0.10
    public static let fast: Double = 0.16
    public static let standard: Double = 0.20

    /// Con «Reducir movimiento» no hay animación.
    public static func duration(_ base: Double, reduceMotion: Bool) -> Double? { reduceMotion ? nil : base }
}
