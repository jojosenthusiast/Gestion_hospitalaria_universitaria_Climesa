import Foundation

/// Estados con nombre del contrato (`contrato/openapi.json`, CON-09). El cliente solo agrega la etiqueta en español.
/// Un valor que esta versión de la app no conoce se lee como `desconocido` en lugar de romper la pantalla.
public protocol ContractEnum: RawRepresentable, CaseIterable, Hashable, Sendable where RawValue == String {
    static var fallback: Self { get }
    var label: String { get }
}

public extension ContractEnum {
    static func decodeLenient(_ decoder: Decoder) throws -> Self {
        let raw = try decoder.singleValueContainer().decode(String.self)
        return Self(rawValue: raw) ?? fallback
    }
}

/// `ServicioFila`
public enum QueueService: String, ContractEnum {
    case consultaGeneral = "consulta_general", emergencia, laboratorio, admisiones, desconocido
    public static var fallback: QueueService { .desconocido }
    public var label: String {
        switch self {
        case .consultaGeneral: return "Consulta general"
        case .emergencia: return "Emergencia"
        case .laboratorio: return "Laboratorio"
        case .admisiones: return "Admisiones"
        case .desconocido: return "Servicio"
        }
    }
}
extension QueueService: Decodable { public init(from decoder: Decoder) throws { self = try Self.decodeLenient(decoder) } }

/// `EstadoFila`
public enum QueueState: String, ContractEnum {
    case enEspera = "en_espera", llamado, enAtencion = "en_atencion", atendido, noSePresento = "no_se_presento", desconocido
    public static var fallback: QueueState { .desconocido }
    public var label: String {
        switch self {
        case .enEspera: return "En espera"
        case .llamado: return "Llamado"
        case .enAtencion: return "En atención"
        case .atendido: return "Atendido"
        case .noSePresento: return "No se presentó"
        case .desconocido: return "Sin estado"
        }
    }
    /// El número sigue vigente para la persona (todavía no termina su atención).
    public var isActive: Bool { self == .enEspera || self == .llamado || self == .enAtencion }
}
extension QueueState: Decodable { public init(from decoder: Decoder) throws { self = try Self.decodeLenient(decoder) } }

/// `EstadoCita`
public enum AppointmentState: String, ContractEnum {
    case solicitada, confirmada, atendida, cancelada, rechazada, noAsistio = "no_asistio", desconocido
    public static var fallback: AppointmentState { .desconocido }
    public var label: String {
        switch self {
        case .solicitada: return "Solicitada"
        case .confirmada: return "Confirmada"
        case .atendida: return "Atendida"
        case .cancelada: return "Cancelada"
        case .rechazada: return "Rechazada"
        case .noAsistio: return "No asistió"
        case .desconocido: return "Sin estado"
        }
    }
}
extension AppointmentState: Decodable { public init(from decoder: Decoder) throws { self = try Self.decodeLenient(decoder) } }

/// `EstadoConsulta`
public enum ConsultationState: String, ContractEnum {
    case abierta, firmada, ingresadaPorError = "ingresada_por_error", desconocido
    public static var fallback: ConsultationState { .desconocido }
    public var label: String {
        switch self {
        case .abierta: return "Abierta"
        case .firmada: return "Firmada"
        case .ingresadaPorError: return "Ingresada por error"
        case .desconocido: return "Sin estado"
        }
    }
}
extension ConsultationState: Decodable { public init(from decoder: Decoder) throws { self = try Self.decodeLenient(decoder) } }

/// `EstadoOrdenLaboratorio`
public enum LabOrderState: String, ContractEnum {
    case pendiente, enProceso = "en_proceso", completado, cancelado, desconocido
    public static var fallback: LabOrderState { .desconocido }
    public var label: String {
        switch self {
        case .pendiente: return "Pendiente"
        case .enProceso: return "En proceso"
        case .completado: return "Completado"
        case .cancelado: return "Cancelado"
        case .desconocido: return "Sin estado"
        }
    }
}
extension LabOrderState: Decodable { public init(from decoder: Decoder) throws { self = try Self.decodeLenient(decoder) } }

/// `PrioridadLaboratorio`
public enum LabPriority: String, ContractEnum {
    case rutina, urgente, desconocido
    public static var fallback: LabPriority { .desconocido }
    public var label: String {
        switch self {
        case .rutina: return "Rutina"
        case .urgente: return "Urgente"
        case .desconocido: return "Sin prioridad"
        }
    }
}
extension LabPriority: Decodable { public init(from decoder: Decoder) throws { self = try Self.decodeLenient(decoder) } }

