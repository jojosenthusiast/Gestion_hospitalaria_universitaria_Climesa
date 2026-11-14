import Foundation

/// Esquema `Problem` del contrato (`application/problem+json`, CON-02). El cliente decide solo por `codigo`.
public struct Problem: Decodable, Equatable, Sendable {
    public let status: Int?
    public let code: String?
    public let detail: String?
    public let field: String?
    public let requestId: String?
    public let currentVersion: Int?
    /// Solo en `consulta_ya_iniciada` cuando la consulta existente es del médico que intentó iniciarla.
    public let consultationId: String?
    enum CodingKeys: String, CodingKey {
        case status, code = "codigo", detail, field = "campo", requestId, currentVersion = "versionActual", consultationId = "consultaId"
    }
    public init(status: Int?, code: String?, detail: String?, field: String? = nil, requestId: String? = nil, currentVersion: Int? = nil, consultationId: String? = nil) {
        self.status = status; self.code = code; self.detail = detail; self.field = field; self.requestId = requestId; self.currentVersion = currentVersion
        self.consultationId = consultationId
    }

    /// Lee el cuerpo de un error; nil si no es un objeto problem+json.
    public static func decode(_ data: Data) -> Problem? {
        guard !data.isEmpty, let problem = try? JSONDecoder().decode(Problem.self, from: data) else { return nil }
        guard problem.code != nil || problem.detail != nil else { return nil }
        return problem
    }
}

/// Falla de una llamada a la API, con su mensaje en español.
public enum APIFailure: Error, Equatable, Sendable {
    /// 401: la sesión venció o se revocó. La app vuelve al ingreso.
    case sessionExpired
    /// Respuesta HTTP de error, con el cuerpo problem+json si vino.
    case http(status: Int, problem: Problem?)
    /// Sin respuesta del servidor (red caída, tiempo de espera).
    case transport
    /// La respuesta no tiene la forma del contrato.
    case invalidResponse

    public static func from(status: Int, body: Data) -> APIFailure {
        status == 401 ? .sessionExpired : .http(status: status, problem: Problem.decode(body))
    }

    public var status: Int? { if case let .http(status, _) = self { return status }; return nil }
    public var code: String? { if case let .http(_, problem) = self { return problem?.code }; return nil }
    public var problem: Problem? { if case let .http(_, problem) = self { return problem }; return nil }
    public var isVersionConflict: Bool { code == "version_conflicto" }
    public var isForbidden: Bool { status == 403 || code == "sin_permiso" }

    /// La consulta ya estaba iniciada por este médico (otro toque, la web): su id para retomarla en vez de fallar.
    public var resumableConsultationId: String? {
        guard code == "consulta_ya_iniciada", let id = problem?.consultationId, !id.isEmpty else { return nil }
        return id
    }

    /// 404 de ruta inexistente (el servidor aún no tiene esa función): el `detail` es el texto técnico del framework,
    /// por ejemplo "Cannot PATCH /api/v1/me/paciente", que no se debe mostrar.
    public var isRouteNotFound: Bool {
        guard status == 404, let detail = problem?.detail else { return false }
        return detail.range(of: #"^Cannot [A-Z]+ /"#, options: .regularExpression) != nil
    }

    /// El reintento puede tener éxito sin cambiar los datos (convenciones-api.md: red, 5xx, 408, 425, 429).
    public var isRetryable: Bool {
        switch self {
        case .transport, .invalidResponse: return true
        case .sessionExpired: return true
        case let .http(status, _): return status >= 500 || [408, 425, 429].contains(status)
        }
    }

    /// Mensaje para mostrar. Usa `detail` del servidor y agrega el código de soporte (`requestId`).
    public var message: String {
        switch self {
        case .sessionExpired: return "Tu sesión expiró. Vuelve a ingresar."
        case .transport: return "No hay conexión con el servidor. Revisa tu red y vuelve a intentar."
        case .invalidResponse: return "El servidor respondió algo inesperado. Vuelve a intentar."
        case let .http(status, problem):
            let text: String
            switch problem?.code {
            case "version_conflicto": text = "Otra persona cambió este registro. Se cargó la versión actual: revísala y vuelve a intentar."
            case "idempotencia_conflicto": text = "Esta acción ya se había enviado con otros datos. Vuelve a intentar."
            case _ where isRouteNotFound: text = "Esta función todavía no está disponible en el servidor. Vuelve a intentar más tarde."
            default: text = problem?.detail.flatMap { $0.isEmpty ? nil : $0 } ?? APIFailure.fallback(status)
            }
            guard let id = problem?.requestId, !id.isEmpty else { return text }
            return "\(text) (código de soporte: \(id))"
        }
    }

    static func fallback(_ status: Int) -> String {
        switch status {
        case 400, 422: return "Revisa los datos e inténtalo de nuevo."
        case 403: return "No tienes permiso para esta acción."
        case 404: return "No se encontró la información."
        case 409: return "La operación no se pudo completar porque el registro cambió."
        case 429: return "Hiciste demasiadas solicitudes. Espera un momento."
        case 500...: return "El servidor no está disponible. Vuelve a intentar en unos minutos."
        default: return "No se pudo completar la operación. Vuelve a intentar."
        }
    }
}

extension APIFailure: LocalizedError {
    public var errorDescription: String? { message }
}

public extension Error {
    /// Mensaje en español de cualquier error de la app.
    var userMessage: String {
        if let failure = self as? APIFailure { return failure.message }
        if self is DecodingError { return APIFailure.invalidResponse.message }
        return (self as? LocalizedError)?.errorDescription ?? "No se pudo completar la operación. Vuelve a intentar."
    }
}
