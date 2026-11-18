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

    /// Row 16 (MED audit): what Mi día counts as «Resultados por revisar»: completed, unreviewed and reviewable by this
    /// doctor (`allowedActions` has `revisar`), like Android's Inicio.
    public static func toReview(_ orders: [LabOrder]) -> Int {
        pending(orders).filter { $0.allows(.revisar) }.count
    }

    /// RN-25: órdenes con valor crítico que este médico puede revisar (`allowedActions` incluye `revisar`).
    public static func criticalToReview(_ orders: [LabOrder]) -> Int {
        orders.filter { $0.allows(.revisar) && isCritical($0) }.count
    }

    /// Órdenes propias en curso que la API deja cancelar, la más antigua primero.
    public static func cancellable(_ orders: [LabOrder]) -> [LabOrder] {
        orders.filter { $0.allows(.cancelar) }.sorted { $0.createdAt < $1.createdAt }
    }

    /// Label key of a completed order waiting for review (web `stageLabel`): "Por revisar" only when this doctor can
    /// review it (`allowedActions` has `revisar`); otherwise "Completada · falta revisión médica".
    public static func rowStatusKey(_ order: LabOrder) -> String {
        guard order.allows(.revisar) else { return "results.awaitingReview" }
        return isAmendedPendingReview(order) ? "results.amended" : "results.toReview"
    }

    /// Un laboratorista corrigió un resultado y el médico todavía no lo vuelve a revisar.
    public static func isAmendedPendingReview(_ order: LabOrder) -> Bool {
        order.amendedAt != nil && order.state == .completado && order.reviewedAt == nil
    }
}

/// MA-LAB-05: cancelar una orden de laboratorio propia. `LabCancelDto.reason` de 10 a 500 caracteres, igual que la web (D-13).
public enum LabCancelRules {
    public static let reasonRange = 10...500

    public static func path(_ orderId: String) -> String { "/laboratorio/ordenes/\(orderId)/cancelar" }

    public static func reasonCount(_ reason: String) -> Int { reason.trimmingCharacters(in: .whitespacesAndNewlines).count }

    public static func reasonError(_ reason: String) -> String? {
        let size = reasonCount(reason)
        if size == 0 { return "Escribe el motivo para cancelar la orden." }
        if size < reasonRange.lowerBound { return "El motivo necesita al menos 10 caracteres (llevas \(size))." }
        if size > reasonRange.upperBound { return "El motivo admite hasta 500 caracteres (llevas \(size))." }
        return nil
    }