/// `MarcaResultado`
public enum ResultMark: String, ContractEnum {
    case normal, alto, bajo, criticoAlto = "critico_alto", criticoBajo = "critico_bajo", sinRango = "sin_rango", desconocido
    public static var fallback: ResultMark { .desconocido }
    public var label: String {
        switch self {
        case .normal: return "Normal"
        case .alto: return "Alto"
        case .bajo: return "Bajo"
        case .criticoAlto: return "Crítico alto"
        case .criticoBajo: return "Crítico bajo"
        case .sinRango: return "Sin rango"
        case .desconocido: return "Sin marca"
        }
    }
    public var isCritical: Bool { self == .criticoAlto || self == .criticoBajo }
}
extension ResultMark: Decodable { public init(from decoder: Decoder) throws { self = try Self.decodeLenient(decoder) } }

/// `EstadoAdmision`
public enum AdmissionState: String, ContractEnum {
    case pendienteCama = "pendiente_cama", hospitalizado, altaFirmada = "alta_firmada", egresado, cancelada, desconocido
    public static var fallback: AdmissionState { .desconocido }
    public var label: String {
        switch self {
        case .pendienteCama: return "Pendiente de cama"
        case .hospitalizado: return "Hospitalizado"
        case .altaFirmada: return "Alta firmada"
        case .egresado: return "Egresado"
        case .cancelada: return "Cancelada"
        case .desconocido: return "Sin estado"
        }
    }
}
extension AdmissionState: Decodable { public init(from decoder: Decoder) throws { self = try Self.decodeLenient(decoder) } }

/// `CategoriaHabitacion`
public enum RoomCategory: String, ContractEnum {
    case vip, semiprivada, desconocido
    public static var fallback: RoomCategory { .desconocido }
    public var label: String {
        switch self {
        case .vip: return "VIP"
        case .semiprivada: return "Semiprivada"
        case .desconocido: return "Sin categoría"
        }
    }
}
extension RoomCategory: Decodable { public init(from decoder: Decoder) throws { self = try Self.decodeLenient(decoder) } }

/// `EstadoVinculacion`
public enum LinkState: String, ContractEnum {
    case pendiente, aprobada, rechazada, desconocido
    public static var fallback: LinkState { .desconocido }
    public var label: String {
        switch self {
        case .pendiente: return "En verificación"
        case .aprobada: return "Aprobada"
        case .rechazada: return "Rechazada"
        case .desconocido: return "Sin estado"
        }
    }
}
extension LinkState: Decodable { public init(from decoder: Decoder) throws { self = try Self.decodeLenient(decoder) } }

/// `EstadoSolicitudAmbulancia`
public enum AmbulanceRequestState: String, ContractEnum {
    case porConfirmar = "por_confirmar", confirmada, descartada, cancelada, desconocido
    public static var fallback: AmbulanceRequestState { .desconocido }
    public var label: String {
        switch self {
        case .porConfirmar: return "Por confirmar"
        case .confirmada: return "Confirmada"
        case .descartada: return "Descartada"
        case .cancelada: return "Cancelada"
        case .desconocido: return "Sin estado"
        }
    }
}
extension AmbulanceRequestState: Decodable { public init(from decoder: Decoder) throws { self = try Self.decodeLenient(decoder) } }

/// `PrioridadAmbulancia`
public enum AmbulancePriority: String, ContractEnum {
    case roja, naranja, amarilla, verde, desconocido
    public static var fallback: AmbulancePriority { .desconocido }
    public var label: String {
        switch self {
        case .roja: return "Roja"
        case .naranja: return "Naranja"
        case .amarilla: return "Amarilla"
        case .verde: return "Verde"
        case .desconocido: return "Sin prioridad"
        }
    }
}
extension AmbulancePriority: Decodable { public init(from decoder: Decoder) throws { self = try Self.decodeLenient(decoder) } }

/// `AccesoHistorial`
public enum HistoryAccess: String, ContractEnum {
    case propio, relacion, desconocido
    public static var fallback: HistoryAccess { .desconocido }
    public var label: String {
        switch self {
        case .propio: return "Tu expediente"
        case .relacion: return "Relación de atención"
        case .desconocido: return "Acceso"
        }
    }
}
extension HistoryAccess: Decodable { public init(from decoder: Decoder) throws { self = try Self.decodeLenient(decoder) } }

/// Tipo de alta del cuerpo `DischargeDto.type`.
public enum DischargeType: String, CaseIterable, Sendable {
    case medica, voluntaria, traslado, defuncion
    public var label: String {
        switch self {
        case .medica: return "Médica"
        case .voluntaria: return "Voluntaria"
        case .traslado: return "Traslado"
        case .defuncion: return "Defunción"
        }
    }
}
