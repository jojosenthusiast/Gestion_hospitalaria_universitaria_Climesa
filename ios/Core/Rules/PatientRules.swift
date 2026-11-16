import Foundation

/// I03: vincular la cuenta con el expediente (spec 101, FR-101-08 a FR-101-10). El cliente solo revisa el formato;
/// la API valida el DUI contra el expediente. Igual que `LinkRules` de Android.
public enum LinkRules {
    public static func digits(_ text: String) -> String { text.filter(\.isNumber) }

    /// DUI de 9 dígitos con dígito verificador válido (8 dígitos ponderados de 9 a 2, módulo 10).
    public static func validDui(_ text: String) -> Bool {
        let numbers = digits(text).compactMap { $0.wholeNumberValue }
        guard numbers.count == 9, numbers.prefix(8).contains(where: { $0 != 0 }) else { return false }
        let sum = numbers.prefix(8).enumerated().reduce(0) { $0 + $1.element * (9 - $1.offset) }
        return (10 - sum % 10) % 10 == numbers[8]
    }

    public static func formatDui(_ text: String) -> String {
        let value = digits(text)
        return value.count == 9 ? "\(value.prefix(8))-\(value.suffix(1))" : text.trimmingCharacters(in: .whitespaces)
    }

    /// Errores por campo (`dui`, `birth`); vacío cuando se puede enviar.
    public static func errors(dui: String, birth: String, today: Date) -> [String: String] {
        var errors: [String: String] = [:]
        let trimmed = dui.trimmingCharacters(in: .whitespaces)
        if trimmed.range(of: #"^[0-9]{8}-?[0-9]$"#, options: .regularExpression) == nil || !validDui(trimmed) {
            errors["dui"] = "Usa 9 dígitos con un verificador válido."
        }
        let day = birth.trimmingCharacters(in: .whitespaces)
        if day.range(of: #"^\d{4}-\d{2}-\d{2}$"#, options: .regularExpression) == nil || ClimesaDates.parse(day + "T12:00:00Z") == nil {
            errors["birth"] = "Escribe la fecha como aaaa-mm-dd."
        } else if day > ClimesaDates.localDay(today) {
            errors["birth"] = "La fecha de nacimiento no puede ser futura."
        }
        return errors
    }

    public static func body(dui: String, birth: String) -> LinkRequestBody {
        LinkRequestBody(dui: formatDui(dui), birth: birth.trimmingCharacters(in: .whitespaces))
    }
}

/// I05: seguimiento del número propio en la fila.
public enum QueueRules {
    /// Número vigente de la persona (el más reciente que no terminó).
    public static func activeTicket(_ tickets: [QueueTicket]) -> QueueTicket? {
        tickets.filter { $0.state.isActive }.max { $0.issuedAt < $1.issuedAt }
    }

    /// Números por delante del mío según los llamados públicos de hoy. Es aproximado: los números se emiten en orden
    /// por servicio y día, pero alguien puede no presentarse. nil si todavía no se llamó a nadie.
    public static func ahead(of number: Int, called: [PublicQueue.Called]) -> Int? {
        guard let last = called.map(\.number).max() else { return nil }
        return max(0, number - last - 1)
    }

    /// Consultorio asignado cuando ya me llamaron.
    public static func office(for number: Int, called: [PublicQueue.Called]) -> String? {
        called.first { $0.number == number }?.office
    }

    /// I20 "Llamar siguiente": el número en espera más bajo de consulta general.
    public static func nextToCall(_ tickets: [QueueTicket], service: QueueService = .consultaGeneral) -> QueueTicket? {
        tickets.filter { $0.service == service && $0.state == .enEspera }.min { $0.number < $1.number }
    }
}

/// I06: citas del paciente.
public enum AppointmentRules {
    /// Próximas (ascendente) y pasadas (descendente) respecto de `now`.
    public static func split(_ appointments: [Appointment], now: Date) -> (upcoming: [Appointment], past: [Appointment]) {
        let stamp = ClimesaDates.iso(now)
        let upcoming = appointments.filter { isUpcoming($0, nowISO: stamp) }.sorted { $0.start < $1.start }
        let past = appointments.filter { !isUpcoming($0, nowISO: stamp) }.sorted { $0.start > $1.start }
        return (upcoming, past)
    }

