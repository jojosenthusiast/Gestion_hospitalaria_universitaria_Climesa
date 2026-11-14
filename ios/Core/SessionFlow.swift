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
