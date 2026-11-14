import Foundation

// Respuestas de `contrato/openapi.json` que usa el Paciente (I03 a I11). Propiedades en inglés y `CodingKeys`
// hacia los nombres del contrato cuando están en español. Las fechas llegan como texto ISO 8601 (ver `ClimesaDates`).

/// `QueueTicketResponse` de `GET /fila`.
public struct QueueTicket: Decodable, Sendable, Identifiable, Equatable {
    public let id: String
    public let service: QueueService
    public let date: String
    public let number: Int
    public let patientId: String?
    public let patientName: String?
    public let state: QueueState
    public let officeId: String?
    public let calls: Int
    public let version: Int
    public let issuedAt: String
    enum CodingKeys: String, CodingKey {
        case id, service, date = "fecha", number = "numero", patientId, patientName, state, officeId, calls = "llamados", version, issuedAt
    }
}

/// `QueueCallResponse` de `POST /fila/{id}/llamar`.
public struct QueueCallResult: Decodable, Sendable, Equatable {
    public let id: String
    public let version: Int
    public let state: QueueState
    public let calls: Int
    enum CodingKeys: String, CodingKey { case id, version, state, calls = "llamados" }
}

/// `PublicQueueResponse` de `GET /publico/fila/{servicio}`: números llamados hoy, sin nombres.
public struct PublicQueue: Decodable, Sendable, Equatable {
    public struct Called: Decodable, Sendable, Equatable {
        public let number: Int
        public let office: String?
        public let calls: Int
        enum CodingKeys: String, CodingKey { case number = "numero", office = "consultorio", calls = "llamados" }
    }
    public let updatedAt: String
    public let service: String
    public let date: String
    public let called: [Called]
    enum CodingKeys: String, CodingKey { case updatedAt = "actualizadoEn", service = "servicio", date = "fecha", called = "llamados" }
}

/// `AppointmentResponse` de `GET /citas`.
public struct Appointment: Decodable, Sendable, Identifiable, Equatable {
    public let id: String
    public let patientId: String
    public let patientName: String?
    public let doctorId: String
    public let doctorName: String
    public let start: String
    public let end: String
    public let reason: String?
    public let state: AppointmentState
    public let origin: String
    public let rejectionReason: String?
    public let version: Int
}

/// `AppointmentCommandResponse` de solicitar y cancelar una cita.
public struct AppointmentCommandResult: Decodable, Sendable, Equatable {
    public let id: String
    public let version: Int
    public let state: AppointmentState
}

/// `AppointmentCatalogsResponse` de `GET /citas/catalogos`; el paciente solo usa los médicos.
public struct AppointmentCatalogs: Decodable, Sendable, Equatable {
    public struct Doctor: Decodable, Sendable, Identifiable, Equatable {
        public let id: String
        public let givenNames: String
        public let surnames: String
        public let specialty: String?
        public let area: String?
        public let active: Bool
        public var fullName: String { "\(givenNames) \(surnames)" }
    }
    public let doctors: [Doctor]
}

/// `PeriodResponse`
public struct Period: Decodable, Sendable, Hashable {
    public let start: String
    public let end: String
    public init(start: String, end: String) { self.start = start; self.end = end }
}

/// `AvailabilityResponse` de `GET /citas/disponibilidad`.
public struct Availability: Decodable, Sendable, Equatable {
    public let doctorId: String
    public let date: String
    public let durationMinutes: Int
    public let slots: [Period]
}

/// `LabItemResultResponse`: el valor solo llega cuando el médico ya revisó la orden (D-040).
public struct LabItemResult: Decodable, Sendable, Equatable {
    public let value: Double?
    public let text: String?
    public let mark: ResultMark?
}

/// `LabOrderItemResponse`
public struct LabOrderItem: Decodable, Sendable, Identifiable, Equatable {
    public let id: String
    public let examId: String
    public let code: String
    public let name: String
    public let result: LabItemResult?
}

/// `LabOrderResponse` de `GET /me/laboratorio` y `GET /laboratorio/ordenes`.
public struct LabOrder: Decodable, Sendable, Identifiable, Equatable {
    public let id: String
    public let consultationId: String
    public let patientId: String
    public let doctorId: String
    public let priority: LabPriority
    public let state: LabOrderState
    public let createdAt: String
    public let sampleTakenAt: String?
    public let completedAt: String?
    public let reviewedAt: String?
    public let version: Int
    public let patientName: String?
    public let items: [LabOrderItem]
}

/// `PatientDetailResponse` de `GET /me/paciente` (solo lo que usa la app).
public struct PatientRecord: Decodable, Sendable, Equatable {
    public let id: String
    public let record: String
    public let fullName: String
    public let version: Int
}

