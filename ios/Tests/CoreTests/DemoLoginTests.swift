import XCTest
@testable import ClimesaCore

// Placeholder accounts only; the real ones live in the git-ignored demo-credenciales.json.
final class DemoLoginTests: XCTestCase {
    private let json = #"[{"rol":"PAC","correo":"pac@example.test","contrasena":"Placeholder-PAC-1"},{"rol":"MED","correo":"med@example.test","contrasena":"Placeholder-MED-1"}]"#
    private var hex: String { json.utf8.map { String(format: "%02x", $0) }.joined() }

    func testFlagOnReadsAccountsInFileOrder() {
        let accounts = DemoLogin.accounts(info: [DemoLogin.enabledKey: "YES", DemoLogin.credentialsKey: hex])
        XCTAssertEqual(accounts, [DemoAccount(role: "PAC", email: "pac@example.test", password: "Placeholder-PAC-1"), DemoAccount(role: "MED", email: "med@example.test", password: "Placeholder-MED-1")])
    }

    func testFlagOffOrMissingCredentialsGiveNoAccounts() {
        XCTAssertEqual(DemoLogin.accounts(info: [DemoLogin.enabledKey: "NO", DemoLogin.credentialsKey: hex]), [])
        XCTAssertEqual(DemoLogin.accounts(info: [DemoLogin.enabledKey: "YES", DemoLogin.credentialsKey: ""]), [])
        XCTAssertEqual(DemoLogin.accounts(info: [DemoLogin.enabledKey: "YES"]), [])
        XCTAssertEqual(DemoLogin.accounts(info: nil), [])
    }

    func testInvalidHexOrJSONGivesNoAccounts() {
        XCTAssertEqual(DemoLogin.accounts(info: [DemoLogin.enabledKey: "YES", DemoLogin.credentialsKey: "zz"]), [])
        XCTAssertEqual(DemoLogin.parse(Data("no es json".utf8)), [])
    }

    func testRolesThatDoNotUseIOSAreDropped() {
        let webOrAndroid = ["ADM", "DPD", "JOP", "REC", "AST", "ENF", "LAB", "PAR"]
        XCTAssertEqual(DemoLogin.parse(file(webOrAndroid)), [])
    }

    func testIOSRolesAreKeptInFileOrder() {
        let accounts = DemoLogin.parse(file(["ADM", "PAC", "REC", "LAB", "MED", "PAR"]))
        XCTAssertEqual(accounts.map(\.role), ["PAC", "MED"])
    }

    func testScriptWritesTheSameRolesAsTheApp() throws {
        // ios/scripts/demo-login.sh keeps only these roles in the xcconfig; it cannot call DemoLogin.usesIOS.
        let script = URL(fileURLWithPath: #filePath).deletingLastPathComponent().appendingPathComponent("../../scripts/demo-login.sh")
        let line = try XCTUnwrap(try String(contentsOf: script, encoding: .utf8).components(separatedBy: .newlines).first { $0.hasPrefix("ios_roles=") })
        let scriptRoles = line.dropFirst("ios_roles=".count).trimmingCharacters(in: CharacterSet(charactersIn: "\"")).split(separator: " ").map(String.init)
        let allRoles = ["ADM", "DPD", "JOP", "REC", "AST", "ENF", "MED", "LAB", "PAR", "PAC"]
        XCTAssertEqual(scriptRoles, allRoles.filter(DemoLogin.usesIOS))
    }

    private func file(_ roles: [String]) -> Data {
        Data(("[" + roles.map { #"{"rol":"\#($0)","correo":"\#($0.lowercased())@example.test","contrasena":"x"}"# }.joined(separator: ",") + "]").utf8)
    }

    func testIncompleteEntriesAreDropped() {
        let data = Data(#"[{"rol":"ADM"},{"rol":"PAC","correo":"pac@example.test","contrasena":"x"}]"#.utf8)
        XCTAssertEqual(DemoLogin.parse(data), [DemoAccount(role: "PAC", email: "pac@example.test", password: "x")])
    }
}
