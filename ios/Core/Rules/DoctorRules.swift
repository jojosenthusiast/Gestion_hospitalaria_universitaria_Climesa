import Foundation

/// I23: resultados por revisar del médico (spec 107).
public enum ReviewRules {
    public static func isCritical(_ order: LabOrder) -> Bool {
        order.items.contains { $0.result?.mark?.isCritical == true }
    }

    /// Completadas sin revisar; las críticas primero y, dentro de cada grupo, la más antigua primero.
    public static func pending(_ orders: [LabOrder]) -> [LabOrder] {
        orders.filter { $0.state == .completado && $0.reviewedAt == nil }.sorted { left, right in
            let l = isCritical(left), r = isCritical(right)
            if l != r { return l }
            return (left.completedAt ?? left.createdAt) < (right.completedAt ?? right.createdAt)
        }
    }
}

/// I21: consulta. La API decide las transiciones; el cliente solo revisa longitudes del contrato.
public enum ConsultationRules {
    /// `ConsultationUpdateDto`: motivo hasta 2000, examen hasta 10000 y plan hasta 5000 caracteres.
    public static func draftErrors(reason: String, physicalExam: String, plan: String) -> [String: String] {
        var errors: [String: String] = [:]
        if reason.count > 2000 { errors["reason"] = "El motivo admite hasta 2000 caracteres." }
        if physicalExam.count > 10000 { errors["physicalExam"] = "El examen físico admite hasta 10000 caracteres." }
        if plan.count > 5000 { errors["plan"] = "El plan admite hasta 5000 caracteres." }
        return errors
    }

    /// `DiagnosisDto.code`: obligatorio y hasta 20 caracteres. La API valida que exista en el catálogo CIE-10.
    public static func diagnosisCodeError(_ code: String) -> String? {
        let size = code.trimmingCharacters(in: .whitespaces).count
        return (1...20).contains(size) ? nil : "Escribe el código CIE-10 (por ejemplo J06.9)."
    }

    public static func prescriptionError(_ item: PrescriptionItemBody) -> String? {
        let required = [item.medication, item.dose, item.route, item.frequency, item.duration]
        return required.contains { $0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
            ? "Completa medicamento, dosis, vía, frecuencia y duración." : nil
    }

    /// Una consulta abierta se puede editar y firmar; una firmada ya no.
    public static func isEditable(_ state: ConsultationState) -> Bool { state == .abierta }
}

/// I21: indicación de hospitalización desde la consulta (`AdmissionDto.motive`, de 10 a 500 caracteres).
public enum AdmissionRules {
    public static let motiveRange = 10...500

    /// Caracteres que cuentan para el límite (sin espacios al inicio ni al final), para el contador del formulario.
    public static func motiveCount(_ motive: String) -> Int { motive.trimmingCharacters(in: .whitespacesAndNewlines).count }

    public static func motiveError(_ motive: String) -> String? {
        let size = motiveCount(motive)
        if size == 0 { return "Escribe el motivo de la hospitalización." }
        if size < motiveRange.lowerBound { return "El motivo necesita al menos 10 caracteres (llevas \(size))." }
        if size > motiveRange.upperBound { return "El motivo admite hasta 500 caracteres (llevas \(size))." }
        return nil
    }
}

/// I24: alta (`DischargeDto`).
public enum DischargeRules {
    public static func errors(type: DischargeType, summary: String, voluntaryConsent: Bool, pending: [DischargePendingBody]) -> [String: String] {
        var errors: [String: String] = [:]
        let size = summary.trimmingCharacters(in: .whitespacesAndNewlines).count
        if size > 0 && !(10...2000).contains(size) { errors["summary"] = "El resumen va de 10 a 2000 caracteres." }
        if type == .voluntaria && !voluntaryConsent { errors["voluntaryConsent"] = "El alta voluntaria requiere el consentimiento del paciente." }
        if pending.count > 50 { errors["pending"] = "Se admiten hasta 50 pendientes." }
        if pending.contains(where: { $0.description.trimmingCharacters(in: .whitespaces).isEmpty || $0.responsible.trimmingCharacters(in: .whitespaces).isEmpty }) {
            errors["pending"] = "Cada pendiente necesita descripción y responsable."
        }
        return errors
    }

    /// Hospitalizados del médico: en cama o esperando una.
    public static func current(_ admissions: [Admission]) -> [Admission] {
        admissions.filter { $0.state == .hospitalizado || $0.state == .pendienteCama }
    }
}
