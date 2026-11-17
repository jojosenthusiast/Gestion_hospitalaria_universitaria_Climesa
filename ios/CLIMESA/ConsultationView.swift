import SwiftUI

/// Desde dónde se abre la consulta: una cita de la agenda o un número llamado de la fila.
enum ConsultationOrigin {
    case appointment(AgendaEntry)
    case ticket(QueueTicket)
    /// m-22: una consulta propia abierta de cualquier día (`GET /consultas/sin-firmar`).
    case resume(UnsignedConsultation)
}

private struct PrescriptionDraft: Identifiable {
    let id = UUID()
    var medication = ""
    var dose = ""
    var route = ""
    var frequency = ""
    var duration = ""
    var instructions = ""
    var body: PrescriptionItemBody {
        let note = instructions.trimmingCharacters(in: .whitespacesAndNewlines)
        return PrescriptionItemBody(medication: medication.trimmingCharacters(in: .whitespaces), dose: dose.trimmingCharacters(in: .whitespaces),
                                    route: route.trimmingCharacters(in: .whitespaces), frequency: frequency.trimmingCharacters(in: .whitespaces),
                                    duration: duration.trimmingCharacters(in: .whitespaces), instructions: note.isEmpty ? nil : note)
    }
}

/// Borrador local de la consulta (lo escrito y aún no guardado en la API), por cuenta y consulta en `DraftStore`.
/// Sobrevive a salir de la pantalla o a que el sistema cierre la app; se borra al firmar o al cerrar sesión.
struct ConsultationDraft: Codable, Equatable {
    struct Line: Codable, Equatable {
        var medication = "", dose = "", route = "", frequency = "", duration = "", instructions = ""
        var isBlank: Bool { [medication, dose, route, frequency, duration, instructions].allSatisfy { $0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty } }
    }
    var reason = ""
    var exam = ""
    var plan = ""
    var code = ""
    var note = ""
    var principal = true
    var lines: [Line] = []

    /// Hay algo que la API todavía no tiene: notas distintas de lo guardado, o diagnóstico o receta a medio escribir.
    func differs(from saved: ConsultationDraft) -> Bool {
        reason != saved.reason || exam != saved.exam || plan != saved.plan
            || !code.trimmingCharacters(in: .whitespaces).isEmpty || !note.trimmingCharacters(in: .whitespaces).isEmpty
            || lines.contains { !$0.isBlank }
    }
}

/// I21 · Consulta: signos (de asistente), motivo, examen, diagnósticos CIE-10, receta, órdenes de laboratorio,
/// indicación de hospitalización (AdmissionIndicationCard); guardar y firmar. La API decide las transiciones y exige la versión vigente.
struct ConsultationView: View {
    let origin: ConsultationOrigin
    let profile: AccessProfile
    @EnvironmentObject private var account: AccountModel
    @Environment(LiveViewModel.self) private var live
    @State private var consultationId: String?
    @State private var detail = Loader<ConsultationDetail>()
    @State private var catalog = Loader<[LabExam]>()
    @State private var starting = Submission()
    @State private var saving = Submission()
    @State private var diagnosing = Submission()
    @State private var prescribing = Submission()
    @State private var ordering = Submission()
    @State private var signing = Submission()
    /// S9: after signing, who goes next in the consultation's area (`nextProposal`), with the call one tap away.
    @State private var handoff: QueueNextProposal?
    @State private var handoffCall = Submission()
    /// S9: the number called from the handoff, undoable from here like on Mi día ("Llamaste CON 4 · Deshacer").
    @State private var lastCall: (id: String, version: Int, code: String)?
    @State private var undoing = Submission()
    @State private var prefilledVersion: Int?
    @State private var reason = ""
    @State private var exam = ""
    @State private var plan = ""
    @State private var draftErrors: [String: String] = [:]
    /// Fase 2R: the diagnosis comes from the CIE-10 search (`GET /consultas/cie10`), never a typed code.
    @State private var cieQuery = ""
    @State private var cieResults = Loader<[Cie10Entry]>()
    @State private var cieChoice: Cie10Entry?
    @State private var principal = true
    @State private var note = ""
    @State private var codeError: String?
    @State private var lines: [PrescriptionDraft] = [PrescriptionDraft()]
    @State private var lineError: String?
    @State private var selectedExams: Set<String> = []
    @State private var priority: LabPriority = .rutina
    /// Notas tal como están en la API; el borrador local solo se guarda si lo escrito difiere.
    @State private var savedNotes = ConsultationDraft()
    @State private var draftRecovered = false
    @State private var draftSaved = false
    @State private var draftFailed = false
    /// S13 / §4.7: signing is clinical and irreversible, so it asks first with a summary of what happens.
    @State private var confirmingSign = false
    /// The whole save → reload → sign sequence, so «Firmar» stays disabled until it ends (no double signature).
    @State private var signFlow = false
    /// The notes save that runs before signing failed: its error shows next to «Firmar» too.
    @State private var signSaveFailed = false
    /// I-19: one step at a time, with the step indicator on top (same steps as web `STEPS`).
    @State private var step: ConsultationStep = .consulta
    /// I-18: «Atender» opens the consultation already started; the start runs once when the screen opens.
    @State private var autoStartTried = false
    @State private var labQuery = ""
    /// Descriptions returned when a diagnosis is added (the detail response only carries the code).
    @State private var diagnosisNames: [String: String] = [:]
    /// B-6: this consultation's lab orders, read from the doctor's order list (the detail does not carry them). A failed
    /// read is never "no orders": ordering waits until the list is known, so an exam is not ordered twice.
    @State private var labOrders: Part<[LabOrder]>?
    /// Exams ordered from this device in this consultation (stored per account), so a repeat is blocked at once.
    @State private var orderedHere: Set<String> = []

