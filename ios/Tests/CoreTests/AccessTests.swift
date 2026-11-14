import XCTest
@testable import ClimesaCore

final class AccessTests: XCTestCase {
    private let basePermissions = [Permission(code: "sesion.perfil", context: "propio")]
    private let medicPermissions = [
        Permission(code: "sesion.perfil", context: "propio"),
        Permission(code: "pacientes.buscar", context: "todos"),
        Permission(code: "turnos.ver", context: "propio"),
        Permission(code: "fila.ver", context: "todos"),
        Permission(code: "citas.ver", context: "propio"),
        Permission(code: "resultados.ver", context: "relacion")
    ]

    func profile(_ roles: [String], _ platforms: [String], _ permissions: [Permission]? = nil, channels: [String] = []) -> AccessProfile {
        AccessProfile(id: "fixture", email: "ejemplo@example.test", name: "Cuenta ficticia", roles: roles, platforms: platforms, permissions: permissions ?? basePermissions, channels: channels)
    }

    func testOnlyTwoIOSRolesAreAllowed() { XCTAssertEqual(profile(["ADM", "MED", "PAC"], ["ios", "android"]).allowedIOSRoles, ["MED", "PAC"]) }

    func testOtherPlatformAndMissingPermissionDenyAccess() {
        XCTAssertTrue(profile(["MED"], ["web"]).allowedIOSRoles.isEmpty)
        XCTAssertTrue(profile(["PAC"], ["ios"], []).allowedIOSRoles.isEmpty)
    }

    func testMedicoVeSusCincoPestanas() {
        let decision = TabPolicy.decide(profile(["MED"], ["ios"], medicPermissions))
        XCTAssertEqual(decision, .tabs(role: "MED", tabs: [.miDia, .pacientes, .resultados, .turnos, .mas]))
    }

    func testPacienteVeSusCincoPestanas() {
        let permissions = [Permission(code: "sesion.perfil", context: "propio"), Permission(code: "fila.ver", context: "propio"), Permission(code: "citas.ver", context: "propio"), Permission(code: "resultados.ver", context: "propio_revisado")]
        let decision = TabPolicy.decide(profile(["PAC"], ["ios"], permissions))
        XCTAssertEqual(decision, .tabs(role: "PAC", tabs: [.inicio, .fila, .citas, .examenes, .mas]))
    }

    func testRecepcionistaNoUsaLaAplicacion() {
        XCTAssertEqual(TabPolicy.decide(profile(["REC"], ["ios", "web"], medicPermissions)), .unsupportedRole)
    }

    func testRolSinPlataformaIOSNoUsaLaAplicacion() {
        XCTAssertEqual(TabPolicy.decide(profile(["MED"], ["web"], medicPermissions)), .unsupportedRole)
    }

    func testUnaPestanaSeOcultaSiFaltaSuPermiso() {
        let decision = TabPolicy.decide(profile(["MED"], ["ios"]))
        XCTAssertEqual(decision, .tabs(role: "MED", tabs: [.miDia, .mas]))
    }

    func testCuentaConDosRolesRespetaElRolPreferidoSoloSiEstaPermitido() {
        let both = profile(["MED", "PAC"], ["ios"], medicPermissions)
        XCTAssertEqual(TabPolicy.decide(both, preferredRole: "PAC"), .tabs(role: "PAC", tabs: [.inicio, .fila, .citas, .examenes, .mas]))
        XCTAssertEqual(TabPolicy.decide(both, preferredRole: "REC"), .tabs(role: "MED", tabs: [.miDia, .pacientes, .resultados, .turnos, .mas]))
    }

    func testTodasLasPestanasConsultanLaAPI() {
        XCTAssertTrue(AppTab.allCases.allSatisfy { $0.isImplemented })
    }

    func testLasSeccionesDelPacienteSalenDeSusPermisos() {
        let pac = AccessProfile(id: "u1", email: "ejemplo@example.test", name: "Cuenta ficticia", roles: ["PAC"], platforms: ["ios"], permissions: [
            Permission(code: "sesion.perfil", context: "x"), Permission(code: "cuenta.vincular", context: "propio"),
            Permission(code: "expediente.ver", context: "propio_revisado"), Permission(code: "auditoria.mis_accesos", context: "propio")
        ])
        XCTAssertEqual(AppSection.visible(for: "PAC", profile: pac), [.vinculacion, .historial, .hospital, .ubicacion, .accesos, .perfil])
        let linked = AccessProfile(id: "u1", email: "ejemplo@example.test", name: "Cuenta ficticia", roles: ["PAC"], platforms: ["ios"], permissions: pac.permissions + [Permission(code: "ambulancia.solicitar", context: "propio")], patientId: "p1")
        XCTAssertEqual(AppSection.visible(for: "PAC", profile: linked), [.historial, .ambulancia, .hospital, .ubicacion, .accesos, .perfil])
    }

