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

    // MARK: C2 · send once, then load the result

    /// «Enviar a externo» only while the API offers it on an order that is not external yet, and never again after this
    /// screen sent it: a copy taken before the send still carries the old version and would hit `version_conflicto`.
    public static func canSend(_ order: LabOrder, sentHere: Bool) -> Bool {
        !sentHere && !order.external && order.allowsExternal(.enviarExterno)
    }

    /// «Cargar resultado externo»: an external order still waiting for its report, when the API offers the action.
    public static func canLoadResult(_ order: LabOrder) -> Bool {
        order.external && order.state == .pendiente && order.allowsExternal(.cargarExterno)
    }

    public static let noteMaximum = 1000

    public static func resultPath(_ orderId: String) -> String { "/laboratorio/ordenes/\(orderId)/resultado-externo" }

    /// Checked before sending: a PDF or photo of at most 10 MiB. The API reads the bytes again.
    public static func attachmentError(_ file: LabExternalFile?) -> String? {
        guard let file else { return "Adjunta la foto o el PDF del informe externo." }
        if file.sizeBytes <= 0 { return "El archivo está vacío." }
        if !LabAttachmentRules.allowedTypes.contains(file.mimeType) { return "El informe debe ser PDF o una foto (JPG, PNG, HEIC o WEBP)." }
        if file.sizeBytes > LabAttachmentRules.maxBytes { return LabAttachmentRules.tooLarge }
        return nil
    }

    /// Accepts a decimal comma, as people type it in El Salvador.
    public static func number(_ value: String) -> Double? {
        Double(value.trimmingCharacters(in: .whitespacesAndNewlines).replacingOccurrences(of: ",", with: "."))
    }

    /// Every exam needs its key value, a number where the exam is numeric.
    public static func valuesError(items: [LabOrderItem], values: [String: String]) -> String? {
        let missing = items.filter { (values[$0.id] ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }.count
        if missing > 0 { return "Falta el valor de \(missing) examen(es)." }
        if let item = items.first(where: { $0.numeric && number(values[$0.id] ?? "") == nil }) { return "El valor de \(item.name) debe ser un número." }
        return nil
    }

    /// `LabExternalResultDto`: the order version, the file reference and one value per exam.
    public static func resultBody(version: Int, file: LabExternalFile, items: [LabOrderItem], values: [String: String], note: String) -> LabExternalResultBody {
        let results = items.map { item -> LabExternalValueBody in
            let raw = values[item.id] ?? ""
            return item.numeric
                ? LabExternalValueBody(orderItemId: item.id, value: number(raw), text: nil)
                : LabExternalValueBody(orderItemId: item.id, value: nil, text: raw.trimmingCharacters(in: .whitespacesAndNewlines))
        }
        let trimmed = note.trimmingCharacters(in: .whitespacesAndNewlines)
        return LabExternalResultBody(version: version, attachment: file.reference, results: results, note: trimmed.isEmpty ? nil : trimmed)
    }
}

/// The photo or PDF picked on the phone, with its bytes, so a retry sends exactly the same file.
public struct LabExternalFile: Sendable, Equatable {
    public let fileName: String
    /// Read from the bytes (`LabAttachmentRules.detectType`); `application/octet-stream` when it is not a valid type.
    public let mimeType: String
    public let sizeBytes: Int
    /// SHA-256 in lowercase hex, computed by the app; the API checks the uploaded bytes against it.
    public let sha256: String?
    public let data: Data

    public static func make(data: Data, fileName: String, sha256: String?) -> LabExternalFile {
        let type = LabAttachmentRules.detectType(data) ?? "application/octet-stream"
        let name = fileName.trimmingCharacters(in: .whitespacesAndNewlines)
        return LabExternalFile(fileName: String((name.isEmpty ? LabAttachmentRules.defaultFileName(type) : name).prefix(200)),
                               mimeType: type, sizeBytes: data.count, sha256: sha256, data: data)
    }

    public var reference: LabAttachmentReferenceBody {
        LabAttachmentReferenceBody(fileName: fileName, mimeType: mimeType, sizeBytes: sizeBytes, sha256: sha256)
    }