    init(origin: ConsultationOrigin, profile: AccessProfile) {
        self.origin = origin
        self.profile = profile
        // Una consulta propia ya iniciada (desde la agenda o desde este número de fila) se retoma sin volver a iniciarla.
        switch origin {
        case let .appointment(entry): _consultationId = State(initialValue: entry.consultationId)
        case let .ticket(ticket): _consultationId = State(initialValue: ticket.consultationId)
        case let .resume(open): _consultationId = State(initialValue: open.id)
        }
    }

    private var patientName: String {
        switch origin {
        case let .appointment(entry): return entry.patientName ?? L.text("day.patient.unknown")
        case let .ticket(ticket): return ticket.patientName ?? String(format: L.text("consultation.ticket"), ticket.number)
        case let .resume(open): return open.patientName ?? L.text("day.patient.unknown")
        }
    }

    var body: some View {
        ScreenFrame(title: "consultation.title") {
            Text(verbatim: patientName).font(Typo.heading).foregroundStyle(Theme.ink)
            if consultationId == nil {
                WriteNotice(submission: starting, reload: loadDetail)
                if starting.busy || !autoStartTried { Skeleton(rows: 3) }
                else if profile.hasPermission("consulta.iniciar") {
                    // Only after the automatic start failed: retry by hand.
                    ClimesaButton(title: L.text("consultation.start"), loading: starting.busy) { Task { await start() } }
                }
            } else {
                LoadState(loader: detail, retry: loadDetail) { value in
                    editor(value)
                }
            }
        }
        .task { await autoStart() }
        .task(id: "\(consultationId ?? "-")|\(live.snapshot.version(.consultations))") { await loadDetail() }
        .onChange(of: currentDraft) { _, _ in persistDraft() }
    }

    // MARK: - Borrador local

    private var draftKey: String? { consultationId.map { "consulta-\($0)" } }

    private var currentDraft: ConsultationDraft {
        ConsultationDraft(reason: reason, exam: exam, plan: plan, code: cieChoice?.code ?? "", note: note, principal: principal,
                          lines: lines.map { ConsultationDraft.Line(medication: $0.medication, dose: $0.dose, route: $0.route, frequency: $0.frequency, duration: $0.duration, instructions: $0.instructions) })
    }

    /// Guarda en el dispositivo lo que la API aún no tiene; si ya no hay nada pendiente, borra el borrador.
    private func persistDraft() {
        guard let key = draftKey, prefilledVersion != nil else { return }
        let draft = currentDraft
        if draft.differs(from: savedNotes) {
            let ok = DraftStore.shared.save(draft, user: profile.id, key: key)
            draftSaved = ok; draftFailed = !ok
        } else {
            DraftStore.shared.clear(user: profile.id, key: key)
            draftSaved = false; draftFailed = false
        }
    }

    private func applyDraft(_ draft: ConsultationDraft) {
        reason = draft.reason; exam = draft.exam; plan = draft.plan
        // The draft keeps only the code: it goes back to the search, so the doctor picks the row again with its description.
        cieQuery = draft.code; note = draft.note; principal = draft.principal
        let restored = draft.lines.map { line -> PrescriptionDraft in
            var item = PrescriptionDraft()
            item.medication = line.medication; item.dose = line.dose; item.route = line.route
            item.frequency = line.frequency; item.duration = line.duration; item.instructions = line.instructions
            return item
        }
        lines = restored.isEmpty ? [PrescriptionDraft()] : restored
    }

    // MARK: - Una acción principal (S13)

    /// Notes typed and not yet saved in the API.
    private var notesPending: Bool { reason != savedNotes.reason || exam != savedNotes.exam || plan != savedNotes.plan }

    /// A diagnosis, prescription line or lab selection started and not sent.
    private var unsentWork: Bool {
        cieChoice != nil || currentDraft.lines.contains { !$0.isBlank } || !selectedExams.isEmpty
    }

    private var canCallProposed: Bool { handoff?.proposal != nil && profile.hasPermission("fila.llamar") }

    /// «Firmar» is the one primary while the consultation is open; every other write is secondary.
    private func kind(_ action: ConsultationAction, editable: Bool) -> ClimesaButtonKind {
        ClimesaButtonKind(ConsultationActionRules.emphasis(action, editable: editable, canCallProposed: canCallProposed))
    }

    @ViewBuilder private var draftStatus: some View {
        if draftFailed {
            Text("consultation.draft.unsaved").font(Typo.small).foregroundStyle(Theme.danger)
        } else if draftSaved {
            Label { Text(LocalizedStringKey(draftRecovered ? "consultation.draft.recovered" : "consultation.draft.saved")) } icon: { Image(systemName: "internaldrive") }
                .font(Typo.caption).foregroundStyle(Theme.muted)
        }
    }

