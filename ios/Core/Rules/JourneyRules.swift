import Foundation

// R7 U4 (iOS journeys, odd/tasks/fase2-recorridos-auditoria.md): the rules behind the patient and doctor journeys,
// at parity with Android U2. Every text here is shown as is, in Spanish.

private func plural(_ count: Int, _ one: String, _ many: String) -> String { count == 1 ? "1 \(one)" : "\(count) \(many)" }

/// "a, b y c" for a short list in a sentence.
private func spokenList(_ parts: [String]) -> String {
    guard parts.count > 1, let last = parts.last else { return parts.first ?? "" }
    return parts.dropLast().joined(separator: ", ") + " y " + last
}

// MARK: - G6 · Inicio del paciente

public enum PatientHomeRules {
    /// The blocks of Inicio, top to bottom. G6: linking goes first while the account is not linked; then today's number,
    /// today's appointment and the next step; then new results and the shortcuts.
    public enum Block: Equatable, Sendable { case link, ticket, today, next, results, shortcuts }

    public static func blocks(linked: Bool, hasTicket: Bool, appointmentToday: Bool) -> [Block] {
        var blocks: [Block] = []
        if !linked { blocks.append(.link) }
        if hasTicket { blocks.append(.ticket) }
        if appointmentToday { blocks.append(.today) }
        blocks.append(.next)
        if linked { blocks.append(.results) }
        blocks.append(.shortcuts)
        return blocks
    }

    /// The first upcoming appointment that falls on today's date in El Salvador ("Hoy tienes cita").
    public static func appointmentToday(_ upcoming: [Appointment], now: Date) -> Appointment? {
        let today = ClimesaDates.localDay(now)
        return upcoming.first { ClimesaDates.parse($0.start).map(ClimesaDates.localDay) == today }
    }

    /// The next step after today: the next appointment that is not today's; nil means "Pedir cita" is the next step.
    public static func nextAppointment(_ upcoming: [Appointment], now: Date) -> Appointment? {
        let today = appointmentToday(upcoming, now: now)
        return upcoming.first { $0.id != today?.id }
    }

    /// Shortcuts of Inicio, each one only with its permission.
    public enum Shortcut: String, CaseIterable, Sendable {
        case requestAppointment, ambulance, exams, hospital

        public var title: String {
            switch self {
            case .requestAppointment: return "Pedir cita"
            case .ambulance: return "Pedir ambulancia"
            case .exams: return "Mis exámenes"
            case .hospital: return "Hospital"
            }
        }

        public var symbol: String {
            switch self {
            case .requestAppointment: return "calendar.badge.plus"
            case .ambulance: return "cross.case"
            case .exams: return "testtube.2"
            case .hospital: return "building.2"
            }
        }
    }

    public static func shortcuts(linked: Bool, can: (String) -> Bool) -> [Shortcut] {
        Shortcut.allCases.filter { shortcut in
            switch shortcut {
            case .requestAppointment: return can("citas.solicitar")
            case .ambulance: return can("ambulancia.solicitar")
            case .exams: return linked && can("resultados.ver")
            case .hospital: return true
            }
        }
    }
}

/// G6 «Resultados nuevos». Gap G-7 (no "seen" in the API): the last visit to «Mis exámenes» is kept on the device, and
/// only results released after it, and in the last 7 days, count as new (Android `recentResults`).
public enum PatientResultsRules {
    public static let window: TimeInterval = 7 * 86_400
    /// `DraftStore` key of the last visit to «Mis exámenes», per account.
    public static let seenKey = "resultados-vistos"

    public struct Seen: Codable, Equatable, Sendable {
        public let at: String
        public init(at: Date) { self.at = ClimesaDates.iso(at) }
        public var date: Date? { ClimesaDates.parse(at) }
    }

    public static func newCount(_ orders: [LabOrder], seenAt: Date?, now: Date) -> Int {
        let since = max(now.addingTimeInterval(-window), seenAt ?? .distantPast)
        return orders.filter { order in
            guard let released = ClimesaDates.parse(order.reviewedAt) else { return false }
            return released > since
        }.count
    }