    private static func isUpcoming(_ appointment: Appointment, nowISO: String) -> Bool {
        guard let start = ClimesaDates.parse(appointment.start), let now = ClimesaDates.parse(nowISO) else { return false }
        return start > now && (appointment.state == .solicitada || appointment.state == .confirmada)
    }

    /// Solo se cancela una cita futura solicitada o confirmada. El plazo (RN-21) lo decide la API.
    public static func canCancel(_ appointment: Appointment, now: Date) -> Bool {
        guard let start = ClimesaDates.parse(appointment.start) else { return false }
        return start > now && (appointment.state == .solicitada || appointment.state == .confirmada)
    }

    /// RN-21 (política `citas.cancelacion_horas`): el paciente cancela hasta 2 h antes del inicio.
    public static let patientCancelHours = 2

    /// Qué puede hacer el paciente con "Cancelar" según estado y hora (CITA-04): no se ofrece lo que la API rechazaría.
    public enum CancelOption: Equatable, Sendable {
        /// Cita pasada, empezada o ya en un estado final: no se muestra la acción.
        case hidden
        /// Se puede cancelar hasta `deadline`.
        case allowed(deadline: Date)
        /// Faltan menos de `patientCancelHours`: la acción se muestra desactivada con el motivo.
        case tooLate(deadline: Date)
        /// El servidor la bloquea (`blockedActions`) con un motivo propio que se muestra tal cual.
        case blocked(reason: String)
    }

    /// Cuando la API manda `allowedActions` (CITA-04), ella decide; el cálculo local queda para respuestas anteriores.
    public static func cancelOption(_ appointment: Appointment, now: Date, hours: Int = AppointmentRules.patientCancelHours) -> CancelOption {
        if let allowed = appointment.allowedActions {
            if allowed.contains(.cancelar) {
                let deadline = appointment.cancelableUntil.flatMap(ClimesaDates.parse) ?? ClimesaDates.parse(appointment.start) ?? now
                return .allowed(deadline: deadline)
            }
            if let reason = blockedReason(appointment, .cancelar) { return .blocked(reason: reason) }
            return .hidden
        }
        guard canCancel(appointment, now: now), let start = ClimesaDates.parse(appointment.start) else { return .hidden }
        let deadline = start.addingTimeInterval(-Double(hours) * 3600)
        return now < deadline ? .allowed(deadline: deadline) : .tooLate(deadline: deadline)
    }

    /// "Puedes cancelar hasta las 08:00" (el mismo día) o "... hasta las 08:00 del 20 nov 2026", en hora de El Salvador.
    public static func cancelDeadlineText(_ deadline: Date, now: Date) -> String {
        let time = ClimesaDates.display(ClimesaDates.iso(deadline), .time)
        if ClimesaDates.localDay(deadline) == ClimesaDates.localDay(now) { return "Puedes cancelar hasta las \(time)." }
        return "Puedes cancelar hasta las \(time) del \(ClimesaDates.display(ClimesaDates.iso(deadline), .date))."
    }

    public static func cancelTooLateText(hours: Int = AppointmentRules.patientCancelHours) -> String {
        "Ya no puedes cancelar desde la aplicación: faltan menos de \(hours) h para la cita. Comunícate con Recepción."
    }

    /// Motivo del servidor para una acción bloqueada, si la hay.
    public static func blockedReason(_ appointment: Appointment, _ action: AppointmentAction) -> String? {
        appointment.blockedActions?.first { $0.action == action }?.reason
    }

    /// CITA-02: el paciente puede pedir otra franja solo si el servidor lo permite ahora.
    public static func canReschedule(_ appointment: Appointment) -> Bool {
        appointment.allowedActions?.contains(.reprogramar) ?? false
    }

    /// Texto de la última solicitud de reprogramación, para el paciente.
    public static func rescheduleText(_ appointment: Appointment) -> String? {
        guard let request = appointment.reschedule else { return nil }
        let when = ClimesaDates.display(request.start)
        switch request.state {
        case .pendiente: return "Pediste cambiar a \(when). Tu cita actual sigue vigente hasta que Recepción o tu médico respondan."
        case .rechazada: return "No se aceptó el cambio a \(when)\(request.rejectionReason.map { ": \($0)" } ?? ".")"
        case .vencida: return "Tu solicitud de cambio a \(when) venció sin respuesta."
        case .aceptada, .desconocido: return nil
        }
    }

