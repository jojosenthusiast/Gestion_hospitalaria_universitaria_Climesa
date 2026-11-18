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

    /// Unlinked, the API refuses every appointment read (403): no «Próxima cita» block until the record is linked.
    public static func blocks(linked: Bool, hasTicket: Bool, appointmentToday: Bool) -> [Block] {
        var blocks: [Block] = []
        if !linked { blocks.append(.link) }
        if hasTicket { blocks.append(.ticket) }
        if appointmentToday { blocks.append(.today) }
        if linked { blocks.append(.next) }
        if linked { blocks.append(.results) }
        blocks.append(.shortcuts)
        return blocks
    }

    /// Owner rule (Android `AttentionList`): Inicio shows the two most urgent pending blocks, in the order of `blocks`,
    /// and folds the rest behind «Ver N pendientes más»; the shortcuts always stay below.
    public static func shown(_ blocks: [Block], expanded: Bool) -> [Block] {
        AttentionFold.shown(pending(blocks), expanded: expanded) + blocks.filter { $0 == .shortcuts }
    }

    /// The pending blocks that count for the fold (everything but the shortcuts).
    public static func pending(_ blocks: [Block]) -> [Block] { blocks.filter { $0 != .shortcuts } }

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
            // Unlinked, `POST /citas/solicitudes-categoria` answers 403 "La cuenta no está vinculada".
            case .requestAppointment: return linked && can("citas.solicitar")
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

/// `GET /citas` with an explicit window (Android `PatientAppointmentRules.listPath`). A bare call only covers the last 7
/// and next 31 days, so «Anteriores» held one week and a later appointment was missing from «Mis citas» and Inicio.
/// 59 days back plus 33 ahead stays inside the API's 93-day limit.
public enum PatientAppointmentRange {
    public static let pastDays = 59
    public static let aheadDays = 33

    public static func path(now: Date) -> String {
        let from = ClimesaDates.localDay(now.addingTimeInterval(-Double(pastDays) * 86_400))
        let to = ClimesaDates.localDay(now.addingTimeInterval(Double(aheadDays) * 86_400))
        return "/citas?from=\(from)&to=\(to)"
    }
}

/// «Ya tengo médico»: reception may assign any of the next 7 days, so a doctor counts as on shift when they have a
/// shift on any of them (Android `loadRequestDoctors`). Each doctor once, in first-seen order; the day with a shift wins.
public enum RequestDoctorRules {
    public static let days = 7

    public static func week(_ lists: [[AppointmentCatalogs.Doctor]]) -> [AppointmentCatalogs.Doctor] {
        var order: [String] = []
        var byId: [String: [AppointmentCatalogs.Doctor]] = [:]
        for doctor in lists.joined() {
            if byId[doctor.id] == nil { order.append(doctor.id) }
            byId[doctor.id, default: []].append(doctor)
        }
        return order.compactMap { id in
            guard let same = byId[id] else { return nil }
            if var onShift = same.first(where: { $0.hasShift != false }) { onShift.reason = nil; return onShift }
            return same.first
        }
    }
}

/// «Quién vio mi expediente» grouped by day (El Salvador), newest first. The last week stays open; older days fold.
public enum AccessLogRules {
    public static let recentDays = 7

    public struct Day: Equatable, Sendable {
        public let day: String
        public let older: Bool
        public let rows: [MyAccess]
    }

    public static func byDay(_ rows: [MyAccess], now: Date) -> [Day] {
        let dated = rows.compactMap { row in ClimesaDates.parse(row.date).map { ($0, row) } }.sorted { $0.0 > $1.0 }
        var order: [String] = []
        var groups: [String: [MyAccess]] = [:]
        for (date, row) in dated {
            let key = ClimesaDates.localDay(date)
            if groups[key] == nil { order.append(key) }
            groups[key, default: []].append(row)
        }
        let cutoff = ClimesaDates.localDay(now.addingTimeInterval(-Double(recentDays - 1) * 86_400))
        return order.map { Day(day: $0, older: $0 < cutoff, rows: groups[$0] ?? []) }
    }

    public static func olderTitle(_ count: Int) -> String { count == 1 ? "1 acceso anterior" : "\(count) accesos anteriores" }
}

