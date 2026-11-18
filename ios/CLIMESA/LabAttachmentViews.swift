import SwiftUI
import PhotosUI
import CryptoKit
import UniformTypeIdentifiers

/// T07c (S10) · Informe externo de una orden completada, solo para el médico (`ExternalReport` de la web). Con archivo
/// guardado: «Ver archivo» pide un enlace firmado de 5 minutos (`GET /laboratorio/adjuntos/{id}/enlace`, auditado) y lo
/// entrega al sistema en el momento; el enlace no se guarda. Solo con la referencia: se dice, y quien puede revisar la
/// orden sube ahí el archivo pendiente (C2, Fase 2R).
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
                PartError(message: error, failure: loader.failure, retry: load)
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
                // The API lets the lab or a doctor who may review the order upload the missing file (same bytes as the reference).
                if account.can("laboratorio.revisar") || account.can("laboratorio.procesar") {
                    PendingFileUpload(attachmentId: file.id, onStored: load)
                }
            }
            if let message = errors[file.id] { PatientNotice(text: message, failure: true) }
        }
        .padding(.vertical, Spacing.s)
    }

    private func meta(_ file: LabAttachment) -> String {
        [LabAttachmentRules.kindLabel(file), LabAttachmentRules.sizeText(file.sizeBytes), ClimesaDates.short(file.uploadedAt), file.uploadedByName]
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

// MARK: - C2 · upload of an external result file

/// One file upload to `POST /laboratorio/adjuntos/{id}/archivo`, with its progress and its error in Spanish. Each
/// attachment keeps its own intent: a retry of the same bytes reuses the same `Idempotency-Key` (`Submission`).
@MainActor @Observable
final class FileUpload {
    private(set) var progress: Double = 0
    private(set) var uploading = false
    private(set) var error: String?
    private let submission = Submission()

    nonisolated init() {}

    /// True when the API stored the file.
    func send(_ file: LabExternalFile, attachmentId: String, account: AccountModel) async -> Bool {
        guard !uploading else { return false }
        uploading = true; error = nil; progress = 0
        defer { uploading = false }
        let ok = await submission.run(attachmentId, body: file.uploadIntent) { key in
            _ = try await account.client().upload(LabAttachmentRules.filePath(attachmentId), fileName: file.fileName, mimeType: file.mimeType, data: file.data, key: key, as: LabAttachmentStored.self) { value in
                // The delegate reports from URLSession's queue; the bar lives on the main actor.
                Task { @MainActor in self.progress = value }
            }
        }
        if ok { progress = 1 }
        else { error = submission.lastFailure.map { LabAttachmentRules.uploadMessage($0) } ?? submission.error ?? LabAttachmentRules.uploadFallback }
        return ok
    }
}

/// «Elegir PDF o foto» (Files) and «Elegir de Fotos» (photo library). The bytes are read once and kept with their
/// SHA-256, so the reference sent with the values and the uploaded file are the same.
struct ExternalFilePicker: View {
    @Binding var file: LabExternalFile?
    @Binding var problem: String?
    @State private var importing = false
    @State private var photo: PhotosPickerItem?
    @State private var reading = false
    @Environment(\.isEnabled) private var enabled

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.m) {
            if let file {
                HStack(alignment: .top, spacing: Spacing.m) {
                    Image(systemName: file.mimeType == "application/pdf" ? "doc.richtext" : "photo")
                        .foregroundStyle(Theme.primaryText).frame(width: 24).accessibilityHidden(true)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(verbatim: file.fileName).font(Typo.subheading).foregroundStyle(Theme.ink).lineLimit(2).truncationMode(.middle)
                        Text(verbatim: "\(file.mimeType == "application/pdf" ? "PDF" : "Foto") · \(LabAttachmentRules.sizeText(file.sizeBytes))")
                            .font(Typo.small).foregroundStyle(Theme.muted)
                    }
                }
                .accessibilityElement(children: .combine)
            }
            if enabled {
                ClimesaButton(title: L.text(file == nil ? "results.externalLoad.pickFile" : "results.externalLoad.changeFile"), kind: .secondary, loading: reading) { importing = true }
                PhotosPicker(selection: $photo, matching: .images) {
                    Label { Text("results.externalLoad.pickPhoto") } icon: { Image(systemName: "photo.on.rectangle") }
                }
                .buttonStyle(ClimesaButtonStyle(kind: .secondary))
                .disabled(reading)
            }
        }
        .fileImporter(isPresented: $importing, allowedContentTypes: [.pdf, .jpeg, .png, .heic, .webP], allowsMultipleSelection: false) { result in
            pick(result)
        }
        .onChange(of: photo) { _, item in
            guard let item else { return }
            Task { await load(item) }
        }
    }

    private func pick(_ result: Result<[URL], Error>) {
        guard case let .success(urls) = result, let url = urls.first else {
            if case .failure = result { problem = LabAttachmentRules.unreadable }
            return
        }
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        do {
            if let size = try url.resourceValues(forKeys: [.fileSizeKey]).fileSize, size > LabAttachmentRules.maxBytes {
                problem = LabAttachmentRules.tooLarge
                return
            }
            accept(try Data(contentsOf: url), name: url.lastPathComponent)
        } catch {
            problem = LabAttachmentRules.unreadable
        }
    }

    private func load(_ item: PhotosPickerItem) async {
        reading = true
        defer { reading = false; photo = nil }
        do {
            guard let data = try await item.loadTransferable(type: Data.self) else { problem = LabAttachmentRules.unreadable; return }
            accept(data, name: "")
        } catch is CancellationError {
        } catch {
            problem = LabAttachmentRules.unreadable
        }
    }

    /// Size first (no hashing of a file that is refused anyway), then the type from the bytes, as the API checks them.
    private func accept(_ data: Data, name: String) {
        if data.count > LabAttachmentRules.maxBytes { problem = LabAttachmentRules.tooLarge; return }
        let picked = LabExternalFile.make(data: data, fileName: name, sha256: Self.sha256(data))
        problem = LabExternalRules.attachmentError(picked)
        if problem == nil { file = picked }
    }

    static func sha256(_ data: Data) -> String {
        SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
    }
}

