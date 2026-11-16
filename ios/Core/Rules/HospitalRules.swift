import Foundation

/// "Mis turnos" (I26): estado, asistencia y orden por día (ASIS-01). La entrada se confirma sola a la hora de inicio en
/// la API (el estado sigue al reloj), así que la app no ofrece marcarla; solo Jefatura registra ausencias.
public enum ShiftAttendanceRules {
    /// Nombre del estado del turno; nunca el código crudo.
    public static func stateLabel(_ state: String) -> String {
        switch state {
        case "publicado": return "Publicado"
        case "en_curso": return "En curso"
        case "completado": return "Completado"
        case "cancelado": return "Cancelado"
        case "ausente": return "Ausente"
        case "borrador": return "Borrador"
        default: return state.replacingOccurrences(of: "_", with: " ")
        }
    }

    /// Texto de la asistencia para la persona, o `nil` si el turno no se trabaja.
    public static func attendanceLabel(_ attendance: String?, late: Bool) -> String? {
        switch attendance {
        case "presente": return late ? "Entrada corregida · llegó tarde" : "Entrada confirmada"
        case "ausente": return "Ausencia registrada"
        case "pendiente": return "Se confirma sola al iniciar"
        case "sin_registro": return "Sin registro de entrada"
        default: return nil
        }
    }

    private static let zone = TimeZone(identifier: "America/El_Salvador")!
    private static var calendar: Calendar { var c = Calendar(identifier: .gregorian); c.timeZone = zone; return c }
    private static func formatter(_ pattern: String) -> DateFormatter {
        let f = DateFormatter(); f.locale = Locale(identifier: "es_SV"); f.timeZone = zone; f.dateFormat = pattern; return f
    }

    /// Instante ISO 8601 de la API (con o sin fracciones de segundo), o `nil` si no es válido.
    public static func date(_ iso: String?) -> Date? {
        guard let iso, !iso.isEmpty else { return nil }
        let fractional = ISO8601DateFormatter(); fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return fractional.date(from: iso) ?? ISO8601DateFormatter().date(from: iso)
    }

    /// `07:00 a 15:00`, `07:00 a 07:00 del día siguiente · Guardia 24 h`, en hora de El Salvador.
    public static func hours(start: Date?, end: Date?, type: String?) -> String {
        guard let start, let end else { return "Sin hora" }
        let clock = formatter("HH:mm")
        let nextDay = !calendar.isDate(start, inSameDayAs: end.addingTimeInterval(-0.001))
        let kind: String
        switch type {
        case "guardia": kind = end.timeIntervalSince(start) == 24 * 3600 ? " · Guardia 24 h" : " · Guardia"
        case "nocturno": kind = " · Nocturno"
        default: kind = ""
        }
        return "\(clock.string(from: start)) a \(clock.string(from: end))\(nextDay ? " del día siguiente" : "")\(kind)"
    }

    /// `Hoy · martes, 10 de noviembre`, `Mañana · …`, `Ayer · …` o `Jueves, 12 de noviembre`.
    public static func dayTitle(_ day: Date, today: Date) -> String {
        let name = formatter("EEEE, d 'de' MMMM").string(from: day)
        let diff = calendar.dateComponents([.day], from: calendar.startOfDay(for: today), to: calendar.startOfDay(for: day)).day ?? 99
        switch diff {
        case 0: return "Hoy · \(name)"
        case 1: return "Mañana · \(name)"
        case -1: return "Ayer · \(name)"
        default: return name.prefix(1).uppercased() + name.dropFirst()
        }
    }

    /// Turnos agrupados por el día asignado (el día en que empiezan), turnos en orden de inicio. "Mis turnos" abre en
    /// hoy: hoy, un día con un turno que sigue en curso (la noche de ayer) y lo que viene van primero, en orden de fecha;
    /// los días anteriores ya terminados van debajo, el más reciente primero, con `past`. Sin fecha, al final.
    public static func byDay<T>(_ items: [T], start: (T) -> Date?, end: (T) -> Date? = { _ in nil }, today: Date) -> [(title: String, items: [T], past: Bool)] {
        let dated = items.compactMap { item in start(item).map { (item, $0) } }.sorted { $0.1 < $1.1 }
        var groups: [(title: String, items: [T], day: Date)] = []
        for (item, at) in dated {
            if let last = groups.last, calendar.isDate(last.day, inSameDayAs: at) { groups[groups.count - 1].items.append(item) }
            else { groups.append((dayTitle(at, today: today), [item], at)) }
        }
        let startOfToday = calendar.startOfDay(for: today)
        let isPast = { (group: (title: String, items: [T], day: Date)) in
            group.day < startOfToday && group.items.allSatisfy { item in end(item).map { $0 <= today } ?? false }
        }
        var result = groups.filter { !isPast($0) }.map { (title: $0.title, items: $0.items, past: false) }
        result += groups.filter(isPast).reversed().map { (title: $0.title, items: $0.items, past: true) }
        let undated = items.filter { start($0) == nil }
        if !undated.isEmpty { result.append((title: "Sin fecha", items: undated, past: false)) }
        return result
    }
}

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

