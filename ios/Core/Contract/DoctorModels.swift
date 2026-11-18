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
    /// MA-CIT-03: `iniciar_consulta` solo el día de la cita; si no, viene bloqueada con su motivo.
    public var allowedActions: [AppointmentAction]? = nil
    public var blockedActions: [BlockedAction<AppointmentAction>]? = nil
    /// Categories of the patient's request by reason (`CategoryRefResponse`); absent on an older API.
    public var categories: [AppointmentCategoryRef]? = nil
    public var id: String { appointmentId }
}

/// `UnsignedConsultationResponse` de `GET /consultas/sin-firmar` (m-22): consultas abiertas propias de cualquier día.
public struct UnsignedConsultation: Decodable, Sendable, Identifiable, Equatable {
    public let id: String
    public let patientId: String
    public let patientName: String?
    public let appointmentId: String?
    public let ticketId: String?
    public let reason: String?
    public let startedAt: String
    public let version: Int
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
    /// Only on signing (S9): who goes next in the consultation's area; nil when the reader does not see the whole queue.
    public var nextProposal: QueueNextProposal? = nil
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
        /// CIE-10 description when the API sends it (the history does; the detail may not yet).
        public let description: String?
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

/// `Cie10Response` de `GET /consultas/cie10?q=`: una entrada del catálogo CIE-10.
public struct Cie10Entry: Decodable, Sendable, Identifiable, Equatable {
    public let code: String
    public let description: String
    public var id: String { code }
    public init(code: String, description: String) { self.code = code; self.description = description }
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
    /// `numerico` or `texto` (`TipoResultadoLaboratorio`); optional so an older answer still decodes as numeric.
    public let resultType: String?

    /// The value is a number unless the catalog says `texto` (same rule as the web `RegisterExternalResultDialog`).
    public var numeric: Bool { resultType != "texto" }
}

/// `LabOrderCreatedResponse` de `POST /laboratorio/ordenes`.
public struct LabOrderCreated: Decodable, Sendable, Equatable {
    public let id: String
    public let version: Int
    public let state: LabOrderState
    public let itemCount: Int
}

/// `LabOrderStateResponse` de `POST /laboratorio/ordenes/{id}/cancelar`.
public struct LabOrderStateResult: Decodable, Sendable, Equatable {
    public let id: String
    public let state: LabOrderState
    public let version: Int
}

/// `LabReviewResponse` de `POST /laboratorio/ordenes/{id}/revisar`.
public struct LabReviewResult: Decodable, Sendable, Equatable {
    public let id: String
    public let version: Int
    public let reviewedAt: String
    /// D-4: the follow-up appointment proposed to reception, or nil. Absent on an older API.
    public let followUpProposalId: String?
    /// D-4: why no follow-up was proposed (`no_pedida`, `hospitalizado`, `ya_propuesta`, `sin_consulta`).
    public let followUpSkipped: String?
}

/// Acciones que la API permite sobre una admisión (`AdmissionResponse.allowedActions`). Los botones salen solo de
/// esta lista, nunca del rol.
public enum AdmissionAction: String, Sendable, CaseIterable {
    case asignarCama = "asignar_cama", autorizar, cancelar, anular, trasladar
    case firmarAlta = "firmar_alta", solicitarAlta = "solicitar_alta", revocarAlta = "revocar_alta"
    case registrarSalida = "registrar_salida", reasignarTratante = "reasignar_tratante", notaEnfermeria = "nota_enfermeria"
}

/// `AdmissionResponse` de `GET /admisiones`. Los campos nuevos (acciones, tratante, alta firmada) se leen con
/// tolerancia: si faltan o vienen con otra forma quedan vacíos y la fila se sigue mostrando.
public struct Admission: Decodable, Sendable, Identifiable, Equatable {
    /// `AdmissionDischargeResponse`: alta firmada vigente.
    public struct Discharge: Decodable, Sendable, Equatable {
        public struct Pending: Decodable, Sendable, Equatable {
            public let description: String
            public let responsible: String
        }
        /// `TipoAlta` como texto; `kind` es nil si la API trae un tipo que esta versión no conoce.
        /// D-031: `type` y `pending` llegan nulos a quien no tiene relación de atención; `pendingCount` y
        /// `specialHandling` llegan siempre.
        public let type: String?
        public let signedAt: String?
        public let signedByName: String?
        public let pending: [Pending]?
        public let pendingCount: Int
        public let specialHandling: Bool
        public var kind: DischargeType? { type.flatMap(DischargeType.init(rawValue:)) }

        enum CodingKeys: String, CodingKey { case type, signedAt, signedByName, pending, pendingCount, specialHandling }
        public init(type: String?, signedAt: String?, signedByName: String?, pending: [Pending]?, pendingCount: Int? = nil, specialHandling: Bool = false) {
            self.type = type; self.signedAt = signedAt; self.signedByName = signedByName; self.pending = pending
            self.pendingCount = pendingCount ?? pending?.count ?? 0; self.specialHandling = specialHandling
        }
        public init(from decoder: Decoder) throws {
            let container = try decoder.container(keyedBy: CodingKeys.self)
            type = (try? container.decodeIfPresent(String.self, forKey: .type)) ?? nil
            signedAt = try container.decode(String.self, forKey: .signedAt)
            signedByName = try? container.decodeIfPresent(String.self, forKey: .signedByName)
            pending = (try? container.decodeIfPresent([Pending].self, forKey: .pending)) ?? nil
            pendingCount = ((try? container.decodeIfPresent(Int.self, forKey: .pendingCount)) ?? nil) ?? pending?.count ?? 0
            specialHandling = ((try? container.decodeIfPresent(Bool.self, forKey: .specialHandling)) ?? nil) ?? false
        }
    }

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
    /// Vacío en servidores anteriores: entonces no se muestra ninguna acción.
    public let allowedActions: [String]
    public let attendingDoctorName: String?
    public let attendingDoctorHasAccount: Bool?
    /// Última solicitud de alta de Recepción al médico tratante (se borra al firmar).
    public let dischargeRequestedAt: String?
    public let discharge: Discharge?
    public let bedCategory: String?
    public let authorized: Bool?
    /// The record the admission came from (`origin`); for an indication, the consultation. Nil on an older server.
    public let originId: String?

