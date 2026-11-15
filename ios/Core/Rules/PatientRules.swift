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
    }

    public static func cancelOption(_ appointment: Appointment, now: Date, hours: Int = AppointmentRules.patientCancelHours) -> CancelOption {
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