/// Upload progress in place: a bar with the percentage, or a spinner while the values are saved.
struct UploadProgressRow: View {
    /// Nil while there is nothing to measure yet (the values are being saved).
    let progress: Double?

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.xs) {
            if let progress {
                ProgressView(value: progress).tint(Theme.primary)
                Text(verbatim: String(format: L.text("results.externalLoad.uploading"), Int((progress * 100).rounded())))
                    .font(Typo.small).monospacedDigit().foregroundStyle(Theme.muted)
            } else {
                HStack(spacing: Spacing.s) {
                    ProgressView().tint(Theme.primary)
                    Text("results.externalLoad.saving").font(Typo.small).foregroundStyle(Theme.muted)
                }
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.updatesFrequently)
    }
}

/// «Archivo pendiente»: a saved reference without its file gets the file here, with progress and «Reintentar».
private struct PendingFileUpload: View {
    let attachmentId: String
    let onStored: () async -> Void
    @EnvironmentObject private var account: AccountModel
    @State private var file: LabExternalFile?
    @State private var problem: String?
    @State private var upload = FileUpload()

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.s) {
            ExternalFilePicker(file: $file, problem: $problem).disabled(upload.uploading)
            if upload.uploading { UploadProgressRow(progress: upload.progress) }
            if let message = problem ?? upload.error { PatientNotice(text: message, failure: true) }
            if file != nil {
                ClimesaButton(title: L.text(upload.error == nil ? "lab.attachments.upload" : "results.externalLoad.retry"), loading: upload.uploading) {
                    Task { await send() }
                }
            }
        }
    }

    private func send() async {
        guard let file else { return }
        problem = nil
        if await upload.send(file, attachmentId: attachmentId, account: account) { await onStored() }
    }
}

/// C2 · «Cargar resultado externo» (S10): the photo or PDF of the report and the key value of every exam of the order.
/// The values and the file reference go first; then the file, with its progress in place. If the upload fails the
/// values stay saved, the screen says «Archivo pendiente» and «Reintentar» uploads the same bytes under the same key.
struct ExternalResultSheet: View {
    let order: LabOrder
    let reload: () async -> Void
    let onDone: (String) -> Void
    @EnvironmentObject private var account: AccountModel
    @Environment(\.dismiss) private var dismiss
    @State private var file: LabExternalFile?
    @State private var values: [String: String] = [:]
    @State private var note = ""
    @State private var problem: String?
    @State private var flow = ExternalResultFlow()
    @State private var valuesSubmission = Submission()
    @State private var upload = FileUpload()