    public static func title(_ count: Int) -> String { "Resultados nuevos (\(count))" }
}

// MARK: - A1, A4, A5 · Citas del paciente

/// D-8: the patient cancels with a quick reason and no typing; only «Otro» asks for text (3 characters or more).
/// The API still asks for a reason of 10 to 500 characters (gap A-2 / sweep #14: `reasonCode` is for the API), so a quick
/// reason goes as written and «Otro» goes as "Otro motivo: <texto>".
public enum PatientCancelReasons {
    public static let other = "Otro"
    public static let quick = ["Ya no lo necesito", "No puedo a esa hora"]
    public static let otherMinimum = 3
    public static let prefix = "Otro motivo: "

    public static var chips: [String] { quick + [other] }

    /// The reason to send; nil while nothing valid is chosen (the confirm button stays off).
    public static func reason(chip: String?, otherText: String) -> String? {
        guard let chip else { return nil }
        if chip == other {
            let text = otherText.trimmingCharacters(in: .whitespacesAndNewlines)
            guard text.count >= otherMinimum else { return nil }
            return String((prefix + text).prefix(500))
        }
        return quick.contains(chip) ? chip : nil
    }

    /// Shown under the «Otro» field once something was typed and it is still too short.
    public static func otherError(_ text: String) -> String? {
        let size = text.trimmingCharacters(in: .whitespacesAndNewlines).count
        return (1..<otherMinimum).contains(size) ? "Escribe al menos \(otherMinimum) caracteres." : nil
    }
}

/// A4 «Reprogramar»: one row of day chips instead of a date picker.
public enum DayChipRules {
    /// The next `count` days of El Salvador as `yyyy-MM-dd`, starting today.
    public static func days(from now: Date, count: Int = 14) -> [String] {
        let calendar = ClimesaDates.calendar
        let start = calendar.startOfDay(for: now)
        return (0..<count).compactMap { offset in
            calendar.date(byAdding: .day, value: offset, to: start).map { ClimesaDates.localDay($0.addingTimeInterval(12 * 3600)) }
        }
    }

    /// "Hoy", "Mañana", otherwise "mié 19".
    public static func label(_ day: String, today: Date) -> String {
        let days = Self.days(from: today, count: 2)
        if day == days.first { return "Hoy" }
        if days.count > 1, day == days[1] { return "Mañana" }
        guard let date = ClimesaDates.parse("\(day)T18:00:00Z") else { return day }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "es_SV")
        formatter.timeZone = ClimesaDates.zone
        formatter.dateFormat = "EEE d"
        return formatter.string(from: date).replacingOccurrences(of: ".", with: "")
    }
}

public extension AppointmentRules {
    /// A5: "Anteriores (3)", folded under the upcoming ones.
    public static func pastTitle(_ count: Int) -> String { "Anteriores (\(count))" }

    /// Free slots of the chosen day, without the slot the appointment already has.
    public static func freeSlots(_ availability: Availability, excluding start: String) -> [Period] {
        availability.slots.filter { $0.start != start }
    }
}

// MARK: - B5 · Mi turno

public enum PatientTurnRules {
    public static func aheadText(_ ahead: Int) -> String {
        switch ahead {
        case ...0: return "Eres el siguiente"
        case 1: return "1 persona antes de ti"
        default: return "\(ahead) personas antes de ti"
        }
    }

    /// "Pasa al consultorio 2" (or "Pasa al Consultorio 2" when the API already names it); without an office, "Es tu turno".
    public static func calledTitle(office: String?) -> String {
        guard let office = office?.trimmingCharacters(in: .whitespacesAndNewlines), !office.isEmpty else { return "Es tu turno" }
        return office.lowercased().hasPrefix("consultorio") ? "Pasa al \(office)" : "Pasa al consultorio \(office)"
    }

    /// One full-screen notice per call: calling the same number again (one more call) shows it again.
    public static func callKey(_ ticket: QueueTicket?) -> String? {
        guard let ticket, ticket.state == .llamado else { return nil }
        return "\(ticket.id)#\(ticket.calls)"
    }

