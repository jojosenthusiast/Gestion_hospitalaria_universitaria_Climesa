import Foundation

/// Adjuntos de laboratorio en iOS (T07c, S10). Solo el médico los abre: pide un enlace firmado a la API en el momento
/// del toque y lo entrega al sistema. El paciente no recibe adjuntos; subir archivos queda en la web.
public enum LabAttachmentRules {
    /// El enlace firmado no es una dirección web que el sistema pueda abrir.
    public enum LinkError: Error, Equatable { case unopenable }

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
