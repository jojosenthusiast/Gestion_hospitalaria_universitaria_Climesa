import SwiftUI

/// I21 · Indicar hospitalización desde la consulta abierta (MOV-01). El formulario es corto: categoría, aislamiento y
/// motivo con contador. El origen (esta consulta) y el paciente ya los sabe la pantalla; el médico tratante no se
/// envía porque la API usa a quien indica. Los errores de la API aparecen junto al campo, en español.
/// Fase 2R: whether the patient already has an admission comes from the server (`GET /admisiones`), not from this
/// screen's memory, so after leaving and coming back an indication already made shows as done and cannot be sent twice.
struct AdmissionIndicationCard: View {
    let consultationId: String
    let patientId: String
    @EnvironmentObject private var account: AccountModel
    @Environment(LiveViewModel.self) private var live
    @State private var submission = Submission()
    @State private var open = false
    @State private var category: RoomCategory = .semiprivada
    @State private var isolation = false
    @State private var isolationType: IsolationKind?
    @State private var unstable = false
    @State private var postSurgical = false
    @State private var motive = ""
    @State private var motiveError: String?
    @State private var done: AdmissionCommandResult?
    /// The patient's active admission on the server; nil before the first read. A failed read keeps its message.
    @State private var existing: Part<Admission?>?

    var body: some View {
        SectionCard(title: L.text("admission.title")) {
            if let done {
                HStack(spacing: Spacing.s) {
                    MedicoTag(done.state.rawValue, label: done.state.label)
                }
                Text("admission.done").font(Typo.body).foregroundStyle(Theme.ink)
            } else if let admission = existing?.value ?? nil {
                HStack(spacing: Spacing.s) {
                    MedicoTag(admission.state.rawValue, label: admission.state.label)
                }
                Text(verbatim: L.text(AdmissionIndicationRules.fromThisConsultation(admission, consultationId: consultationId) ? "admission.done" : "admission.active"))
                    .font(Typo.body).foregroundStyle(Theme.ink).fixedSize(horizontal: false, vertical: true)
            } else if existing == nil && account.can("admision.ver") {
                Skeleton(rows: 1)
            } else {
                // A failed read is not "no admission": it says so, and the API still refuses a second active admission.
                if let message = existing?.error { PartError(message: message, retry: loadExisting) }
                if !open {
                    // I-42: the explanation shows once, with the form.
                    ClimesaButton(title: L.text("admission.submit"), kind: .secondary) { open = true }
                } else {
                    form
                }
            }
        }
        .task(id: live.snapshot.version(.admissions)) { await loadExisting() }
    }

    @ViewBuilder private var form: some View {
        Text("admission.intro").font(Typo.small).foregroundStyle(Theme.muted)
        VStack(alignment: .leading, spacing: Spacing.s) {
            Text("admission.category").font(Typo.label).foregroundStyle(Theme.ink)
            Picker("admission.category", selection: $category) {
                Text(verbatim: RoomCategory.semiprivada.label).tag(RoomCategory.semiprivada)
                Text(verbatim: RoomCategory.vip.label).tag(RoomCategory.vip)
            }.pickerStyle(.segmented)
            FieldError(text: submission.fieldErrors["requestedCategory"])
        }
        Toggle("admission.isolation", isOn: $isolation).font(Typo.body).tint(Theme.primary).frame(minHeight: Spacing.control)
        // Row 10: same fields as Android: the isolation type (with isolation on), unstable and post-surgical.
        if isolation {
            Picker(selection: $isolationType) {
                Text(verbatim: "Sin especificar").tag(IsolationKind?.none)
                ForEach(IsolationKind.allCases, id: \.self) { kind in Text(verbatim: kind.label).tag(Optional(kind)) }
            } label: { Text(verbatim: "Tipo de aislamiento").font(Typo.body) }
            .frame(minHeight: Spacing.control)
        }
        Toggle(isOn: $unstable) { Text(verbatim: "Paciente inestable").font(Typo.body) }.tint(Theme.primary).frame(minHeight: Spacing.control)
        Toggle(isOn: $postSurgical) { Text(verbatim: "Posquirúrgico").font(Typo.body) }.tint(Theme.primary).frame(minHeight: Spacing.control)
        VStack(alignment: .leading, spacing: Spacing.xs) {
            MedicoTextArea(label: L.text("admission.reason"), text: $motive, error: motiveError ?? submission.fieldErrors["motive"], lines: 3...6)
            CharacterCounter(count: AdmissionRules.motiveCount(motive), range: AdmissionRules.motiveRange)
        }
        .onChange(of: motive) { _, value in
            // El error se corrige mientras escribe; no aparece antes del primer intento de envío.
            if motiveError != nil { motiveError = AdmissionRules.motiveError(value) }
        }
        if submission.fieldErrors["motive"] == nil && submission.fieldErrors["requestedCategory"] == nil {
            SubmissionNotice(submission: submission)
        }
        ClimesaButton(title: L.text("admission.submit"), loading: submission.busy) { Task { await submit() } }
        ClimesaButton(title: L.text("admission.later"), kind: .secondary) { open = false; motiveError = nil }
            .disabled(submission.busy)
    }

    /// Without `admision.ver` there is nothing to read: the form behaves as before and the API keeps the rule.
    private func loadExisting() async {
        guard account.can("admision.ver") else { return }
        do {
            let rows = try await account.client().get("/admisiones", as: [Admission].self)
            existing = .loaded(AdmissionIndicationRules.existing(rows, patientId: patientId, consultationId: consultationId))
        } catch is CancellationError {
        } catch {
            existing = .failed(error.userMessage)
        }
    }

    private func submit() async {
        motiveError = AdmissionRules.motiveError(motive)
        guard motiveError == nil else { return }
        let body = AdmissionBody(patientId: patientId, consultationId: consultationId, category: category, isolation: isolation, motive: motive,
                                 isolationType: isolationType, unstable: unstable, postSurgical: postSurgical)
        var result: AdmissionCommandResult?
        let ok = await submission.run(consultationId, body: body) { key in
            result = try await account.client().send("POST", "/admisiones/indicaciones", body: body, key: key, as: AdmissionCommandResult.self)
        }
        if ok, let result { done = result }
        // A refusal (for example "El paciente ya tiene una admisión activa.") stays on screen; the read shows what exists.
        if !ok { await loadExisting() }
    }
}
