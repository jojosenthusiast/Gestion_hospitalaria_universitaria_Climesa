import Foundation

/// Adjuntos de laboratorio en iOS (T07c, S10). Solo el médico los abre: pide un enlace firmado a la API en el momento
/// del toque y lo entrega al sistema. El paciente no recibe adjuntos. C2 (Fase 2R): el médico también sube la foto o
/// el PDF de un resultado externo, por la API (`POST /laboratorio/adjuntos/{id}/archivo`, campo `archivo`).
public enum LabAttachmentRules {
    /// El enlace firmado no es una dirección web que el sistema pueda abrir.
    public enum LinkError: Error, Equatable { case unopenable }

    /// Multipart field of the upload, as the API reads it (`readSingleFile(r, 'archivo', ...)`).
    public static let uploadField = "archivo"
    /// `MAX_ATTACHMENT_BYTES` of the API: 10 MiB.
    public static let maxBytes = 10 * 1024 * 1024
    /// `ATTACHMENT_TYPES` of the API.
    public static let allowedTypes: Set<String> = ["application/pdf", "image/jpeg", "image/png", "image/heic", "image/webp"]
    static let heifBrands: Set<String> = ["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"]
    public static let tooLarge = "El archivo pasa de 10 MB; toma una foto más liviana o comprime el PDF."
    public static let unreadable = "No se pudo leer el archivo en este equipo. Elígelo de nuevo."
    public static let uploadFallback = "No se pudo subir el archivo. Vuelve a intentar."

    public static func filePath(_ attachmentId: String) -> String { "/laboratorio/adjuntos/\(attachmentId)/archivo" }

    /// The type read from the first bytes, the same check as the API (`detectAttachmentType`); nil for anything else.
    public static func detectType(_ data: Data) -> String? {
        let bytes = [UInt8](data.prefix(12))
        func ascii(_ range: Range<Int>) -> String? {
            guard bytes.count >= range.upperBound else { return nil }
            return String(decoding: bytes[range], as: UTF8.self)
        }
        if ascii(0..<5) == "%PDF-" { return "application/pdf" }
        if bytes.count >= 3, bytes[0] == 0xFF, bytes[1] == 0xD8, bytes[2] == 0xFF { return "image/jpeg" }
        if bytes.count >= 8, Array(bytes[0..<8]) == [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A] { return "image/png" }
        if ascii(0..<4) == "RIFF", ascii(8..<12) == "WEBP" { return "image/webp" }
        if ascii(4..<8) == "ftyp", let brand = ascii(8..<12), heifBrands.contains(brand) { return "image/heic" }
        return nil
    }

    /// File name for a type when the picker gives none (a photo from the library).
    public static func defaultFileName(_ mimeType: String) -> String {
        switch mimeType {
        case "application/pdf": return "informe.pdf"
        case "image/png": return "foto.png"
        case "image/heic": return "foto.heic"
        case "image/webp": return "foto.webp"
        default: return "foto.jpg"
        }
    }

    public static func multipartContentType(boundary: String) -> String { "multipart/form-data; boundary=\(boundary)" }

    /// multipart/form-data with one file part in `archivo`. Quotes, backslashes and line breaks in the name would break
    /// the part header, so they become `_` (same as Android `Multipart.body`).
    public static func multipartBody(boundary: String, fileName: String, mimeType: String, data: Data) -> Data {
        // Unicode scalars, not Characters: "\r\n" is one Character and must become two `_`, as on Android.
        let unsafe: Set<Unicode.Scalar> = ["\"", "\\", "\r", "\n"]
        var scalars = String.UnicodeScalarView()
        for scalar in fileName.unicodeScalars { scalars.append(unsafe.contains(scalar) ? "_" : scalar) }
        let safeName = String(scalars)
        var body = Data()
        body.append(Data("--\(boundary)\r\nContent-Disposition: form-data; name=\"\(uploadField)\"; filename=\"\(safeName)\"\r\nContent-Type: \(mimeType)\r\n\r\n".utf8))
        body.append(data)
        body.append(Data("\r\n--\(boundary)--\r\n".utf8))
        return body
    }

    /// Spanish text for a failed upload; the API code is never shown raw.
    public static func uploadMessage(_ error: Error) -> String {
        guard let failure = error as? APIFailure else { return error.userMessage }
        switch failure.code {
        case "adjunto_tipo_invalido": return "El archivo no es un PDF ni una foto JPG, PNG, HEIC o WEBP."
        case "adjunto_muy_grande": return tooLarge
        case "adjunto_ya_almacenado": return "Este adjunto ya tiene su archivo guardado; no se reemplaza."
        case "adjunto_no_coincide": return "El archivo no coincide con el que se adjuntó al resultado; sube el mismo archivo."
        default: return failure.message
        }
    }

    /// «PDF» o «Foto», como la web.
    public static func kindLabel(_ attachment: LabAttachment) -> String {
        attachment.mimeType == "application/pdf" ? "PDF" : "Foto"
    }

    /// Tamaño legible con coma decimal: «900 B», «1,5 kB», «2,5 MB».
    public static func sizeText(_ bytes: Int) -> String {
        func decimal(_ value: Double) -> String {
            value.rounded() == value ? String(Int(value)) : String(format: "%.1f", value).replacingOccurrences(of: ".", with: ",")
        }
        if bytes < 1024 { return "\(bytes) B" }
        if bytes < 1024 * 1024 { return "\(decimal(Double(bytes) / 1024)) kB" }
        return "\(decimal(Double(bytes) / 1024 / 1024)) MB"
    }

    /// URL del enlace firmado solo si es http(s); cualquier otro esquema no se abre.
    public static func openableURL(_ link: LabAttachmentLink) -> URL? {
        guard let url = URL(string: link.url), let scheme = url.scheme?.lowercased(), scheme == "https" || scheme == "http", url.host != nil else { return nil }
        return url
    }

    /// Mensaje en español al pedir o abrir el enlace; nunca el código crudo.
    public static func linkMessage(_ error: Error) -> String {
        if let error = error as? LinkError, error == .unopenable { return "No se pudo abrir el archivo en este equipo. Vuelve a intentar." }
        guard let failure = error as? APIFailure else { return error.userMessage }
        if failure.code == "adjunto_sin_archivo" { return "Solo hay la referencia del archivo: no se guardó en el sistema." }
        if failure.status == 404 { return "No encontramos este archivo. Vuelve a cargar la orden." }
        if failure.isForbidden { return "Tu cuenta no puede abrir este archivo." }
        return failure.message
    }
}
