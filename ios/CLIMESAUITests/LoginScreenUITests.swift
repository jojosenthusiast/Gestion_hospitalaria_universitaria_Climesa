import XCTest

/// Humo en simulador: la app arranca (sin sesión, sin secretos) y muestra la pantalla de ingreso.
final class LoginScreenUITests: XCTestCase {
    override func setUpWithError() throws { continueAfterFailure = false }

    func testLaunchShowsLoginScreen() {
        let app = XCUIApplication()
        app.launchArguments = ["-AppleLanguages", "(es)", "-AppleLocale", "es_SV"]
        app.launch()
        let login = app.buttons["Ingresar"].firstMatch
        XCTAssertTrue(login.waitForExistence(timeout: 30), "La pantalla de ingreso no apareció: falta el botón Ingresar.\n\(app.debugDescription)")
    }
}
