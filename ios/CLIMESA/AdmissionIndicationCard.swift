import SwiftUI

/// I21 · Indicar hospitalización desde la consulta abierta (MOV-01). El formulario es corto: categoría, aislamiento y
/// motivo con contador. El origen (esta consulta), el paciente y el médico tratante (quien indica) ya los sabe la
/// pantalla y no se piden. Los errores de la API aparecen junto al campo, en español.
struct AdmissionIndicationCard: View {
    let consultationId: String
    let patientId: String
    let staffId: String
    @EnvironmentObject private var account: AccountModel
    @State private var submission = Submission()
    @State private var open = false
    @State private var category: RoomCategory = .semiprivada
    @State private var isolation = false
    @State private var motive = ""
    @State private var motiveError: String?
    @State private var done: AdmissionCommandResult?

    var body: some View {
        SectionCard(title: L.text("admission.title")) {
            if let done {
                HStack(spacing: Spacing.s) {
                    MedicoTag(done.state.rawValue, label: done.state.label)
                }
                Text("admission.done").font(Typo.body).foregroundStyle(Theme.ink)
            } else if !open {
                Text("admission.intro").font(Typo.small).foregroundStyle(Theme.muted)
                ClimesaButton(title: L.text("admission.submit"), kind: .secondary) { open = true }
            } else {
                form
            }
        }
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

    private func submit() async {
        motiveError = AdmissionRules.motiveError(motive)
        guard motiveError == nil else { return }
        let body = AdmissionBody(patientId: patientId, consultationId: consultationId, category: category, isolation: isolation,
                                 attendingDoctorId: staffId, motive: motive)
        var result: AdmissionCommandResult?
        let ok = await submission.run(consultationId, body: body) { key in
            result = try await account.client().send("POST", "/admisiones/indicaciones", body: body, key: key, as: AdmissionCommandResult.self)
        }
        if ok, let result { done = result }
    }
}
