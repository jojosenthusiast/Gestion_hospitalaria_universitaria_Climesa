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
    /// Consulta iniciada desde este número por el médico que lee la fila; `nil` si no hay o es de otro profesional.
    public let consultationId: String?
    public let consultationState: ConsultationState?
    /// FILA-01: acciones que el servidor acepta ahora y las bloqueadas con su motivo.
    public var allowedActions: [QueueAction]? = nil
    public var blockedActions: [BlockedAction<QueueAction>]? = nil
    public var maxCalls: Int? = nil
    public var callsForAbsence: Int? = nil
    /// Fase 2 (S9): area code ("CON"), clinical priority, today's appointment time (nil = walk-in), consultorio code,
    /// and the reversible moves the server accepts now (`deshacer_llamado`).
    public var area: String? = nil
    public var priority: String? = nil
    public var appointmentAt: String? = nil
    public var walkIn: Bool? = nil
    public var officeCode: String? = nil
    public var undoActions: [String]? = nil
    /// Who called this number: the reader (`calledByMe`) or another account with `consulta.iniciar` (`calledByColleague`).
    /// Nil on an older server; a call by reception, an assistant or with no recorded caller sets neither.
    public var calledByMe: Bool? = nil
    public var calledByColleague: Bool? = nil
    /// B5: numbers waiting before this one in its area, when the API sends it (today only the issue response does);
    /// nil otherwise, and the public board gives the estimate.
    public var ahead: Int? = nil
    /// Lote 5 S11: age in years on the ticket's day (`pacientes.ver_nacimiento`) and sex (`pacientes.ver_ficha`); nil on an
    /// older API or without the permission.
    public var patientAge: Int? = nil
    public var patientSex: String? = nil
    enum CodingKeys: String, CodingKey {
        case id, service, date = "fecha", number = "numero", patientId, patientName, state, officeId, calls = "llamados", version, issuedAt
        case consultationId, consultationState, allowedActions, blockedActions, maxCalls, callsForAbsence
        case area, priority, appointmentAt, walkIn, officeCode, undoActions, calledByMe, calledByColleague, ahead, patientAge, patientSex
    }
}

/// Acción bloqueada por estado u hora, con el motivo en español para mostrar.
public struct BlockedAction<Action: ContractEnum & Decodable>: Decodable, Sendable, Equatable {
    public let action: Action
    public let reason: String
    public init(action: Action, reason: String) { self.action = action; self.reason = reason }
}

/// `AppointmentRescheduleResponse`: última solicitud de reprogramación de una cita (CITA-02).
public struct AppointmentReschedule: Decodable, Sendable, Equatable {
    public let id: String
    public let start: String
    public let end: String
    public let state: RescheduleState
    public let origin: String
    public let reason: String?
    public let rejectionReason: String?
    public let version: Int
}

/// `QueueTransitionResponse` de atender, completar y "no se presentó".
public struct QueueTransitionResult: Decodable, Sendable, Equatable {
    public let id: String
    public let version: Int
    public let state: QueueState
}

/// `QueueCallNextResponse` de `POST /fila/llamar-siguiente`.
public struct QueueCallNextResult: Decodable, Sendable, Equatable {
    public let id: String
    public let version: Int
    public let state: QueueState
    public let calls: Int
    public let number: Int
    public let patientName: String?
    enum CodingKeys: String, CodingKey { case id, version, state, calls = "llamados", number = "numero", patientName }
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
    /// CITA-04 y CITA-01: acciones válidas ahora, bloqueadas con motivo y hasta cuándo se puede cancelar o reprogramar.
    public var allowedActions: [AppointmentAction]? = nil
    public var blockedActions: [BlockedAction<AppointmentAction>]? = nil
    public var cancelableUntil: String? = nil
    public var reschedule: AppointmentReschedule? = nil
    public var rescheduledToId: String? = nil
    /// Categories the patient chose when asking by reason; empty or absent when reception booked it directly.
    public var categories: [AppointmentCategoryRef]? = nil
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
        /// Only when the catalog is asked for a `date`: whether the doctor has a published shift that day.
        public var hasShift: Bool? = nil
        /// Why not ("Sin turno ese día") when `hasShift` is false.
        public var reason: String? = nil
        public var fullName: String { "\(givenNames) \(surnames)" }
        enum CodingKeys: String, CodingKey { case id, givenNames, surnames, specialty, area, active, hasShift = "tieneTurno", reason = "motivo" }
    }
    public let doctors: [Doctor]
    /// The merged week of «Ya tengo médico» (`RequestDoctorRules.week`).
    public init(doctors: [Doctor]) { self.doctors = doctors }
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
    /// S10: nota del laboratorio sobre el valor; `relevant` indica que abrió un pendiente en «Resultados por revisar» del médico.
    public var observation: String? = nil
    public var relevant: Bool? = nil
}