/// `ClinicalHistoryResponse` de `GET /pacientes/{id}/historial`.
public struct ClinicalHistory: Decodable, Sendable, Equatable {
    public struct Patient: Decodable, Sendable, Equatable {
        public let id: String
        public let record: String
        public let fullName: String?
    }
    public struct Doctor: Decodable, Sendable, Equatable {
        public let id: String?
        public let name: String?
        public let specialty: String?
    }
    public struct Diagnosis: Decodable, Sendable, Equatable {
        public let code: String
        public let description: String
        public let principal: Bool
        public let note: String?
    }
    public struct PrescriptionItem: Decodable, Sendable, Equatable {
        public let medication: String
        public let dose: String
        public let route: String
        public let frequency: String
        public let duration: String
        public let instructions: String?
    }
    public struct Prescription: Decodable, Sendable, Identifiable, Equatable {
        public let id: String
        public let issuedAt: String
        public let items: [PrescriptionItem]
    }
    public struct Consultation: Decodable, Sendable, Identifiable, Equatable {
        public let id: String
        public let state: ConsultationState
        public let startedAt: String
        public let signedAt: String?
        public let reason: String?
        public let physicalExam: String?
        public let plan: String?
        public let doctor: Doctor
        public let diagnoses: [Diagnosis]
        public let prescriptions: [Prescription]
    }
    public struct LabResult: Decodable, Sendable, Equatable {
        public let value: Double?
        public let text: String?
        public let mark: ResultMark?
    }
    public struct LabItem: Decodable, Sendable, Identifiable, Equatable {
        public let id: String
        public let code: String
        public let name: String
        public let unit: String?
        public let result: LabResult?
    }
    public struct LabOrder: Decodable, Sendable, Identifiable, Equatable {
        public let id: String
        public let consultationId: String?
        public let state: LabOrderState
        public let priority: LabPriority
        public let createdAt: String
        public let completedAt: String?
        public let reviewedAt: String?
        public let items: [LabItem]
    }
    public struct AdmissionDoctor: Decodable, Sendable, Equatable {
        public let id: String?
        public let name: String?
    }
    public struct Admission: Decodable, Sendable, Identifiable, Equatable {
        public let id: String
        public let state: AdmissionState
        public let origin: String
        public let createdAt: String
        public let doctor: AdmissionDoctor
    }
    public let patient: Patient
    public let access: HistoryAccess
    public let consultations: [Consultation]
    public let laboratory: [LabOrder]
    public let admissions: [Admission]
}

/// `LinkRequestResponse` de `POST /cuentas/vinculacion`.
public struct LinkRequestResult: Decodable, Sendable, Equatable {
    public let id: String
    public let state: LinkState
    public let createdAt: String
    public let resolvedAt: String?
    public let rejectionReason: String?
    public let version: Int
}

/// `MyAccessResponse` de `GET /me/accesos`: quién vio mi expediente, sin nombres de personas.
public struct MyAccess: Decodable, Sendable, Equatable {
    public let date: String
    public let role: String
    public let dataType: String
    public let reason: String
    public let exceptional: Bool
    enum CodingKeys: String, CodingKey { case date = "fecha", role = "rol", dataType = "tipoDato", reason = "motivo", exceptional = "accesoExcepcional" }
}

/// `PublicOccupancyResponse` de `GET /publico/ocupacion`.
public struct PublicOccupancy: Decodable, Sendable, Equatable {
    public struct Row: Decodable, Sendable, Equatable {
        public let floor: Int?
        public let category: RoomCategory
        public let beds: Int
        public let free: Int
        public let occupied: Int
        enum CodingKeys: String, CodingKey { case floor = "planta", category = "categoria", beds = "camas", free = "libres", occupied = "ocupadas" }
    }
    public let updatedAt: String
    public let rows: [Row]
    enum CodingKeys: String, CodingKey { case updatedAt = "actualizadoEn", rows = "ocupacion" }
}

/// `DoctorsOnDutyResponse` de `GET /publico/medicos-de-turno`.
public struct DoctorsOnDuty: Decodable, Sendable, Equatable {
    public struct Doctor: Decodable, Sendable, Equatable {
        public let name: String
        public let specialty: String
        public let area: String?
        public let until: String?
        enum CodingKeys: String, CodingKey { case name = "nombre", specialty = "especialidad", area, until = "hasta" }
    }
    public let updatedAt: String
    public let doctors: [Doctor]
    enum CodingKeys: String, CodingKey { case updatedAt = "actualizadoEn", doctors = "medicos" }
}

/// `NoticesResponse` de `GET /publico/avisos`.
public struct PublicNotices: Decodable, Sendable, Equatable {
    public struct Notice: Decodable, Sendable, Identifiable, Equatable {
        public let id: String
        public let title: String
        public let body: String
        public let from: String?
        public let until: String?
        enum CodingKeys: String, CodingKey { case id, title = "titulo", body = "cuerpo", from = "desde", until = "hasta" }
    }
    public let updatedAt: String
    public let notices: [Notice]
    enum CodingKeys: String, CodingKey { case updatedAt = "actualizadoEn", notices = "avisos" }
}

/// `AmbulanceRequestCreatedResponse` de `POST /ambulancia/solicitudes`.
public struct AmbulanceRequestCreated: Decodable, Sendable, Equatable {
    public let id: String
    public let state: AmbulanceRequestState
    public let version: Int
    public let createdAt: String
    public let notice: String
}
