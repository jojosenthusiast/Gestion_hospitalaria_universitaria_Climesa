import SwiftUI

/// T07c (S10) · Informe externo de una orden completada, solo para el médico (`ExternalReport` de la web). Con archivo
/// guardado: «Ver archivo» pide un enlace firmado de 5 minutos (`GET /laboratorio/adjuntos/{id}/enlace`, auditado) y lo
/// entrega al sistema en el momento; el enlace no se guarda. Solo con la referencia: se dice. Subir queda en la web.
struct LabAttachmentsSection: View {
    let order: LabOrder
    @EnvironmentObject private var account: AccountModel
    @Environment(\.openURL) private var openURL
    @State private var loader = Loader<LabOrderAttachments>()
    /// One flag spans the whole action (ask for the link, then open it), so a double tap cannot ask twice.
    @State private var opening: String?
    @State private var errors: [String: String] = [:]

    var body: some View {
        SectionCard(title: L.text("lab.attachments.title")) {
            if let files = loader.value?.attachments {
                if files.isEmpty {
                    Text("lab.attachments.none").font(Typo.small).foregroundStyle(Theme.muted)
                } else {
                    ForEach(Array(files.enumerated()), id: \.element.id) { index, file in
                        if index > 0 { Divider().overlay(Theme.line) }
                        row(file)
                    }
                    Text("lab.attachments.privacy").font(Typo.caption).foregroundStyle(Theme.muted)
                }
            } else if let error = loader.error {
                PartError(message: error, retry: load)
            } else {
                Skeleton(rows: 1)
            }
        }
        // `.task(id:)` cancels the previous read when the order changes or the screen goes away.
        .task(id: "\(order.id)#\(order.version)") { await load() }
    }

    @ViewBuilder private func row(_ file: LabAttachment) -> some View {
        VStack(alignment: .leading, spacing: Spacing.s) {
            HStack(alignment: .top, spacing: Spacing.m) {
                Image(systemName: file.mimeType == "application/pdf" ? "doc.richtext" : "photo")
                    .foregroundStyle(Theme.primaryText).frame(width: 24).accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 2) {
                    Text(verbatim: file.fileName).font(Typo.subheading).foregroundStyle(Theme.ink).lineLimit(2).truncationMode(.middle)
                    Text(verbatim: meta(file)).font(Typo.small).foregroundStyle(Theme.muted).fixedSize(horizontal: false, vertical: true)
                    if let note = file.note, !note.isEmpty {
                        Text(verbatim: note).font(Typo.small).foregroundStyle(Theme.ink).fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
            if file.stored {
                ClimesaButton(title: L.text(opening == file.id ? "lab.attachments.opening" : "lab.attachments.open"), kind: .secondary, loading: opening == file.id) {
                    Task { await open(file) }
                }
                .disabled(opening != nil)
                .accessibilityLabel(Text(verbatim: String(format: L.text("lab.attachments.open.a11y"), file.fileName)))
            } else {
                Text("lab.attachments.referenceOnly").font(Typo.small).foregroundStyle(Theme.muted).fixedSize(horizontal: false, vertical: true)
            }
            if let message = errors[file.id] { PatientNotice(text: message, failure: true) }
        }
        .padding(.vertical, Spacing.s)
    }

    private func meta(_ file: LabAttachment) -> String {
        [LabAttachmentRules.kindLabel(file), LabAttachmentRules.sizeText(file.sizeBytes), ClimesaDates.display(file.uploadedAt), file.uploadedByName]
            .compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")
    }

    private func load() async {
        await loader.load { try await account.client().get("/laboratorio/ordenes/\(order.id)", as: LabOrderAttachments.self) }
    }

    /// Asks for a fresh signed link on every tap and hands it to the system; the link is never stored or shown.
    private func open(_ file: LabAttachment) async {
        guard opening == nil else { return }
        opening = file.id
        errors[file.id] = nil
        defer { opening = nil }
        do {
            let link = try await account.client().get("/laboratorio/adjuntos/\(file.id)/enlace", as: LabAttachmentLink.self)
            guard let url = LabAttachmentRules.openableURL(link) else { throw LabAttachmentRules.LinkError.unopenable }
            let accepted = await withCheckedContinuation { (continuation: CheckedContinuation<Bool, Never>) in
                openURL(url) { continuation.resume(returning: $0) }
            }
            if !accepted { throw LabAttachmentRules.LinkError.unopenable }
        } catch is CancellationError {
        } catch {
            errors[file.id] = LabAttachmentRules.linkMessage(error)
        }
    }
}