    @ViewBuilder private func editor(_ value: ConsultationDetail) -> some View {
        let editable = ConsultationRules.isEditable(value.consultation.state) && profile.hasPermission("consulta.registrar")
        MedicoTag(value.consultation.state.rawValue, label: value.consultation.state.label)
        if let handoff { nextPatient(handoff, editable: editable) }
        if let lastCall {
            HStack(spacing: Spacing.m) {
                Text(verbatim: String(format: L.text("queue.called.undoable"), lastCall.code)).font(Typo.body).foregroundStyle(Theme.ink)
                Spacer()
                Button(L.text("queue.undo")) { Task { await undoCall() } }.disabled(undoing.busy).frame(minHeight: 44)
            }
        }
        WriteNotice(submission: undoing, reload: loadDetail)
        // Sweep #7: the signature result shows after signing too, when the screen is no longer editable.
        WriteNotice(submission: signing, reload: loadDetail)
        if editable {
            // S9 / I-19: consultation → procedures → prescription and exams → close, one step at a time. Each step
            // carries how many records it already holds.
            ConsultationStepBar(current: $step, counts: stepCounts(value))
            switch step {
            case .consulta:
                vitalSigns(value.vitalSigns)
                draftSection(value, editable: true, planOnly: false)
                diagnosesSection(value, editable: true)
            case .procedimientos:
                draftSection(value, editable: true, planOnly: true)
                if profile.hasPermission("admision.solicitar") && profile.staffId != nil {
                    AdmissionIndicationCard(consultationId: value.consultation.id, patientId: value.consultation.patientId)
                }
            case .recetaExamenes:
                prescriptionSection(value, editable: profile.hasPermission("recetas.emitir"))
                if profile.hasPermission("laboratorio.ordenar") { labSection(value) }
            case .cierre:
                signSection(value, editable: editable)
            }
            if let next = step.next {
                Button { step = next } label: {
                    Label { Text(verbatim: String(format: L.text("consultation.step.next"), L.text(next.titleKey))) } icon: { Image(systemName: "arrow.right") }
                        .font(Typo.label).frame(maxWidth: .infinity, minHeight: 44, alignment: .trailing).contentShape(Rectangle())
                }
                .foregroundStyle(Theme.primaryText)
            }
        } else {
            vitalSigns(value.vitalSigns)
            draftSection(value, editable: false, planOnly: false)
            diagnosesSection(value, editable: false)
            prescriptionSection(value, editable: false)
            labOrdersCard()
        }
    }

    private func stepCounts(_ value: ConsultationDetail) -> [ConsultationStep: Int] {
        let orders = labOrders?.value?.count ?? 0
        var counts: [ConsultationStep: Int] = [:]
        for step in ConsultationStep.allCases {
            if let count = ConsultationRecordRules.stepCount(step, diagnoses: value.diagnoses.count, prescriptions: value.prescriptions.count, labOrders: orders), count > 0 {
                counts[step] = count
            }
        }
        return counts
    }

    @ViewBuilder private func signSection(_ value: ConsultationDetail, editable: Bool) -> some View {
        // What the record holds, so the doctor sees what is signed before tapping.
        SectionCard(title: L.text("consultation.sign.record")) {
            ListRow(title: L.text("consultation.diagnoses"), meta: "\(value.diagnoses.count)")
            ListRow(title: L.text("consultation.prescriptions"), meta: "\(value.prescriptions.count)")
            ListRow(title: L.text("lab.order"), meta: labOrders?.value.map { "\($0.count)" } ?? "—")
        }
        if signSaveFailed {
            Text("consultation.sign.saveFailed").font(Typo.small).foregroundStyle(Theme.danger).fixedSize(horizontal: false, vertical: true)
            WriteNotice(submission: saving, reload: loadDetail)
        }
        // The API signs only with a reason and a plan: say what is missing and take the doctor there, instead of failing.
        let blocker = ConsultationRecordRules.signBlocker(reason: reason, plan: plan)
        if let blocker {
            Text(verbatim: blocker).font(Typo.body).foregroundStyle(Theme.danger).fixedSize(horizontal: false, vertical: true)
            if let target = ConsultationRecordRules.stepFor(reason: reason, plan: plan) {
                Button { step = target } label: {
                    Label { Text(verbatim: String(format: L.text("consultation.sign.goTo"), L.text(target.titleKey))) } icon: { Image(systemName: "arrow.left") }
                        .font(Typo.label).frame(minHeight: 44).contentShape(Rectangle())
                }
                .foregroundStyle(Theme.primaryText)
            }
        }
        ClimesaButton(title: L.text("consultation.sign"), kind: kind(.sign, editable: editable), loading: signFlow || signing.busy || saving.busy) { confirmingSign = true }
            .disabled(blocker != nil)
            .confirmationDialog(L.text("consultation.sign.confirm"), isPresented: $confirmingSign, titleVisibility: .visible) {
                Button(L.text("consultation.sign")) { Task { await sign(value) } }
            } message: {
                Text(verbatim: ConsultationRecordRules.signRecap(diagnoses: value.diagnoses.count, prescriptions: value.prescriptions.count,
                                                                labOrders: labOrders?.value?.count, notesPending: notesPending, unsentWork: unsentWork))
            }
    }

