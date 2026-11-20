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

    /// Status value whose look the chip wears (web `inboxFilters`): «Sin leer» the waiting family of the «Sin leer» tag,
    /// «Críticos» the double red border of critical; «Todos» stays neutral.
    public var statusValue: String? {
        switch self {
        case .todos: return nil
        case .sinLeer: return "pendiente"
        case .criticos: return "critico_alto"
        }
    }
}

/// The inbox laid out like the appointments agenda: notices in force first, then scheduled ones by the day they start
/// (soonest first), then expired ones by the day they ended (latest first), which the screen folds by default.
public struct NoticeTimeline: Equatable, Sendable {
    public struct Day: Equatable, Sendable, Identifiable {
        /// `yyyy-MM-dd` in El Salvador.
        public let day: String
        public let notices: [InboxNotice]
        public var id: String { day }
    }
    public let current: [InboxNotice]
    public let upcoming: [Day]
    public let past: [Day]
    public var pastCount: Int { past.reduce(0) { $0 + $1.notices.count } }
}

/// A tag drawn by `StatusBadge`: API-style status value and its label.
public struct NoticeTag: Equatable, Sendable {
    public let value: String
    public let label: String
}

/// Reglas de «Avisos» (S11), espejo de `web/src/features/avisos/rules.ts` y `CriticalNoticeBanner.tsx`.
public enum NoticeRules {
    /// Nombres de rol en español (`roleNames` de la web); un código desconocido se muestra tal cual.
    public static let roleNames: [String: String] = [
        "ADM": "Administración", "JOP": "Operaciones", "REC": "Recepción", "AST": "Asistencia", "ENF": "Enfermería",
        "MED": "Medicina", "LAB": "Laboratorio", "PAR": "Atención prehospitalaria", "DPD": "Protección de datos", "PAC": "Paciente",
    ]

    /// «Críticos» keeps what the API counts in `criticos`: critical notices in force, addressed to the account, without
    /// «Enterado», so the chip count and the list always agree (web `isPendingCritical`, Android `NoticeInboxRules`).
    public static func isPendingCritical(_ notice: InboxNotice) -> Bool {
        notice.state == .vigente && notice.level == .critico && notice.targeted && notice.acknowledgedAt == nil
    }