    /// Cuerpo con la versión de la orden y el motivo sin espacios sobrantes.
    public static func body(version: Int, reason: String) -> LabOrderCancelBody {
        LabOrderCancelBody(version: version, reason: reason.trimmingCharacters(in: .whitespacesAndNewlines))
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

    /// Fase 2R: the code comes from a result of the CIE-10 search, never typed by hand.
    public static func diagnosisSelectionError(_ entry: Cie10Entry?) -> String? {
        entry == nil ? "Busca y elige el diagnóstico CIE-10." : nil
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

/// Fase 2R: whether the patient of this consultation already has an admission, read from `GET /admisiones`, so an
/// indication already made shows as done after leaving the screen and cannot be sent twice. The API refuses a second
/// active admission too ("El paciente ya tiene una admisión activa.").
public enum AdmissionIndicationRules {
    /// The states the API counts as active when it refuses another admission.
    public static let activeStates: Set<AdmissionState> = [.pendienteCama, .hospitalizado, .altaFirmada]

    /// The patient's active admission, preferring the one indicated from this consultation; nil when there is none.
    public static func existing(_ admissions: [Admission], patientId: String, consultationId: String) -> Admission? {
        let active = admissions.filter { $0.patientId == patientId && activeStates.contains($0.state) }
        return active.first { fromThisConsultation($0, consultationId: consultationId) } ?? active.first
    }

    public static func fromThisConsultation(_ admission: Admission, consultationId: String) -> Bool {
        admission.origin == "consulta" && admission.originId == consultationId
    }

    /// Row 12 (MED audit): why «Indicar hospitalización» is missing when the account has no linked staff record.
    public static let noStaffRecord = "Tu cuenta no está vinculada a un registro de personal, así que no puedes indicar hospitalizaciones. Pide a administración que la vincule."
}

/// Fase 2R: CIE-10 search of the diagnosis step (`GET /consultas/cie10?q=`, up to 20 rows).
public enum Cie10SearchRules {
    public static let minimum = 2
    /// Pause after the last key before searching (the user's typing, not a refresh timer).
    public static let debounceNanoseconds: UInt64 = 350_000_000
    public static let shortQuery = "Escribe al menos 2 letras o el inicio del código."

    /// The trimmed text to search, or nil below 2 characters (the API refuses it).
    public static func query(_ text: String) -> String? {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.count >= minimum ? trimmed : nil
    }

    public static func path(_ query: String) -> String {
        var allowed = CharacterSet.urlQueryAllowed
        allowed.remove(charactersIn: "&=+?#")
        return "/consultas/cie10?q=" + (query.addingPercentEncoding(withAllowedCharacters: allowed) ?? "")
    }

    /// «J45.9 · Asma no especificada».
    public static func title(_ entry: Cie10Entry) -> String { "\(entry.code) · \(entry.description)" }
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
        } else if pending.contains(where: { $0.description.count > 500 || $0.responsible.count > 200 }) {
            errors["pending"] = "La descripción admite hasta 500 caracteres y el responsable hasta 200."
        }
        return errors
    }

    /// Hospitalizados del médico: en cama o esperando una.
    public static func current(_ admissions: [Admission]) -> [Admission] {
        admissions.filter { $0.state == .hospitalizado || $0.state == .pendienteCama }
    }

    /// Lista de I24: además de los vigentes, las altas firmadas que aún no salen (para ver el alta y poder revocarla).
    public static func listed(_ admissions: [Admission]) -> [Admission] {
        admissions.filter { $0.state == .hospitalizado || $0.state == .pendienteCama || $0.state == .altaFirmada }
    }

    /// Row 13 (MED audit): what needs the doctor first: a discharge Recepción asked for, then signed discharges still in the
    /// bed, then the rest; same rank keeps the API order. I24 shows two and folds the rest (`AttentionFold`).
    public static func ranked(_ admissions: [Admission]) -> [Admission] {
        func rank(_ a: Admission) -> Int {
            if a.state != .altaFirmada && a.dischargeRequestedAt != nil { return 0 }
            return a.state == .altaFirmada ? 1 : 2
        }
        return listed(admissions).enumerated().sorted { l, r in
            rank(l.element) == rank(r.element) ? l.offset < r.offset : rank(l.element) < rank(r.element)
        }.map(\.element)
    }
}

/// I24: qué muestra cada fila de hospitalizados. Todo botón sale de `allowedActions`.
public struct HospitalizedRowActions: Equatable, Sendable {
    public let sign: Bool
    public let revoke: Bool
    /// "Recepción pidió el alta hace 5 min" si hay una solicitud vigente.
    public let requestHint: String?
    /// Alta firmada vigente para mostrar (tipo y pendientes).
    public let discharge: Admission.Discharge?