    /// Fingerprint of the upload intent: the same bytes keep the same `Idempotency-Key` on every retry.
    public var uploadIntent: LabAttachmentReferenceBody { reference }
}

/// `LabAttachmentDto`: the reference of the file sent with the values.
public struct LabAttachmentReferenceBody: Encodable, Sendable, Equatable {
    public let fileName: String
    public let mimeType: String
    public let sizeBytes: Int
    public let sha256: String?
}

/// `LabExternalValueDto`: `value` for a numeric exam, `text` otherwise (the other key is left out).
public struct LabExternalValueBody: Encodable, Sendable, Equatable {
    public let orderItemId: String
    public let value: Double?
    public let text: String?
}

/// `LabExternalResultDto` of `POST /laboratorio/ordenes/{id}/resultado-externo`.
public struct LabExternalResultBody: Encodable, Sendable, Equatable {
    public let version: Int
    public let attachment: LabAttachmentReferenceBody
    public let results: [LabExternalValueBody]
    public let note: String?
}

/// `LabExternalResultResponse`: the completed order and the attachment that receives the file next.
public struct LabExternalResultSaved: Decodable, Sendable, Equatable {
    public let id: String
    public let version: Int
    public let attachmentId: String?
}

/// `LabAttachmentStoredResponse` of `POST /laboratorio/adjuntos/{id}/archivo`.
public struct LabAttachmentStored: Decodable, Sendable, Equatable {
    public let id: String
    public let stored: Bool
}

/// C2: the two steps of an external result. The values (with the file reference) go first; then the file. When the
/// upload fails the values are already saved, so «Reintentar» only uploads the file again, never the values.
public struct ExternalResultFlow: Equatable, Sendable {
    public enum Step: Equatable, Sendable { case saveValues, upload(attachmentId: String), finished }
    public enum Status: Equatable, Sendable { case editing, saving, uploading, failed(String), done(withFile: Bool) }

    public private(set) var status: Status = .editing
    public private(set) var attachmentId: String?
    private var valuesDone = false
    private var stored = false

    public init() {}

    public var next: Step {
        if !valuesDone { return .saveValues }
        if let attachmentId, !stored { return .upload(attachmentId: attachmentId) }
        return .finished
    }

    public var busy: Bool { status == .saving || status == .uploading }
    /// The file and the values change only until the reference (with its SHA-256) is saved.
    public var canEdit: Bool { !valuesDone && !busy }
    /// The values are saved but the file is not: the screen shows «Archivo pendiente · Reintentar».
    public var filePending: Bool { valuesDone && attachmentId != nil && !stored }

    public mutating func begin() {
        switch next {
        case .saveValues: status = .saving
        case .upload: status = .uploading
        case .finished: break
        }
    }

    public mutating func valuesSaved(attachmentId: String?) {
        valuesDone = true
        self.attachmentId = attachmentId
        status = attachmentId == nil ? .done(withFile: false) : .uploading
    }

    public mutating func fileStored() {
        stored = true
        status = .done(withFile: true)
    }

    public mutating func fail(_ message: String) { status = .failed(message) }
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

// MARK: - D4 · external result without an order (doctor's patient record)

/// D4 (R7 C-5, D-5): the patient brings an exam done elsewhere that nobody ordered here. The doctor with a care
/// relationship records it from the record with `POST /laboratorio/pacientes/{id}/resultado-externo`
/// (`LabExternalRecordDto`, permission `laboratorio.ordenar`); the file goes up next, as in `ExternalResultFlow`.
/// Same bounds as the API, the web and Android (`ExternalRecordRules`); the API stays the guarantee.
public enum ExternalRecordRules {
    public static let permission = "laboratorio.ordenar"
    public static let placeMinimum = 3
    public static let placeMaximum = 200
    public static let examMaximum = 50
    public static let textMaximum = 5000

    public static func path(_ patientId: String) -> String { "/laboratorio/pacientes/\(patientId)/resultado-externo" }

    /// Rule 8: the action depends on the permission, never on the role.
    public static func canRecord(_ profile: AccessProfile?) -> Bool { profile?.hasPermission(permission) ?? false }

