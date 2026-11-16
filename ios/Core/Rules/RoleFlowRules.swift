import Foundation

/// How strongly a screen presents an action. S13: one primary action per screen; the rest are secondary
/// (bordered) or destructive (with a confirmation).
public enum ActionEmphasis: Equatable, Sendable {
    case primary, secondary, destructive
}

/// I21 · Consultation: the writes the doctor can make on the screen.
public enum ConsultationAction: Equatable, Sendable {
    case save, addDiagnosis, issuePrescription, orderLab, sign, callNext
}

/// S13: the consultation has a single primary action. While it is open, «Firmar» closes the flow; notes, diagnoses,
/// prescription and lab orders are steps inside it. Once signed, calling the proposed next patient is the next step.
public enum ConsultationActionRules {
    public static func primary(editable: Bool, canCallProposed: Bool) -> ConsultationAction? {
        if editable { return .sign }
        return canCallProposed ? .callNext : nil
    }

    public static func emphasis(_ action: ConsultationAction, editable: Bool, canCallProposed: Bool) -> ActionEmphasis {
        primary(editable: editable, canCallProposed: canCallProposed) == action ? .primary : .secondary
    }

    /// What «Firmar» does, for its confirmation (clinical and irreversible, §4.7). Notes typed and not saved are saved
    /// first, so signing never loses them; a diagnosis, prescription or lab order still being typed is not sent.
    public static func signSummary(notesPending: Bool, unsentWork: Bool) -> String {
        var parts = ["La consulta queda cerrada y ya no se puede editar."]
        if notesPending { parts.append("Las notas sin guardar se guardan antes de firmar.") }
        if unsentWork { parts.append("El diagnóstico, la receta o los exámenes que no enviaste no se incluyen.") }
        return parts.joined(separator: " ")
    }
}

/// I20 · Doctor's day: what the single primary button does.
public enum DoctorDayAction: Equatable, Sendable {
    /// Open the consultation of the number already called or in attention.
    case attend(String)
    /// Call the next waiting number (the server picks it, RN-FILA-SIGUIENTE).
    case callNext
}

public enum DoctorDayActionRules {
    /// The patient already in attention (or called, lowest number first) is the day's next step; otherwise calling the
    /// next waiting number. Nil when there is nothing to do, so no button looks primary.
    public static func primary(tickets: [QueueTicket], canAttend: Bool, canCallNext: Bool) -> DoctorDayAction? {
        if canAttend {
            let inAttention = tickets.filter { $0.state == .enAtencion }.min { $0.number < $1.number }
            let called = tickets.filter { $0.state == .llamado }.min { $0.number < $1.number }
            if let current = inAttention ?? called { return .attend(current.id) }
        }
        if canCallNext, QueueRules.nextToCall(tickets) != nil { return .callNext }
        return nil
    }
}

/// I24 · Discharge: the confirmation summary before a signature or a revocation (clinical, §4.7).
public enum DischargeConfirmRules {
    public static func signSummary(type: DischargeType, pendingCount: Int) -> String {
        let pending: String
        switch pendingCount {
        case 0: pending = "sin pendientes"
        case 1: pending = "con 1 pendiente"
        default: pending = "con \(pendingCount) pendientes"
        }
        return "Se firma un alta de tipo «\(type.label)» \(pending). Se puede revocar mientras el paciente no haya salido."
    }

    public static let revokeSummary = "La admisión vuelve a hospitalizado y el alta firmada deja de valer. Queda registrado con tu motivo."
}

/// I09 · Ambulance request: the form starts with the contact the patient already has on file (`GET /me/paciente`).
public enum AmbulancePrefillRules {
    /// Fills only the empty fields, so what the person already typed is never overwritten.
    public static func prefill(address: String, phone: String, from patient: PatientProfile?) -> (address: String, phone: String) {
        func value(_ current: String, _ known: String?) -> String {
            guard current.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return current }
            return known?.trimmingCharacters(in: .whitespacesAndNewlines) ?? current
        }
        return (value(address, patient?.address), value(phone, patient?.phone))
    }
}

public extension AmbulanceLogQuery {
    /// The filters that apply as soon as they change (priority, final state and dates), without an «Aplicar» step.
    /// The free text is left out: it applies on «Buscar» instead of on every keystroke.
    var autoApplyKey: String {
        [from ?? "", to ?? "", priority?.rawValue ?? "", finalState?.rawValue ?? ""].joined(separator: "|")
    }
}
