import Foundation

// Fase 2, flow B (S9): the queue board. Per-area numbers ("CON 7"), priority, cited vs walk-in, moves between columns
// that are always server actions, and the "who goes next" proposal (RN-FILA-SIGUIENTE, decided by the API).

/// `QueueProposalResponse`: one proposed number with the reason the rule picked it.
public struct QueueProposedTicket: Decodable, Sendable, Equatable {
    public let id: String
    public let number: Int
    public let area: String
    public let patientName: String?
    public let priority: String
    public let appointmentAt: String?
    public let version: Int
    public let reason: String
    public let reasonText: String
    enum CodingKeys: String, CodingKey { case id, number = "numero", area, patientName, priority, appointmentAt, version, reason, reasonText }
    /// "CON 4", as the number is called out loud.
    public var code: String { "\(area) \(number)" }
}

/// `QueueNextProposalResponse` of `GET /fila/siguiente` and of `nextProposal` when signing a consultation.
public struct QueueNextProposal: Decodable, Sendable, Equatable {
    public let service: String
    public let area: String
    public let rule: String
    public let proposal: QueueProposedTicket?
}

/// Board columns; a move between two of them is one server action.
public enum QueueColumn: String, CaseIterable, Sendable {
    case espera, llamado, atencion, cerrado
    public var label: String {
        switch self {
        case .espera: return "En espera"
        case .llamado: return "Llamados"
        case .atencion: return "En atención"
        case .cerrado: return "Terminados"
        }
    }
}

/// Server action behind a board move, with its path segment under `/fila/{id}/`.
public enum QueueMove: String, Sendable {
    case llamar, atender, completar, noSePresento = "no_se_presento", deshacerLlamado = "deshacer_llamado"
    public var path: String {
        switch self {
        case .noSePresento: return "no-se-presento"
        case .deshacerLlamado: return "deshacer-llamado"
        default: return rawValue
        }
    }
    public var label: String {
        switch self {
        case .llamar: return "Llamar"
        case .atender: return "Iniciar atención"
        case .completar: return "Completar"
        case .noSePresento: return "No se presentó"
        case .deshacerLlamado: return "Devolver a espera"
        }
    }
}

/// A column the card can go to now and the server action that takes it there.
public struct QueueDestination: Hashable, Sendable {
    public let column: QueueColumn
    public let move: QueueMove
}

public enum QueueBoardRules {
    public static let priorities = ["emergencia", "urgente", "rutina"]

    /// Area code of a service (the same table the API uses).
    public static func area(of service: QueueService) -> String {
        switch service {
        case .consultaGeneral: return "CON"
        case .emergencia: return "EMG"
        case .laboratorio: return "LAB"
        case .admisiones: return "REC"
        case .desconocido: return "GEN"
        }
    }

    public static func area(_ ticket: QueueTicket) -> String { ticket.area ?? area(of: ticket.service) }

    /// "CON 7": area code next to the per-area number.
    public static func code(_ ticket: QueueTicket) -> String { "\(area(ticket)) \(ticket.number)" }

    public static func priority(_ ticket: QueueTicket) -> String { ticket.priority ?? "rutina" }

    public static func priorityLabel(_ code: String) -> String {
        switch code {
        case "emergencia": return "Emergencia"
        case "urgente": return "Urgente"
        default: return "Rutina"
        }
    }

    /// "Cita 10:30" for a cited patient (El Salvador time), "Sin cita" for a walk-in.
    public static func arrival(_ ticket: QueueTicket) -> String {
        guard let at = ticket.appointmentAt, let date = ClimesaDates.parse(at) else { return "Sin cita" }
        let shifted = date.addingTimeInterval(-6 * 3600)
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        let parts = calendar.dateComponents([.hour, .minute], from: shifted)
        return String(format: "Cita %02d:%02d", parts.hour ?? 0, parts.minute ?? 0)
    }

    public static func column(_ state: QueueState) -> QueueColumn {
        switch state {
        case .enEspera: return .espera
        case .llamado: return .llamado
        case .enAtencion: return .atencion
        default: return .cerrado
        }
    }

    private static func action(from: QueueColumn, to: QueueColumn) -> QueueMove? {
        switch (from, to) {
        case (.espera, .llamado): return .llamar
        case (.llamado, .espera): return .deshacerLlamado
        case (.llamado, .atencion): return .atender
        case (.llamado, .cerrado): return .noSePresento
        case (.atencion, .cerrado): return .completar
        default: return nil
        }
    }

    /// The move to a column only when the server accepts its action now (`allowedActions`, or `undoActions` for undo).
    public static func move(_ ticket: QueueTicket, to: QueueColumn) -> QueueMove? {
        guard let move = action(from: column(ticket.state), to: to) else { return nil }
        if move == .deshacerLlamado { return (ticket.undoActions ?? []).contains(move.rawValue) ? move : nil }
        let allowed = (ticket.allowedActions ?? []).map(\.rawValue)
        return allowed.contains(move.rawValue) ? move : nil
    }

    /// Columns the card may go to now, for the card menu (no dragging needed).
    public static func destinations(_ ticket: QueueTicket) -> [QueueDestination] {
        QueueColumn.allCases.compactMap { column in move(ticket, to: column).map { QueueDestination(column: column, move: $0) } }
    }

    /// Priorities the card can change to: only while waiting or called.
    public static func priorityChoices(_ ticket: QueueTicket) -> [String] {
        guard ticket.state == .enEspera || ticket.state == .llamado else { return [] }
        return priorities.filter { $0 != priority(ticket) }
    }

    public static func path(_ ticket: QueueTicket, _ move: QueueMove) -> String { "/fila/\(ticket.id)/\(move.path)" }
}
