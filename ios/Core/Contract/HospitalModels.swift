import Foundation

// Respuestas y cuerpos de `contrato/openapi.json` de la ronda 3: datos propios del paciente, bitácora de ambulancia.

/// `PatientDetailResponse` de `GET /me/paciente` con los campos que muestra "Mis datos".
public struct PatientProfile: Decodable, Sendable, Equatable {
    public let id: String
    public let record: String
    public let fullName: String
    public let givenNames: String
    public let surnames: String
    public let sex: String
    public let version: Int
    public let birth: String?
    public let dui: String?
    public let phone: String?
    public let email: String?
    public let address: String?
}

/// `PatientUpdateDto` de `PATCH /pacientes/{id}`: los datos que no se editan viajan sin cambio.
public struct PatientUpdateBody: Encodable, Sendable, Equatable {
    public let givenNames: String
    public let surnames: String
    public let sex: String
    public let phone: String?
    public let email: String?
    public let address: String?
    public let version: Int
    public let reason: String
    public init(givenNames: String, surnames: String, sex: String, phone: String?, email: String?, address: String?, version: Int, reason: String) {
        self.givenNames = givenNames; self.surnames = surnames; self.sex = sex
        self.phone = phone; self.email = email; self.address = address; self.version = version; self.reason = reason
    }
}

/// `ServiceLogEntryResponse` de `GET /ambulancia/bitacora`.
public struct AmbulanceLogEntry: Decodable, Sendable, Identifiable, Equatable {
    public struct Crew: Decodable, Sendable, Equatable {
        public let staffId: String
        public let role: String
        public let name: String
    }
    public struct Milestone: Decodable, Sendable, Equatable {
        public let type: String
        public let occurredAt: String
    }
    public let id: String
    public let type: String
    public let priority: AmbulancePriority
    public let origin: String
    public let destination: String
    public let municipality: String?
    public let dispatchedAt: String
    public let finishedAt: String?
    public let finalState: String?
    public let crew: [Crew]
    public let responseMinutes: Double?
    public let milestones: [Milestone]
    public let patientRef: String?
}

/// `IdVersionResponse` de `PATCH /pacientes/{id}`.
public struct PatientUpdateResult: Decodable, Sendable, Equatable {
    public let id: String
    public let version: Int
}