    /// `AppointmentCancelDto.reason`: de 10 a 500 caracteres.
    public static func cancelReasonError(_ reason: String) -> String? {
        let size = reason.trimmingCharacters(in: .whitespacesAndNewlines).count
        return (10...500).contains(size) ? nil : "Escribe un motivo de 10 a 500 caracteres."
    }

    /// `PatientAppointmentRequestDto.reason`: hasta 500 caracteres.
    public static func requestReasonError(_ reason: String) -> String? {
        reason.trimmingCharacters(in: .whitespacesAndNewlines).count <= 500 ? nil : "El motivo admite hasta 500 caracteres."
    }
}

/// I09: solicitud de ambulancia (`AmbulanceRequestDto`).
public enum AmbulanceRules {
    public static func errors(address: String, reason: String, phone: String) -> [String: String] {
        var errors: [String: String] = [:]
        let place = address.trimmingCharacters(in: .whitespacesAndNewlines).count
        if !(5...300).contains(place) { errors["address"] = "Escribe la dirección (5 a 300 caracteres)." }
        let motive = reason.trimmingCharacters(in: .whitespacesAndNewlines).count
        if !(5...500).contains(motive) { errors["reason"] = "Describe el motivo (5 a 500 caracteres)." }
        if phone.trimmingCharacters(in: .whitespaces).range(of: #"^[0-9+ -]{8,20}$"#, options: .regularExpression) == nil {
            errors["contactPhone"] = "Escribe un teléfono de 8 a 20 dígitos."
        }
        return errors
    }

    /// Nombre del hito para el paciente.
    public static func milestoneLabel(_ type: String) -> String {
        ["salida": "Salida", "en_escena": "En el lugar", "trasladando": "Hacia el hospital", "en_hospital": "En el hospital", "finalizado": "Finalizado"][type] ?? "Avance"
    }

    /// MA-AMB-05: la solicitud que sigue la pantalla: la activa más reciente (por confirmar o en camino).
    public static func active(_ requests: [OwnAmbulanceRequest]) -> OwnAmbulanceRequest? { requests.first { $0.isActive } }

    /// Qué pasa con la solicitud, en una frase para el paciente; sale del estado del servidor, no de los eventos.
    public static func progress(_ request: OwnAmbulanceRequest) -> String {
        let done = Set(request.service?.milestones.map(\.type) ?? [])
        switch request.state {
        case .porConfirmar: return "Despacho te llamará para confirmar antes de mover la ambulancia."
        case .cancelada: return "Cancelaste esta solicitud."
        case .descartada: return "Despacho no pudo atender esta solicitud. Si hay riesgo de vida, llama al 911."
        default: break
        }
        guard let service = request.service else { return "Despacho confirmó tu solicitud." }
        if let final = service.finalState { return "El servicio terminó: \((AmbulanceFinalState(rawValue: final)?.label ?? "finalizado").lowercased())." }
        if done.contains("en_hospital") { return "La ambulancia llegó al hospital." }
        if done.contains("trasladando") { return "La ambulancia va hacia el hospital." }
        if done.contains("en_escena") { return "La ambulancia llegó al lugar." }
        if done.contains("salida") { return "La ambulancia va en camino." }
        return "Despacho confirmó tu solicitud: la ambulancia saldrá en breve."
    }

    public static func body(address: String, municipality: String, reason: String, phone: String) -> AmbulanceRequestBody {
        let place = municipality.trimmingCharacters(in: .whitespacesAndNewlines)
        return AmbulanceRequestBody(
            address: address.trimmingCharacters(in: .whitespacesAndNewlines),
            municipality: place.isEmpty ? nil : place,
            reason: reason.trimmingCharacters(in: .whitespacesAndNewlines),
            contactPhone: phone.trimmingCharacters(in: .whitespaces)
        )
    }
}

