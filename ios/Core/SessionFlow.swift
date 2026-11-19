import Foundation

/// Pantalla de sesión que corresponde al estado de la cuenta. Lógica pura: `RootView` solo la aplica.
enum SessionRoute: Equatable, Sendable {
    /// Restaurando la sesión guardada o verificando /auth/me al abrir la app.
    case verifying
    /// Sin sesión, o ingreso en curso (credenciales enviadas y /auth/me pendiente): se queda el formulario con su botón en carga.
    case login
    /// Sesión guardada sin perfil verificado: aviso y reintento.
    case retry
    /// Perfil verificado por /auth/me.
    case workspace
}

enum SessionRouter {
    static func route(loading: Bool, hasProfile: Bool, needsRetry: Bool) -> SessionRoute {
        if loading { return .verifying }
        if hasProfile { return .workspace }
        if needsRetry { return .retry }
        return .login
    }
}

/// Why the app closes a session by itself; `message` is what the login screen shows afterwards (Android `SessionEnd`).
enum SessionEnd: Equatable, Sendable {
    /// The refresh token is gone or Auth rejects it: the person signs in again.
    case expired
    /// The API rejects an account whose token is valid: deactivated by administration, or its roles or app access withdrawn.
    case revoked

    var message: String {
        switch self {
        case .expired: return APIFailure.sessionExpired.message
        case .revoked: return "Tu acceso fue retirado. Si crees que es un error, contacta a administración."
        }
    }
}

/// Which responses end the session (same rule as Android `SessionEndRules`). Only account-level signals do: an ordinary
/// 403 to one action is a refusal of that action (an info state, S8) and the person keeps working. Network errors never do.
enum SessionEndRules {
    /// Renewing the session failed: Auth answered 400/401 for the refresh token.
    static func afterRefreshFailure(status: Int?) -> SessionEnd? { status == 400 || status == 401 ? .expired : nil }

    /// An API call failed with a token that was just renewed (or another call had just renewed it). The API answers 401
    /// only when it no longer accepts the account (inactive account, or no role left); 403 is per action.
    static func afterRenewedCall(status: Int?) -> SessionEnd? { status == 401 ? .revoked : nil }

    /// `/auth/me` failed while restoring or re-checking the session. It is the account's own profile, so a 401 (account
    /// not active, no role) or a 403 (no `sesion.perfil`, no role) means the account lost access to the app.
    static func afterProfile(status: Int?) -> SessionEnd? { status == 401 || status == 403 ? .revoked : nil }
}

enum SessionFailure {
    /// Mensaje para la persona. Nil cuando el error es una cancelación: no es un fallo y nunca se muestra.
    static func visibleMessage(for error: Error) -> String? {
        if error is CancellationError { return nil }
        if let urlError = error as? URLError, urlError.code == .cancelled { return nil }
        return error.userMessage
    }

    /// Tras guardar la sesión, si /auth/me falla se ofrece reintentar; con sesión caducada no tiene sentido.
    static func offersRetry(after error: Error, signedIn: Bool) -> Bool {
        guard signedIn else { return false }
        if let failure = error as? APIFailure, failure == .sessionExpired { return false }
        return true
    }
}