/// «Mis solicitudes»: pending ones stay in view; assigned, rejected or withdrawn ones fold under one line.
public enum CategoryRequestFold {
    public static func split(_ requests: [CategoryRequest]) -> (pending: [CategoryRequest], resolved: [CategoryRequest]) {
        (requests.filter { $0.state == "pendiente" }, requests.filter { $0.state != "pendiente" })
    }

    public static func rejection(_ reason: String?) -> String? {
        guard let text = reason?.trimmingCharacters(in: .whitespacesAndNewlines), !text.isEmpty else { return nil }
        return "Motivo del rechazo: \(text)"
    }

    public static func toggleTitle(_ count: Int, expanded: Bool) -> String { expanded ? "Ocultar resueltas (\(count))" : "Ver resueltas (\(count))" }
}

/// D-8: the patient cancels with a quick reason and no typing; only «Otro» asks for text (3 characters or more). The
/// reason goes with its `reasonCode`. An API released before D-8 refuses that field; then the released body
/// `{version, reason}` goes instead, and only that body keeps the old rule of 10 or more characters (it matters for
/// «Otro»: every quick reason already has 10 characters).
public enum PatientCancelReasons {
    public static let other = "Otro"
    public static let quick = ["Ya no lo necesito", "No puedo a esa hora"]
    public static let otherMinimum = 3
    /// The released body's rule (`AppointmentCancelDto.reason` without `reasonCode`).
    public static let legacyMinimum = 10
    public static let maximum = 500

    public static let chooseError = "Elige un motivo."
    public static let otherShort = "Escribe al menos \(otherMinimum) caracteres."
    public static let legacyError = "Escribe un motivo de al menos \(legacyMinimum) caracteres."
    /// What a server before D-8 says of `reasonCode` (whitelist validation): the only answer that switches to the released body.
    public static let unsupportedField = "Este campo no se admite en la solicitud."

    public static var chips: [String] { quick + [other] }

    /// The API code of a chip (`AppointmentCancelDto.reasonCode`); nil while nothing is chosen.
    public static func code(chip: String?) -> String? {
        guard let chip else { return nil }
        if chip == other { return "otro" }
        if chip == quick[0] { return "ya_no_lo_necesito" }
        if chip == quick[1] { return "no_puedo_a_esa_hora" }
        return nil
    }

    /// The reason to send: the chip's words, or what was typed under «Otro». nil while nothing valid is chosen (the
    /// confirm button stays off).
    public static func reason(chip: String?, otherText: String) -> String? {
        guard let chip else { return nil }
        if chip == other {
            let text = otherText.trimmingCharacters(in: .whitespacesAndNewlines)
            guard text.count >= otherMinimum else { return nil }
            return String(text.prefix(maximum))
        }
        return quick.contains(chip) ? chip : nil
    }

    /// Shown under the «Otro» field once something was typed and it is still too short.
    public static func otherError(_ text: String) -> String? {
        let size = text.trimmingCharacters(in: .whitespacesAndNewlines).count
        return (1..<otherMinimum).contains(size) ? otherShort : nil
    }

    /// The released body's rule; nil when the reason can go without a code.
    public static func legacyReasonError(_ reason: String) -> String? {
        reason.trimmingCharacters(in: .whitespacesAndNewlines).count < legacyMinimum ? legacyError : nil
    }

    /// A 400 whose field error on `reasonCode` is the unknown-field message: the server was released before D-8.
    public static func refusesReasonCode(_ failure: APIFailure) -> Bool {
        guard failure.status == 400, let problem = failure.problem else { return false }
        return problem.errors.contains { $0.field == "reasonCode" && $0.message == unsupportedField }
    }
}

/// A write the app refuses before sending anything, with its Spanish message.
public struct CancelRefusal: Error, LocalizedError, Equatable, Sendable {
    public let message: String
    public init(message: String) { self.message = message }
    public var errorDescription: String? { message }
}

/// A4 / D-8 · the patient's cancel, with the fallback to the released body for an API before D-8.
/// - The coded body `{version, reason, reasonCode}` and the released body `{version, reason}` each keep their own
///   idempotency key per appointment: a retry after no signal or a 5xx replays the same body under the same key.
/// - A pending key never carries another body: a changed body (another chip, a new version) takes a new key.
/// - When the API refuses `reasonCode` as an unknown field, the released body goes at once under a NEW key, and every
///   later cancel of this session sends the released body.
@MainActor
public final class PatientCancelFlow {
    public typealias Post = @MainActor (AppointmentCancelBody, String) async throws -> Void

