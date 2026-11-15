import Foundation

/// MA-OPS-01: el servidor gratuito de Render se duerme tras unos 15 minutos sin uso y tarda hasta un minuto en
/// despertar. Mientras se cree dormido, las lecturas esperan más, se reintentan con espera creciente y la app avisa
/// a los 5 s que el servidor se está activando.
public enum ColdStartPolicy {
    /// Mensaje que se muestra cuando una llamada tarda más de `slowNoticeAfter`.
    public static let wakingMessage = "El servidor se está activando, puede tardar hasta un minuto."
    public static let slowNoticeAfter: TimeInterval = 5
    /// Tiempo de espera de una llamada mientras el servidor puede estar dormido (y siempre para `/auth/me`).
    public static let coldTimeout: TimeInterval = 90
    /// Tiempo de espera con el servidor ya despierto.
    public static let warmTimeout: TimeInterval = 30
    /// Sin respuestas durante este tiempo, se asume que el servidor volvió a dormirse.
    public static let idleUntilCold: TimeInterval = 14 * 60
    /// Esperas antes de cada reintento de una lectura (en segundos); su largo es el número de reintentos.
    public static let retryDelays: [TimeInterval] = [2, 5, 10]

    public static func isLikelyCold(lastSuccess: Date?, now: Date) -> Bool {
        guard let lastSuccess else { return true }
        return now.timeIntervalSince(lastSuccess) > idleUntilCold
    }

    public static func timeout(path: String, lastSuccess: Date?, now: Date) -> TimeInterval {
        path.hasPrefix("/auth/me") || isLikelyCold(lastSuccess: lastSuccess, now: now) ? coldTimeout : warmTimeout
    }

    /// Solo se reintentan lecturas (GET) que fallan por red o porque el servidor aún no responde (502, 503, 504).
    /// Una escritura nunca se reintenta sola: la repite la persona con su misma `Idempotency-Key`.
    public static func shouldRetry(method: String, failure: APIFailure, attempt: Int) -> Bool {
        guard method == "GET", attempt < retryDelays.count else { return false }
        switch failure {
        case .transport: return true
        case let .http(status, _): return [502, 503, 504].contains(status)
        case .sessionExpired, .invalidResponse: return false
        }
    }

    public static func delay(beforeRetry attempt: Int) -> TimeInterval {
        retryDelays[min(max(attempt, 0), retryDelays.count - 1)]
    }
}