    func testLasSeccionesDelMedicoSalenDeSusPermisos() {
        let med = profile(["MED"], ["ios"], basePermissions + [Permission(code: "admision.ver", context: "relacion")])
        XCTAssertEqual(AppSection.visible(for: "MED", profile: med), [.hospitalizados, .hospital, .ubicacion, .perfil])
    }

    func testElMedicoVeAgendaYAmbulanciaConSusPermisos() {
        let med = profile(["MED"], ["ios"], basePermissions + [Permission(code: "consulta.iniciar", context: "x"), Permission(code: "ambulancia.ver_estado", context: "x"), Permission(code: "ambulancia.recibir_prehospital", context: "x")])
        XCTAssertEqual(AppSection.visible(for: "MED", profile: med), [.agenda, .ambulanciaEstado, .llegadaAmbulancia, .hospital, .ubicacion, .perfil])
    }

    func testMisDatosYMiHabitacionSoloConExpedienteVinculado() {
        let permissions = basePermissions + [Permission(code: "pacientes.ver_ficha", context: "propio"), Permission(code: "admision.ver", context: "propio")]
        let unlinked = AccessProfile(id: "u1", email: "ejemplo@example.test", name: "Cuenta ficticia", roles: ["PAC"], platforms: ["ios"], permissions: permissions)
        XCTAssertEqual(AppSection.visible(for: "PAC", profile: unlinked), [.hospital, .ubicacion, .perfil])
        let linked = AccessProfile(id: "u1", email: "ejemplo@example.test", name: "Cuenta ficticia", roles: ["PAC"], platforms: ["ios"], permissions: permissions, patientId: "p1")
        XCTAssertEqual(AppSection.visible(for: "PAC", profile: linked), [.misDatos, .miHabitacion, .hospital, .ubicacion, .perfil])
    }

    func testElPerfilDelContratoTraeExpedienteYPersonalYAceptaNombreNulo() throws {
        let json = Data(#"{"user":{"id":"u1"},"id":"u1","email":"ejemplo@example.test","name":null,"roles":["PAC"],"platforms":["android","ios"],"permissions":[{"code":"sesion.perfil","context":"x"}],"channels":["usuario:u1"],"patientId":"p1","staffId":null,"canInviteAdmin":false}"#.utf8)
        let decoded = try JSONDecoder().decode(AccessProfile.self, from: json)
        XCTAssertEqual(decoded.name, "")
        XCTAssertEqual(decoded.patientId, "p1")
        XCTAssertNil(decoded.staffId)
        XCTAssertEqual(TabPolicy.decide(decoded), .tabs(role: "PAC", tabs: [.inicio, .mas]))
    }

    func testCadaPestanaTieneClaveDeTitulo() {
        XCTAssertEqual(AppTab.miDia.titleKey, "tab.miDia")
        XCTAssertEqual(AppTab.examenes.titleKey, "tab.examenes")
        XCTAssertEqual(RolePolicy.labelKey("MED"), "role.MED")
        XCTAssertEqual(RolePolicy.labelKey("PAC"), "role.PAC")
    }

    func testElPerfilDecodificaLosCanalesYAceptaSuAusencia() throws {
        let withChannels = Data(#"{"id":"u1","email":"ejemplo@example.test","name":"Cuenta ficticia","roles":["MED"],"platforms":["ios"],"permissions":[{"code":"sesion.perfil","context":"propio"}],"channels":["publico","usuario:u1"]}"#.utf8)
        XCTAssertEqual(try JSONDecoder().decode(AccessProfile.self, from: withChannels).channels, ["publico", "usuario:u1"])
        let without = Data(#"{"id":"u1","email":"ejemplo@example.test","name":"Cuenta ficticia","roles":["MED"],"platforms":["ios"],"permissions":[]}"#.utf8)
        XCTAssertTrue(try JSONDecoder().decode(AccessProfile.self, from: without).channels.isEmpty)
    }

    func testRegistrationValidation() {
        XCTAssertTrue(RegistrationRules.errors(name: "Cuenta Ejemplo", email: "ejemplo@example.test", password: "Segura#2026", confirmation: "Segura#2026").isEmpty)
        XCTAssertEqual(RegistrationRules.errors(name: "A", email: "invalido", password: "123", confirmation: "456").count, 4)
    }
}