    public static func shouldPresent(_ ticket: QueueTicket?, dismissed: String?) -> Bool {
        guard let key = callKey(ticket) else { return false }
        return key != dismissed
    }
}

// MARK: - B3 · Fila del médico

/// RN-FILA-SIGUIENTE in the app's own words, one step per line. The server's `rule` text is never printed.
public enum NextRuleText {
    public static let steps = [
        "Emergencias",
        "Urgentes",
        "Citas dentro de su hora (de 15 min antes a 15 min después)",
        "El resto por orden de llegada"
    ]

    public static var lines: [String] { steps.enumerated().map { "\($0.offset + 1). \($0.element)" } }
}

public extension DoctorDayActionRules {
    /// B3: every number this doctor called keeps its own «Deshacer» while it is still called and the server accepts
    /// undoing the call (`undoActions`). `calledHere` covers a server without `calledByMe`.
    public static func canUndo(_ ticket: QueueTicket, calledHere: Set<String>) -> Bool {
        guard ticket.state == .llamado, (ticket.undoActions ?? []).contains(QueueMove.deshacerLlamado.rawValue) else { return false }
        return ticket.calledByMe == true || calledHere.contains(ticket.id)
    }

    /// What «Deshacer» did: with 2+ calls the number stays called with one call less.
    public static func undoDone(_ ticket: QueueTicket) -> String {
        QueueBoardRules.moveDone(QueueBoardRules.code(ticket), ticket.calls > 1 ? .quitarLlamado : .deshacerLlamado)
    }

    /// D-3 on Mi día: "No se presentó" waits 8 s with «Deshacer» before it is sent.
    public static func absencePending(_ ticket: QueueTicket) -> String {
        "\(QueueBoardRules.code(ticket)) se marcará como no se presentó"
    }

    /// The deferred "No se presentó" may still go: the number is still called and the server still offers it.
    public static func absenceStillApplies(_ ticket: QueueTicket?) -> Bool {
        guard let ticket else { return false }
        return ticket.state == .llamado && (ticket.allowedActions ?? []).contains(.noSePresento)
    }
}

// MARK: - B4 · Consulta

public enum ConsultationRecordRules {
    /// Orders of this consultation from the doctor's order list (gap B-6: the detail does not carry them), oldest first.
    public static func labOrders(_ orders: [LabOrder], consultationId: String) -> [LabOrder] {
        orders.filter { $0.consultationId == consultationId && $0.state != .cancelado }.sorted { $0.createdAt < $1.createdAt }
    }

    /// An exam already ordered in this consultation: in a listed order (by exam id or code) or ordered from this device.
    public static func alreadyOrdered(_ exam: LabExam, orders: [LabOrder], orderedHere: Set<String>) -> Bool {
        if orderedHere.contains(exam.id) { return true }
        return orders.contains { order in order.items.contains { $0.examId == exam.id || $0.code == exam.code } }
    }

    /// Selected exams that were already ordered, in catalog order.
    public static func repeated(selected: Set<String>, catalog: [LabExam], orders: [LabOrder], orderedHere: Set<String>) -> [LabExam] {
        catalog.filter { selected.contains($0.id) && alreadyOrdered($0, orders: orders, orderedHere: orderedHere) }
    }

    public static func repeatError(_ exams: [LabExam]) -> String? {
        guard !exams.isEmpty else { return nil }
        return "Ya ordenaste \(spokenList(exams.map(\.name))) en esta consulta."
    }

    public static let ordersUnknown = "No se pudieron leer las órdenes de esta consulta. Vuelve a cargarlas antes de ordenar, así no se repite un examen."

    /// Why «Emitir orden» is off: the order list of this consultation is not known (an unreadable list is never "0").
    /// A doctor without `resultados.ver` cannot read it at all; then only the device memory blocks a repeat.
    public static func orderBlocker(canReadOrders: Bool, ordersKnown: Bool) -> String? {
        canReadOrders && !ordersKnown ? ordersUnknown : nil
    }

