import Foundation

/// Esquema `Problem` del contrato (`application/problem+json`, CON-02). El cliente decide solo por `codigo`.
public struct Problem: Decodable, Equatable, Sendable {
    /// Error de validación de un campo (`errors[]` del problem+json): el campo del cuerpo y su mensaje en español.
    public struct FieldIssue: Decodable, Equatable, Sendable {
        public let field: String
        public let message: String
        enum CodingKeys: String, CodingKey { case field, campo, message, mensaje }
        public init(field: String, message: String) { self.field = field; self.message = message }
        public init(from decoder: Decoder) throws {
            let container = try decoder.container(keyedBy: CodingKeys.self)
            field = try container.decodeIfPresent(String.self, forKey: .field) ?? container.decodeIfPresent(String.self, forKey: .campo) ?? ""
            message = try container.decodeIfPresent(String.self, forKey: .message) ?? container.decodeIfPresent(String.self, forKey: .mensaje) ?? ""
        }
    }

    public let status: Int?
    public let code: String?
    public let detail: String?
    public let field: String?
    public let requestId: String?
    public let currentVersion: Int?
    /// Solo en `consulta_ya_iniciada` cuando la consulta existente es del médico que intentó iniciarla.
    public let consultationId: String?
    /// Errores por campo de una validación (400). Puede faltar en servidores anteriores.
    public let errors: [FieldIssue]
    enum CodingKeys: String, CodingKey {
        case status, code = "codigo", detail, field = "campo", requestId, currentVersion = "versionActual", consultationId = "consultaId", errors
    }
    public init(status: Int?, code: String?, detail: String?, field: String? = nil, requestId: String? = nil, currentVersion: Int? = nil, consultationId: String? = nil, errors: [FieldIssue] = []) {
        self.status = status; self.code = code; self.detail = detail; self.field = field; self.requestId = requestId; self.currentVersion = currentVersion
        self.consultationId = consultationId; self.errors = errors
    }
    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        status = try? container.decodeIfPresent(Int.self, forKey: .status)
        code = try? container.decodeIfPresent(String.self, forKey: .code)
        detail = try? container.decodeIfPresent(String.self, forKey: .detail)
        field = try? container.decodeIfPresent(String.self, forKey: .field)
        requestId = try? container.decodeIfPresent(String.self, forKey: .requestId)
        currentVersion = try? container.decodeIfPresent(Int.self, forKey: .currentVersion)
        consultationId = try? container.decodeIfPresent(String.self, forKey: .consultationId)
        errors = ((try? container.decodeIfPresent([FieldIssue].self, forKey: .errors)) ?? nil)?.filter { !$0.field.isEmpty && !$0.message.isEmpty } ?? []
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
            case let code?: text = showableDetail ?? ProblemText.codeMessage(code, field: problem?.field) ?? APIFailure.fallback(status)
            default: text = showableDetail ?? APIFailure.fallback(status)
            }
            guard let id = problem?.requestId, !id.isEmpty else { return text }
            return "\(text) (código de soporte: \(id))"
        }
    }

    /// `detail` del servidor solo si está en español.
    private var showableDetail: String? { problem?.detail.flatMap { ProblemText.isShowable($0) ? $0 : nil } }

    /// Mensajes en español por campo del cuerpo (`motive`, `phone`...). La ruta `pending[0].description` queda también
    /// bajo su raíz (`pending`). Sin `errors[]`, el `campo` del problema recibe el `detail` si está en español.
    public var fieldErrors: [String: String] {
        guard let problem else { return [:] }
        var result: [String: String] = [:]
        func put(_ field: String, _ message: String) {
            guard ProblemText.isShowable(message) else { return }
            let root = ProblemText.rootField(field)
            if result[field] == nil { result[field] = message }
            if result[root] == nil { result[root] = message }
        }
        for issue in problem.errors { put(issue.field, issue.message) }
        if result.isEmpty, let field = problem.field, !field.isEmpty {
            // Un `detail` en inglés no se muestra: el campo recibe un texto en español.
            if let detail = problem.detail, ProblemText.isShowable(detail) { put(field, detail) }
            else if problem.code == "validacion" { put(field, "Revisa este dato.") }
        }
        return result
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

/// Qué texto del servidor se puede mostrar: nunca el inglés crudo de class-validator ni del framework.
public enum ProblemText {
    private static let english = #"(?i)\b(must|should|property|longer|shorter|than|allowed|cannot|invalid|required|request|internal server error|not found|unauthorized|forbidden|each value|is not|an? (array|string|number|boolean|object))\b"#

    public static func isShowable(_ text: String) -> Bool {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        return !trimmed.isEmpty && trimmed.range(of: english, options: .regularExpression) == nil
    }

    /// Texto en español por `codigo` cuando el `detail` falta o no se puede mostrar. Nil si el código no tiene uno propio.
    public static func codeMessage(_ code: String, field: String?) -> String? {
        switch code {
        case "transicion_invalida": return "La admisión cambió de estado; vuelve a cargar."
        case "validacion":
            guard let field, let label = fieldLabel(field) else { return "Revisa los datos e inténtalo de nuevo." }
            return "Revisa el dato «\(label)» e inténtalo de nuevo."
        case "servicio_finalizado": return "El servicio ya terminó; vuelve a cargar."
        case "sin_paramedico_de_turno": return "No hay paramédico con cuenta en la app con turno en curso."
        case "conflicto": return "La operación no se pudo completar porque el registro cambió. Vuelve a cargar."
        case "sin_permiso": return "No tienes permiso para esta acción."
        default: return nil
        }
    }

    /// Nombre en español de un campo del cuerpo (`pending[0].responsible` → "pendientes"); nil si no se conoce, para no
    /// mostrar el identificador en inglés.
    public static func fieldLabel(_ path: String) -> String? {
        switch rootField(path) {
        case "reason", "motive": return "motivo"
        case "summary": return "resumen"
        case "pending": return "pendientes"
        case "voluntaryConsent": return "consentimiento"
        case "type": return "tipo de alta"
        case "version": return "versión"
        case "requestedCategory": return "categoría"
        case "attendingDoctorId": return "médico tratante"
        case "note": return "nota"
        default: return nil
        }
    }

    /// `pending[0].description` → `pending`; `motive` → `motive`.
    public static func rootField(_ path: String) -> String {
        String(path.prefix { $0 != "[" && $0 != "." })
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
