import Foundation

/// Borradores locales de formularios largos (consulta, signos...) que sobreviven a salir de la pantalla o a que el
/// sistema cierre la app. Cada borrador vive en `<base>/<usuario>/<clave>.json`: nunca se lee el de otra cuenta y
/// `clearAll()` los borra todos al cerrar sesión. Ningún método lanza errores: si el disco falla, `save` devuelve `false`.
public struct DraftStore: Sendable {
    public let baseURL: URL

    public init(baseURL: URL) { self.baseURL = baseURL }

    /// Almacén de la app: `Application Support/borradores`, fuera de los documentos visibles del usuario.
    public static let shared: DraftStore = {
        let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? FileManager.default.temporaryDirectory
        return DraftStore(baseURL: support.appendingPathComponent("borradores", isDirectory: true))
    }()

    @discardableResult
    public func save<T: Encodable>(_ value: T, user: String, key: String) -> Bool {
        guard let file = fileURL(user: user, key: key) else { return false }
        do {
            try FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
            let data = try JSONEncoder().encode(value)
            #if os(iOS)
            try data.write(to: file, options: [.atomic, .completeFileProtectionUnlessOpen])
            #else
            try data.write(to: file, options: [.atomic])
            #endif
            return true
        } catch {
            return false
        }
    }

    public func load<T: Decodable>(_ type: T.Type, user: String, key: String) -> T? {
        guard let file = fileURL(user: user, key: key), let data = try? Data(contentsOf: file) else { return nil }
        return try? JSONDecoder().decode(T.self, from: data)
    }

    public func clear(user: String, key: String) {
        guard let file = fileURL(user: user, key: key) else { return }
        try? FileManager.default.removeItem(at: file)
    }

    /// Borra los borradores de todas las cuentas (cierre de sesión).
    public func clearAll() {
        try? FileManager.default.removeItem(at: baseURL)
    }

    /// Solo letras, números, `-` y `_`: un id con `/` o `..` no puede salir de la carpeta del usuario.
    static func sanitize(_ text: String) -> String {
        let allowed = Set("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_")
        return String(text.map { allowed.contains($0) ? $0 : "_" })
    }

    func fileURL(user: String, key: String) -> URL? {
        let folder = Self.sanitize(user), name = Self.sanitize(key)
        guard !folder.isEmpty, !name.isEmpty else { return nil }
        return baseURL.appendingPathComponent(folder, isDirectory: true).appendingPathComponent(name + ".json")
    }
}