    /// The record offers «Registrar resultado externo» only once the history was read (Android `ClinicalHistoryScreen`):
    /// without a care relationship the API answers 403 and the action would only fail after the form is filled.
    public static func canOffer(_ profile: AccessProfile?, historyReadable: Bool) -> Bool { historyReadable && canRecord(profile) }

    /// A finite number, with the decimal comma people type in El Salvador ("nan" and "inf" are not numbers).
    public static func number(_ value: String) -> Double? {
        guard let parsed = LabExternalRules.number(value), parsed.isFinite else { return nil }
        return parsed
    }

    /// Exams that can still be added: never a panel (the API refuses them), not picked yet, matching [query], by name.
    public static func options(_ catalog: [LabExam], picked: [LabExam], query: String = "") -> [LabExam] {
        let q = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return catalog
            .filter { exam in !exam.isPanel && !picked.contains { $0.id == exam.id } }
            .filter { q.isEmpty || $0.name.lowercased().contains(q) || $0.code.lowercased().contains(q) }
            .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
    }

    /// First blocking problem of the form, or nil when it can be sent.
    public static func error(place: String, exams: [LabExam], values: [String: String], file: LabExternalFile?, note: String) -> String? {
        let spot = place.trimmingCharacters(in: .whitespacesAndNewlines)
        if spot.count < placeMinimum { return "Indica dónde se hizo el examen (al menos \(placeMinimum) caracteres)." }
        if spot.count > placeMaximum { return "El lugar no puede pasar de \(placeMaximum) caracteres." }
        if exams.isEmpty { return "Agrega al menos un examen." }
        if exams.count > examMaximum { return "Registra como máximo \(examMaximum) exámenes." }
        if Set(exams.map(\.id)).count != exams.count { return "Cada examen va una sola vez." }
        let text: (LabExam) -> String = { (values[$0.id] ?? "").trimmingCharacters(in: .whitespacesAndNewlines) }
        let missing = exams.filter { text($0).isEmpty }.count
        if missing > 0 { return "Falta el valor de \(missing) examen(es)." }
        if let exam = exams.first(where: { $0.numeric && number(text($0)) == nil }) { return "El valor de \(exam.name) debe ser un número." }
        if let exam = exams.first(where: { !$0.numeric && text($0).count > textMaximum }) { return "El valor de \(exam.name) no puede pasar de \(textMaximum) caracteres." }
        if note.trimmingCharacters(in: .whitespacesAndNewlines).count > LabExternalRules.noteMaximum { return "La nota no puede pasar de \(LabExternalRules.noteMaximum) caracteres." }
        return LabExternalRules.attachmentError(file)
    }

    /// `LabExternalRecordDto`: place, file reference, one value per exam (`value` if numeric, `text` otherwise) and the note.
    public static func body(place: String, file: LabExternalFile, exams: [LabExam], values: [String: String], note: String) -> LabExternalRecordBody {
        let results = exams.map { exam -> LabExternalRecordValueBody in
            let raw = (values[exam.id] ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            return exam.numeric ? LabExternalRecordValueBody(examId: exam.id, value: number(raw), text: nil) : LabExternalRecordValueBody(examId: exam.id, value: nil, text: raw)
        }
        let trimmed = note.trimmingCharacters(in: .whitespacesAndNewlines)
        return LabExternalRecordBody(place: place.trimmingCharacters(in: .whitespacesAndNewlines), attachment: file.reference, results: results, note: trimmed.isEmpty ? nil : trimmed)
    }
}

/// `LabExternalRecordValueDto`: an exam of the catalog with `value` (numeric) or `text`.
public struct LabExternalRecordValueBody: Encodable, Sendable, Equatable {
    public let examId: String
    public let value: Double?
    public let text: String?
}

/// `LabExternalRecordDto` of `POST /laboratorio/pacientes/{id}/resultado-externo`.
public struct LabExternalRecordBody: Encodable, Sendable, Equatable {
    public let place: String
    public let attachment: LabAttachmentReferenceBody
    public let results: [LabExternalRecordValueBody]
    public let note: String?
}

/// `LabExternalRecordResponse`: the completed order, the attachment that receives the file next and the consultation.
public struct LabExternalRecordSaved: Decodable, Sendable, Equatable {
    public let id: String
    public let version: Int
    public let attachmentId: String?
    public let consultationId: String?
}
