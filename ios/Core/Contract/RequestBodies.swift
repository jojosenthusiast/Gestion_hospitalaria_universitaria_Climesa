import Foundation

// Cuerpos de escritura del contrato. Los opcionales en nil no se envían. Toda escritura que cambia un registro
// existente lleva su `version` (convenciones-api.md, API-10).

/// `PatientAppointmentRequestDto`
public struct AppointmentRequestBody: Encodable, Sendable, Equatable {
    public let doctorId: String
    public let start: String
    public let end: String
    public let reason: String?
    public init(doctorId: String, start: String, end: String, reason: String?) {
        self.doctorId = doctorId; self.start = start; self.end = end; self.reason = reason
    }
}

/// `AppointmentCancelDto`. D-8: the patient's quick reason adds `reasonCode`; without it (nil is not sent) this is the
/// released body `{version, reason}` that every API version accepts.
public struct AppointmentCancelBody: Encodable, Sendable, Equatable {
    public let version: Int
    public let reason: String
    public let reasonCode: String?
    public init(version: Int, reason: String, reasonCode: String? = nil) {
        self.version = version; self.reason = reason; self.reasonCode = reasonCode
    }
}

/// `LabReviewDto` of `POST /laboratorio/ordenes/{id}/revisar`. The released body is `{version}`: the API proposes the
/// follow-up appointment when `followUp` is absent (D-4), so it is sent only as `false`, and `patientNote` only when written.
public struct LabReviewBody: Encodable, Sendable, Equatable {
    public let version: Int
    public let followUp: Bool?
    public let patientNote: String?
    public init(version: Int, followUp: Bool? = nil, patientNote: String? = nil) {
        self.version = version; self.followUp = followUp; self.patientNote = patientNote
    }
}

/// `AmbulanceRequestDto`
public struct AmbulanceRequestBody: Encodable, Sendable, Equatable {
    public let address: String
    public let municipality: String?
    public let reason: String
    public let contactPhone: String
    public init(address: String, municipality: String?, reason: String, contactPhone: String) {
        self.address = address; self.municipality = municipality; self.reason = reason; self.contactPhone = contactPhone
    }
}

/// MA-AMB-05: `CancelRequestDto`; el motivo es opcional y no se envía vacío.
public struct AmbulanceCancelBody: Encodable, Sendable, Equatable {
    public let version: Int
    public let reason: String?
    public init(version: Int, reason: String) {
        let text = reason.trimmingCharacters(in: .whitespacesAndNewlines)
        self.version = version; self.reason = text.isEmpty ? nil : String(text.prefix(300))
    }
}

/// Cuerpo vacío (`{}`) de una escritura sin campos, como la entrega al hospital (MA-AMB-04): no lleva la versión del
/// servicio porque cada hito o reporte la cambia mientras se recibe al paciente.
public struct EmptyBody: Encodable, Sendable, Equatable {
    public init() {}
}

/// `QueueTransitionDto`, `ConsultationSignDto` y `LabVersionDto`: solo la versión vigente.
public struct VersionBody: Encodable, Sendable, Equatable {
    public let version: Int
    public init(version: Int) { self.version = version }
}

/// `ConsultationStartDto`
public struct ConsultationStartBody: Encodable, Sendable, Equatable {
    public let appointmentId: String?
    public let ticketId: String?
    public init(appointmentId: String? = nil, ticketId: String? = nil) { self.appointmentId = appointmentId; self.ticketId = ticketId }
}

/// `ConsultationUpdateDto`
public struct ConsultationUpdateBody: Encodable, Sendable, Equatable {
    public let version: Int
    public let reason: String
    public let physicalExam: String
    public let plan: String
    public init(version: Int, reason: String, physicalExam: String, plan: String) {
        self.version = version; self.reason = reason; self.physicalExam = physicalExam; self.plan = plan
    }
}

/// `DiagnosisDto`
public struct DiagnosisBody: Encodable, Sendable, Equatable {
    public let code: String
    public let principal: Bool
    public let note: String?
    public init(code: String, principal: Bool, note: String?) { self.code = code; self.principal = principal; self.note = note }
}

/// `PrescriptionItemDto`
public struct PrescriptionItemBody: Encodable, Sendable, Equatable {
    public let medication: String
    public let dose: String
    public let route: String
    public let frequency: String
    public let duration: String
    public let instructions: String?
    public init(medication: String, dose: String, route: String, frequency: String, duration: String, instructions: String?) {
        self.medication = medication; self.dose = dose; self.route = route; self.frequency = frequency; self.duration = duration; self.instructions = instructions
    }
}

/// `PrescriptionDto`
public struct PrescriptionBody: Encodable, Sendable, Equatable {
    public let items: [PrescriptionItemBody]
    public init(items: [PrescriptionItemBody]) { self.items = items }
}

/// `LabCancelDto` de `POST /laboratorio/ordenes/{id}/cancelar`: versión de la orden y motivo (MA-LAB-05).
public struct LabOrderCancelBody: Encodable, Sendable, Equatable {
    public let version: Int
    public let reason: String
    public init(version: Int, reason: String) { self.version = version; self.reason = reason }
}

/// `LabOrderDto`
public struct LabOrderBody: Encodable, Sendable, Equatable {
    public let consultationId: String
    public let exams: [String]
    public let priority: String
    public init(consultationId: String, exams: [String], priority: LabPriority) {
        self.consultationId = consultationId; self.exams = exams; self.priority = priority.rawValue
    }
}