/// `LabItemRangeResponse` (C-3): reference and critical limits valid for this patient; only for staff who see values.
public struct LabItemRange: Decodable, Sendable, Equatable {
    public let min: Double?
    public let max: Double?
    public let criticalLow: Double?
    public let criticalHigh: Double?

    public init(min: Double?, max: Double?, criticalLow: Double?, criticalHigh: Double?) {
        self.min = min; self.max = max; self.criticalLow = criticalLow; self.criticalHigh = criticalHigh
    }
}

/// `LabOrderItemResponse`
public struct LabOrderItem: Decodable, Sendable, Identifiable, Equatable {
    public let id: String
    public let examId: String
    public let code: String
    public let name: String
    public let result: LabItemResult?
    /// Unidad del examen (`mg/dL`); nula si el examen no la tiene o el servidor es anterior.
    public let unit: String?
    /// `numerico` o `texto` (`TipoResultadoLaboratorio`); nulo en un servidor anterior.
    public let resultType: String?
    /// Reference range for doctors and the lab. D1: the patient gets only `min`/`max`, and only on released results; null without a range.
    public var referenceRange: LabItemRange? = nil

    /// The exam takes a number. Without `resultType` (older server) an exam with a unit is numeric, as on Android.
    public var numeric: Bool { resultType.map { $0 == "numerico" } ?? (unit != nil) }
}

/// Acciones que la API permite al lector sobre una orden (`LabOrderResponse.allowedActions`, `AccionOrdenLaboratorio`).
/// Los botones salen solo de esta lista, nunca del rol ni del estado.
public enum LabOrderAction: String, Sendable, CaseIterable {
    case tomarMuestra = "tomar_muestra", capturar, completar, revisar, cancelar, enmendar
}

/// S10: camino externo (`LabOrderResponse.externalActions`, `AccionExternaLaboratorio`), aparte para que `allowedActions` no cambie.
public enum LabExternalAction: String, Sendable, CaseIterable {
    case enviarExterno = "enviar_externo", cargarExterno = "cargar_externo"
}

/// `LabOrderResponse` de `GET /me/laboratorio` y `GET /laboratorio/ordenes`. `allowedActions` y `amendedAt` se leen
/// con tolerancia: en un servidor anterior quedan vacíos y no se muestra ninguna acción.
public struct LabOrder: Decodable, Sendable, Identifiable, Equatable {
    public let id: String
    /// Null for an order of an admission (no consultation): the list must still decode.
    public let consultationId: String?
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
    /// Un laboratorista enmendó un resultado de la orden completada; volvió a la revisión del médico.
    public let amendedAt: String?
    /// Siempre vacío para el paciente.
    public let allowedActions: [String]
    /// S10: el examen se hace en otro lugar; el paciente ve `externalPlace` y `externalInstructions`. Falso en un servidor anterior.
    public let external: Bool
    public let externalPlace: String?
    public let externalInstructions: String?
    public let externalActions: [String]
    /// R7 C1: the doctor's note for the patient; the API sends it only once the results are released.
    public let patientNote: String?
    /// Why the order was cancelled; null when it is not cancelled or on an older server.
    public let cancellationReason: String?

