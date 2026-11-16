import Foundation

/// `LabAttachmentResponse` (T07b, S10): la foto o el PDF de un resultado externo. Con `stored` falso solo existe la
/// referencia (nombre, tipo, tamaño y huella); el archivo no está en el almacenamiento privado.
public struct LabAttachment: Decodable, Sendable, Identifiable, Equatable {
    public let id: String
    public let fileName: String
    /// `application/pdf`, `image/jpeg`, `image/png`, `image/heic` o `image/webp`.
    public let mimeType: String
    public let sizeBytes: Int
    public let stored: Bool
    public let note: String?
    public let uploadedAt: String
    public let uploadedByName: String?
}

/// Solo los adjuntos de `LabOrderDetailResponse` (`GET /laboratorio/ordenes/{id}`). Vacío para quien no ve valores y en
/// un servidor anterior sin el campo.
public struct LabOrderAttachments: Decodable, Sendable, Equatable {
    public let attachments: [LabAttachment]
    enum CodingKeys: String, CodingKey { case attachments }
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        attachments = try c.decodeIfPresent([LabAttachment].self, forKey: .attachments) ?? []
    }
}

/// `LabAttachmentLinkResponse` de `GET /laboratorio/adjuntos/{id}/enlace`: enlace firmado que deja de servir en
/// `expiresAt` (5 minutos). Se abre en el momento; nunca se guarda ni se comparte.
public struct LabAttachmentLink: Decodable, Sendable, Equatable {
    public let url: String
    public let expiresAt: String
    public let expiresInSeconds: Int
    public let fileName: String
    public let mimeType: String
    public let sizeBytes: Int
}