    public static func of(_ admission: Admission, now: Date = Date()) -> HospitalizedRowActions {
        let requested = ClimesaDates.parse(admission.dischargeRequestedAt)
        return HospitalizedRowActions(
            sign: admission.allows(.firmarAlta),
            revoke: admission.allows(.revocarAlta),
            requestHint: requested.map { "Recepción pidió el alta " + RelativeTime.text($0, now: now) + "." },
            discharge: admission.discharge
        )
    }
}

/// Tiempo transcurrido en español ("hace un momento", "hace 5 min", "hace 2 h", "hace 3 días").
public enum RelativeTime {
    public static func text(_ date: Date, now: Date) -> String {
        let seconds = max(0, Int(now.timeIntervalSince(date)))
        if seconds < 60 { return "hace un momento" }
        let minutes = seconds / 60
        if minutes < 60 { return "hace \(minutes) min" }
        let hours = minutes / 60
        if hours < 24 { return "hace \(hours) h" }
        let days = hours / 24
        return days == 1 ? "hace 1 día" : "hace \(days) días"
    }
}

/// I24: revocar un alta firmada (`DischargeRevocationDto.reason`, de 10 a 500 caracteres).
public enum DischargeRevocationRules {
    public static let reasonRange = 10...500

    public static func reasonCount(_ reason: String) -> Int { reason.trimmingCharacters(in: .whitespacesAndNewlines).count }

    public static func reasonError(_ reason: String) -> String? {
        let size = reasonCount(reason)
        if size == 0 { return "Escribe el motivo para revocar el alta." }
        if size < reasonRange.lowerBound { return "El motivo necesita al menos 10 caracteres (llevas \(size))." }
        if size > reasonRange.upperBound { return "El motivo admite hasta 500 caracteres (llevas \(size))." }
        return nil
    }
}

// MARK: - R2: consulta por pasos, catálogo con búsqueda, signos con nombre

/// Pasos de la consulta, los mismos de la web (`STEPS` de web/src/features/consultations.tsx): consulta →
/// procedimientos → receta y exámenes → cerrar. La pantalla muestra un paso a la vez con su indicador arriba.
public enum ConsultationStep: Int, CaseIterable, Sendable {
    case consulta = 1, procedimientos, recetaExamenes, cierre

    /// Clave de Localizable.xcstrings con el título numerado («1. Consulta»).
    public var titleKey: String { "consultation.step.\(rawValue)" }

    /// El paso siguiente; el último no tiene.
    public var next: ConsultationStep? { ConsultationStep(rawValue: rawValue + 1) }

    /// Estado del paso respecto del actual: hecho (antes), actual o pendiente (después).
    public func state(current: ConsultationStep) -> StepState {
        if self == current { return .actual }
        return rawValue < current.rawValue ? .hecho : .pendiente
    }

    public enum StepState: Sendable { case hecho, actual, pendiente }
}

/// Búsqueda del catálogo de laboratorio: por nombre o código, sin acentos ni mayúsculas. Lo ya elegido siempre se ve.
public enum LabCatalogFilter {
    public static func filter(_ exams: [LabExam], query: String, selected: Set<String>) -> [LabExam] {
        let text = fold(query)
        guard !text.isEmpty else { return exams }
        return exams.filter { selected.contains($0.id) || fold($0.name).contains(text) || fold($0.code).contains(text) }
    }

    private static func fold(_ text: String) -> String {
        text.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: Locale(identifier: "es")).trimmingCharacters(in: .whitespacesAndNewlines)
    }
}

/// Nombre y unidad de cada signo vital del reporte prehospital (`VitalSignsDto` de la API), nunca la clave cruda.
public enum VitalSignLabels {
    private static let order = ["systolic", "diastolic", "heartRate", "respiratoryRate", "oxygenSaturation", "temperature", "glasgow"]
    private static let labels: [String: (name: String, unit: String?)] = [
        "systolic": ("Presión sistólica", "mmHg"), "diastolic": ("Presión diastólica", "mmHg"),
        "heartRate": ("Frecuencia cardiaca", "lpm"), "respiratoryRate": ("Frecuencia respiratoria", "rpm"),
        "oxygenSaturation": ("Saturación de oxígeno", "%"), "temperature": ("Temperatura", "°C"), "glasgow": ("Escala de Glasgow", nil)
    ]

    /// Nombre en español; una clave desconocida se muestra con espacios en lugar de guiones bajos.
    public static func label(_ key: String) -> String { labels[key]?.name ?? key.replacingOccurrences(of: "_", with: " ") }

