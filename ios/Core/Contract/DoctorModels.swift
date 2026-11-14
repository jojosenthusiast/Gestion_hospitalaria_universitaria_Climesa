import Foundation

// Respuestas de `contrato/openapi.json` que usa el Médico (I20 a I25).

/// `AgendaEntryResponse` de `GET /consultas/agenda`.
public struct AgendaEntry: Decodable, Sendable, Identifiable, Equatable {
    public let appointmentId: String
    public let patientId: String
    public let patientName: String?
    public let start: String
    public let end: String
    public let reason: String?
    public let appointmentState: AppointmentState
    public let consultationId: String?
    public let consultationState: ConsultationState?
    public let version: Int?
    public let signedAt: String?
    public var id: String { appointmentId }
}

/// `ConsultationStartResponse` de `POST /consultas`.
public struct ConsultationStartResult: Decodable, Sendable, Equatable {
    public let id: String
    public let appointmentId: String?
    public let ticketId: String?
    public let version: Int
    public let state: ConsultationState
}

/// `ConsultationCommandResponse` / `ConsultationSignResponse`.
public struct ConsultationCommandResult: Decodable, Sendable, Equatable {
    public let id: String
    public let version: Int
    public let state: ConsultationState
}

/// `ConsultationDetailResponse` de `GET /consultas/{id}/detalle`.
public struct ConsultationDetail: Decodable, Sendable, Equatable {
    public struct Summary: Decodable, Sendable, Equatable {
        public let id: String
        public let patientId: String
        public let doctorId: String
        public let appointmentId: String?
        public let reason: String?
        public let physicalExam: String?
        public let plan: String?
        public let state: ConsultationState
        public let version: Int
        public let patientName: String?
    }
    public struct VitalSigns: Decodable, Sendable, Identifiable, Equatable {
        public let id: String
        public let takenAt: String
        public let systolic: Int?
        public let diastolic: Int?
        public let heartRate: Int?
        public let respiratoryRate: Int?
        public let temperature: String?
        public let oxygenSaturation: Int?
        public let weightKg: String?
        public let heightCm: String?
    }
    public struct Diagnosis: Decodable, Sendable, Identifiable, Equatable {
        public let id: String
        public let code: String
        public let principal: Bool
        public let note: String?
    }
    public let consultation: Summary
    public let vitalSigns: [VitalSigns]
    public let diagnoses: [Diagnosis]
    public let prescriptions: [Prescription]
}

/// `PrescriptionItemResponse`
public struct PrescriptionLine: Decodable, Sendable, Equatable {
    public let medication: String
    public let dose: String
    public let route: String
    public let frequency: String
    public let duration: String
    public let instructions: String?
}

/// `PrescriptionResponse` de `POST /consultas/{id}/receta`.
public struct Prescription: Decodable, Sendable, Identifiable, Equatable {
    public let id: String
    public let issuedAt: String
    public let items: [PrescriptionLine]
}

/// `DiagnosisCreatedResponse` de `POST /consultas/{id}/diagnosticos`.
public struct DiagnosisCreated: Decodable, Sendable, Equatable {
    public let id: String
    public let code: String
    public let principal: Bool
    public let description: String
}

/// `LabExamResponse` de `GET /laboratorio/catalogo`.
public struct LabExam: Decodable, Sendable, Identifiable, Equatable {
    public let id: String
    public let code: String
    public let name: String
    public let isPanel: Bool
    public let unit: String?
}

/// `LabOrderCreatedResponse` de `POST /laboratorio/ordenes`.
public struct LabOrderCreated: Decodable, Sendable, Equatable {
    public let id: String
    public let version: Int
    public let state: LabOrderState
    public let itemCount: Int
}

/// `LabReviewResponse` de `POST /laboratorio/ordenes/{id}/revisar`.
public struct LabReviewResult: Decodable, Sendable, Equatable {
    public let id: String
    public let version: Int
    public let reviewedAt: String
}

/// `AdmissionResponse` de `GET /admisiones`.
public struct Admission: Decodable, Sendable, Identifiable, Equatable {
    public let id: String
    public let patientId: String
    public let patientName: String?
    public let origin: String
    public let requestedCategory: RoomCategory
    public let state: AdmissionState
    public let isolation: Bool
    public let scheduledAt: String?
    public let attendingDoctorId: String
    public let version: Int
    public let bed: String
}

/// `AdmissionCommandResponse` de indicar hospitalización y firmar alta.
public struct AdmissionCommandResult: Decodable, Sendable, Equatable {
    public let id: String
    public let state: AdmissionState
    public let version: Int
}

/// `PatientCandidateResponse` de `GET /pacientes?query=`.
public struct PatientCandidate: Decodable, Sendable, Identifiable, Equatable {
    public let id: String
    public let record: String
    public let fullName: String
    public let active: Bool
    public let birth: String?
    public let matchReason: String
}

/// `AmbulanceStatusResponse` de `GET /ambulancia` (lo que necesita I25).
public struct AmbulanceStatus: Decodable, Sendable, Equatable {
    public struct UnitInfo: Decodable, Sendable, Equatable {
        public let id: String
        public let plate: String
        public let state: String
        public let stateReason: String?
        public let stateSince: String?
    }
    /// `DispatchBlockResponse`: por qué no se puede despachar la unidad y qué hacer (RN-30).
    public struct DispatchBlock: Decodable, Sendable, Equatable {
        public let code: String
        public let message: String
        public let action: String
    }
    public struct ActiveService: Decodable, Sendable, Equatable {
        public let id: String
        public let priority: AmbulancePriority
        public let origin: String
        public let destination: String
        public let dispatchedAt: String
        public let hasPrehospital: Bool
    }
    public let unit: UnitInfo
    public let activeService: ActiveService?
    public let paramedicOnDuty: Bool?
    /// RN-30: la unidad también necesita motorista de turno; `nil` (API anterior) cuenta como cubierto.
    public let driverOnDuty: Bool?
    public let dispatchBlock: DispatchBlock?
}

/// Valor de un objeto libre del contrato (por ejemplo `vitalSigns`) mostrado como texto.
public struct LooseText: Decodable, Sendable, Equatable {
    public let text: String
    public init(_ text: String) { self.text = text }
    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let value = try? container.decode(String.self) { text = value }
        else if let value = try? container.decode(Int.self) { text = String(value) }
        else if let value = try? container.decode(Double.self) { text = String(value) }
        else if let value = try? container.decode(Bool.self) { text = value ? "Sí" : "No" }
        else { text = "" }
    }
}

/// `PrehospitalViewResponse` de `GET /ambulancia/servicios/{id}/prehospital`.
public struct PrehospitalView: Decodable, Sendable, Equatable {
    public struct Report: Decodable, Sendable, Identifiable, Equatable {
        public let id: String
        public let priority: AmbulancePriority
        public let estimatedArrival: String?
        public let capturedAt: String
        public let receivedAt: String
        public let reason: String?
        public let vitalSigns: [String: LooseText]?
    }
    public let serviceId: String
    public let active: Bool
    public let priority: AmbulancePriority
    public let clinical: Bool
    public let reports: [Report]
}
