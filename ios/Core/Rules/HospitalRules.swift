import Foundation

/// Filtro por estado de los exámenes del paciente (Pendiente / En proceso / Completado).
public enum LabFilter: String, CaseIterable, Sendable, Hashable {
    case all, pendiente, enProceso, completado

    /// Clave de Localizable.xcstrings con el nombre del filtro.
    public var titleKey: String { "exams.filter.\(rawValue)" }

    public func matches(_ order: LabOrder) -> Bool {
        switch self {
        case .all: return true
        case .pendiente: return order.state == .pendiente
        case .enProceso: return order.state == .enProceso
        case .completado: return order.state == .completado
        }
    }

    /// Órdenes que cumplen el filtro, la más reciente primero.
    public func apply(_ orders: [LabOrder]) -> [LabOrder] {
        orders.filter(matches).sorted { $0.createdAt > $1.createdAt }
    }

    public func count(in orders: [LabOrder]) -> Int { orders.filter(matches).count }
}

/// Un piso de la ocupación pública: sus categorías y los totales.
public struct OccupancyFloor: Equatable, Sendable, Identifiable {
    public let floor: Int?
    public let rows: [PublicOccupancy.Row]
    public var id: String { floor.map(String.init) ?? "sin_piso" }
    public var beds: Int { rows.reduce(0) { $0 + $1.beds } }
    public var free: Int { rows.reduce(0) { $0 + $1.free } }
    public var occupied: Int { rows.reduce(0) { $0 + $1.occupied } }
    public var percent: Int { OccupancyRules.percent(occupied: occupied, beds: beds) }
}

/// I10: ocupación del hospital en detalle (total, por piso y por categoría), siempre con datos públicos.
public enum OccupancyRules {
    public static func totals(_ rows: [PublicOccupancy.Row]) -> (beds: Int, free: Int, occupied: Int) {
        (rows.reduce(0) { $0 + $1.beds }, rows.reduce(0) { $0 + $1.free }, rows.reduce(0) { $0 + $1.occupied })
    }

    /// Porcentaje de camas ocupadas, redondeado; 0 si no hay camas.
    public static func percent(occupied: Int, beds: Int) -> Int {
        guard beds > 0 else { return 0 }
        return Int((Double(occupied) / Double(beds) * 100).rounded())
    }

    /// Pisos en orden ascendente; las filas sin piso van al final.
    public static func floors(_ rows: [PublicOccupancy.Row]) -> [OccupancyFloor] {
        let numbered = Set(rows.compactMap(\.floor)).sorted()
        var result = numbered.map { floor in OccupancyFloor(floor: floor, rows: rows.filter { $0.floor == floor }) }
        let unassigned = rows.filter { $0.floor == nil }
        if !unassigned.isEmpty { result.append(OccupancyFloor(floor: nil, rows: unassigned)) }
        return result
    }

    /// Tono de la barra: verde hasta 69 %, ámbar hasta 89 %, rojo desde 90 %.
    public static func tone(percent: Int) -> StatusTone {
        percent >= 90 ? .danger : percent >= 70 ? .warning : .success
    }
}

/// Habitación asignada: el paciente ve la suya (`admision.ver` propio) y el médico la de sus pacientes (relación).
public enum RoomRules {
    /// Hospitalización vigente con cama asignada.
    public static func current(_ admissions: [Admission], patientId: String? = nil) -> Admission? {
        admissions.first { $0.state == .hospitalizado && !$0.bed.isEmpty && (patientId == nil || $0.patientId == patientId) }
    }

    /// Hospitalización pedida que todavía espera cama.
    public static func waiting(_ admissions: [Admission], patientId: String? = nil) -> Admission? {
        admissions.first { $0.state == .pendienteCama && (patientId == nil || $0.patientId == patientId) }
    }
}

/// "Mis datos": solo el contacto es editable y solo con `pacientes.editar_demograficos` (la API decide quién lo tiene).
public enum PatientProfileRules {
    public static func errors(phone: String, email: String, address: String, reason: String) -> [String: String] {
        var errors: [String: String] = [:]
        let phoneText = phone.trimmingCharacters(in: .whitespaces)
        if !phoneText.isEmpty && phoneText.range(of: #"^[0-9+ -]{8,9}$"#, options: .regularExpression) == nil {
            errors["phone"] = "Escribe el teléfono con 8 dígitos (por ejemplo 7777-7777)."
        }
        let emailText = email.trimmingCharacters(in: .whitespaces)
        if !emailText.isEmpty && (emailText.count > 254 || emailText.range(of: #"^[^\s@]+@[^\s@]+\.[^\s@]+$"#, options: .regularExpression) == nil) {
            errors["email"] = "Ingresa un correo válido."
        }
        if address.trimmingCharacters(in: .whitespacesAndNewlines).count > 500 { errors["address"] = "La dirección admite hasta 500 caracteres." }
        let size = reason.trimmingCharacters(in: .whitespacesAndNewlines).count
        if !(10...500).contains(size) { errors["reason"] = "Escribe el motivo del cambio (10 a 500 caracteres)." }
        return errors
    }

    public static func body(profile: PatientProfile, phone: String, email: String, address: String, reason: String) -> PatientUpdateBody {
        func clean(_ text: String) -> String? { let value = text.trimmingCharacters(in: .whitespacesAndNewlines); return value.isEmpty ? nil : value }
        return PatientUpdateBody(givenNames: profile.givenNames, surnames: profile.surnames, sex: profile.sex,
                                 phone: clean(phone), email: clean(email), address: clean(address),
                                 version: profile.version, reason: reason.trimmingCharacters(in: .whitespacesAndNewlines))
    }
}

/// Un día de la agenda del médico.
public struct AgendaDay: Equatable, Sendable, Identifiable {
    public let day: String
    public let entries: [AgendaEntry]
    public var id: String { day }
}

/// Agenda del médico: citas de sus pacientes agrupadas por día.
public enum AgendaRules {
    /// Días desde hoy en adelante, ascendente; dentro del día, por hora.
    public static func upcoming(_ entries: [AgendaEntry], now: Date) -> [AgendaDay] {
        group(entries, now: now) { $0 >= $1 }.sorted { $0.day < $1.day }
    }

