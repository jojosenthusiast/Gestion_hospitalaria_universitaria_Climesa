import XCTest
@testable import ClimesaCore

// Placeholder accounts only; the real ones live in the git-ignored demo-credenciales.json.
final class DemoLoginTests: XCTestCase {
    private let json = #"[{"rol":"ADM","correo":"adm@example.test","contrasena":"Placeholder-ADM-1"},{"rol":"MED","correo":"med@example.test","contrasena":"Placeholder-MED-1"}]"#
    private var hex: String { json.utf8.map { String(format: "%02x", $0) }.joined() }

    func testFlagOnReadsAccountsInFileOrder() {
        let accounts = DemoLogin.accounts(info: [DemoLogin.enabledKey: "YES", DemoLogin.credentialsKey: hex])
        XCTAssertEqual(accounts, [DemoAccount(role: "ADM", email: "adm@example.test", password: "Placeholder-ADM-1"), DemoAccount(role: "MED", email: "med@example.test", password: "Placeholder-MED-1")])
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

    func testIncompleteEntriesAreDropped() {
        let data = Data(#"[{"rol":"ADM"},{"rol":"PAC","correo":"pac@example.test","contrasena":"x"}]"#.utf8)
        XCTAssertEqual(DemoLogin.parse(data), [DemoAccount(role: "PAC", email: "pac@example.test", password: "x")])
    }
}
