import Foundation

/// `LabFollowUpResponse` de `GET /laboratorio/pendientes` (S10): un pendiente de «Resultados por revisar» del médico.
public struct LabFollowUp: Decodable, Sendable, Identifiable, Equatable {
    public let id: String
    public let orderId: String
    public let patientId: String
    public let patientName: String?
    public let patientRecord: String?
    /// `critico` u `observacion`.
    public let reason: String
    public let detail: String
    public let createdAt: String
    public let version: Int

    public var critical: Bool { reason == "critico" }
}

/// `LabFollowUpStateResponse` de `POST /laboratorio/pendientes/{id}/revisar`.
public struct LabFollowUpState: Decodable, Sendable, Equatable {
    public let id: String
    public let state: String
    public let version: Int
}

/// `LabExternalSentResponse` de `POST /laboratorio/ordenes/{id}/externa`.
public struct LabExternalSent: Decodable, Sendable, Equatable {
    public let id: String
    public let version: Int
    public let external: Bool
}

/// Cuerpo de `POST /laboratorio/ordenes/{id}/externa`.
public struct LabSendExternalBody: Encodable, Sendable, Equatable {
    public let version: Int
    public let place: String
    public let instructions: String
}

/// S10: «Resultados por revisar». Críticos primero y luego los más antiguos; el médico marca cada uno como revisado.
public enum LabFollowUpRules {
    public static func sorted(_ items: [LabFollowUp]) -> [LabFollowUp] {
        items.sorted { a, b in a.critical != b.critical ? a.critical : a.createdAt < b.createdAt }
    }
    /// La observación del laboratorio es una nota para el médico: nunca se muestra en la vista del paciente.
    public static func labNote(_ result: LabItemResult?, staffView: Bool) -> String? { staffView ? result?.observation : nil }

    public static func reviewPath(_ id: String) -> String { "/laboratorio/pendientes/\(id)/revisar" }
    public static func reviewBody(version: Int) -> VersionBody { VersionBody(version: version) }
}

/// S10: órdenes que se hacen en otro lugar. La API es la garantía; aquí solo se evita un envío que fallaría seguro.
public enum LabExternalRules {
    public static let placeRange = 3...200
    public static let instructionsRange = 10...1000
    public static let instructionsTemplate = "Presente esta orden y su DUI en el lugar indicado. Siga la preparación que le indiquen. Traiga el informe (foto o PDF) a su próxima cita o al laboratorio."

    public static func sendPath(_ orderId: String) -> String { "/laboratorio/ordenes/\(orderId)/externa" }

    public static func sendError(place: String, instructions: String) -> String? {
        let place = place.trimmingCharacters(in: .whitespacesAndNewlines).count
        let instructions = instructions.trimmingCharacters(in: .whitespacesAndNewlines).count
        if place < placeRange.lowerBound { return "Indica dónde se realiza el examen." }
        if place > placeRange.upperBound { return "El lugar no puede pasar de \(placeRange.upperBound) caracteres." }
        if instructions < instructionsRange.lowerBound { return "Escribe las instrucciones para el paciente (al menos \(instructionsRange.lowerBound) caracteres)." }
        if instructions > instructionsRange.upperBound { return "Las instrucciones no pueden pasar de \(instructionsRange.upperBound) caracteres." }
        return nil
    }

    public static func sendBody(version: Int, place: String, instructions: String) -> LabSendExternalBody {
        LabSendExternalBody(version: version, place: place.trimmingCharacters(in: .whitespacesAndNewlines), instructions: instructions.trimmingCharacters(in: .whitespacesAndNewlines))
    }

    /// Lo que el paciente lee en «Mis exámenes» mientras la orden externa espera el informe; nil si la orden no es externa o ya avanzó.
    public static func patientNote(_ order: LabOrder) -> String? {
        guard order.external, order.state == .pendiente else { return nil }
        return "Hazte el examen en \(order.externalPlace ?? "el lugar indicado") y trae el informe."
    }
}

/// Grupos de la lista de órdenes, en el orden en que se trabaja; lo cerrado empieza plegado. Mismos grupos que la web y Android.
public enum LabWorkGroup: String, Sendable, CaseIterable {
    case enProceso = "en_proceso", muestra, externa, porRevisar = "por_revisar", liberada, cancelada

    public var label: String {
        switch self {
        case .enProceso: return "En proceso"
        case .muestra: return "Por tomar muestra"
        case .externa: return "Externas: esperan el informe"
        case .porRevisar: return "Esperan revisión médica"
        case .liberada: return "Liberadas"
        case .cancelada: return "Canceladas"
        }
    }
    public var folded: Bool { self == .liberada || self == .cancelada }

    public static func of(_ order: LabOrder) -> LabWorkGroup {
        switch order.state {
        case .cancelado: return .cancelada
        case .enProceso: return .enProceso
        case .pendiente: return order.external ? .externa : .muestra
        default: return order.reviewedAt == nil ? .porRevisar : .liberada
        }
    }

    /// Conserva el orden de entrada dentro de cada grupo y omite los grupos vacíos.
    public static func group(_ orders: [LabOrder]) -> [(group: LabWorkGroup, orders: [LabOrder])] {
        allCases
            .map { group -> (group: LabWorkGroup, orders: [LabOrder]) in (group: group, orders: orders.filter { Self.of($0) == group }) }
            .filter { !$0.orders.isEmpty }
    }
}
