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

    /// El correo escrito se conserva al salir un momento de la app (la contraseña solo vive en memoria, nunca en disco).
    func testTypedEmailSurvivesGoingToBackground() {
        let app = XCUIApplication()
        app.launchArguments = ["-AppleLanguages", "(es)", "-AppleLocale", "es_SV"]
        app.launch()
        let email = app.textFields.firstMatch
        XCTAssertTrue(email.waitForExistence(timeout: 30), "No apareció el campo de correo.\n\(app.debugDescription)")
        email.tap()
        email.typeText("ejemplo@example.test")
        XCUIDevice.shared.press(.home)
        app.activate()
        let again = app.textFields.firstMatch
        XCTAssertTrue(again.waitForExistence(timeout: 30))
        XCTAssertEqual(again.value as? String, "ejemplo@example.test")
    }
}