    /// This consultation's lab orders, or why they are not known (with «Reintentar»).
    @ViewBuilder private func labOrdersList() -> some View {
        if let message = labOrders?.error {
            PartError(message: ConsultationRecordRules.ordersUnknown + " " + message, retry: loadLabOrders)
        } else if let orders = labOrders?.value, !orders.isEmpty {
            VStack(alignment: .leading, spacing: Spacing.xs) {
                Text("lab.ordered.title").font(Typo.label).foregroundStyle(Theme.muted)
                ForEach(orders) { order in
                    Text(verbatim: ConsultationRecordRules.orderLine(order)).font(Typo.body).foregroundStyle(Theme.ink).fixedSize(horizontal: false, vertical: true)
                }
            }
        }
    }

    @ViewBuilder private func labOrdersCard() -> some View {
        if labOrders?.error != nil || !(labOrders?.value?.isEmpty ?? true) {
            SectionCard(title: L.text("lab.ordered.title")) { labOrdersList() }
        }
    }

    @ViewBuilder private func vitalSigns(_ signs: [ConsultationDetail.VitalSigns]) -> some View {
        SectionCard(title: L.text("consultation.vitals")) {
            if signs.isEmpty { Text("consultation.vitals.none").font(Typo.small).foregroundStyle(Theme.muted) }
            ForEach(Array(signs.enumerated()), id: \.element.id) { index, sign in
                if index > 0 { Divider().overlay(Theme.line) }
                ListRow(title: Self.vitalsText(sign), meta: ClimesaDates.display(sign.takenAt, .time))
            }
        }
    }

    static func vitalsText(_ sign: ConsultationDetail.VitalSigns) -> String {
        var parts: [String] = []
        if let s = sign.systolic, let d = sign.diastolic { parts.append("PA \(s)/\(d)") }
        if let value = sign.heartRate { parts.append("FC \(value)") }
        if let value = sign.respiratoryRate { parts.append("FR \(value)") }
        if let value = sign.temperature { parts.append("T \(value) °C") }
        if let value = sign.oxygenSaturation { parts.append("SpO₂ \(value) %") }
        if let value = sign.weightKg { parts.append("\(value) kg") }
        if let value = sign.heightCm { parts.append("\(value) cm") }
        return parts.isEmpty ? "—" : parts.joined(separator: " · ")
    }

    @ViewBuilder private func draftSection(_ value: ConsultationDetail, editable: Bool, planOnly: Bool) -> some View {
        SectionCard(title: L.text(planOnly ? "consultation.plan" : "consultation.notes")) {
            if editable {
                if planOnly {
                    MedicoTextArea(label: L.text("consultation.plan"), text: $plan, error: draftErrors["plan"], lines: 2...6)
                } else {
                    MedicoTextArea(label: L.text("consultation.reason"), text: $reason, error: draftErrors["reason"], lines: 2...5)
                    MedicoTextArea(label: L.text("consultation.exam"), text: $exam, error: draftErrors["physicalExam"])
                }
                draftStatus
                WriteNotice(submission: saving, reload: loadDetail)
                ClimesaButton(title: L.text("consultation.save"), kind: kind(.save, editable: editable), loading: saving.busy) { Task { await save(value) } }
            } else {
                if let text = value.consultation.reason, !text.isEmpty { readOnly("consultation.reason", text) }
                if let text = value.consultation.physicalExam, !text.isEmpty { readOnly("consultation.exam", text) }
                if let text = value.consultation.plan, !text.isEmpty { readOnly("consultation.plan", text) }
            }
        }
    }

    @ViewBuilder private func readOnly(_ key: String, _ text: String) -> some View {
        VStack(alignment: .leading, spacing: Spacing.xs) {
            Text(verbatim: L.text(key)).font(Typo.eyebrow).foregroundStyle(Theme.primaryText).textCase(.uppercase)
            Text(verbatim: text).font(Typo.body).foregroundStyle(Theme.ink)
        }
    }

    /// I-16: «J45.9 · Asma no especificada», never the bare code.
    private func diagnosisTitle(_ diagnosis: ConsultationDetail.Diagnosis) -> String {
        guard let name = diagnosis.description ?? diagnosisNames[diagnosis.code], !name.isEmpty else { return diagnosis.code }
        return "\(diagnosis.code) · \(name)"
    }

    @ViewBuilder private func diagnosesSection(_ value: ConsultationDetail, editable: Bool) -> some View {
        SectionCard(title: L.text("consultation.diagnoses")) {
            ForEach(Array(value.diagnoses.enumerated()), id: \.element.id) { index, diagnosis in
                if index > 0 { Divider().overlay(Theme.line) }
                ListRow(title: diagnosisTitle(diagnosis), subtitle: diagnosis.note) {
                    if diagnosis.principal { StatusBadge("principal", label: L.text("consultation.principal")) }
                }
            }
            if editable {
                cieSearch
                Toggle("consultation.principal", isOn: $principal).font(Typo.body).tint(Theme.primary)
                FormField(label: L.text("consultation.diagnosis.note"), text: $note)
                WriteNotice(submission: diagnosing, reload: loadDetail)
                ClimesaButton(title: L.text("consultation.diagnosis.add"), kind: kind(.addDiagnosis, editable: editable), loading: diagnosing.busy) { Task { await addDiagnosis() } }
            }
        }
    }