    enum CodingKeys: String, CodingKey {
        case id, patientId, patientName, origin, requestedCategory, state, isolation, scheduledAt, attendingDoctorId, version, bed
        case allowedActions, attendingDoctorName, attendingDoctorHasAccount, dischargeRequestedAt, discharge, bedCategory, authorized, originId
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        patientId = try container.decode(String.self, forKey: .patientId)
        patientName = try container.decodeIfPresent(String.self, forKey: .patientName)
        origin = try container.decode(String.self, forKey: .origin)
        requestedCategory = try container.decode(RoomCategory.self, forKey: .requestedCategory)
        state = try container.decode(AdmissionState.self, forKey: .state)
        isolation = try container.decode(Bool.self, forKey: .isolation)
        scheduledAt = try container.decodeIfPresent(String.self, forKey: .scheduledAt)
        attendingDoctorId = try container.decode(String.self, forKey: .attendingDoctorId)
        version = try container.decode(Int.self, forKey: .version)
        bed = try container.decode(String.self, forKey: .bed)
        allowedActions = ((try? container.decodeIfPresent([String].self, forKey: .allowedActions)) ?? nil) ?? []
        attendingDoctorName = (try? container.decodeIfPresent(String.self, forKey: .attendingDoctorName)) ?? nil
        attendingDoctorHasAccount = (try? container.decodeIfPresent(Bool.self, forKey: .attendingDoctorHasAccount)) ?? nil
        dischargeRequestedAt = (try? container.decodeIfPresent(String.self, forKey: .dischargeRequestedAt)) ?? nil
        discharge = (try? container.decodeIfPresent(Discharge.self, forKey: .discharge)) ?? nil
        bedCategory = (try? container.decodeIfPresent(String.self, forKey: .bedCategory)) ?? nil
        authorized = (try? container.decodeIfPresent(Bool.self, forKey: .authorized)) ?? nil
        originId = (try? container.decodeIfPresent(String.self, forKey: .originId)) ?? nil
    }

    /// La API permite esta acción al usuario actual.
    public func allows(_ action: AdmissionAction) -> Bool { allowedActions.contains(action.rawValue) }
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
        /// Milestones recorded so far; nil from an older API.
        public let milestones: [AmbulanceLogEntry.Milestone]?
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

/// `ArrivalServiceResponse` de `GET /ambulancia/llegada` (MA-AMB-04): los servicios por recibir, sin datos clínicos. Primero los que
/// llegaron sin entrega registrada (aunque la unidad ya salió a otro), después el activo; `serviceId` es el primero.
public struct ArrivalService: Decodable, Sendable, Equatable {
    public struct Candidate: Decodable, Sendable, Equatable, Identifiable {
        public let serviceId: String
        public let dispatchedAt: String
        public let active: Bool
        public let arrived: Bool
        public var id: String { serviceId }
    }
    public let serviceId: String?
    public let services: [Candidate]

    /// El elegido mientras siga en la lista; si no, el primero.
    public func pick(_ chosen: String?) -> String? {
        if let chosen, services.contains(where: { $0.serviceId == chosen }) { return chosen }
        return services.first?.serviceId ?? serviceId
    }
}

/// `HandoverResponse` de `POST /ambulancia/servicios/{id}/recepcion` (MA-AMB-04).
public struct HandoverResult: Decodable, Sendable, Equatable {
    public let serviceId: String
    public let version: Int
    public let receivedAt: String
    public let receivedByName: String?
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
    /// MA-AMB-04: quién recibió al paciente en el hospital y cuándo.
    public struct Handover: Decodable, Sendable, Equatable {
        public let receivedAt: String
        public let receivedByName: String?
    }
    public let serviceId: String
    public let active: Bool
    public let priority: AmbulancePriority
    public let clinical: Bool
    public let reports: [Report]
    /// Versión del servicio; la entrega la envía (`HandoverBody`).
    public let version: Int?
    public let arrived: Bool?
    public let handover: Handover?
    /// `recibir`: la API permite marcar recibido al paciente (personal clínico, después de la llegada).
    public let allowedActions: [String]?
    public var canReceive: Bool { allowedActions?.contains("recibir") == true }
}

/// Row 4 (MED audit): `GET /pacientes/{id}/signos` (`PatientVitalsHistoryResponse`); each item carries the same measures as
/// the consultation detail, so it decodes as `ConsultationDetail.VitalSigns` (extra fields are ignored).
public struct PatientVitalsHistory: Decodable, Sendable, Equatable {
    public let patientId: String
    /// Active admission of the patient: a take recorded from the record is linked to it (D5).
    public let admissionId: String?
    public let items: [ConsultationDetail.VitalSigns]
}
