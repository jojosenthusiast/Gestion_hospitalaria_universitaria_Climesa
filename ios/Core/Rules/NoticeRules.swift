import Foundation

/// Filtros de «Avisos» (Fase 2, S11), los mismos de la web.
public enum NoticeFilter: String, CaseIterable, Sendable, Hashable {
    case todos, sinLeer, criticos

    public var label: String {
        switch self {
        case .todos: return "Todos"
        case .sinLeer: return "Sin leer"
        case .criticos: return "Críticos"
        }
    }
}

/// Reglas de «Avisos» (S11), espejo de `web/src/features/avisos/rules.ts` y `CriticalNoticeBanner.tsx`.
public enum NoticeRules {
    /// Nombres de rol en español (`roleNames` de la web); un código desconocido se muestra tal cual.
    public static let roleNames: [String: String] = [
        "ADM": "Administración", "JOP": "Operaciones", "REC": "Recepción", "AST": "Asistencia", "ENF": "Enfermería",
        "MED": "Medicina", "LAB": "Laboratorio", "PAR": "Atención prehospitalaria", "DPD": "Protección de datos", "PAC": "Paciente",
    ]

    /// Lista con el filtro elegido, en el orden del servidor (críticos primero). «Sin leer»: sin «Enterado».
    public static func filter(_ notices: [InboxNotice], by filter: NoticeFilter) -> [InboxNotice] {
        switch filter {
        case .todos: return notices
        case .sinLeer: return notices.filter { $0.acknowledgedAt == nil }
        case .criticos: return notices.filter { $0.level == .critico }
        }
    }

    /// Conteo que acompaña al filtro (los calcula la API); «Todos» no lleva número.
    public static func count(_ inbox: NoticeInbox, _ filter: NoticeFilter) -> Int? {
        switch filter {
        case .todos: return nil
        case .sinLeer: return inbox.unread
        case .criticos: return inbox.critical
        }
    }

    /// Avisos del inicio: solo los `destacado` (la API decide), menos los que la persona acaba de atender aquí y
    /// todavía no se reflejan en una nueva lectura.
    public static func banner(_ inbox: NoticeInbox?, hiding hidden: Set<String> = []) -> [InboxNotice] {
        (inbox?.notices ?? []).filter { $0.highlighted && !hidden.contains($0.id) }
    }

    /// «Enterado» se ofrece mientras la cuenta no lo haya dado; la API lo acepta para todo aviso que le llega.
    public static func canAcknowledge(_ notice: InboxNotice) -> Bool { notice.acknowledgedAt == nil }

    /// «Recordarme en N h» solo para un crítico dirigido a la cuenta y sin «Enterado» (igual que la web).
    public static func canSnooze(_ notice: InboxNotice) -> Bool {
        notice.level == .critico && notice.targeted && notice.acknowledgedAt == nil
    }

    /// Dónde se ve un aviso, en palabras («Medicina, Enfermería + Área EMG»). Un aviso solo de área llega por
    /// `/me/avisos` sin público ni roles y a veces sin códigos: entonces es «Tu área».
    public static func audience(isPublic: Bool, roles: [String], areas: [String]) -> String {
        var parts: [String] = []
        if isPublic { parts.append("Pantalla pública y apps sin sesión") }
        if !roles.isEmpty { parts.append(roles.map { roleNames[$0] ?? $0 }.joined(separator: ", ")) }
        if !areas.isEmpty { parts.append("Área \(areas.joined(separator: ", "))") }
        return parts.isEmpty ? "Tu área" : parts.joined(separator: " + ")
    }

    public static func audience(_ notice: InboxNotice) -> String {
        audience(isPublic: notice.isPublic, roles: notice.roles, areas: notice.areas)
    }

    /// Horas del recordatorio para «Recordarme en N h»: entero sin decimales, o con coma decimal.
    public static func hoursText(_ hours: Double) -> String {
        if hours.rounded() == hours { return String(Int(hours)) }
        return String(format: "%.1f", hours).replacingOccurrences(of: ".", with: ",")
    }

    /// Mensaje en español de un «Enterado» o «Recordarme» rechazado. Tras el error la bandeja se vuelve a leer.
    public static func actionMessage(_ error: Error) -> String {
        switch (error as? APIFailure)?.code {
        case "no_encontrado": return "Este aviso ya no está disponible para tu cuenta. La lista se actualizó."
        case "aviso_retirado": return "Este aviso fue retirado; ya no necesita «Enterado». La lista se actualizó."
        case "aviso_vencido": return "Este aviso ya venció; ya no necesita «Enterado». La lista se actualizó."
        default: return error.userMessage
        }
    }
}
