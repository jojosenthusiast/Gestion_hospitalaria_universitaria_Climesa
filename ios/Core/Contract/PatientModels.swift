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
    enum CodingKeys: String, CodingKey {
        case id, service, date = "fecha", number = "numero", patientId, patientName, state, officeId, calls = "llamados", version, issuedAt
        case consultationId, consultationState, allowedActions, blockedActions, maxCalls, callsForAbsence
        case area, priority, appointmentAt, walkIn, officeCode, undoActions, calledByMe, calledByColleague, ahead
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
    /// Un laboratorista enmendó un resultado de la orden completada; volvió a la revisión del médico.
    public let amendedAt: String?
    /// Siempre vacío para el paciente.
    public let allowedActions: [String]
    /// S10: el examen se hace en otro lugar; el paciente ve `externalPlace` y `externalInstructions`. Falso en un servidor anterior.
    public let external: Bool
    public let externalPlace: String?
    public let externalInstructions: String?
    public let externalActions: [String]

    enum CodingKeys: String, CodingKey {
        case id, consultationId, patientId, doctorId, priority, state, createdAt, sampleTakenAt, completedAt, reviewedAt, version, patientName, items
        case amendedAt, allowedActions, external, externalPlace, externalInstructions, externalActions
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        consultationId = try container.decode(String.self, forKey: .consultationId)
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

/// `MyLinkResponse` of `GET /me/vinculacion` (G2): the account's last link request, so the screen opens in its real state.
public struct MyLink: Decodable, Sendable, Equatable {
    /// `LinkDeclaredResponse`: what the account declared, to ask again with the form filled in.
    public struct Declared: Decodable, Sendable, Equatable {
        public let dui: String
        /// Local day `yyyy-MM-dd`.
        public let birth: String?
        public init(dui: String, birth: String?) { self.dui = dui; self.birth = birth }
    }
    public let linked: Bool
    /// nil when the account never asked.
    public let request: LinkRequestResult?
    /// Absent when the account never asked, and on a server before R7.
    public let declared: Declared?
}

/// `MyAccessResponse` de `GET /me/accesos`: quién vio mi expediente, sin nombres de personas.
public struct MyAccess: Decodable, Sendable, Equatable {
    public let date: String
    public let role: String
    public let dataType: String
    public let reason: String
    enum CodingKeys: String, CodingKey { case date = "fecha", role = "rol", dataType = "tipoDato", reason = "motivo" }
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
    /// Clave estable del ícono (`piel`, `corazon`...); la app la traduce a un SF Symbol (`CategoryRequestRules.symbol`).
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