/// "Mis datos": el paciente edita solo su contacto con `pacientes.editar_propios` (`PATCH /me/paciente`).
/// Las reglas espejan `validateContact` de la API: teléfono de 8 dígitos que empieza en 2, 6 o 7, y correo válido.
public enum PatientProfileRules {
    public static func errors(phone: String, email: String, address: String) -> [String: String] {
        var errors: [String: String] = [:]
        let phoneText = phone.trimmingCharacters(in: .whitespaces)
        if !phoneText.isEmpty && phoneText.range(of: #"^[267][0-9]{3}-?[0-9]{4}$"#, options: .regularExpression) == nil {
            errors["phone"] = "Escribe el teléfono con 8 dígitos y empieza con 2, 6 o 7 (por ejemplo 7777-7777)."
        }
        let emailText = email.trimmingCharacters(in: .whitespaces)
        if !emailText.isEmpty && (emailText.count > 254 || emailText.range(of: #"^[^\s@]+@[^\s@]+\.[^\s@]+$"#, options: .regularExpression) == nil) {
            errors["email"] = "Ingresa un correo válido."
        }
        if address.trimmingCharacters(in: .whitespacesAndNewlines).count > 500 { errors["address"] = "La dirección admite hasta 500 caracteres." }
        return errors
    }

    /// Cuerpo de `PATCH /me/paciente`: el texto vacío se envía como `""` para que la API borre el dato.
    public static func body(version: Int, phone: String, email: String, address: String) -> PatientSelfUpdateBody {
        func trimmed(_ text: String) -> String { text.trimmingCharacters(in: .whitespacesAndNewlines) }
        return PatientSelfUpdateBody(version: version, phone: trimmed(phone), email: trimmed(email), address: trimmed(address))
    }
}

/// Ubicación del hospital: teléfono para llamar y enlace de Mapas en las coordenadas publicadas.
public enum HospitalLocationRules {
    /// `tel:` con solo dígitos; nil si el hospital no tiene teléfono utilizable.
    public static func callURL(_ location: HospitalLocation) -> URL? {
        let digits = location.phone.filter(\.isNumber)
        return digits.isEmpty ? nil : URL(string: "tel:" + digits)
    }

    /// Apple Maps en las coordenadas del hospital; sin ubicación, búsqueda por nombre (`fallbackQuery`).
    public static func mapsURL(_ location: HospitalLocation?, fallbackQuery: String) -> URL? {
        var components = URLComponents(string: "https://maps.apple.com/")
        if let location {
            components?.queryItems = [
                URLQueryItem(name: "ll", value: "\(location.latitude),\(location.longitude)"),
                URLQueryItem(name: "q", value: location.name)
            ]
        } else {
            components?.queryItems = [URLQueryItem(name: "q", value: fallbackQuery)]
        }
        return components?.url
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
    case completado, cancelado, sinTraslado = "sin_traslado", rechazaTraslado = "rechaza_traslado", fallecido, desviado
    public var label: String {
        switch self {
        case .completado: return "Completado"
        case .cancelado: return "Cancelado"
        case .sinTraslado: return "Sin traslado"
        case .rechazaTraslado: return "Rechaza traslado"
        case .fallecido: return "Paciente fallecido"
        case .desviado: return "Desviado a otro centro"
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

    /// Códigos de bloqueo por tripulación incompleta (RN-30): faltan paramédico, motorista o ambos.
    public static let crewBlockCodes: Set<String> = ["sin_paramedico_de_turno", "sin_motorista_de_turno", "sin_tripulacion_de_turno"]

    /// Lo que tiene que hacer quien ve una unidad bloqueada: publicar un turno o a quién avisar (RN-30).
    /// Sin `turnos.planificar` no puede publicar turnos, así que se le dice a quién avisar por la tripulación que falta.
    public static func blockAdvice(_ block: AmbulanceStatus.DispatchBlock, canPlanShifts: Bool) -> String {
        if canPlanShifts { return block.action }
        switch block.code {
        case "sin_paramedico_de_turno": return "Falta el turno del paramédico: avisa a la Jefatura de Operaciones."
        case "sin_motorista_de_turno": return "Falta el turno del motorista: avisa a la Jefatura de Operaciones."
        case "sin_tripulacion_de_turno": return "Faltan los turnos del paramédico y del motorista: avisa a la Jefatura de Operaciones."
        default: return "\(block.action) Avisa a quien planifica los turnos."
        }
    }

    /// Tripulación que falta en la unidad, o `nil` si está completa o la API no lo informa.
    /// No se repite cuando el bloqueo de despacho ya es por tripulación.
    public static func crewNotice(_ status: AmbulanceStatus) -> String? {
        if let code = status.dispatchBlock?.code, crewBlockCodes.contains(code) { return nil }
        let paramedic = status.paramedicOnDuty ?? true
        let driver = status.driverOnDuty ?? true
        switch (paramedic, driver) {
        case (false, false): return "Sin paramédico ni motorista con turno en curso."
        case (false, true): return "Sin paramédico con turno en curso."
        case (true, false): return "Sin motorista con turno en curso."
        default: return nil
        }
    }
}
