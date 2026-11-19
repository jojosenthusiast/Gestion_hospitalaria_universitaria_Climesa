import Foundation

/// Fechas del contrato: instantes ISO 8601 en UTC y días `yyyy-MM-dd` de `America/El_Salvador`.
public enum ClimesaDates {
    public static let zone = TimeZone(identifier: "America/El_Salvador") ?? TimeZone(secondsFromGMT: -6 * 3600)!

    /// Calendario gregoriano en la zona de El Salvador: los selectores de día lo usan para que el día elegido sea el
    /// del hospital y no el de la zona horaria del teléfono.
    public static var calendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = zone
        return calendar
    }

    public static func parse(_ text: String?) -> Date? {
        guard let text, !text.isEmpty else { return nil }
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = fractional.date(from: text) { return date }
        let plain = ISO8601DateFormatter()
        plain.formatOptions = [.withInternetDateTime]
        return plain.date(from: text)
    }

    /// Instante para enviar a la API (UTC con milisegundos).
    public static func iso(_ date: Date) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        formatter.timeZone = TimeZone(identifier: "UTC")
        return formatter.string(from: date)
    }

    /// Día local de El Salvador (`yyyy-MM-dd`), como lo pide `GET /citas/disponibilidad`.
    public static func localDay(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = zone
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }

    /// Inicio y fin (exclusivo) del día local que contiene `date`, en ISO UTC.
    public static func dayRange(_ date: Date) -> (from: String, to: String) {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = zone
        let start = calendar.startOfDay(for: date)
        let end = calendar.date(byAdding: .day, value: 1, to: start) ?? start.addingTimeInterval(86_400)
        return (iso(start), iso(end))
    }

    public enum Style: Sendable { case dateTime, date, time }

    /// Texto para mostrar en español de El Salvador. Devuelve "—" si la fecha no se puede leer.
    public static func display(_ text: String?, _ style: Style = .dateTime) -> String {
        guard let date = parse(text) else {
            // Un día sin hora (`yyyy-MM-dd`) se muestra tal cual.
            if let text, text.count == 10 { return text }
            return "—"
        }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "es_SV")
        formatter.timeZone = zone
        switch style {
        case .dateTime: formatter.dateStyle = .medium; formatter.timeStyle = .short
        case .date: formatter.dateStyle = .medium; formatter.timeStyle = .none
        case .time: formatter.dateStyle = .none; formatter.timeStyle = .short
        }
        return formatter.string(from: date)
    }

    // MARK: Short dates without the year (owner rule R4, same as Android `MyShifts.relative` and `ShortDay`)

    private static let weekdays = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"]
    private static let weekdaysShort = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"]
    private static let monthsShort = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]

    private static func capitalized(_ text: String) -> String { text.prefix(1).uppercased() + text.dropFirst() }

    /// "HH:mm" in El Salvador time.
    public static func clock(_ date: Date) -> String {
        let parts = calendar.dateComponents([.hour, .minute], from: date)
        return String(format: "%02d:%02d", parts.hour ?? 0, parts.minute ?? 0)
    }

    /// "jue 26 nov" in El Salvador time, never with the year.
    public static func dayMonth(_ date: Date) -> String {
        let parts = calendar.dateComponents([.weekday, .day, .month], from: date)
        return "\(weekdaysShort[((parts.weekday ?? 1) - 1) % 7]) \(parts.day ?? 0) \(monthsShort[((parts.month ?? 1) - 1) % 12])"
    }

    /// Calendar days from `now`'s local day to `date`'s local day (negative in the past).
    public static func dayOffset(_ date: Date, from now: Date) -> Int {
        calendar.dateComponents([.day], from: calendar.startOfDay(for: now), to: calendar.startOfDay(for: date)).day ?? 0
    }

    /// A near moment the way people say it, in El Salvador time: "Hoy 09:00", "Mañana 07:00", "Ayer 23:22", "Jueves 07:00"
    /// within the week ahead and "Jue 26 nov, 07:00" otherwise. A `yyyy-MM-dd` day reads like `shortDay`; "—" when unreadable.
    public static func short(_ text: String?, now: Date = Date()) -> String {
        guard let date = parse(text) else {
            if let text, text.count == 10 { return shortDay(text, now: now) }
            return "—"
        }
        return short(date, now: now)
    }

    public static func short(_ date: Date, now: Date = Date()) -> String {
        let time = clock(date)
        switch dayOffset(date, from: now) {
        case 0: return "Hoy \(time)"
        case 1: return "Mañana \(time)"
        case -1: return "Ayer \(time)"
        case 2...6:
            let weekday = calendar.component(.weekday, from: date)
            return "\(capitalized(weekdays[(weekday - 1) % 7])) \(time)"
        default: return "\(capitalized(dayMonth(date))), \(time)"
        }
    }

    /// Title of a day group: "Hoy · mié 18 nov", "Mañana · jue 19 nov", "Ayer · mar 17 nov", otherwise "Jue 26 nov".
    /// Takes an instant or a `yyyy-MM-dd` day of El Salvador.
    public static func shortDay(_ text: String, now: Date = Date()) -> String {
        guard let date = parse(text) ?? pickerDate(day: text) else { return text }
        let label = dayMonth(date)
        switch dayOffset(date, from: now) {
        case 0: return "Hoy · \(label)"
        case 1: return "Mañana · \(label)"
        case -1: return "Ayer · \(label)"
        default: return capitalized(label)
        }
    }

    /// The `Date` a day-only `DatePicker` shows for a `yyyy-MM-dd` day of El Salvador: noon of that day there, so neither
    /// the phone's zone nor UTC can move it to the day before or after. Read it back with `localDay`.
    public static func pickerDate(day: String?) -> Date? {
        guard let day, day.count == 10 else { return nil }
        return parse("\(day)T18:00:00Z")
    }

    // MARK: Live clock of the top bar (owner obs. 2, same text as the web header clock)

    private static let monthsLong = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre",
                                     "octubre", "noviembre", "diciembre"]

    /// "HH:mm:ss" (24 h) in El Salvador time.
    public static func clockSeconds(_ date: Date) -> String {
        let parts = calendar.dateComponents([.hour, .minute, .second], from: date)
        return String(format: "%02d:%02d:%02d", parts.hour ?? 0, parts.minute ?? 0, parts.second ?? 0)
    }

    /// "Miércoles 18 de noviembre" in El Salvador time, never with the year.
    public static func longDay(_ date: Date) -> String {
        let parts = calendar.dateComponents([.weekday, .day, .month], from: date)
        let weekday = capitalized(weekdays[((parts.weekday ?? 1) - 1) % 7])
        return "\(weekday) \(parts.day ?? 0) de \(monthsLong[((parts.month ?? 1) - 1) % 12])"
    }

    /// "Mié 18 nov": the clock's date line when the bar is too narrow for `longDay`.
    public static func compactDay(_ date: Date) -> String { capitalized(dayMonth(date)) }

    /// Whole years from a `yyyy-MM-dd` birth day to `now`'s local day in El Salvador; nil when unreadable or in the future.
    public static func age(birthDay: String?, now: Date = Date()) -> Int? {
        guard let birthDay, let birth = pickerDate(day: String(birthDay.prefix(10))) else { return nil }
        let years = calendar.dateComponents([.year], from: calendar.startOfDay(for: birth), to: calendar.startOfDay(for: now)).year
        guard let years, years >= 0 else { return nil }
        return years
    }

    /// Días completos entre dos instantes (para "días de hospitalización" y plazos).
    public static func days(from start: Date, to end: Date) -> Int {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = zone
        return max(0, calendar.dateComponents([.day], from: calendar.startOfDay(for: start), to: calendar.startOfDay(for: end)).day ?? 0)
    }
}
