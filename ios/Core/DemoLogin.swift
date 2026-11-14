import Foundation

// TEMPORARY testing aid (docs/operacion/login-de-prueba.md): fictitious test accounts the sign-in form can be filled with.
// Only Debug builds carry them, and only when CLIMESA_DEMO_LOGIN = YES and the git-ignored ios/DemoLogin.xcconfig exists
// (sh ios/scripts/demo-login.sh); Release never includes that file. Remove before final delivery with sh ios/scripts/demo-login.sh --off.
public struct DemoAccount: Equatable, Sendable {
    public let role: String
    public let email: String
    public let password: String
    public init(role: String, email: String, password: String) { self.role = role; self.email = email; self.password = password }
}

public enum DemoLogin {
    public static let enabledKey = "ClimesaDemoLogin"
    public static let credentialsKey = "ClimesaDemoCredentials"

    /// Reads the Info.plist values: `YES` plus the credentials JSON as hexadecimal text (hex survives xcconfig, where `//` starts a comment).
    /// B-02: a Release build never offers the selector, whatever its Info.plist says (Release.xcconfig also forces it off).
    public static func accounts(info: [String: Any]?) -> [DemoAccount] {
        #if DEBUG
        guard (info?[enabledKey] as? String) == "YES", let hex = info?[credentialsKey] as? String, let data = decodeHex(hex) else { return [] }
        return parse(data)
        #else
        return []
        #endif
    }

    /// Reads `[{"rol","correo","contrasena"}]`; invalid JSON or incomplete entries give no account, never an error.
    public static func parse(_ data: Data) -> [DemoAccount] {
        guard let items = (try? JSONSerialization.jsonObject(with: data)) as? [[String: Any]] else { return [] }
        return items.compactMap { item in
            guard let role = item["rol"] as? String, let email = item["correo"] as? String, let password = item["contrasena"] as? String,
                  !role.isEmpty, !email.isEmpty, !password.isEmpty else { return nil }
            return DemoAccount(role: role, email: email, password: password)
        }
    }

    static func decodeHex(_ hex: String) -> Data? {
        let digits = Array(hex.utf8)
        guard !digits.isEmpty, digits.count % 2 == 0 else { return nil }
        var bytes = [UInt8](); bytes.reserveCapacity(digits.count / 2)
        var index = 0
        while index < digits.count {
            guard let byte = UInt8(String(decoding: digits[index..<index + 2], as: UTF8.self), radix: 16) else { return nil }
            bytes.append(byte); index += 2
        }
        return Data(bytes)
    }
}