    /// Search by code or words: from 2 characters, a short pause after the last key, up to 20 rows from the API. Tapping a
    /// row fills the code and its description; «Cambiar» goes back to the search.
    @ViewBuilder private var cieSearch: some View {
        if let choice = cieChoice {
            VStack(alignment: .leading, spacing: Spacing.s) {
                Text("consultation.diagnosis.chosen").font(Typo.label).foregroundStyle(Theme.ink)
                HStack(alignment: .top, spacing: Spacing.m) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(verbatim: choice.code).font(Typo.mono).foregroundStyle(Theme.ink)
                        Text(verbatim: choice.description).font(Typo.small).foregroundStyle(Theme.muted).fixedSize(horizontal: false, vertical: true)
                    }
                    Spacer(minLength: Spacing.s)
                    Button(L.text("consultation.diagnosis.change")) { cieChoice = nil; codeError = nil }
                        .font(Typo.label).foregroundStyle(Theme.primaryText).frame(minHeight: 44).disabled(diagnosing.busy)
                }
                .accessibilityElement(children: .combine)
            }
        } else {
            VStack(alignment: .leading, spacing: Spacing.s) {
                FormField(label: L.text("consultation.diagnosis.search"), text: $cieQuery, error: codeError)
                    .autocorrectionDisabled().submitLabel(.search)
                    .onSubmit { Task { await searchCie() } }
                let trimmed = cieQuery.trimmingCharacters(in: .whitespacesAndNewlines)
                if !trimmed.isEmpty && Cie10SearchRules.query(cieQuery) == nil {
                    Text(verbatim: Cie10SearchRules.shortQuery).font(Typo.small).foregroundStyle(Theme.muted)
                }
                if let error = cieResults.error {
                    PartError(message: error, retry: searchCie)
                } else if cieResults.loading && cieResults.value == nil {
                    Skeleton(rows: 2)
                } else if let rows = cieResults.value {
                    if rows.isEmpty {
                        Text("consultation.diagnosis.noMatch").font(Typo.small).foregroundStyle(Theme.muted)
                    } else {
                        VStack(alignment: .leading, spacing: 0) {
                            ForEach(Array(rows.enumerated()), id: \.element.id) { index, entry in
                                if index > 0 { Divider().overlay(Theme.line) }
                                Button {
                                    cieChoice = entry
                                    codeError = nil
                                } label: {
                                    HStack(alignment: .firstTextBaseline, spacing: Spacing.m) {
                                        Text(verbatim: entry.code).font(Typo.mono).foregroundStyle(Theme.ink).frame(minWidth: 56, alignment: .leading)
                                        Text(verbatim: entry.description).font(Typo.body).foregroundStyle(Theme.ink).multilineTextAlignment(.leading)
                                            .fixedSize(horizontal: false, vertical: true)
                                        Spacer(minLength: 0)
                                    }
                                    .frame(minHeight: 44).contentShape(Rectangle())
                                }
                                .buttonStyle(.plain)
                                .accessibilityLabel(Text(verbatim: Cie10SearchRules.title(entry)))
                            }
                        }
                    }
                }
            }
            // Debounce of the user's typing (not a refresh timer): the search runs a moment after the last key.
            .task(id: cieQuery) {
                guard Cie10SearchRules.query(cieQuery) != nil else { cieResults.clear(); return }
                try? await Task.sleep(nanoseconds: Cie10SearchRules.debounceNanoseconds)
                if !Task.isCancelled { await searchCie() }
            }
        }
    }

    private func searchCie() async {
        guard let query = Cie10SearchRules.query(cieQuery) else { cieResults.clear(); return }
        await cieResults.load { try await account.client().get(Cie10SearchRules.path(query), as: [Cie10Entry].self) }
    }

    @ViewBuilder private func prescriptionSection(_ value: ConsultationDetail, editable: Bool) -> some View {
        SectionCard(title: L.text("consultation.prescriptions")) {
            ForEach(value.prescriptions) { prescription in
                VStack(alignment: .leading, spacing: Spacing.xs) {
                    Text(verbatim: ClimesaDates.display(prescription.issuedAt)).font(Typo.mono).foregroundStyle(Theme.muted)
                    ForEach(Array(prescription.items.enumerated()), id: \.offset) { _, item in
                        Text(verbatim: "\(item.medication) \(item.dose) · \(item.route) · \(item.frequency) · \(item.duration)").font(Typo.body).foregroundStyle(Theme.ink)
                    }
                }
            }
            if editable {
                ForEach($lines) { $line in
                    PrescriptionLineFields(line: $line, removable: lines.count > 1) {
                        let id = line.id
                        lines.removeAll { $0.id == id }
                    }
                }
                if let lineError { Text(verbatim: lineError).font(Typo.caption).foregroundStyle(Theme.danger) }
                ClimesaButton(title: L.text("rx.addLine"), kind: .secondary) { lines.append(PrescriptionDraft()) }
                WriteNotice(submission: prescribing, reload: loadDetail)
                ClimesaButton(title: L.text("rx.issue"), kind: kind(.issuePrescription, editable: editable), loading: prescribing.busy) { Task { await prescribe() } }
            }
        }
    }

    @ViewBuilder private func labSection(_ value: ConsultationDetail) -> some View {
        SectionCard(title: L.text("lab.order")) {
            LoadState(loader: catalog, retry: loadCatalog) { exams in
                // I-20: search the catalog by name or code; what is already picked stays visible.
                FormField(label: L.text("lab.search"), text: $labQuery)
                    .textInputAutocapitalization(.never).autocorrectionDisabled()
                if !selectedExams.isEmpty {
                    Text(verbatim: String(format: L.text("lab.selected"), selectedExams.count)).font(Typo.small).foregroundStyle(Theme.muted)
                }
                let visible = LabCatalogFilter.filter(exams, query: labQuery, selected: selectedExams)
                if visible.isEmpty { EmptyNote("lab.search.none") }
                ForEach(visible) { item in
                    Toggle(isOn: Binding(get: { selectedExams.contains(item.id) }, set: { on in
                        if on { selectedExams.insert(item.id) } else { selectedExams.remove(item.id) }
                    })) {
                        Text(verbatim: item.isPanel ? "\(item.name) · \(L.text("lab.panel"))" : item.name).font(Typo.body).foregroundStyle(Theme.ink)
                    }.tint(Theme.primary).frame(minHeight: 44)
                }
                VStack(alignment: .leading, spacing: Spacing.s) {
                    Text("lab.priority").font(Typo.label).foregroundStyle(Theme.ink)
                    Picker("lab.priority", selection: $priority) {
                        Text(verbatim: LabPriority.rutina.label).tag(LabPriority.rutina)
                        Text(verbatim: LabPriority.urgente.label).tag(LabPriority.urgente)
                    }.pickerStyle(.segmented)
                }
            }
            .task { if catalog.value == nil { await loadCatalog() } }
            labOrdersList()
            // Never the same exam twice in one consultation; never an order while the list is unknown.
            let blocker = ConsultationRecordRules.orderBlocker(canReadOrders: profile.hasPermission("resultados.ver"), ordersKnown: labOrders?.value != nil)
            let repeated = ConsultationRecordRules.repeated(selected: selectedExams, catalog: catalog.value ?? [], orders: labOrders?.value ?? [], orderedHere: orderedHere)
            if let reason = blocker ?? ConsultationRecordRules.repeatError(repeated) {
                Text(verbatim: reason).font(Typo.small).foregroundStyle(Theme.danger).fixedSize(horizontal: false, vertical: true)
            }
            WriteNotice(submission: ordering, reload: loadLabOrders)
            ClimesaButton(title: L.text("lab.submit"), kind: kind(.orderLab, editable: true), loading: ordering.busy) { Task { await order(value) } }
                .disabled(selectedExams.isEmpty || ordering.busy || blocker != nil || !repeated.isEmpty)
        }
    }

    // MARK: - Lecturas

    private func loadDetail() async {
        guard let id = consultationId else { return }
        await detail.load { try await account.client().get("/consultas/\(id)/detalle", as: ConsultationDetail.self) }
        // El borrador se llena con lo guardado al abrir y cuando otra versión reemplaza la que se estaba editando.
        if let summary = detail.value?.consultation, prefilledVersion == nil || saving.lastFailure?.isVersionConflict == true {
            let firstFill = prefilledVersion == nil
            reason = summary.reason ?? ""; exam = summary.physicalExam ?? ""; plan = summary.plan ?? ""
            savedNotes = ConsultationDraft(reason: reason, exam: exam, plan: plan)
            prefilledVersion = summary.version
            // Al volver a la consulta, lo escrito en el dispositivo y no guardado reemplaza lo de la API.
            if firstFill, ConsultationRules.isEditable(summary.state), let key = draftKey,
               let draft = DraftStore.shared.load(ConsultationDraft.self, user: profile.id, key: key) {
                applyDraft(draft)
                draftRecovered = true
            }
            persistDraft()
        }
        await loadLabOrders()
    }

    /// B-6: the orders of this consultation from `/laboratorio/ordenes` (needs `resultados.ver`), plus the exams this
    /// device ordered here.
    private func loadLabOrders() async {
        guard let id = consultationId else { return }
        orderedHere = DraftStore.shared.load(Set<String>.self, user: profile.id, key: ConsultationRecordRules.orderedKey(id)) ?? []
        guard profile.hasPermission("resultados.ver") else { return }
        do {
            let orders = try await account.client().get("/laboratorio/ordenes", as: [LabOrder].self)
            labOrders = .loaded(ConsultationRecordRules.labOrders(orders, consultationId: id))
        } catch is CancellationError {
        } catch {
            labOrders = .failed(error.userMessage)
        }
    }

    private func loadCatalog() async { await catalog.load { try await account.client().get("/laboratorio/catalogo", as: [LabExam].self) } }

    // MARK: - Escrituras

    /// I-18: the consultation starts when the screen opens from «Atender» or «Iniciar»; one try, then a manual retry.
    private func autoStart() async {
        guard !autoStartTried else { return }
        if consultationId == nil && profile.hasPermission("consulta.iniciar") { await start() }
        autoStartTried = true
    }

    private func start() async {
        let body: ConsultationStartBody
        switch origin {
        case let .appointment(entry): body = ConsultationStartBody(appointmentId: entry.appointmentId)
        case let .ticket(ticket): body = ConsultationStartBody(ticketId: ticket.id)
        case let .resume(open):
            // Ya existe: no se vuelve a iniciar.
            consultationId = open.id
            return
        }
        var started: ConsultationStartResult?
        let ok = await starting.run(body: body) { key in
            started = try await account.client().send("POST", "/consultas", body: body, key: key, as: ConsultationStartResult.self)
        }
        if ok, let started { consultationId = started.id; return }
        // Ya estaba iniciada por este médico (otro toque, la web o una visita anterior a este número): se retoma.
        if let existing = starting.lastFailure?.resumableConsultationId {
            starting.error = nil
            consultationId = existing
        }
    }

    /// Saves the notes; returns the consultation version the API answered with, or nil if the save did not go through.
    @discardableResult
    private func save(_ value: ConsultationDetail) async -> Int? {
        draftErrors = ConsultationRules.draftErrors(reason: reason, physicalExam: exam, plan: plan)
        guard draftErrors.isEmpty, let id = consultationId else { return nil }
        let body = ConsultationUpdateBody(version: value.consultation.version, reason: reason, physicalExam: exam, plan: plan)
        var saved: ConsultationCommandResult?
        let ok = await saving.run(id, body: body, success: L.text("consultation.saved")) { key in
            saved = try await account.client().send("PATCH", "/consultas/\(id)", body: body, key: key, as: ConsultationCommandResult.self)
        }
        if ok {
            // The notes are saved, so an earlier "not saved" error next to «Firmar» no longer applies.
            signSaveFailed = false
            // Las notas ya están en la API: el borrador local solo conserva el diagnóstico o la receta pendientes.
            savedNotes = ConsultationDraft(reason: reason, exam: exam, plan: plan)
            draftRecovered = false
            persistDraft()
        }
        await loadDetail()
        return ok ? saved?.version : nil
    }

    private func addDiagnosis() async {
        codeError = ConsultationRules.diagnosisSelectionError(cieChoice)
        guard codeError == nil, let choice = cieChoice, let id = consultationId else { return }
        let text = note.trimmingCharacters(in: .whitespacesAndNewlines)
        let body = DiagnosisBody(code: choice.code, principal: principal, note: text.isEmpty ? nil : text)
        var created: DiagnosisCreated?
        let ok = await diagnosing.run(body: body) { key in
            created = try await account.client().send("POST", "/consultas/\(id)/diagnosticos", body: body, key: key, as: DiagnosisCreated.self)
        }
        if ok { diagnosisNames[choice.code] = choice.description }
        if ok, let created { diagnosisNames[created.code] = created.description }
        if ok { cieChoice = nil; cieQuery = ""; cieResults.clear(); note = ""; principal = false }
        await loadDetail()
    }

    private func prescribe() async {
        let items = lines.map(\.body)
        lineError = items.compactMap { ConsultationRules.prescriptionError($0) }.first
        guard lineError == nil, !items.isEmpty, let id = consultationId else { return }
        let body = PrescriptionBody(items: items)
        let ok = await prescribing.run(body: body, success: L.text("rx.issued")) { key in
            _ = try await account.client().send("POST", "/consultas/\(id)/receta", body: body, key: key, as: Prescription.self)
        }
        if ok { lines = [PrescriptionDraft()] }
        await loadDetail()
    }

    private func order(_ value: ConsultationDetail) async {
        let id = value.consultation.id
        let catalogExams = catalog.value ?? []
        // Checked again at the tap: the list may have changed since the screen drew.
        guard ConsultationRecordRules.orderBlocker(canReadOrders: profile.hasPermission("resultados.ver"), ordersKnown: labOrders?.value != nil) == nil,
              ConsultationRecordRules.repeated(selected: selectedExams, catalog: catalogExams, orders: labOrders?.value ?? [], orderedHere: orderedHere).isEmpty
        else { return }
        let body = LabOrderBody(consultationId: id, exams: selectedExams.sorted(), priority: priority)
        let ok = await ordering.run(body: body, success: L.text("lab.ordered")) { key in
            _ = try await account.client().send("POST", "/laboratorio/ordenes", body: body, key: key, as: LabOrderCreated.self)
        }
        if ok {
            orderedHere.formUnion(selectedExams)
            _ = DraftStore.shared.save(orderedHere, user: profile.id, key: ConsultationRecordRules.orderedKey(id))
            selectedExams = []
        }
        await loadLabOrders()
    }

    private func sign(_ value: ConsultationDetail) async {
        guard !signFlow, let id = consultationId else { return }
        signFlow = true
        signSaveFailed = false
        defer { signFlow = false }
        var version = value.consultation.version
        // Signing never loses typed notes: they are saved first, then the consultation is signed at the version the
        // save returned.
        if notesPending {
            guard let saved = await save(value) else { signSaveFailed = true; return }
            version = saved
        }
        let body = VersionBody(version: version)
        var signed: ConsultationCommandResult?
        let ok = await signing.run(id, body: body, success: L.text("consultation.signed")) { key in
            signed = try await account.client().send("POST", "/consultas/\(id)/firmar", body: body, key: key, as: ConsultationCommandResult.self)
        }
        handoff = signed?.nextProposal
        if ok, let key = draftKey {
            DraftStore.shared.clear(user: profile.id, key: key)
            draftSaved = false; draftFailed = false; draftRecovered = false
        }
        await loadDetail()
    }

    // MARK: - Quién pasa después (S9)

    @ViewBuilder private func nextPatient(_ next: QueueNextProposal, editable: Bool) -> some View {
        VStack(alignment: .leading, spacing: Spacing.s) {
            Text("consultation.next.title").font(Typo.label).foregroundStyle(Theme.muted)
            if let proposal = next.proposal {
                HStack(spacing: Spacing.s) {
                    AreaTag(proposal.area)
                    Text(verbatim: "\(proposal.number)").font(Typo.number(28)).foregroundStyle(Theme.ink).accessibilityLabel(proposal.code)
                    if proposal.priority != "rutina" { PriorityBadge(proposal.priority) }
                }
                Text(verbatim: proposal.patientName ?? "").font(Typo.body).foregroundStyle(Theme.ink)
                Text(verbatim: proposal.reasonText).font(Typo.small).foregroundStyle(Theme.muted)
            } else {
                Text("queue.next.none").font(Typo.body).foregroundStyle(Theme.ink)
            }
            // I-31: the rule stays one tap away instead of a sentence under every proposal.
            DisclosureGroup {
                // In the app's words, never the server's raw `rule` text.
                NextRuleList()
            } label: { Text("queue.next.why").font(Typo.small).foregroundStyle(Theme.primaryText).frame(minHeight: 44) }
            WriteNotice(submission: handoffCall, reload: loadDetail)
            if let proposal = next.proposal, profile.hasPermission("fila.llamar") {
                ClimesaButton(title: String(format: L.text("consultation.next.call"), proposal.code), kind: kind(.callNext, editable: editable), loading: handoffCall.busy) { Task { await callProposed(proposal) } }
            }
            ClimesaButton(title: L.text("consultation.next.dismiss"), kind: .secondary) { handoff = nil }
        }
        .padding(Spacing.m)
        .frame(maxWidth: .infinity, alignment: .leading)
        .areaSurface(next.area)
    }

    private func callProposed(_ proposal: QueueProposedTicket) async {
        let body = VersionBody(version: proposal.version)
        var result: QueueCallResult?
        let ok = await handoffCall.run(proposal.id, body: body) { key in
            result = try await account.client().send("POST", "/fila/\(proposal.id)/llamar", body: body, key: key, as: QueueCallResult.self)
        }
        if ok {
            handoff = nil
            undoing.clearFailure()
            if let result { lastCall = (result.id, result.version, proposal.code) }
        }
    }

    private func undoCall() async {
        guard let last = lastCall else { return }
        let body = VersionBody(version: last.version)
        let ok = await undoing.run(last.id, body: body, success: String(format: L.text("queue.undone"), last.code)) { key in
            _ = try await account.client().send("POST", "/fila/\(last.id)/deshacer-llamado", body: body, key: key, as: QueueTransitionResult.self)
        }
        if ok { lastCall = nil }
    }
}