    enum CodingKeys: String, CodingKey {
        case id, consultationId, patientId, doctorId, priority, state, createdAt, sampleTakenAt, completedAt, reviewedAt, version, patientName, items
        case amendedAt, allowedActions, external, externalPlace, externalInstructions, externalActions, patientNote, cancellationReason
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        consultationId = (try? container.decodeIfPresent(String.self, forKey: .consultationId)) ?? nil
        patientId = try container.decode(String.self, forKey: .patientId)
        doctorId = try container.decode(String.self, forKey: .doctorId)
        priority = try container.decode(LabPriority.self, forKey: .priority)
        state = try container.decode(LabOrderState.self, forKey: .state)
        createdAt = try container.decode(String.self, forKey: .createdAt)
        sampleTakenAt = try container.decodeIfPresent(String.self, forKey: .sampleTakenAt)
        completedAt = try container.decodeIfPresent(String.self, forKey: .completedAt)
        reviewedAt = try container.decodeIfPresent(String.self, forKey: .reviewedAt)
        version = try container.decode(Int.self, forKey: .version)
        patientName = try container.decodeIfPresent(String.self, forKey: .patientName)
        items = try container.decode([LabOrderItem].self, forKey: .items)
        amendedAt = (try? container.decodeIfPresent(String.self, forKey: .amendedAt)) ?? nil
        allowedActions = ((try? container.decodeIfPresent([String].self, forKey: .allowedActions)) ?? nil) ?? []
        external = ((try? container.decodeIfPresent(Bool.self, forKey: .external)) ?? nil) ?? false
        externalPlace = (try? container.decodeIfPresent(String.self, forKey: .externalPlace)) ?? nil
        externalInstructions = (try? container.decodeIfPresent(String.self, forKey: .externalInstructions)) ?? nil
        externalActions = ((try? container.decodeIfPresent([String].self, forKey: .externalActions)) ?? nil) ?? []
        patientNote = (try? container.decodeIfPresent(String.self, forKey: .patientNote)) ?? nil
        cancellationReason = (try? container.decodeIfPresent(String.self, forKey: .cancellationReason)) ?? nil
    }

    /// La API permite esta acción al usuario actual.
    public func allows(_ action: LabOrderAction) -> Bool { allowedActions.contains(action.rawValue) }
    public func allowsExternal(_ action: LabExternalAction) -> Bool { externalActions.contains(action.rawValue) }
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
    /// S4: what the caller may do from this history now (`resultado_externo`). Absent on an older server.
    public let allowedActions: [String]?
}

/// `MyLinkResponse` of `GET /me/vinculacion` (U12): linking is automatic by verified email. The account joins the one
/// active record whose email matches the email Supabase Auth confirmed, so the app shows either the linked record or the
/// email Recepción must write on the record. The retired DUI request (`request`) always comes back null and is not read.
public struct MyLink: Decodable, Sendable, Equatable {
    public let linked: Bool
    /// The account's email; nil when the server has none.
    public let email: String?
    /// Supabase Auth confirmed the email. Only a confirmed email joins the account with the record.
    public let emailVerified: Bool

    public init(linked: Bool, email: String?, emailVerified: Bool) {
        self.linked = linked; self.email = email; self.emailVerified = emailVerified
    }

    enum CodingKeys: String, CodingKey { case linked, email, emailVerified }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        linked = try container.decode(Bool.self, forKey: .linked)
        email = try container.decodeIfPresent(String.self, forKey: .email)
        // A server before U12 does not send it: treat the email as not confirmed yet.
        emailVerified = try container.decodeIfPresent(Bool.self, forKey: .emailVerified) ?? false
    }
}

/// `MyAccessResponse` de `GET /me/accesos`: quién vio mi expediente, sin nombres de personas.
public struct MyAccess: Decodable, Sendable, Equatable {
    public let date: String
    public let role: String
    public let dataType: String
    public let reason: String
    /// D120: true for the urgent read of an ambulance reception; nil from an older API.
    public var urgent: Bool? = nil
    /// D130: the person's name, only when the API sends it; otherwise the row shows the role alone.
    public var name: String? = nil
    enum CodingKeys: String, CodingKey { case date = "fecha", role = "rol", dataType = "tipoDato", reason = "motivo", urgent = "urgente", name = "nombre" }

    /// D120: urgent by the API flag, or by the reason text an older API writes.
    public var isUrgent: Bool { (urgent ?? false) || AccessLogRules.isUrgentReason(reason) }
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

/// Escalera de avisos (D-071), del más urgente al menos. Un valor desconocido se trata como `atencion`.
public enum NoticePriority: String, Sendable, Equatable, CaseIterable {
    case critico, urgente, atencion

    public var label: String {
        switch self {
        case .critico: return "Crítico"
        case .urgente: return "Urgente"
        case .atencion: return "Atención"
        }
    }
}

/// `NoticesResponse` de `GET /publico/avisos` y `MyNoticesResponse` de `GET /me/avisos` (MA-AVI-01): los avisos
/// públicos y los dirigidos a los roles de la cuenta, con su prioridad. `/publico/avisos` no trae audiencia.
public struct PublicNotices: Decodable, Sendable, Equatable {
    public struct Notice: Decodable, Sendable, Identifiable, Equatable {
        public let id: String
        public let title: String
        public let body: String
        public let from: String?
        public let until: String?
        public let priority: NoticePriority
        public let isPublic: Bool
        public let roles: [String]
        enum CodingKeys: String, CodingKey { case id, title = "titulo", body = "cuerpo", from = "desde", until = "hasta", priority = "prioridad", isPublic = "publico", roles }

