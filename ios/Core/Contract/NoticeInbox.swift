import Foundation

/// `NivelAviso` (Fase 2, S11): criticidad para el personal. Solo `critico` se destaca en el inicio; un valor
/// desconocido se trata como `informativo` (igual que la web).
public enum NoticeLevel: String, Sendable, Equatable, CaseIterable {
    case critico, importante, informativo

    public var label: String {
        switch self {
        case .critico: return "Crítico"
        case .importante: return "Importante"
        case .informativo: return "Informativo"
        }
    }

    /// Ícono SF Symbols del nivel (alerta, doble flecha, información), como `NoticeLevelBadge` de la web.
    public var symbol: String {
        switch self {
        case .critico: return "exclamationmark.triangle"
        case .importante: return "chevron.up.2"
        case .informativo: return "info.circle"
        }
    }

    /// Prioridad del sistema (02-sistema §3) con que se pinta el nivel: el rojo es solo de «Crítico».
    public var priority: Priority {
        switch self {
        case .critico: return .emergencia
        case .importante: return .urgente
        case .informativo: return .rutina
        }
    }
}

/// `MyInboxNoticeResponse`: un aviso de la bandeja con el acuse de la cuenta.
public struct InboxNotice: Decodable, Sendable, Identifiable, Equatable {
    public let id: String
    public let title: String
    public let body: String
    public let from: String?
    public let until: String?
    // D-6 / D1: `nivel` is the only importance scale shown; the legacy `prioridad` is not read.
    public let isPublic: Bool
    public let roles: [String]
    public let level: NoticeLevel
    /// Códigos de espacio (área o bahía) a cuyo personal va dirigido.
    public let areas: [String]
    public let publishedAt: String?
    /// Dirigido al rol o al área de la cuenta (no solo público).
    public let targeted: Bool
    /// Cuándo la cuenta dio «Enterado»; nil si no lo ha hecho.
    public let acknowledgedAt: String?
    /// Hasta cuándo pospuso el recordatorio.
    public let remindAt: String?
    /// Lo decide la API: crítico, dirigido, sin «Enterado» y sin posponer. Es lo único que sale en el inicio.
    public let highlighted: Bool

    enum CodingKeys: String, CodingKey {
        case id, title = "titulo", body = "cuerpo", from = "desde", until = "hasta", isPublic = "publico", roles
        case level = "nivel", areas, publishedAt = "publicadoEn", targeted = "dirigido", acknowledgedAt = "enteradoEn", remindAt = "recordarEn"
        case highlighted = "destacado"
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        title = try c.decode(String.self, forKey: .title)
        body = try c.decode(String.self, forKey: .body)
        from = try c.decodeIfPresent(String.self, forKey: .from)
        until = try c.decodeIfPresent(String.self, forKey: .until)
        isPublic = try c.decodeIfPresent(Bool.self, forKey: .isPublic) ?? false
        roles = try c.decodeIfPresent([String].self, forKey: .roles) ?? []
        level = (try c.decodeIfPresent(String.self, forKey: .level)).flatMap(NoticeLevel.init(rawValue:)) ?? .informativo
        areas = try c.decodeIfPresent([String].self, forKey: .areas) ?? []
        publishedAt = try c.decodeIfPresent(String.self, forKey: .publishedAt)
        targeted = try c.decodeIfPresent(Bool.self, forKey: .targeted) ?? false
        acknowledgedAt = try c.decodeIfPresent(String.self, forKey: .acknowledgedAt)
        remindAt = try c.decodeIfPresent(String.self, forKey: .remindAt)
        highlighted = try c.decodeIfPresent(Bool.self, forKey: .highlighted) ?? false
    }
}

/// `MyInboxResponse` de `GET /me/avisos/bandeja` (S11): avisos vigentes para la cuenta, conteos y el siguiente instante
/// en que la bandeja cambia sola (vence o empieza un aviso, o vuelve un recordatorio).
public struct NoticeInbox: Decodable, Sendable, Equatable {
    public let updatedAt: String
    public let notices: [InboxNotice]
    /// Avisos sin «Enterado».
    public let unread: Int
    /// Críticos dirigidos a la cuenta sin «Enterado».
    public let critical: Int
    /// Horas que tarda en volver un crítico pospuesto (política `avisos.recordatorio_horas`).
    public let reminderHours: Double
    public let nextChange: String?

    enum CodingKeys: String, CodingKey {
        case updatedAt = "actualizadoEn", notices = "avisos", unread = "noLeidos", critical = "criticos", reminderHours = "recordatorioHoras", nextChange = "proximoCambio"
    }

    /// Segundos hasta volver a leer la bandeja (una sola vez, en `proximoCambio`); nil si nada cambia con el tiempo.
    public func refreshDelay(now: Date) -> TimeInterval? {
        guard let at = ClimesaDates.parse(nextChange) else { return nil }
        return max(0, at.timeIntervalSince(now)) + PublicNotices.refreshSlack
    }
}

/// `NoticeAckResponse` de `POST /me/avisos/{id}/enterado` y `/posponer`.
public struct NoticeAck: Decodable, Sendable, Equatable {
    public let noticeId: String
    public let acknowledgedAt: String?
    public let remindAt: String?
    enum CodingKeys: String, CodingKey { case noticeId = "avisoId", acknowledgedAt = "enteradoEn", remindAt = "recordarEn" }
}
