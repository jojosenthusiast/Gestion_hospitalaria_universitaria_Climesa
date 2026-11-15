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

/// `AppointmentCancelDto`
public struct AppointmentCancelBody: Encodable, Sendable, Equatable {
    public let version: Int
    public let reason: String
    public init(version: Int, reason: String) { self.version = version; self.reason = reason }
}

/// `LinkRequestDto`
public struct LinkRequestBody: Encodable, Sendable, Equatable {
    public let dui: String
    public let birth: String
    public init(dui: String, birth: String) { self.dui = dui; self.birth = birth }
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

/// `LabOrderDto`
public struct LabOrderBody: Encodable, Sendable, Equatable {
    public let consultationId: String
    public let exams: [String]
    public let priority: String
    public init(consultationId: String, exams: [String], priority: LabPriority) {
        self.consultationId = consultationId; self.exams = exams; self.priority = priority.rawValue
    }
}

/// `AdmissionDto` para `POST /admisiones/indicaciones` desde una consulta: el origen es la consulta abierta,
/// el médico tratante es quien la indica y `motive` (10 a 500 caracteres) explica por qué se hospitaliza.
public struct AdmissionBody: Encodable, Sendable, Equatable {
    public let patientId: String
    public let origin: String
    public let originId: String
    public let requestedCategory: String
    public let isolation: Bool
    public let attendingDoctorId: String
    public let motive: String
    public init(patientId: String, consultationId: String, category: RoomCategory, isolation: Bool, attendingDoctorId: String, motive: String) {
        self.patientId = patientId; self.origin = "consulta"; self.originId = consultationId; self.requestedCategory = category.rawValue
        self.isolation = isolation; self.attendingDoctorId = attendingDoctorId; self.motive = motive.trimmingCharacters(in: .whitespacesAndNewlines)
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