/// I-19: step indicator like the web (`consult-steps`): done steps carry a check, the current one is filled.
private struct ConsultationStepBar: View {
    @Binding var current: ConsultationStep
    /// Records already held by a step ("Consulta 2"), so the doctor sees what is done without opening it.
    var counts: [ConsultationStep: Int] = [:]

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: Spacing.space2) {
                ForEach(ConsultationStep.allCases, id: \.self) { step in
                    let state = step.state(current: current)
                    let isCurrent = state == .actual
                    Button { current = step } label: {
                        HStack(spacing: Spacing.space1) {
                            if state == .hecho { Image(systemName: "checkmark").imageScale(.small).accessibilityHidden(true) }
                            Text(LocalizedStringKey(step.titleKey)).font(Typo.label).lineLimit(1)
                            if let count = counts[step] {
                                Text(verbatim: "\(count)").font(Typo.caption).monospacedDigit()
                                    .padding(.horizontal, Spacing.space1)
                                    .background((isCurrent ? Theme.onPrimary : Theme.ink).opacity(0.12), in: Capsule())
                                    .accessibilityLabel(Text(verbatim: String(format: L.text("consultation.step.count"), count)))
                            }
                        }
                        .padding(.horizontal, Spacing.space3).frame(minHeight: 44)
                        .foregroundStyle(isCurrent ? Theme.onPrimary : (state == .hecho ? Theme.ink : Theme.muted))
                        .background(isCurrent ? Theme.primary : Theme.surface, in: RoundedRectangle(cornerRadius: Radius.control))
                        .overlay(RoundedRectangle(cornerRadius: Radius.control).stroke(isCurrent ? Theme.primary : Theme.line, lineWidth: 1))
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(isCurrent ? AccessibilityTraits.isSelected : AccessibilityTraits())
                }
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(Text("consultation.steps.label"))
    }
}

