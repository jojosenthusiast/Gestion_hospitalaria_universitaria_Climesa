import Foundation
import XCTest
@testable import ClimesaCore

final class SessionFlowTests: XCTestCase {
    // Regresión: durante el ingreso (credenciales enviadas, /auth/me en curso) la pantalla debe seguir siendo el ingreso,
    // no el aviso de reintento, o aparece un error rojo antes del panel.
    func testSignInInProgressKeepsLoginRoute() {
        XCTAssertEqual(SessionRouter.route(loading: false, hasProfile: false, needsRetry: false), .login)
    }

    func testFailedVerificationAfterSessionSavedShowsRetry() {
        XCTAssertEqual(SessionRouter.route(loading: false, hasProfile: false, needsRetry: true), .retry)
    }

    func testVerifiedProfileShowsWorkspaceAndRestoreShowsVerifying() {
        XCTAssertEqual(SessionRouter.route(loading: false, hasProfile: true, needsRetry: false), .workspace)
        XCTAssertEqual(SessionRouter.route(loading: true, hasProfile: false, needsRetry: false), .verifying)
    }

    // Cancelaciones (cambio de pestaña, nueva petición, escena que se oculta) nunca se muestran como error.
    func testCancellationsAreNotVisibleErrors() {
        XCTAssertNil(SessionFailure.visibleMessage(for: CancellationError()))
        XCTAssertNil(SessionFailure.visibleMessage(for: URLError(.cancelled)))
    }

    func testRealFailuresStayVisible() {
        XCTAssertEqual(SessionFailure.visibleMessage(for: APIFailure.transport), APIFailure.transport.message)
        XCTAssertNotNil(SessionFailure.visibleMessage(for: URLError(.notConnectedToInternet)))
    }

    func testRetryOnlyWhenSessionWasSavedAndNotExpired() {
        XCTAssertFalse(SessionFailure.offersRetry(after: APIFailure.transport, signedIn: false))
        XCTAssertTrue(SessionFailure.offersRetry(after: APIFailure.transport, signedIn: true))
        XCTAssertFalse(SessionFailure.offersRetry(after: APIFailure.sessionExpired, signedIn: true))
    }

    // A rejected refresh token ends the session as expired; network errors (no status) and Auth 5xx never end it.
    func testRejectedRefreshEndsSessionAsExpired() {
        XCTAssertEqual(SessionEndRules.afterRefreshFailure(status: 400), .expired)
        XCTAssertEqual(SessionEndRules.afterRefreshFailure(status: 401), .expired)
        XCTAssertNil(SessionEndRules.afterRefreshFailure(status: nil))
        XCTAssertNil(SessionEndRules.afterRefreshFailure(status: 500))
        XCTAssertEqual(SessionEnd.expired.message, "Tu sesión expiró. Vuelve a ingresar.")
    }

    // A 401 with a just-renewed token means the API no longer accepts the account; a 403 is one refused action.
    func testUnauthorizedAfterRenewalEndsSessionAsRevoked() {
        XCTAssertEqual(SessionEndRules.afterRenewedCall(status: 401), .revoked)
        XCTAssertNil(SessionEndRules.afterRenewedCall(status: 403))
        XCTAssertNil(SessionEndRules.afterRenewedCall(status: nil))
        XCTAssertEqual(SessionEnd.revoked.message, "Tu acceso fue retirado. Si crees que es un error, contacta a administración.")
    }

    // A refused own profile (/auth/me 401 or 403) withdraws access; other failures keep the session.
    func testRefusedProfileEndsSessionAsRevoked() {
        XCTAssertEqual(SessionEndRules.afterProfile(status: 401), .revoked)
        XCTAssertEqual(SessionEndRules.afterProfile(status: 403), .revoked)
        XCTAssertNil(SessionEndRules.afterProfile(status: 500))
        XCTAssertNil(SessionEndRules.afterProfile(status: nil))
    }
}