    /// One body and its pending key; the key is dropped on success and after `idempotencia_conflicto`.
    private struct Lane {
        var key: String?
        var body: AppointmentCancelBody?
    }

    /// This server refused `reasonCode` once.
    public private(set) var legacyServer: Bool
    private var coded: [String: Lane] = [:]
    private var released: [String: Lane] = [:]
    private let makeKey: @MainActor () -> String

    /// `nonisolated` so a view can hold it in `@State` (like `Submission`).
    nonisolated public init(legacyServer: Bool = false, makeKey: @escaping @MainActor () -> String = { UUID().uuidString.lowercased() }) {
        self.legacyServer = legacyServer
        self.makeKey = makeKey
    }

    /// The key waiting for a retry of an appointment's coded body (or of its released body with `legacy`).
    public func pendingKey(_ appointmentId: String, legacy: Bool = false) -> String? {
        (legacy ? released : coded)[appointmentId]?.key
    }

    /// Sends the cancel; throws `CancelRefusal` when nothing could be sent, or the API's failure.
    public func cancel(_ appointmentId: String, version: Int, chip: String?, otherText: String, post: Post) async throws {
        guard let reason = PatientCancelReasons.reason(chip: chip, otherText: otherText) else {
            throw CancelRefusal(message: chip == PatientCancelReasons.other ? PatientCancelReasons.otherShort : PatientCancelReasons.chooseError)
        }
        if let code = PatientCancelReasons.code(chip: chip), !legacyServer {
            do {
                try await send(AppointmentCancelBody(version: version, reason: reason, reasonCode: code), appointmentId, legacy: false, post: post)
                return
            } catch let failure as APIFailure where PatientCancelReasons.refusesReasonCode(failure) {
                // A definitive answer: the coded key is done, and from now on this server gets the released body.
                coded[appointmentId] = nil
                legacyServer = true
            }
        }
        if let error = PatientCancelReasons.legacyReasonError(reason) { throw CancelRefusal(message: error) }
        try await send(AppointmentCancelBody(version: version, reason: reason), appointmentId, legacy: true, post: post)
    }

    private func send(_ body: AppointmentCancelBody, _ id: String, legacy: Bool, post: Post) async throws {
        var lane = (legacy ? released[id] : coded[id]) ?? Lane()
        // Same body: the pending key (an exact replay). Another body: a new key, never the pending one.
        if lane.key == nil || lane.body != body { lane = Lane(key: makeKey(), body: body) }
        store(lane, id, legacy: legacy)
        let key = lane.key ?? ""
        do {
            try await post(body, key)
        } catch {
            // No signal, 5xx or a definitive 4xx with the same body keep the key; only a key conflict drops it.
            if (error as? APIFailure)?.code == "idempotencia_conflicto" { settle(id, key: key, legacy: legacy) }
            throw error
        }
        settle(id, key: key, legacy: legacy)
    }

    private func store(_ lane: Lane, _ id: String, legacy: Bool) {
        if legacy { released[id] = lane } else { coded[id] = lane }
    }