    /// `DraftStore` key of the exams ordered from this device in a consultation.
    public static func orderedKey(_ consultationId: String) -> String { "examenes-\(consultationId)" }

    /// The API signs only with a reason and a plan: «Firmar» says what is missing instead of failing.
    public static func signBlocker(reason: String, plan: String) -> String? {
        var missing: [String] = []
        if reason.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { missing.append("el motivo de consulta") }
        if plan.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { missing.append("el plan") }
        return missing.isEmpty ? nil : "Para firmar falta \(spokenList(missing))."
    }

    /// The step that holds the missing field, so «Firmar» can take the doctor there.
    public static func stepFor(reason: String, plan: String) -> ConsultationStep? {
        if reason.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { return .consulta }
        if plan.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { return .procedimientos }
        return nil
    }

    /// The confirmation of «Firmar»: what the record holds, then what signing does.
    public static func signRecap(diagnoses: Int, prescriptions: Int, labOrders: Int?, notesPending: Bool, unsentWork: Bool) -> String {
        var held = [plural(diagnoses, "diagnóstico", "diagnósticos"), plural(prescriptions, "receta", "recetas")]
        if let labOrders { held.append(plural(labOrders, "orden de laboratorio", "órdenes de laboratorio")) }
        return "Se firma con \(spokenList(held)). " + ConsultationActionRules.signSummary(notesPending: notesPending, unsentWork: unsentWork)
    }

    /// The count a step carries in its chip: diagnoses on «Consulta», prescriptions and orders on «Receta y exámenes».
    public static func stepCount(_ step: ConsultationStep, diagnoses: Int, prescriptions: Int, labOrders: Int) -> Int? {
        switch step {
        case .consulta: return diagnoses
        case .recetaExamenes: return prescriptions + labOrders
        case .procedimientos, .cierre: return nil
        }
    }

    /// "Hemograma, Glucosa · Pendiente" for a listed order.
    public static func orderLine(_ order: LabOrder) -> String {
        "\(order.items.map(\.name).joined(separator: ", ")) · \(order.state.label)"
    }
}

// MARK: - C1 · Revisar y liberar (#12)

public enum ReleaseRules {
    /// What the patient will see once released: "Ana Pérez verá: Hemoglobina 7.1 g/dL (crítico bajo), Glucosa 90 mg/dL."
    public static func summary(_ order: LabOrder) -> String {
        let who = order.patientName ?? "El paciente"
        let values = order.items.map { item -> String in
            var text = "\(item.name) \(PatientLabRules.valueText(item.result))"
            if let unit = item.unit, !unit.isEmpty, item.result?.value != nil { text += " \(unit)" }
            if let mark = item.result?.mark, mark != .normal, mark != .desconocido { text += " (\(mark.label.lowercased()))" }
            return text
        }
        let seen = values.isEmpty ? "sus resultados" : values.joined(separator: ", ")
        return "\(who) verá: \(seen). La revisión queda registrada y no se puede deshacer."
    }

    public static func done(_ order: LabOrder) -> String {
        "Resultados revisados y liberados. \(order.patientName ?? "El paciente") ya puede verlos."
    }
}

// MARK: - G3 · Alta

public extension DischargeConfirmRules {
    /// The confirmation of the signature with who and what: "Alta de Ana Pérez · Médica, sin pendientes. …".
    public static func signRecap(patient: String?, type: DischargeType, pendingCount: Int, summary: String) -> String {
        let pending: String
        switch pendingCount {
        case 0: pending = "sin pendientes"
        case 1: pending = "con 1 pendiente"
        default: pending = "con \(pendingCount) pendientes"
        }
        let text = summary.trimmingCharacters(in: .whitespacesAndNewlines)
        let note = text.isEmpty ? "Sin resumen." : "Resumen: \(text.count > 120 ? String(text.prefix(120)) + "…" : text)"
        return "Alta de \(patient ?? "este paciente") · \(type.label), \(pending). \(note) Se puede revocar mientras no haya salido."
    }

    public static let signedNotice = "Alta firmada. Recepción registrará la salida."
}