    /// Días anteriores a hoy, el más reciente primero.
    public static func past(_ entries: [AgendaEntry], now: Date) -> [AgendaDay] {
        group(entries, now: now) { $0 < $1 }.sorted { $0.day > $1.day }
    }

    private static func group(_ entries: [AgendaEntry], now: Date, keep: (String, String) -> Bool) -> [AgendaDay] {
        let today = ClimesaDates.localDay(now)
        var buckets: [String: [AgendaEntry]] = [:]
        for entry in entries {
            guard let date = ClimesaDates.parse(entry.start) else { continue }
            let day = ClimesaDates.localDay(date)
            if keep(day, today) { buckets[day, default: []].append(entry) }
        }
        return buckets.map { AgendaDay(day: $0.key, entries: $0.value.sorted { $0.start < $1.start }) }
    }
}

/// Expediente: solo la persona dueña y el médico tratante. Sin relación de atención la API responde 403.
public enum RecordAccess {
    public static func deniedMessage(for failure: APIFailure?, viewerIsPatient: Bool) -> String? {
        guard let failure, failure.isForbidden else { return nil }
        return viewerIsPatient
            ? "Solo puedes ver tu propio expediente."
            : "Solo el médico tratante puede ver este expediente. Se habilita cuando hay una cita, consulta u hospitalización a tu cargo."
    }
}

/// Estado final de un servicio de ambulancia (`EstadoFinalServicio`).
public enum AmbulanceFinalState: String, CaseIterable, Sendable, Hashable {
    case completado, cancelado, sinTraslado = "sin_traslado", rechazaTraslado = "rechaza_traslado"
    public var label: String {
        switch self {
        case .completado: return "Completado"
        case .cancelado: return "Cancelado"
        case .sinTraslado: return "Sin traslado"
        case .rechazaTraslado: return "Rechaza traslado"
        }
    }
}

/// Filtros de `GET /ambulancia/bitacora` (`q`, `from`, `to`, `priority`, `finalState`).
public struct AmbulanceLogQuery: Equatable, Sendable {
    public var text = ""
    public var from: String?
    public var to: String?
    public var priority: AmbulancePriority?
    public var finalState: AmbulanceFinalState?
    public init() {}

    /// Cuántos filtros hay activos (para el distintivo del panel y "Quitar filtros").
    public var activeCount: Int {
        [!text.trimmingCharacters(in: .whitespaces).isEmpty, from != nil, to != nil, priority != nil, finalState != nil].filter { $0 }.count
    }

    /// Mensaje si el rango de fechas no tiene sentido; nil si es válido.
    public var rangeError: String? {
        guard let from, let to, from > to else { return nil }
        return "La fecha inicial no puede ser posterior a la final."
    }

    public var path: String {
        var items: [String] = []
        let q = text.trimmingCharacters(in: .whitespaces)
        if !q.isEmpty { items.append("q=\(Self.encode(q))") }
        if let from { items.append("from=\(from)") }
        if let to { items.append("to=\(to)") }
        if let priority, priority != .desconocido { items.append("priority=\(priority.rawValue)") }
        if let finalState { items.append("finalState=\(finalState.rawValue)") }
        return items.isEmpty ? "/ambulancia/bitacora" : "/ambulancia/bitacora?" + items.joined(separator: "&")
    }

    private static func encode(_ value: String) -> String {
        var allowed = CharacterSet.urlQueryAllowed
        allowed.remove(charactersIn: "&=+?#")
        return value.addingPercentEncoding(withAllowedCharacters: allowed) ?? ""
    }
}

/// Bitácora de ambulancia: textos de resumen.
public enum AmbulanceLogRules {
    public static func finalStateLabel(_ code: String?) -> String {
        guard let code else { return "En curso" }
        return AmbulanceFinalState(rawValue: code)?.label ?? code.replacingOccurrences(of: "_", with: " ")
    }

    public static func typeLabel(_ code: String) -> String {
        switch code {
        case "emergencia_domicilio": return "Emergencia a domicilio"
        case "traslado_interhospitalario": return "Traslado interhospitalario"
        default: return code.replacingOccurrences(of: "_", with: " ")
        }
    }

    public static func responseText(_ minutes: Double?) -> String? {
        guard let minutes else { return nil }
        return "Respuesta en \(Int(minutes.rounded())) min"
    }

    /// Lo que tiene que hacer quien ve una unidad bloqueada: publicar un turno o a quién avisar (RN-30).
    public static func blockAdvice(_ block: AmbulanceStatus.DispatchBlock, canPlanShifts: Bool) -> String {
        canPlanShifts ? block.action : "\(block.action) Avisa a quien planifica los turnos."
    }
}