/// One prescription line. I-39: dose/route and frequency/duration stack in a column with large text, and a line can
/// be removed while there is more than one.
private struct PrescriptionLineFields: View {
    @Binding var line: PrescriptionDraft
    let removable: Bool
    let remove: () -> Void
    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        let pair = typeSize >= .xxLarge
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: Spacing.m))
            : AnyLayout(HStackLayout(alignment: .top, spacing: Spacing.m))
        VStack(alignment: .leading, spacing: Spacing.m) {
            HStack(alignment: .bottom, spacing: Spacing.s) {
                FormField(label: L.text("rx.medication"), text: $line.medication)
                if removable {
                    Button(action: remove) {
                        Image(systemName: "minus.circle").font(Typo.heading).frame(width: 44, height: 44).contentShape(Rectangle())
                    }
                    .foregroundStyle(Theme.muted)
                    .accessibilityLabel(Text("rx.removeLine"))
                }
            }
            pair {
                FormField(label: L.text("rx.dose"), text: $line.dose)
                FormField(label: L.text("rx.route"), text: $line.route)
            }
            pair {
                FormField(label: L.text("rx.frequency"), text: $line.frequency)
                FormField(label: L.text("rx.duration"), text: $line.duration)
            }
            FormField(label: L.text("rx.instructions"), text: $line.instructions)
        }
    }
}