    /// Valor con su unidad («98 %», «120 mmHg»).
    public static func value(_ key: String, _ text: String) -> String {
        guard let unit = labels[key]?.unit, !text.isEmpty else { return text }
        return "\(text) \(unit)"
    }

    /// Claves en orden clínico (presión, frecuencias, saturación, temperatura, Glasgow); las desconocidas al final.
    public static func ordered(_ keys: [String]) -> [String] {
        let known = order.filter { keys.contains($0) }
        return known + keys.filter { !order.contains($0) }.sorted()
    }
}

/// How urgent a pending item is: danger before warning before the rest (Android `AttentionList`, web focused tray).
public enum AttentionTone: Int, Comparable, Sendable {
    case danger = 0, warning = 1, other = 2
    public static func < (lhs: AttentionTone, rhs: AttentionTone) -> Bool { lhs.rawValue < rhs.rawValue }
}

/// Owner rule: a home screen shows only the two most urgent pending items and folds the rest behind
/// «Ver N pendientes más», so the first glance is what to do now, not a wall of rows.
public enum AttentionFold {
    public static let visible = 2

    /// Most urgent first; items of the same tone keep their order.
    public static func ranked<T>(_ items: [T], tone: (T) -> AttentionTone) -> [T] {
        items.enumerated().sorted { a, b in
            let (ta, tb) = (tone(a.element), tone(b.element))
            return ta == tb ? a.offset < b.offset : ta < tb
        }.map(\.element)
    }

    /// Rows to draw: all when expanded, otherwise the first `visible`.
    public static func shown<T>(_ items: [T], expanded: Bool) -> [T] {
        expanded ? items : Array(items.prefix(visible))
    }

    /// How many rows stay folded.
    public static func hidden(_ count: Int, expanded: Bool) -> Int { expanded ? 0 : max(0, count - visible) }

    /// "Ver 3 pendientes más" / "Ver 1 pendiente más", or "Ver menos" once open; nil when nothing folds.
    public static func toggleTitle(_ count: Int, expanded: Bool) -> String? {
        guard count > visible else { return nil }
        if expanded { return "Ver menos" }
        let more = count - visible
        return more == 1 ? "Ver 1 pendiente más" : "Ver \(more) pendientes más"
    }
}

/// Chip of a doctor picker: only the doctors with a shift that day (default) or every doctor.
public enum DoctorShiftFilter: String, CaseIterable, Sendable, Hashable {
    case conTurno, todos
    public var label: String { self == .conTurno ? "Con turno" : "Todos" }
    /// «Con turno» wears the available (green) badge; «Todos» stays neutral.
    public var statusValue: String? { self == .conTurno ? "disponible" : nil }
}

/// Owner rules R1-R3 for every doctor picker (Android `DoctorShifts`, web `doctor-shifts.tsx`): doctors with a shift
/// first, «Con turno» hides the others, and an unknown shift (no date asked) counts as on shift.
public enum DoctorShiftRules {
    public static func onShift(_ doctor: AppointmentCatalogs.Doctor) -> Bool { doctor.hasShift != false }

    /// Active doctors, the ones with a shift first; each group keeps the API order.
    public static func ordered(_ doctors: [AppointmentCatalogs.Doctor]) -> [AppointmentCatalogs.Doctor] {
        let active = doctors.filter(\.active)
        return active.filter(onShift) + active.filter { !onShift($0) }
    }

    public static func withShift(_ doctors: [AppointmentCatalogs.Doctor]) -> Int { doctors.filter { $0.active && onShift($0) }.count }

    /// «Con turno» with nobody on shift would show an empty list: fall back to «Todos».
    public static func effective(_ filter: DoctorShiftFilter, _ doctors: [AppointmentCatalogs.Doctor]) -> DoctorShiftFilter {
        let active = doctors.filter(\.active)
        return filter == .conTurno && !active.isEmpty && !active.contains(where: onShift) ? .todos : filter
    }

