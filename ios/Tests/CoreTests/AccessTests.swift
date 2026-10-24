import XCTest
@testable import ClimesaCore
final class AccessTests: XCTestCase {
    func profile(_ roles: [String], _ platforms: [String], _ permissions: [Permission] = [Permission(code:"sesion.perfil",context:"propio")]) -> AccessProfile {
        AccessProfile(id:"fixture",email:"ejemplo@example.test",name:"Cuenta ficticia",roles:roles,platforms:platforms,permissions:permissions)
    }
    func testOnlyTwoIOSRolesAreAllowed() { XCTAssertEqual(profile(["ADM","MED","PAC"],["ios","android"]).allowedIOSRoles,["MED","PAC"]) }
    func testOtherPlatformAndMissingPermissionDenyAccess() {
        XCTAssertTrue(profile(["MED"],["web"]).allowedIOSRoles.isEmpty)
        XCTAssertTrue(profile(["PAC"],["ios"],[]).allowedIOSRoles.isEmpty)
    }
    func testRoleNavigation() { XCTAssertTrue(RolePolicy.sections("MED").contains("Mis turnos")); XCTAssertFalse(RolePolicy.sections("PAC").contains("Mis turnos")) }
    func testRegistrationValidation() {
        XCTAssertTrue(RegistrationRules.errors(name:"Cuenta Ejemplo",email:"ejemplo@example.test",password:"Segura#2026",confirmation:"Segura#2026").isEmpty)
        XCTAssertEqual(RegistrationRules.errors(name:"A",email:"invalido",password:"123",confirmation:"456").count,4)
    }
}