    /// Lista con el filtro elegido, en el orden del servidor (críticos primero). «Sin leer»: vigentes sin «Enterado»
    /// (los programados y vencidos no se pueden marcar).
    public static func filter(_ notices: [InboxNotice], by filter: NoticeFilter) -> [InboxNotice] {
        switch filter {
        case .todos: return notices
        case .sinLeer: return notices.filter { $0.state == .vigente && $0.acknowledgedAt == nil }
        case .criticos: return notices.filter(isPendingCritical)
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

    /// D1: the badge on the notices bell is the API's `noLeidos` (in-force notices without «Enterado»), minus the ones
    /// acknowledged here and not yet re-read; nil hides it.
    public static func badge(_ inbox: NoticeInbox?, hiding hidden: Set<String> = []) -> Int? {
        guard let inbox else { return nil }
        let handled = inbox.notices.filter { hidden.contains($0.id) && $0.state == .vigente && $0.acknowledgedAt == nil }.count
        let unread = inbox.unread - handled
        return unread > 0 ? unread : nil
    }

    /// Text on the bell: "4", "99+" over ninety-nine (Lote 5 S1, Android `bellBadgeText`), nil for none.
    public static func badgeText(_ count: Int?) -> String? {
        guard let count, count > 0 else { return nil }
        return count > 99 ? "99+" : String(count)
    }

    /// Look of the bell count (web `.notices-bell-count`): a white pill with primary text, red only while an in-force
    /// critical notice is unread. Nil when there is no count to show.
    public static func bellBadgeTone(_ inbox: NoticeInbox?, hiding hidden: Set<String> = []) -> BellBadgeTone? {
        guard badgeText(badge(inbox, hiding: hidden)) != nil else { return nil }
        return bellIsCritical(inbox, hiding: hidden) ? .critical : .neutral
    }

    /// The bell turns red while an in-force critical notice is still unread (and was not handled here).
    public static func bellIsCritical(_ inbox: NoticeInbox?, hiding hidden: Set<String> = []) -> Bool {
        (inbox?.notices ?? []).contains { $0.state == .vigente && $0.level == .critico && $0.acknowledgedAt == nil && !hidden.contains($0.id) }
    }

    /// Owner: «Avisos» reads like «Citas». In force first (server order), scheduled grouped by the day they start, expired
    /// grouped by the day they ended, latest first.
    public static func timeline(_ notices: [InboxNotice]) -> NoticeTimeline {
        func byDay(_ list: [InboxNotice], at: (InboxNotice) -> Date, latestFirst: Bool) -> [NoticeTimeline.Day] {
            let sorted = list.sorted { latestFirst ? at($0) > at($1) : at($0) < at($1) }
            var days: [NoticeTimeline.Day] = []
            for notice in sorted {
                let day = ClimesaDates.localDay(at(notice))
                if let last = days.last, last.day == day {
                    days[days.count - 1] = NoticeTimeline.Day(day: day, notices: last.notices + [notice])
                } else {
                    days.append(NoticeTimeline.Day(day: day, notices: [notice]))
                }
            }
            return days
        }
        let scheduled = notices.filter { $0.state == .programado && ClimesaDates.parse($0.from) != nil }
        let expired = notices.filter { $0.state == .vencido && ClimesaDates.parse($0.until) != nil }
        return NoticeTimeline(
            current: notices.filter { $0.state == .vigente },
            upcoming: byDay(scheduled, at: { ClimesaDates.parse($0.from) ?? .distantPast }, latestFirst: false),
            past: byDay(expired, at: { ClimesaDates.parse($0.until) ?? .distantPast }, latestFirst: true)
        )
    }

    /// «Ver avisos vencidos (N)».
    public static func pastTitle(_ count: Int) -> String { "Ver avisos vencidos (\(count))" }

    /// Status tag of a row: in force, its read state («Sin leer» waits, «Enterado» is done); scheduled waits
    /// («Programado»); expired is closed («Vencido»).
    public static func tag(_ notice: InboxNotice) -> NoticeTag {
        switch notice.state {
        case .vigente: return notice.acknowledgedAt == nil ? NoticeTag(value: "pendiente", label: "Sin leer") : NoticeTag(value: "completado", label: "Enterado")
        case .programado: return NoticeTag(value: "pendiente", label: "Programado")
        case .vencido: return NoticeTag(value: "inactivo", label: "Vencido")
        }
    }

    /// One quiet line under the title, with short dates: "Hoy 09:33 · hasta jueves 07:00", "Empieza mañana 07:00",
    /// "Venció ayer 23:22".
    public static func whenText(_ notice: InboxNotice, now: Date = Date()) -> String {
        func lower(_ text: String) -> String { text.prefix(1).lowercased() + text.dropFirst() }
        switch notice.state {
        case .programado:
            return notice.from.map { "Empieza \(lower(ClimesaDates.short($0, now: now)))" } ?? ""
        case .vencido:
            return notice.until.map { "Venció \(lower(ClimesaDates.short($0, now: now)))" } ?? ""
        case .vigente:
            return [notice.publishedAt.map { ClimesaDates.short($0, now: now) }, notice.until.map { "hasta \(lower(ClimesaDates.short($0, now: now)))" }]
                .compactMap { $0 }.joined(separator: " · ")
        }
    }

    /// The badge read aloud: "3 avisos sin leer".
    public static func badgeLabel(_ count: Int) -> String {
        count == 1 ? "1 aviso sin leer" : "\(count) avisos sin leer"
    }

    /// Avisos del inicio: solo los `destacado` (la API decide), menos los que la persona acaba de atender aquí y
    /// todavía no se reflejan en una nueva lectura.
    public static func banner(_ inbox: NoticeInbox?, hiding hidden: Set<String> = []) -> [InboxNotice] {
        (inbox?.notices ?? []).filter { $0.highlighted && $0.state == .vigente && !hidden.contains($0.id) }
    }

    /// «Enterado» se ofrece mientras la cuenta no lo haya dado; la API lo acepta para todo aviso que le llega.
    /// Only for a notice in force: the API refuses it on scheduled and expired ones.
    public static func canAcknowledge(_ notice: InboxNotice) -> Bool { notice.state == .vigente && notice.acknowledgedAt == nil }

    /// «Recordarme en N h» solo para un crítico dirigido a la cuenta y sin «Enterado» (igual que la web).
    public static func canSnooze(_ notice: InboxNotice) -> Bool {
        notice.state == .vigente && notice.level == .critico && notice.targeted && notice.acknowledgedAt == nil
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

    /// D68: the answer to «Enterado» on the Inicio banner, shown there (not later in Avisos).
    public static let acknowledgedText = "Listo: diste «Enterado»."

    /// D68: the answer to «Recordarme en N h», with the hours so it says when the notice comes back.
    public static func snoozedText(_ hours: Double) -> String { "Listo: te lo recordamos en \(hoursText(hours)) h." }

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

/// Bell count look: `neutral` is the white pill with primary text, `critical` the red one.
public enum BellBadgeTone: Equatable, Sendable {
    case neutral, critical
}