    /// Drops the lane only if it still holds `key` (a newer body may have taken it while this one was in flight).
    private func settle(_ id: String, key: String, legacy: Bool) {
        if legacy {
            if released[id]?.key == key { released[id] = nil }
        } else if coded[id]?.key == key {
            coded[id] = nil
        }
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
    static func pastTitle(_ count: Int) -> String { "Anteriores (\(count))" }

    /// Free slots of the chosen day, without the slot the appointment already has.
    static func freeSlots(_ availability: Availability, excluding start: String) -> [Period] {
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

    /// The server's `ahead` when it sends one; otherwise the estimate from the public board (U4). nil before anyone
    /// was called and without `ahead`.
    public static func ahead(_ ticket: QueueTicket, called: [PublicQueue.Called]?) -> Int? {
        if let ahead = ticket.ahead { return max(0, ahead) }
        guard let called else { return nil }
        return QueueRules.ahead(of: ticket.number, called: called)
    }

    /// "Pasa al consultorio 2" (or "Pasa al Consultorio 2" when the API already names it); without an office, "Es tu turno".
    public static func calledTitle(office: String?) -> String {
        guard let office = office?.trimmingCharacters(in: .whitespacesAndNewlines), !office.isEmpty else { return "Es tu turno" }
        return office.lowercased().hasPrefix("consultorio") ? "Pasa al \(office)" : "Pasa al consultorio \(office)"
    }

    /// Inicio's line for a called ticket: "Es tu turno · Pasa al consultorio 2", or "Es tu turno" without an office.
    public static func homeLine(office: String?) -> String {
        let title = calledTitle(office: office)
        return title == "Es tu turno" ? title : "Es tu turno · \(title)"
    }

    /// `@AppStorage` key of the call the patient already closed, shared by Inicio and «Mi turno».
    public static let dismissedKey = "paciente.llamado.cerrado"

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
    static func canUndo(_ ticket: QueueTicket, calledHere: Set<String>) -> Bool {
        guard ticket.state == .llamado, (ticket.undoActions ?? []).contains(QueueMove.deshacerLlamado.rawValue) else { return false }
        return ticket.calledByMe == true || calledHere.contains(ticket.id)
    }

    /// What «Deshacer» did: with 2+ calls the number stays called with one call less.
    static func undoDone(_ ticket: QueueTicket) -> String {
        QueueBoardRules.moveDone(QueueBoardRules.code(ticket), ticket.calls > 1 ? .quitarLlamado : .deshacerLlamado)
    }

    /// D-3 on Mi día: "No se presentó" waits 8 s with «Deshacer» before it is sent.
    static func absencePending(_ ticket: QueueTicket) -> String {
        "\(QueueBoardRules.code(ticket)) se marcará como no se presentó"
    }

    /// The deferred "No se presentó" may still go: the number is still called and the server still offers it.
    static func absenceStillApplies(_ ticket: QueueTicket?) -> Bool {
        guard let ticket else { return false }
        return ticket.state == .llamado && (ticket.allowedActions ?? []).contains(.noSePresento)
    }
}

// MARK: - B4 · Consulta

public enum ConsultationRecordRules {
    /// Row 5 (MED audit): a new diagnosis starts as principal only when the consultation has none yet, so a single
    /// diagnosis is principal and a second one never demotes the first by default.
    public static func defaultPrincipal(_ diagnoses: [ConsultationDetail.Diagnosis]) -> Bool {
        !diagnoses.contains { $0.principal }
    }

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

    /// Row 17: the exams of a listed order ("Hemograma, Glucosa"); its state goes in a tag next to them.
    public static func orderExams(_ order: LabOrder) -> String {
        order.items.map(\.name).joined(separator: ", ")
    }

    /// "Hemograma, Glucosa · Pendiente" for a listed order.
    public static func orderLine(_ order: LabOrder) -> String {
        "\(order.items.map(\.name).joined(separator: ", ")) · \(order.state.label)"
    }
}

// MARK: - C1 · Revisar y liberar (#12)

public enum ReleaseRules {
    public static let noteMaximum = 500

    /// C1: critical marks first, then high or low, then normal, then the rest (no result, no range); the order of the
    /// order is kept inside each group (Android `LabReviewSummary`).
    public static func orderedItems(_ order: LabOrder) -> [LabOrderItem] {
        func rank(_ mark: ResultMark?) -> Int {
            switch mark {
            case .criticoAlto?, .criticoBajo?: return 0
            case .alto?, .bajo?: return 1
            case .normal?: return 2
            default: return 3
            }
        }
        // `sorted` is not stable: the original index breaks ties.
        return order.items.enumerated()
            .sorted { (rank($0.element.result?.mark), $0.offset) < (rank($1.element.result?.mark), $1.offset) }
            .map(\.element)
    }

    /// The release body: `{version}` unless the doctor turned the follow-up off or wrote a note for the patient.
    public static func body(version: Int, followUp: Bool, note: String) -> LabReviewBody {
        let text = note.trimmingCharacters(in: .whitespacesAndNewlines)
        return LabReviewBody(version: version, followUp: followUp ? nil : false, patientNote: text.isEmpty ? nil : String(text.prefix(noteMaximum)))
    }

    /// What happened with the follow-up appointment (D-4); nil when nothing needs saying (or the doctor turned it off).
    public static func followUpOutcome(proposalId: String?, skipped: String?) -> String? {
        if let proposalId, !proposalId.isEmpty { return "Se propuso a Recepción una cita de seguimiento." }
        switch skipped {
        case "hospitalizado": return "Sin cita de seguimiento: el paciente está hospitalizado."
        case "ya_propuesta": return "Ya había una cita de seguimiento propuesta."
        case "sin_consulta": return "Sin cita de seguimiento: la orden no viene de una consulta."
        default: return nil
        }
    }

    /// What the patient will see once released, critical values first: "Ana Pérez verá: Hemoglobina 7.1 g/dL (crítico bajo), Glucosa 90 mg/dL."
    public static func summary(_ order: LabOrder) -> String {
        let who = order.patientName ?? "El paciente"
        let values = orderedItems(order).map { item -> String in
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

    /// `done` plus what happened with the follow-up appointment, from the API's answer.
    public static func done(_ order: LabOrder, result: LabReviewResult?) -> String {
        guard let outcome = followUpOutcome(proposalId: result?.followUpProposalId, skipped: result?.followUpSkipped) else { return done(order) }
        return "\(done(order)) \(outcome)"
    }
}

// MARK: - G2 · Vincular expediente

/// G2: the link screen opens in the real state of the request (`GET /me/vinculacion`), so a patient who comes back never
/// sees an empty form and never asks twice.
public enum LinkStatusRules {
    public enum Screen: Equatable, Sendable {
        /// No request yet.
        case form(prefill: MyLink.Declared?)
        /// Waiting for reception, since `createdAt`.
        case pending(since: String)
        case approved
        /// With the reason, and «Volver a pedir» with what was declared.
        case rejected(reason: String?, prefill: MyLink.Declared?)
    }

    /// `sent` is the request this screen just created: until a read returns it, the screen stays pending instead of
    /// showing the older state (no form, so it is never sent twice).
    public static func screen(_ link: MyLink, profileLinked: Bool, sent: LinkRequestResult? = nil) -> Screen {
        if profileLinked || link.linked { return .approved }
        if let sent, link.request?.id != sent.id { return .pending(since: sent.createdAt) }
        guard let request = link.request else { return .form(prefill: nil) }
        switch request.state {
        case .aprobada: return .approved
        case .rechazada: return .rejected(reason: request.rejectionReason, prefill: link.declared)
        // An unknown state is still a request: never the form, so it is not asked twice.
        case .pendiente, .desconocido: return .pending(since: request.createdAt)
        }
    }

    /// "En revisión desde 16/11" (day and month in El Salvador).
    public static func pendingText(_ createdAt: String) -> String {
        guard let date = ClimesaDates.parse(createdAt) else { return "En revisión" }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "es_SV")
        formatter.timeZone = ClimesaDates.zone
        formatter.dateFormat = "dd/MM"
        return "En revisión desde \(formatter.string(from: date))"
    }

    public static func rejectedText(_ reason: String?) -> String {
        let text = reason?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return text.isEmpty ? "Tu solicitud fue rechazada. Revisa tus datos o acude a recepción." : "Tu solicitud fue rechazada. Motivo: \(text)"
    }

    /// The declared birth day (`yyyy-MM-dd`) as a date for the picker, at noon in `zone` so it never slips a day.
    public static func birthDate(_ day: String?, zone: TimeZone = .current) -> Date? {
        guard let day, day.range(of: #"^\d{4}-\d{2}-\d{2}$"#, options: .regularExpression) != nil else { return nil }
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = zone
        formatter.dateFormat = "yyyy-MM-dd HH:mm"
        return formatter.date(from: "\(day) 12:00")
    }
}

// MARK: - G3 · Alta

public extension DischargeConfirmRules {
    /// The confirmation of the signature with who and what: "Alta de Ana Pérez · Médica, sin pendientes. …".
    static func signRecap(patient: String?, type: DischargeType, pendingCount: Int, summary: String) -> String {
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

    static let signedNotice = "Alta firmada. Recepción registrará la salida."
}