        public init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            id = try c.decode(String.self, forKey: .id)
            title = try c.decode(String.self, forKey: .title)
            body = try c.decode(String.self, forKey: .body)
            from = try c.decodeIfPresent(String.self, forKey: .from)
            until = try c.decodeIfPresent(String.self, forKey: .until)
            priority = (try c.decodeIfPresent(String.self, forKey: .priority)).flatMap(NoticePriority.init(rawValue:)) ?? .atencion
            isPublic = try c.decodeIfPresent(Bool.self, forKey: .isPublic) ?? true
            roles = try c.decodeIfPresent([String].self, forKey: .roles) ?? []
        }
    }

    /// Del más urgente al menos, conservando el orden del servidor dentro de cada prioridad (igual que Android y la web).
    public var byPriority: [Notice] {
        let rank = Dictionary(uniqueKeysWithValues: NoticePriority.allCases.enumerated().map { ($1, $0) })
        return notices.enumerated().sorted { (rank[$0.element.priority] ?? 0, $0.offset) < (rank[$1.element.priority] ?? 0, $1.offset) }.map(\.element)
    }
    public let updatedAt: String
    public let notices: [Notice]
    /// Siguiente instante en que la lista cambia solo por el paso del tiempo (un aviso vence o empieza).
    public let nextChange: String?
    enum CodingKeys: String, CodingKey { case updatedAt = "actualizadoEn", notices = "avisos", nextChange = "proximoCambio" }

    /// Margen tras `proximoCambio` para que el servidor ya vea el cambio al volver a leer.
    public static let refreshSlack: TimeInterval = 1

    /// Segundos hasta volver a leer los avisos (en `proximoCambio`, como Android y la web); nil si nada cambia con el tiempo.
    public func refreshDelay(now: Date) -> TimeInterval? {
        guard let at = ClimesaDates.parse(nextChange) else { return nil }
        return max(0, at.timeIntervalSince(now)) + Self.refreshSlack
    }
}

/// MA-AMB-05: `OwnAmbulanceRequestResponse` de `GET /ambulancia/solicitudes/mias`: la solicitud propia como la guarda el servidor.
public struct OwnAmbulanceRequest: Decodable, Sendable, Equatable, Identifiable {
    public struct Milestone: Decodable, Sendable, Equatable {
        public let type: String
        public let occurredAt: String
    }
    public struct Service: Decodable, Sendable, Equatable {
        public let dispatchedAt: String
        public let milestones: [Milestone]
        public let finalState: String?
        public let finishedAt: String?
    }
    public let id: String
    public let state: AmbulanceRequestState
    public let address: String
    public let reason: String
    public let createdAt: String
    public let version: Int
    public let service: Service?
    public let allowedActions: [String]
    public let notice: String
    /// Why dispatch discarded it (only in state `descartada`); nil from an older API.
    public let discardReason: String?
    public var canCancel: Bool { allowedActions.contains("cancelar") }
    /// Sigue esperando o va en camino: la pantalla la sigue en lugar de ofrecer otra solicitud.
    public var isActive: Bool { state == .porConfirmar || (state == .confirmada && service != nil && service?.finalState == nil) }
}

/// `AmbulanceRequestStateResponse` de `POST /ambulancia/solicitudes/{id}/cancelar`.
public struct AmbulanceRequestStateResult: Decodable, Sendable, Equatable {
    public let id: String
    public let state: AmbulanceRequestState
    public let version: Int
}

/// `AmbulanceRequestCreatedResponse` de `POST /ambulancia/solicitudes`.
public struct AmbulanceRequestCreated: Decodable, Sendable, Equatable {
    public let id: String
    public let state: AmbulanceRequestState
    public let version: Int
    public let createdAt: String
    public let notice: String
}

// MARK: - Fase 2, flujo A: cita por motivo (S8)

/// `AppointmentCategoryResponse` de `GET /citas/categorias`: el motivo que el paciente elige en lugar del médico.
public struct AppointmentCategory: Decodable, Sendable, Identifiable, Equatable {
    public let code: String
    public let name: String
    public let description: String
    /// Clave estable del ícono (`piel`, `corazon`...); la app la traduce a su glifo web (`CategoryRequestRules.icon`).
    public let icon: String
    public let specialties: [String]
    public let keywords: String
    public var id: String { code }
    public init(code: String, name: String, description: String, icon: String, specialties: [String], keywords: String) {
        self.code = code; self.name = name; self.description = description; self.icon = icon; self.specialties = specialties; self.keywords = keywords
    }
}

