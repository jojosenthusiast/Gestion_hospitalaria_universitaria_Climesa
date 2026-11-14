import Foundation

/// Tono visual de un estado (mismos grupos que las clases `.status-*` de web/src/modules.css).
public enum StatusTone: String, Sendable, CaseIterable {
    case success, process, reserved, warning, blocked, danger, neutral
}

/// Etiqueta en español y tono de un código de estado de la API (`statusNames` de web/src/features/common.tsx).
public struct StatusStyle: Equatable, Sendable {
    public let label: String
    public let tone: StatusTone
}

public enum StatusCatalog {
    private static let labels: [String: String] = [
        "activo": "Activo", "inactivo": "Inactivo", "provisional": "Provisional", "libre": "Libre", "ocupada": "Ocupada",
        "reservada": "Reservada", "limpieza": "En limpieza", "bloqueada": "Bloqueada", "borrador": "Borrador",
        "publicado": "Pendiente de iniciar", "pendiente": "Pendiente de iniciar", "en_curso": "En curso",
        "completado": "Completado", "cancelado": "Cancelado", "cancelada": "Cancelada", "solicitada": "Solicitada",
        "confirmada": "Confirmada", "atendida": "Atendida", "firmada": "Firmada", "rechazada": "Rechazada",
        "no_asistio": "No asistió", "desactivado": "Desactivado", "pendiente_cama": "Pendiente de cama",
        "hospitalizado": "Hospitalizado", "alta_firmada": "Alta firmada", "egresado": "Egresado", "exito": "Correcto",
        "denegado": "Denegado", "fallido": "Fallido", "en_espera": "En espera", "llamado": "Llamado",
        "en_atencion": "En atención", "no_se_presento": "No se presentó", "en_proceso": "En proceso", "abierta": "Abierta",
        "bajo_minimo": "Bajo mínimo", "vencido": "Vencido", "normal": "Normal", "alto": "Alto", "bajo": "Bajo",
        "critico_alto": "Crítico alto", "critico_bajo": "Crítico bajo", "sin_rango": "Sin rango",
        "disponible": "Disponible", "en_servicio": "En servicio", "en_mantenimiento": "En mantenimiento"
    ]

    private static let tones: [String: StatusTone] = [
        "activo": .success, "libre": .success, "exito": .success, "completado": .success, "disponible": .success,
        "ocupada": .process, "publicado": .process, "en_curso": .process,
        "reservada": .reserved, "provisional": .reserved, "borrador": .reserved, "pendiente": .reserved,
        "limpieza": .warning,
        "inactivo": .blocked, "desactivado": .blocked, "bloqueada": .blocked, "en_mantenimiento": .blocked,
        "denegado": .danger, "fallido": .danger, "cancelado": .danger, "en_servicio": .danger
    ]

    /// `label` reemplaza la etiqueta común cuando el mismo código significa otra cosa en un módulo.
    /// Un código sin entrada usa el código con espacios y el tono neutro, igual que web.
    public static func style(for code: String, label: String? = nil) -> StatusStyle {
        StatusStyle(label: label ?? labels[code] ?? code.replacingOccurrences(of: "_", with: " "), tone: tones[code] ?? .neutral)
    }
}
