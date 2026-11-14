import Foundation

/// Fechas del contrato: instantes ISO 8601 en UTC y días `yyyy-MM-dd` de `America/El_Salvador`.
public enum ClimesaDates {
    public static let zone = TimeZone(identifier: "America/El_Salvador") ?? TimeZone(secondsFromGMT: -6 * 3600)!

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

    /// Días completos entre dos instantes (para "días de hospitalización" y plazos).
    public static func days(from start: Date, to end: Date) -> Int {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = zone
        return max(0, calendar.dateComponents([.day], from: calendar.startOfDay(for: start), to: calendar.startOfDay(for: end)).day ?? 0)
    }
}