/// `AdmissionIndicationDto` para `POST /admisiones/indicaciones` desde una consulta (MOV-01): el origen es la consulta
/// abierta y `motive` (10 a 500 caracteres) explica por qué se hospitaliza. `attendingDoctorId` se omite: la API pone
/// como tratante al médico que indica.
public struct AdmissionBody: Encodable, Sendable, Equatable {
    public let patientId: String
    public let origin: String
    public let originId: String
    public let requestedCategory: String
    public let isolation: Bool
    /// Nil se omite del JSON (la API usa al propio médico).
    public let attendingDoctorId: String?
    public let motive: String
    /// Row 10 (MED audit, Android `AdmissionIndication.body`): isolation type only with isolation on; the two clinical flags
    /// only when marked. Nil is omitted from the JSON, so an indication without them keeps the same body.
    public let isolationType: String?
    public let unstable: Bool?
    public let postSurgical: Bool?
    public init(patientId: String, consultationId: String, category: RoomCategory, isolation: Bool, attendingDoctorId: String? = nil, motive: String,
                isolationType: IsolationKind? = nil, unstable: Bool = false, postSurgical: Bool = false) {
        self.patientId = patientId; self.origin = "consulta"; self.originId = consultationId; self.requestedCategory = category.rawValue
        self.isolation = isolation; self.attendingDoctorId = attendingDoctorId; self.motive = motive.trimmingCharacters(in: .whitespacesAndNewlines)
        self.isolationType = isolation ? isolationType?.rawValue : nil
        self.unstable = unstable ? true : nil
        self.postSurgical = postSurgical ? true : nil
    }
}

/// `isolationType` of an admission (`AdmissionIndicationDto`).
public enum IsolationKind: String, CaseIterable, Sendable, Hashable {
    case contacto, gotitas, aerea, protector
    public var label: String {
        switch self {
        case .contacto: return "Por contacto"
        case .gotitas: return "Por gotitas"
        case .aerea: return "Aérea"
        case .protector: return "Protector"
        }
    }
}

/// `DischargePendingDto`
public struct DischargePendingBody: Encodable, Sendable, Equatable {
    public let description: String
    public let responsible: String
    public init(description: String, responsible: String) { self.description = description; self.responsible = responsible }
}

/// `DischargeDto`
public struct DischargeBody: Encodable, Sendable, Equatable {
    public let type: String
    public let version: Int
    public let summary: String?
    public let voluntaryConsent: Bool?
    public let pending: [DischargePendingBody]
    public init(type: DischargeType, version: Int, summary: String?, voluntaryConsent: Bool?, pending: [DischargePendingBody]) {
        self.type = type.rawValue; self.version = version; self.summary = summary; self.voluntaryConsent = voluntaryConsent; self.pending = pending
    }
}

/// `DischargeRevocationDto` para `POST /admisiones/{id}/revocar-alta`: vuelve la admisión a hospitalizado.
public struct DischargeRevocationBody: Encodable, Sendable, Equatable {
    public let version: Int
    public let reason: String
    public init(version: Int, reason: String) {
        self.version = version; self.reason = reason.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}

public enum JSONBody {
    /// Bytes estables (claves ordenadas) del cuerpo; también sirven de huella para `SubmissionIntent`.
    public static func encode<Body: Encodable>(_ body: Body) throws -> Data {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        return try encoder.encode(body)
    }

    public static func fingerprint<Body: Encodable>(_ body: Body) -> String {
        guard let data = try? encode(body) else { return "" }
        return String(decoding: data, as: UTF8.self)
    }
}

/// `AppointmentRescheduleDto` de `POST /citas/{id}/reprogramar` (CITA-02).
public struct AppointmentRescheduleBody: Encodable, Sendable, Equatable {
    public let version: Int
    public let start: String
    public let end: String
    public init(version: Int, start: String, end: String) { self.version = version; self.start = start; self.end = end }
}

/// `RescheduleDecisionDto` de aceptar o rechazar una solicitud de reprogramación.
public struct RescheduleDecisionBody: Encodable, Sendable, Equatable {
    public let version: Int
    public let rejectionReason: String?
    public init(version: Int, rejectionReason: String? = nil) { self.version = version; self.rejectionReason = rejectionReason }
}

/// `QueueCallNextDto` de `POST /fila/llamar-siguiente` (FILA-02).
public struct QueueCallNextBody: Encodable, Sendable, Equatable {
    public let service: String
    /// Consultorio the called number goes to; omitted when not chosen.
    public let officeId: String?
    public init(service: String, officeId: String? = nil) { self.service = service; self.officeId = officeId }
}

/// `QueuePriorityDto` de `POST /fila/{id}/prioridad` (Fase 2, S9).
public struct QueuePriorityBody: Encodable, Sendable, Equatable {
    public let version: Int
    public let priority: String
    public init(version: Int, priority: String) { self.version = version; self.priority = priority }
}

/// `CategoryRequestCreateDto` de `POST /citas/solicitudes-categoria` (Fase 2, flujo A): motivo sin médico.
public struct CategoryRequestBody: Encodable, Sendable, Equatable {
    public let categories: [String]
    public let franja: RequestFranja
    public let note: String?
    public let preferredDoctorId: String?
    public init(categories: [String], franja: RequestFranja, note: String?, preferredDoctorId: String?) {
        self.categories = categories; self.franja = franja; self.note = note; self.preferredDoctorId = preferredDoctorId
    }
}