    /// Rows for the filter and the typed text (name or specialty).
    public static func visible(_ doctors: [AppointmentCatalogs.Doctor], filter: DoctorShiftFilter, query: String) -> [AppointmentCatalogs.Doctor] {
        let needle = query.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: nil).trimmingCharacters(in: .whitespacesAndNewlines)
        return ordered(doctors).filter { doctor in
            (effective(filter, doctors) == .todos || onShift(doctor))
                && (needle.isEmpty || "\(doctor.fullName) \(doctor.specialty ?? "")".folding(options: [.diacriticInsensitive, .caseInsensitive], locale: nil).contains(needle))
        }
    }

    /// Tag of a row: green «Con turno», or the closed reason ("Sin turno ese día").
    public static func tag(_ doctor: AppointmentCatalogs.Doctor) -> (value: String, label: String) {
        onShift(doctor) ? ("disponible", "Con turno") : ("cerrado", doctor.reason ?? "Sin turno")
    }
}

/// Row 4 (MED audit): the record shows the latest vital signs, newest first, read-only.
public enum PatientVitalsRules {
    public static let shown = 3

    public static func latest(_ items: [ConsultationDetail.VitalSigns]) -> [ConsultationDetail.VitalSigns] {
        Array(items.sorted { $0.takenAt > $1.takenAt }.prefix(shown))
    }
}

// MARK: - D5 · the doctor records vital signs from the record

/// D5: the measures of the vitals form, with the hard limits the API and the database accept (`PatientVitalsDto`).
/// Same table, messages and rules as Android `VitalMeasure` / `VitalsRules`; the API stays the guarantee.
public enum VitalEntryMeasure: String, CaseIterable, Sendable {
    case temperature, heartRate, respiratoryRate, systolic, diastolic, oxygenSaturation, pain, glucoseMgDl, weightKg, heightCm

    public var label: String {
        switch self {
        case .temperature: return "Temperatura"
        case .heartRate: return "Frecuencia cardiaca"
        case .respiratoryRate: return "Frecuencia respiratoria"
        case .systolic: return "Presión sistólica"
        case .diastolic: return "Presión diastólica"
        case .oxygenSaturation: return "Saturación de oxígeno"
        case .pain: return "Dolor (0 a 10)"
        case .glucoseMgDl: return "Glucemia"
        case .weightKg: return "Peso"
        case .heightCm: return "Talla"
        }
    }

    public var unit: String {
        switch self {
        case .temperature: return "°C"
        case .heartRate: return "lpm"
        case .respiratoryRate: return "rpm"
        case .systolic, .diastolic: return "mmHg"
        case .oxygenSaturation: return "%"
        case .pain: return "/10"
        case .glucoseMgDl: return "mg/dL"
        case .weightKg: return "kg"
        case .heightCm: return "cm"
        }
    }

    public var range: ClosedRange<Double> {
        switch self {
        case .temperature: return 30...45
        case .heartRate: return 20...250
        case .respiratoryRate: return 4...80
        case .systolic: return 40...300
        case .diastolic: return 20...200
        case .oxygenSaturation: return 40...100
        case .pain: return 0...10
        case .glucoseMgDl: return 20...800
        case .weightKg: return 0.3...400
        case .heightCm: return 20...250
        }
    }

    /// Temperature, weight and height take one decimal; the rest are whole numbers.
    public var decimals: Bool { self == .temperature || self == .weightKg || self == .heightCm }

    public func format(_ value: Double) -> String {
        decimals && value.truncatingRemainder(dividingBy: 1) != 0 ? String(format: "%.1f", value) : String(Int(value))
    }

    public var rangeText: String { "\(format(range.lowerBound)) a \(format(range.upperBound)) \(unit)" }
}

public enum VitalsEntryRules {
    public static let permission = "signos.registrar"
    public static let noteMaximum = 500