/// `CategoryRefResponse`
public struct AppointmentCategoryRef: Decodable, Sendable, Equatable {
    public let code: String
    public let name: String
    public let icon: String
}

/// `AssignedAppointmentResponse`: la cita que recepción creó al asignar la solicitud.
public struct AssignedAppointment: Decodable, Sendable, Equatable {
    public let id: String
    public let doctorName: String
    public let start: String
    public let end: String
}

/// Franja preferida de una solicitud por motivo (`FranjaSolicitudCita`).
public enum RequestFranja: String, Codable, CaseIterable, Sendable, Hashable {
    case manana, tarde, cualquiera
    /// Clave de Localizable.xcstrings con el nombre de la franja.
    public var titleKey: String { "appointments.franja.\(rawValue)" }
}

/// `CategoryRequestResponse` de `GET /citas/solicitudes-categoria`; las acciones salen del servidor (`allowedActions`).
public struct CategoryRequest: Decodable, Sendable, Identifiable, Equatable {
    public let id: String
    public let categories: [AppointmentCategoryRef]
    public let franja: RequestFranja
    public let note: String?
    public let preferredDoctorName: String?
    /// `pendiente`, `asignada`, `rechazada` o `cancelada` (`EstadoSolicitudCita`).
    public let state: String
    public let rejectionReason: String?
    public let appointment: AssignedAppointment?
    public let createdAt: String
    public let version: Int
    public let allowedActions: [String]

    private enum CodingKeys: String, CodingKey {
        case id, categories, franja, note, preferredDoctorName, state, rejectionReason, appointment, createdAt, version, allowedActions
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        categories = (try? c.decodeIfPresent([AppointmentCategoryRef].self, forKey: .categories)) ?? []
        franja = (try? c.decodeIfPresent(RequestFranja.self, forKey: .franja)) ?? .cualquiera
        note = try c.decodeIfPresent(String.self, forKey: .note)
        preferredDoctorName = try c.decodeIfPresent(String.self, forKey: .preferredDoctorName)
        state = try c.decode(String.self, forKey: .state)
        rejectionReason = try c.decodeIfPresent(String.self, forKey: .rejectionReason)
        appointment = try c.decodeIfPresent(AssignedAppointment.self, forKey: .appointment)
        createdAt = try c.decode(String.self, forKey: .createdAt)
        version = try c.decode(Int.self, forKey: .version)
        allowedActions = ((try? c.decodeIfPresent([String].self, forKey: .allowedActions)) ?? nil) ?? []
    }

    public var categoryNames: String { categories.map(\.name).joined(separator: ", ") }
    public var canWithdraw: Bool { allowedActions.contains("cancelar") }
    public var isPending: Bool { state == "pendiente" }
}

/// `CategoryRequestCommandResponse` de crear, asignar, rechazar o retirar una solicitud por motivo.
public struct CategoryRequestCommandResult: Decodable, Sendable, Equatable {
    public let id: String
    public let version: Int
    public let state: String
    public let appointmentId: String?
}

/// D128 · `RequestLimitResponse` of `GET /citas/solicitudes-categoria/limite`: pending requests that count for the limit,
/// the policy maximum, and whether a new one would be accepted (with the server's code and reason). Read tolerantly: a
/// missing field never fails the read, and a missing `canRequest` counts as allowed.
public struct CategoryRequestLimit: Decodable, Sendable, Equatable {
    public let pending: Int
    public let max: Int
    public let canRequest: Bool
    public let code: String?
    public let reason: String?

    public init(pending: Int, max: Int, canRequest: Bool, code: String? = nil, reason: String? = nil) {
        self.pending = pending; self.max = max; self.canRequest = canRequest; self.code = code; self.reason = reason
    }

    enum CodingKeys: String, CodingKey { case pending, max, canRequest, code, reason }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        pending = (try? container.decodeIfPresent(Int.self, forKey: .pending)) ?? 0
        max = (try? container.decodeIfPresent(Int.self, forKey: .max)) ?? 0
        canRequest = (try? container.decodeIfPresent(Bool.self, forKey: .canRequest)) ?? true
        code = try? container.decodeIfPresent(String.self, forKey: .code)
        reason = try? container.decodeIfPresent(String.self, forKey: .reason)
    }
}
