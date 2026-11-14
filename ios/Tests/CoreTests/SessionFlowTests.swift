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
}
