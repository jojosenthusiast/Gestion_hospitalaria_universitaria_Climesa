import Foundation

/// Enlaces que Supabase Auth pone en sus correos. Sin `redirect_to`, Supabase usa su Site URL (localhost) y el enlace
/// "Confirmar tu correo" abría una página inexistente. Todos los enlaces abren una página de la web.
public enum AuthRedirects {
    public static let confirmEmailPath = "/confirmar-correo"
    public static let resetPasswordPath = "/restablecer"
    public static let defaultWebURL = "https://sghu-web.onrender.com"

    private static func base(_ webURL: String) -> String {
        var value = webURL.trimmingCharacters(in: .whitespacesAndNewlines)
        while value.hasSuffix("/") { value.removeLast() }
        return value
    }
    public static func confirmEmail(webURL: String) -> String { base(webURL) + confirmEmailPath }
    public static func resetPassword(webURL: String) -> String { base(webURL) + resetPasswordPath }

    /// Ruta de Supabase Auth con el parámetro `redirect_to` (el mismo que envía supabase-js para `emailRedirectTo`).
    public static func withRedirect(_ path: String, to redirect: String) -> String {
        var allowed = CharacterSet.alphanumerics
        allowed.insert(charactersIn: "-._~")
        let encoded = redirect.addingPercentEncoding(withAllowedCharacters: allowed) ?? redirect
        return path + (path.contains("?") ? "&" : "?") + "redirect_to=" + encoded
    }
}

/// Error de Supabase Auth con su `error_code` y el mensaje en español para la persona.
public struct AuthFailure: LocalizedError, Equatable, Sendable {
    public let code: String?
    public let status: Int
    public init(code: String?, status: Int) { self.code = code; self.status = status }
    public var errorDescription: String? { AuthErrors.message(code) }
    public var isEmailNotConfirmed: Bool { code == AuthErrors.emailNotConfirmed }
}

public enum AuthErrors {
    public static let emailNotConfirmed = "email_not_confirmed"
    public static let unconfirmedMessage = "Tu correo todavía no está confirmado. Abre el enlace que te enviamos (revisa también la carpeta de spam) o reenvía el correo."

    /// `error_code` de la respuesta; servidores de Auth anteriores solo describen el correo sin confirmar en el texto.
    public static func code(errorCode: String?, detail: String?) -> String? {
        if let errorCode, !errorCode.isEmpty { return errorCode }
        if let detail, detail.range(of: "not confirmed", options: .caseInsensitive) != nil { return emailNotConfirmed }
        return nil
    }

    /// Lee el JSON de error de Supabase Auth (`error_code`, `msg` o `error_description`).
    public static func failure(status: Int, data: Data) -> AuthFailure {
        let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
        let detail = (json["msg"] as? String) ?? (json["error_description"] as? String)
        return AuthFailure(code: code(errorCode: json["error_code"] as? String, detail: detail), status: status)
    }

    public static func message(_ code: String?) -> String {
        switch code {
        case "invalid_credentials": return "Correo o contraseña incorrectos."
        case emailNotConfirmed: return unconfirmedMessage
        case "user_already_exists", "email_exists": return "Ya existe una cuenta con ese correo. Inicia sesión o recupera tu contraseña."
        case "weak_password": return "La contraseña es muy débil. Usa 8 caracteres, mayúscula, minúscula, número y símbolo."
        case "email_address_invalid": return "Ese correo no es válido. Revisa que esté bien escrito."
        case "over_email_send_rate_limit": return "Ya enviamos un correo hace poco. Espera un minuto antes de pedir otro."
        case "over_request_rate_limit": return "Demasiados intentos. Espera un momento y vuelve a intentar."
        case "signup_disabled": return "El registro de cuentas está desactivado por ahora."
        case "user_banned": return "Esta cuenta está suspendida. Comunícate con Recepción."
        default: return "No se pudo completar la autenticación. Revisa los datos o intenta más tarde."
        }
    }
}

/// Espera entre dos correos de confirmación: Supabase rechaza otro correo a la misma dirección antes de 60 segundos.
public enum ResendCooldown {
    public static let seconds: TimeInterval = 60
    public static func availableAt(sentAt: Date) -> Date { sentAt.addingTimeInterval(seconds) }
    public static func remainingSeconds(until availableAt: Date?, now: Date) -> Int {
        guard let availableAt, availableAt > now else { return 0 }
        return Int(availableAt.timeIntervalSince(now).rounded(.up))
    }
}

/// Mensaje para una cuenta cuyos roles no abren esta app. Las plataformas vienen de `platforms` de `/auth/me`
/// (unión de `acceso.rol.plataformas` de cada rol); no se repite una tabla de roles en el cliente.
public enum PlatformGate {
    private static let order = ["web", "android", "ios"]
    private static let names = ["web": "la web", "android": "la app de Android", "ios": "la app de iPhone (iOS)"]

    public static func otherPlatforms(_ platforms: [String], current: String) -> [String] {
        let own = Set(platforms.map { $0.lowercased() })
        return order.filter { own.contains($0) && $0 != current.lowercased() }
    }

    public static func message(platforms: [String], current: String, webURL: String) -> String {
        let others = otherPlatforms(platforms, current: current)
        guard !others.isEmpty else { return "Tu cuenta todavía no tiene un rol habilitado en ninguna plataforma. Pide a Administración que revise tus roles." }
        var host = webURL.trimmingCharacters(in: .whitespacesAndNewlines)
        while host.hasSuffix("/") { host.removeLast() }
        for scheme in ["https://", "http://"] where host.hasPrefix(scheme) { host.removeFirst(scheme.count) }
        let described = others.map { $0 == "web" ? "la web (\(host))" : names[$0]! }
        let list = described.count == 1 ? described[0] : described.dropLast().joined(separator: ", ") + " o " + described.last!
        return "Tus roles no usan \(names[current.lowercased()] ?? current). Puedes ingresar desde \(list)."
    }
}
