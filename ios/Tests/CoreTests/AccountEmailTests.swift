import Foundation
import XCTest
@testable import ClimesaCore

final class AccountEmailTests: XCTestCase {
    func testRedirectsLandOnWebPages() {
        XCTAssertEqual(AuthRedirects.confirmEmail(webURL: "https://sghu-web.onrender.com/"), "https://sghu-web.onrender.com/confirmar-correo")
        XCTAssertEqual(AuthRedirects.resetPassword(webURL: " https://sghu-web.onrender.com "), "https://sghu-web.onrender.com/restablecer")
    }

    func testRedirectIsEncodedQueryParameter() {
        XCTAssertEqual(AuthRedirects.withRedirect("/auth/v1/signup", to: "https://sghu-web.onrender.com/confirmar-correo"),
                       "/auth/v1/signup?redirect_to=https%3A%2F%2Fsghu-web.onrender.com%2Fconfirmar-correo")
        XCTAssertEqual(AuthRedirects.withRedirect("/auth/v1/x?a=1", to: "https://a.b/r"), "/auth/v1/x?a=1&redirect_to=https%3A%2F%2Fa.b%2Fr")
    }

    func testUnconfirmedEmailIsRecognisedAndMapped() {
        let current = AuthErrors.failure(status: 400, data: Data(#"{"code":400,"error_code":"email_not_confirmed","msg":"Email not confirmed"}"#.utf8))
        XCTAssertTrue(current.isEmailNotConfirmed)
        XCTAssertEqual(current.errorDescription, AuthErrors.unconfirmedMessage)
        let legacy = AuthErrors.failure(status: 400, data: Data(#"{"error":"invalid_grant","error_description":"Email not confirmed"}"#.utf8))
        XCTAssertTrue(legacy.isEmailNotConfirmed)
        let wrong = AuthErrors.failure(status: 400, data: Data(#"{"error_code":"invalid_credentials"}"#.utf8))
        XCTAssertFalse(wrong.isEmailNotConfirmed)
        XCTAssertEqual(wrong.errorDescription, "Correo o contraseña incorrectos.")
        XCTAssertTrue(AuthErrors.failure(status: 500, data: Data("no json".utf8)).errorDescription!.hasPrefix("No se pudo completar"))
    }

    func testCooldownRoundsUpAndEnds() {
        let sent = Date(timeIntervalSince1970: 1_000)
        let at = ResendCooldown.availableAt(sentAt: sent)
        XCTAssertEqual(ResendCooldown.remainingSeconds(until: at, now: sent), 60)
        XCTAssertEqual(ResendCooldown.remainingSeconds(until: at, now: sent.addingTimeInterval(59.5)), 1)
        XCTAssertEqual(ResendCooldown.remainingSeconds(until: at, now: at), 0)
        XCTAssertEqual(ResendCooldown.remainingSeconds(until: nil, now: sent), 0)
    }

    func testPlatformGateNamesWhereTheAccountCanSignIn() {
        XCTAssertEqual(PlatformGate.message(platforms: ["web", "android"], current: "ios", webURL: "https://sghu-web.onrender.com/"),
                       "Tus roles no usan la app de iPhone (iOS). Puedes ingresar desde la web (sghu-web.onrender.com) o la app de Android.")
        XCTAssertEqual(PlatformGate.otherPlatforms(["Web"], current: "ios"), ["web"])
        XCTAssertTrue(PlatformGate.message(platforms: [], current: "ios", webURL: "https://w.test").contains("Administración"))
    }

    func testMultiRoleAccountKeepsOnlyRolesAllowedOnIOS() {
        let profile = AccessProfile(id: "u", email: "u@example.test", name: "U", roles: ["REC", "MED"], platforms: ["android", "ios", "web"],
                                    permissions: [Permission(code: "sesion.perfil", context: "propio")])
        XCTAssertEqual(profile.allowedIOSRoles, ["MED"])
        let noIOS = AccessProfile(id: "u", email: "u@example.test", name: "U", roles: ["REC", "LAB"], platforms: ["android", "web"],
                                  permissions: [Permission(code: "sesion.perfil", context: "propio")])
        XCTAssertEqual(noIOS.allowedIOSRoles, [])
    }
}