    public static func path(_ patientId: String) -> String { "/pacientes/\(patientId)/signos" }

    /// Rule 8: who takes signs is decided by the permission `signos.registrar`, never by the role.
    public static func canRecord(_ profile: AccessProfile?) -> Bool { profile?.hasPermission(permission) ?? false }

    /// Decimals accept a comma (es-SV keyboards); "nan" or "inf" are not numbers.
    public static func parse(_ text: String) -> Double? {
        guard let value = Double(text.trimmingCharacters(in: .whitespacesAndNewlines).replacingOccurrences(of: ",", with: ".")), value.isFinite else { return nil }
        return value
    }

    /// Inline error for one field, or nil when it is empty or acceptable.
    public static func fieldError(_ measure: VitalEntryMeasure, _ text: String) -> String? {
        if text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { return nil }
        guard let value = parse(text) else { return "Escribe un número." }
        if !measure.decimals && value.truncatingRemainder(dividingBy: 1) != 0 { return "Solo números enteros." }
        return measure.range.contains(value) ? nil : "Fuera de rango: \(measure.rangeText)."
    }

    /// First blocking problem of the whole form, or nil when it can be sent.
    public static func formError(_ values: [VitalEntryMeasure: String], note: String) -> String? {
        for measure in VitalEntryMeasure.allCases {
            if let error = fieldError(measure, values[measure] ?? "") { return "\(measure.label): \(error)" }
        }
        let filled = VitalEntryMeasure.allCases.filter { !(values[$0] ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
        if filled.isEmpty { return "Registra al menos una medida." }
        let systolic = parse(values[.systolic] ?? ""), diastolic = parse(values[.diastolic] ?? "")
        if (systolic == nil) != (diastolic == nil) { return "La presión necesita la sistólica y la diastólica." }
        if let systolic, let diastolic, systolic <= diastolic { return "La sistólica debe ser mayor que la diastólica." }
        if note.count > noteMaximum { return "La nota no puede pasar de \(noteMaximum) caracteres." }
        return nil
    }

    /// Body of `POST /pacientes/{id}/signos`: only filled measures, the trimmed note and the active admission.
    public static func body(_ values: [VitalEntryMeasure: String], note: String, admissionId: String?) -> VitalsEntryBody {
        func whole(_ m: VitalEntryMeasure) -> Int? { parse(values[m] ?? "").map { Int($0) } }
        func decimal(_ m: VitalEntryMeasure) -> Double? { parse(values[m] ?? "") }
        let trimmed = note.trimmingCharacters(in: .whitespacesAndNewlines)
        let admission = admissionId?.trimmingCharacters(in: .whitespacesAndNewlines)
        return VitalsEntryBody(
            systolic: whole(.systolic), diastolic: whole(.diastolic), heartRate: whole(.heartRate), respiratoryRate: whole(.respiratoryRate),
            temperature: decimal(.temperature), oxygenSaturation: whole(.oxygenSaturation), weightKg: decimal(.weightKg), heightCm: decimal(.heightCm),
            pain: whole(.pain), glucoseMgDl: whole(.glucoseMgDl), note: trimmed.isEmpty ? nil : trimmed,
            admissionId: (admission?.isEmpty ?? true) ? nil : admission)
    }
}

/// `PatientVitalsDto`: every key is optional and left out when empty.
public struct VitalsEntryBody: Encodable, Sendable, Equatable {
    public let systolic: Int?
    public let diastolic: Int?
    public let heartRate: Int?
    public let respiratoryRate: Int?
    public let temperature: Double?
    public let oxygenSaturation: Int?
    public let weightKg: Double?
    public let heightCm: Double?
    public let pain: Int?
    public let glucoseMgDl: Int?
    public let note: String?
    public let admissionId: String?
}

/// `VitalSignsCreatedResponse`: only the id is read.
public struct VitalsEntrySaved: Decodable, Sendable, Equatable {
    public let id: String
}