    var body: some View {
        NavigationStack {
            ScreenFrame(title: "results.externalLoad.title", onClose: { if !flow.busy { dismiss() } }) {
                if let place = order.externalPlace, !place.isEmpty {
                    Text(verbatim: String(format: L.text("results.externalLoad.place"), place)).font(Typo.small).foregroundStyle(Theme.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
                SectionCard(title: L.text("results.externalLoad.file")) {
                    ExternalFilePicker(file: $file, problem: $problem).disabled(!flow.canEdit)
                }
                SectionCard(title: L.text("results.externalLoad.values")) {
                    ForEach(order.items) { item in
                        FormField(label: label(item), text: binding(item))
                            .keyboardType(item.numeric ? .decimalPad : .default)
                    }
                }
                .disabled(!flow.canEdit)
                VStack(alignment: .leading, spacing: Spacing.xs) {
                    MedicoTextArea(label: L.text("results.externalLoad.note"), text: $note, error: valuesSubmission.fieldErrors["note"], lines: 2...4)
                    CharacterCounter(count: note.trimmingCharacters(in: .whitespacesAndNewlines).count, range: 0...LabExternalRules.noteMaximum)
                }
                .disabled(!flow.canEdit)
                if let problem { PatientNotice(text: problem, failure: true) }
                status
                ClimesaButton(title: L.text(flow.filePending ? "results.externalLoad.retry" : "results.externalLoad.save"), loading: flow.busy) {
                    Task { await save() }
                }
                .disabled(note.trimmingCharacters(in: .whitespacesAndNewlines).count > LabExternalRules.noteMaximum)
            }
        }
        .interactiveDismissDisabled(flow.busy)
    }

    @ViewBuilder private var status: some View {
        switch flow.status {
        case .saving:
            UploadProgressRow(progress: nil)
        case .uploading:
            UploadProgressRow(progress: upload.progress)
        case let .failed(message):
            if flow.filePending {
                // The values are saved; only the file is missing.
                VStack(alignment: .leading, spacing: Spacing.xs) {
                    Text("results.externalLoad.filePending").font(Typo.label).foregroundStyle(Theme.danger)
                    Text(verbatim: message).font(Typo.small).foregroundStyle(Theme.ink).fixedSize(horizontal: false, vertical: true)
                }
                .padding(Spacing.l).frame(maxWidth: .infinity, alignment: .leading)
                .background(Theme.dangerSoft, in: RoundedRectangle(cornerRadius: Radius.card))
                .overlay(RoundedRectangle(cornerRadius: Radius.card).stroke(Theme.danger, lineWidth: 1))
                .accessibilityElement(children: .combine)
            } else if valuesSubmission.error != nil {
                WriteNotice(submission: valuesSubmission, reload: reload)
            } else {
                PatientNotice(text: message, failure: true)
            }
        case .editing, .done:
            EmptyView()
        }
    }

    private func label(_ item: LabOrderItem) -> String {
        guard let unit = item.unit, !unit.isEmpty else { return item.name }
        return "\(item.name) (\(unit))"
    }

    private func binding(_ item: LabOrderItem) -> Binding<String> {
        Binding(get: { values[item.id] ?? "" }, set: { values[item.id] = $0 })
    }

    private func save() async {
        problem = nil
        switch flow.next {
        case .saveValues: await saveValues()
        case let .upload(attachmentId): await sendFile(attachmentId)
        case .finished: finish()
        }
    }

    private func saveValues() async {
        problem = LabExternalRules.attachmentError(file) ?? LabExternalRules.valuesError(items: order.items, values: values)
        guard problem == nil, let file else { return }
        let body = LabExternalRules.resultBody(version: order.version, file: file, items: order.items, values: values, note: note)
        flow.begin()
        var saved: LabExternalResultSaved?
        let ok = await valuesSubmission.run(order.id, body: body) { key in
            saved = try await account.client().send("POST", LabExternalRules.resultPath(order.id), body: body, key: key, as: LabExternalResultSaved.self)
        }
        guard ok, let saved else {
            flow.fail(valuesSubmission.error ?? L.text("results.externalLoad.failed"))
            return
        }
        flow.valuesSaved(attachmentId: saved.attachmentId)
        await reload()
        if case let .upload(attachmentId) = flow.next { await sendFile(attachmentId) } else { finish() }
    }

    private func sendFile(_ attachmentId: String) async {
        guard let file else { return }
        flow.begin()
        if await upload.send(file, attachmentId: attachmentId, account: account) {
            flow.fileStored()
            await reload()
            finish()
        } else {
            flow.fail(upload.error ?? LabAttachmentRules.uploadFallback)
        }
    }

    private func finish() {
        onDone(L.text(flow.status == .done(withFile: true) ? "results.externalLoad.done" : "results.externalLoad.doneNoFile"))
        dismiss()
    }
}
