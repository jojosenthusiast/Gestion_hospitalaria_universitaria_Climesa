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

/// `PatientSelfUpdateDto` de `PATCH /me/paciente`: el paciente cambia solo su contacto. `""` borra el dato; `nil` no lo toca.
public struct PatientSelfUpdateBody: Encodable, Sendable, Equatable {
    public let version: Int
    public let phone: String?
    public let email: String?
    public let address: String?
    public init(version: Int, phone: String?, email: String?, address: String?) {
        self.version = version; self.phone = phone; self.email = email; self.address = address
    }
}

/// `HospitalLocationResponse` de `GET /publico/hospital`: nombre, dirección, teléfono y coordenadas del hospital.
public struct HospitalLocation: Decodable, Sendable, Equatable {
    public let name: String
    public let address: String
    public let municipality: String
    public let department: String
    public let phone: String
    public let latitude: Double
    public let longitude: Double

    enum CodingKeys: String, CodingKey {
        case name = "nombre", address = "direccion", municipality = "municipio", department = "departamento"
        case phone = "telefono", latitude = "latitud", longitude = "longitud"
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

/// `IdVersionResponse` de `PATCH /me/paciente`.
public struct PatientUpdateResult: Decodable, Sendable, Equatable {
    public let id: String
    public let version: Int
}