/// I07: el paciente ve los valores solo cuando el médico revisó la orden (D-040).
public enum PatientLabRules {
    public static func showsValues(_ order: LabOrder) -> Bool { order.reviewedAt != nil }

    /// Texto del estado para el paciente: un completado sin revisar sigue "En revisión médica".
    public static func statusText(_ order: LabOrder) -> String {
        if order.state == .completado && order.reviewedAt == nil { return "En revisión médica" }
        if order.state == .completado { return "Resultados disponibles" }
        return order.state.label
    }

    public static func valueText(_ result: LabItemResult?) -> String {
        guard let result else { return "—" }
        if let value = result.value {
            return value.rounded() == value ? String(Int(value)) : String(value)
        }
        return result.text ?? "—"
    }
}

/// Fase 2, flujo A (S8): el paciente pide cita por motivo (una a tres categorías), franja preferida y nota; el médico es
/// opcional y recepción asigna médico y hora. iOS no tiene rol de recepción: solo cubre el lado del paciente.
public enum CategoryRequestRules {
    public static let path = "/citas/solicitudes-categoria"
    public static let categoriesPath = "/citas/categorias"
    public static let maxCategories = 3
    public static let noteMax = 280

    public static func cancelPath(_ id: String) -> String { "\(path)/\(id)/cancelar" }

    private static func fold(_ text: String) -> String {
        text.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: Locale(identifier: "es")).trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// Búsqueda sin tildes en nombre, descripción, palabras clave y especialidades; las elegidas siempre quedan a la vista.
    public static func filter(_ categories: [AppointmentCategory], query: String, picked: [String] = []) -> [AppointmentCategory] {
        let needle = fold(query)
        guard !needle.isEmpty else { return categories }
        return categories.filter { c in
            picked.contains(c.code) || fold([c.name, c.description, c.keywords, c.specialties.joined(separator: " ")].joined(separator: " ")).contains(needle)
        }
    }

    /// De una a tres: una cuarta se ignora y tocar una elegida la quita.
    public static func toggle(_ picked: [String], _ code: String) -> [String] {
        if picked.contains(code) { return picked.filter { $0 != code } }
        return picked.count >= maxCategories ? picked : picked + [code]
    }

    public static func canSend(picked: [String], note: String) -> Bool { !picked.isEmpty && note.count <= noteMax }

    public static func body(picked: [String], franja: RequestFranja, note: String, preferredDoctorId: String?) -> CategoryRequestBody {
        let text = note.trimmingCharacters(in: .whitespacesAndNewlines)
        let doctor = preferredDoctorId?.trimmingCharacters(in: .whitespacesAndNewlines)
        return CategoryRequestBody(categories: picked, franja: franja, note: text.isEmpty ? nil : text, preferredDoctorId: (doctor?.isEmpty ?? true) ? nil : doctor)
    }

    /// Médicos que coinciden con lo escrito (nombre o especialidad), para la opción secundaria "Ya tengo médico".
    public static func doctors(_ doctors: [AppointmentCatalogs.Doctor], query: String, limit: Int = 6) -> [AppointmentCatalogs.Doctor] {
        let needle = fold(query)
        guard !needle.isEmpty else { return [] }
        return Array(doctors.filter { $0.active && fold("\($0.fullName) \($0.specialty ?? "")").contains(needle) }.prefix(limit))
    }

    /// Clave estable del ícono de la categoría a SF Symbol; una clave desconocida usa un ícono genérico.
    public static func symbol(_ icon: String) -> String {
        switch icon {
        case "general": return "stethoscope"
        case "nino": return "figure.and.child.holdinghands"
        case "mujer": return "figure.dress.line.vertical.figure"
        case "corazon": return "heart"
        case "hueso": return "figure.walk"
        case "piel": return "hand.raised"
        case "ojo": return "eye"
        case "oido": return "ear"
        case "mente": return "brain.head.profile"
        case "neuro": return "brain"
        case "digestivo": return "fork.knife"
        case "rinon": return "drop"
        case "alergia": return "allergens"
        case "cirugia": return "bandage"
        default: return "cross.case"
        }
    }

    /// Clave de Localizable.xcstrings con el estado de la solicitud.
    public static func stateKey(_ state: String) -> String { "appointments.category.state.\(state)" }
}
