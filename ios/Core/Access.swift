import Foundation
public struct Permission: Codable, Equatable {
    public let code: String
    public let context: String
    public init(code: String, context: String) { self.code = code; self.context = context }
}
public struct AccessProfile: Codable {
    public let id: String
    public let email: String
    public let name: String
    public let roles: [String]
    public let platforms: [String]
    public let permissions: [Permission]
    public init(id: String, email: String, name: String, roles: [String], platforms: [String], permissions: [Permission]) {
        self.id=id; self.email=email; self.name=name; self.roles=roles; self.platforms=platforms; self.permissions=permissions
    }
    // Solo se invoca con el perfil verificado que devuelve /auth/me; nunca con metadatos del JWT.
    public var allowedIOSRoles: [String] {
        guard platforms.contains("ios"), permissions.contains(where: { $0.code == "sesion.perfil" }) else { return [] }
        return ["MED", "PAC"].filter { roles.contains($0) }
    }
}
public enum RolePolicy {
    public static func label(_ role: String) -> String { role == "MED" ? "Medicina" : "Paciente" }
    public static func sections(_ role: String) -> [String] {
        role == "MED" ? ["Inicio", "Consultas", "Mis turnos", "Mi cuenta"] : ["Inicio", "Citas", "Resultados", "Mi cuenta"]
    }
}
public enum RegistrationRules {
    public static func errors(name: String, email: String, password: String, confirmation: String) -> [String] {
        var errors: [String] = []
        let size = name.trimmingCharacters(in: .whitespacesAndNewlines).count
        if !(2...120).contains(size) { errors.append("Escribe tu nombre completo.") }
        if email.range(of: #"^[^\s@]+@[^\s@]+\.[^\s@]+$"#, options: .regularExpression) == nil { errors.append("Ingresa un correo válido.") }
        if password.count < 8 || password.rangeOfCharacter(from: .uppercaseLetters) == nil || password.rangeOfCharacter(from: .lowercaseLetters) == nil || password.rangeOfCharacter(from: .decimalDigits) == nil || password.unicodeScalars.allSatisfy({ CharacterSet.alphanumerics.contains($0) }) { errors.append("Usa 8 caracteres, mayúscula, minúscula, número y símbolo.") }
        if password != confirmation { errors.append("Las contraseñas no coinciden.") }
        return errors
    }
}
