import Foundation

/// Grupos de datos que una pantalla vuelve a pedir cuando llega un evento delgado (invalidar y volver a pedir).
public enum LiveTopic: String, CaseIterable, Hashable, Sendable {
    case shifts, queue, appointments, consultations, laboratory, admissions, ambulance, hospitalInfo, link, access, patient, profile
}

/// Qué eventos obligan a volver a pedir cada grupo de datos (docs/arquitectura/tiempo-real.md, enum `TipoEvento`).
public enum InvalidationRule {
    public static func affectsShifts(_ event: DomainEvent) -> Bool {
        event.type.hasPrefix("turno.") || event.entity == "turno"
    }

    /// Una cuenta de usuario cambió (o se resolvió su vinculación): conviene verificar de nuevo el perfil.
    public static func affectsProfile(_ event: DomainEvent) -> Bool {
        event.entity == "usuario" || event.type == "vinculacion.resuelta"
    }

    public static func topics(for event: DomainEvent) -> Set<LiveTopic> {
        var topics = Set<LiveTopic>()
        let type = event.type
        if affectsShifts(event) { topics.insert(.shifts) }
        if affectsProfile(event) { topics.insert(.profile) }
        if type.hasPrefix("fila.") || event.entity == "ticket_fila" { topics.insert(.queue) }
        if type.hasPrefix("cita.") || event.entity == "cita" { topics.insert(.appointments) }
        if type.hasPrefix("consulta.") || event.entity == "consulta" { topics.insert(.consultations) }
        if type.hasPrefix("laboratorio.") || event.entity == "orden_laboratorio" { topics.insert(.laboratory) }
        if type.hasPrefix("admision.") || type.hasPrefix("cama.") { topics.insert(.admissions) }
        if type.hasPrefix("ambulancia.") { topics.insert(.ambulance) }
        if type.hasPrefix("aviso.") || type.hasPrefix("cama.") || type.hasPrefix("turno.") || type.hasPrefix("metricas.") { topics.insert(.hospitalInfo) }
        if type.hasPrefix("vinculacion.") { topics.insert(.link) }
        if type.hasPrefix("acceso.") { topics.insert(.access) }
        if type.hasPrefix("paciente.") { topics.insert(.patient) }
        return topics
    }
}

/// Estado de tiempo real que ven las pantallas. Cada contador sube cuando hay que volver a pedir esos datos.
public struct LiveSnapshot: Equatable, Sendable {
    public var connection: ConnectionState
    public var version: Int
    public var shiftsVersion: Int
    public var profileVersion: Int
    public var versions: [LiveTopic: Int]
    /// Último evento recibido (por ejemplo, para avisar "te llamaron" en I05).
    public var lastEvent: DomainEvent?
    public init(connection: ConnectionState = .reconnecting, version: Int = 0, shiftsVersion: Int = 0, profileVersion: Int = 0) {
        self.connection = connection; self.version = version; self.shiftsVersion = shiftsVersion; self.profileVersion = profileVersion
        self.versions = [:]; self.lastEvent = nil
    }

    /// Contador de un grupo: úsalo como `id` de `.task(id:)`.
    public func version(_ topic: LiveTopic) -> Int { versions[topic] ?? 0 }

    /// Contador combinado de varios grupos (una pantalla que muestra datos de más de uno).
    public func version(_ topics: [LiveTopic]) -> Int { topics.reduce(0) { $0 + version($1) } }
}

public enum LiveReducer {
    public static func apply(_ signal: RealtimeSignal, to snapshot: LiveSnapshot) -> LiveSnapshot {
        var next = snapshot
        switch signal {
        case .state(let state):
            next.connection = state
        case .resync:
            next.version += 1
            next.shiftsVersion += 1
            // Tras reconectar no se sabe qué se perdió: se invalidan todas las vistas.
            for topic in LiveTopic.allCases { next.versions[topic, default: 0] += 1 }
        case .event(let event):
            next.version += 1
            next.lastEvent = event
            if InvalidationRule.affectsShifts(event) { next.shiftsVersion += 1 }
            if InvalidationRule.affectsProfile(event) { next.profileVersion += 1 }
            for topic in InvalidationRule.topics(for: event) { next.versions[topic, default: 0] += 1 }
        }
        return next
    }
}
