import SwiftUI

// `ConsultationOrigin` and the screen's reads and writes live in Core/ViewModels/ConsultationViewModel.swift (S13).

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
    /// S13: the reads and writes of this screen (loaders, submissions, method, path and body of every call).
    @State private var model = ConsultationViewModel()
    private var detail: Loader<ConsultationDetail> { model.detail }
    private var catalog: Loader<[LabExam]> { model.catalog }
    private var starting: Submission { model.starting }
    private var saving: Submission { model.saving }
    private var diagnosing: Submission { model.diagnosing }
    private var prescribing: Submission { model.prescribing }
    private var ordering: Submission { model.ordering }
    private var signing: Submission { model.signing }
    /// S9: after signing, who goes next in the consultation's area (`nextProposal`), with the call one tap away.
    @State private var handoff: QueueNextProposal?
    private var handoffCall: Submission { model.handoffCall }
    /// S9: the number called from the handoff, undoable from here like on Mi día ("Llamaste CON 4 · Deshacer").
    @State private var lastCall: (id: String, version: Int, code: String)?
    private var undoing: Submission { model.undoing }
    @State private var prefilledVersion: Int?
    @State private var reason = ""
    @State private var exam = ""
    @State private var plan = ""
    @State private var draftErrors: [String: String] = [:]
    /// Fase 2R: the diagnosis comes from the CIE-10 search (`GET /consultas/cie10`), never a typed code.
    @State private var cieQuery = ""
    private var cieResults: Loader<[Cie10Entry]> { model.cieResults }
    @State private var cieChoice: Cie10Entry?
    /// Row 5: set from the record when it loads (principal only while the consultation has none).
    @State private var principal = false
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
    /// B-6: this consultation's lab orders (see `ConsultationViewModel.labOrders`).
    private var labOrders: Part<[LabOrder]>? { model.labOrders }
    /// Exams ordered from this device in this consultation (stored per account), so a repeat is blocked at once.
    @State private var orderedHere: Set<String> = []
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.dismiss) private var dismiss
    @Environment(\.dynamicTypeSize) private var typeSize
    /// Lote 5 S12: the consultation's version as the API last answered it (a save or autosave moves it), so the next
    /// write never sends a stale one and hits `version_conflicto`.
    @State private var version: Int?
    /// Lote 5 S3: the red errors under motive and plan after a sign attempt with them empty.
    @State private var signErrors: [String: String] = [:]
    /// The field the screen scrolls to after a failed sign ("reason" or "plan").
    @State private var scrollTarget: String?
    /// Lote 5 S12: the autosave waits 2.5 s after the last key (`debounce`); `inflight` is the PATCH being sent, which
    /// «Guardar borrador» and «Firmar consulta» wait for so two writes never race on one version.
    @State private var debounce: Task<Void, Never>?
    @State private var inflight: Task<Int?, Never>?
    private var autosaving: Submission { model.autosaving }
    /// «Borrador guardado…» with the time of the last save that reached the server.
    @State private var savedFeedback: String?
    /// Lote 5 S12: «Lo que pidió el paciente».
    @State private var context: VisitContext?
    /// Lote 5 S12: another unsigned consultation of this doctor, asked about before starting a new one.
    @State private var unsignedOther: UnsignedConsultation?
    @State private var askingUnsigned = false
    /// «Reanudarla» switched this screen to that consultation.
    @State private var resumedOther: UnsignedConsultation?
    /// D79 (owner): while the keyboard is up the actions are the last thing of the form, never a bar floating over the
    /// keyboard or covering the field being typed.
    @State private var keyboardShown = false

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
        if let resumedOther { return resumedOther.patientName ?? L.text("day.patient.unknown") }
        switch origin {
        case let .appointment(entry): return entry.patientName ?? L.text("day.patient.unknown")
        case let .ticket(ticket): return ticket.patientName ?? String(format: L.text("consultation.ticket"), ticket.number)
        case let .resume(open): return open.patientName ?? L.text("day.patient.unknown")
        }
    }

    /// The view model, bound to the session's client before each call (the view calls the network only through it).
    private var vm: ConsultationViewModel {
        model.client = { [account] in try account.client() }
        return model
    }

    /// The consultation is loaded, open and this doctor may write it: the bottom action bar shows.
    private var editableNow: Bool {
        guard consultationId != nil, let value = detail.value else { return false }
        return ConsultationRules.isEditable(value.consultation.state) && profile.hasPermission("consulta.registrar")
    }

    var body: some View {
        // Own frame instead of `ScreenFrame`: the scroll reader reaches the first error and the action bar docks at the bottom.
        ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: Spacing.gap) { content }
                    .padding(Spacing.gutter).frame(maxWidth: 760, alignment: .leading).frame(maxWidth: .infinity)
            }
            .dismissibleKeyboard()
            .background(Theme.bg).navigationTitle(Text("consultation.title")).navigationBarTitleDisplayMode(.inline)
            .climesaNavBar()
            .toolbar { ToolbarItem(placement: .topBarTrailing) { LiveClock() } }
            .safeAreaInset(edge: .bottom, spacing: 0) {
                if editableNow, !keyboardShown, let value = detail.value { actionBar(value) }
            }
            .onChange(of: scrollTarget) { _, target in
                guard let target else { return }
                scrollTarget = nil
                // The step that holds the field draws first; then the field comes into view.
                Task { @MainActor in
                    try? await Task.sleep(nanoseconds: 150_000_000)
                    withAnimation(.easeOut(duration: 0.25)) { proxy.scrollTo(target, anchor: .top) }
                }
            }
        }
        .trackingKeyboard($keyboardShown)
        // S13 / D35: signing asks first; each zero count stands out in amber, but nothing blocks the signature.
        .sheet(isPresented: $confirmingSign) {
            if let value = detail.value {
                SignConfirmSheet(counts: signCounts(value),
                                 effect: ConsultationRecordRules.signEffect(notesPending: notesPending, unsentWork: unsentWork)) {
                    confirmingSign = false
                    Task { await sign(value) }
                }
            }
        }
        .task { await prepare() }
        .task(id: "\(consultationId ?? "-")|\(live.snapshot.version(.consultations))") { await loadDetail() }
        .onChange(of: currentDraft) { _, _ in persistDraft() }
        .onChange(of: "\(reason)\u{1F}\(exam)\u{1F}\(plan)") { _, _ in
            if !signErrors.isEmpty { signErrors = ConsultationForm.errors(reason: reason, plan: plan) }
            scheduleAutosave()
        }
        // Lote 5 S12: leaving the app saves the draft on the server at once (the device copy stays as a fallback).
        .onChange(of: scenePhase) { _, phase in
            if phase == .background || phase == .inactive { Task { await autosaveNow() } }
        }
        .onDisappear { debounce?.cancel(); Task { await autosaveNow() } }
        .alert(unsignedOther.map(ConsultationGuard.title) ?? "", isPresented: $askingUnsigned, presenting: unsignedOther) { other in
            Button(L.text("consultation.unsigned.resume")) { resume(other) }
            Button(L.text("consultation.unsigned.startAnyway")) { Task { await start() } }
            Button(L.text("consultation.unsigned.back"), role: .cancel) { dismiss() }
        } message: { _ in
            Text("consultation.unsigned.message")
        }
    }

    @ViewBuilder private var content: some View {
        Text(verbatim: patientName).font(Typo.heading).foregroundStyle(Theme.ink)
        contextCard
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
            // D79: with the keyboard up the bar leaves the bottom edge and closes the form instead.
            if editableNow, keyboardShown, let value = detail.value { actionBar(value) }
        }
    }

    /// Lote 5 S12 · «Lo que pidió el paciente»: the appointment's reason and categories, or the queue number it came from.
    @ViewBuilder private var contextCard: some View {
        if let context {
            SectionCard(title: L.text("consultation.context.title")) {
                HStack(spacing: Spacing.s) {
                    Text(verbatim: context.origin).font(Typo.small).foregroundStyle(Theme.muted).fixedSize(horizontal: false, vertical: true)
                    if let priority = context.priority { PriorityBadge(priority) }
                }
                if !context.categories.isEmpty {
                    HStack(alignment: .firstTextBaseline, spacing: Spacing.s) {
                        CategoryMarks(categories: context.categories)
                        Text(verbatim: context.categories.map(\.name).joined(separator: ", ")).font(Typo.label).foregroundStyle(Theme.ink)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                if let reason = context.reason {
                    Text(verbatim: reason).font(Typo.body).foregroundStyle(Theme.ink).fixedSize(horizontal: false, vertical: true)
                } else if context.categories.isEmpty {
                    Text("consultation.context.none").font(Typo.small).foregroundStyle(Theme.muted)
                }
            }
        }
    }

    /// Lote 5 S12 · bottom action bar: what signing still needs, the save feedback, «Guardar borrador» (edit) and
    /// «Firmar consulta» (the one primary), above the keyboard and the home indicator.
    @ViewBuilder private func actionBar(_ value: ConsultationDetail) -> some View {
        let stacked = typeSize.isAccessibilitySize
        let buttons = stacked
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: Spacing.s))
            : AnyLayout(HStackLayout(spacing: Spacing.m))
        VStack(alignment: .leading, spacing: Spacing.s) {
            if let missing = FormCopy.missingSummary(ConsultationForm.missingNames(reason: reason, plan: plan)) {
                Label { Text(verbatim: missing).fixedSize(horizontal: false, vertical: true) } icon: { ClimesaIcon(.alert, size: 14) }
                    .font(Typo.small).foregroundStyle(signErrors.isEmpty ? Theme.warning : Theme.danger)
            } else if let savedFeedback {
                SavedFeedback(text: savedFeedback)
            }
            buttons {
                CardActionButton(title: L.text("consultation.save"), role: .edit, loading: saving.busy && !signFlow) { Task { await saveDraft(value) } }
                    .disabled(signFlow || signing.busy)
                CardActionButton(title: L.text("consultation.sign"), role: .primary, icon: .check, loading: signFlow || signing.busy) { trySign() }
                    .disabled(saving.busy)
            }
        }
        .padding(.horizontal, Spacing.gutter).padding(.vertical, Spacing.m)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.surface)
        .overlay(alignment: .top) { Rectangle().fill(Theme.line).frame(height: 1) }
    }

    /// D35: what the signature closes, as the owner listed it: diagnoses, medications (prescription lines) and exams.
    private func signCounts(_ value: ConsultationDetail) -> [ConsultationRecordRules.SignCount] {
        let medications = value.prescriptions.reduce(0) { $0 + $1.items.count }
        let exams = labOrders?.value.map { orders in orders.reduce(0) { $0 + $1.items.count } }
        return ConsultationRecordRules.signCounts(diagnoses: value.diagnoses.count, medications: medications, exams: exams)
    }

    /// Lote 5 S3: signing without motive or plan marks each empty field in red and scrolls to the first one.
    private func trySign() {
        signErrors = ConsultationForm.errors(reason: reason, plan: plan)
        guard let first = ConsultationForm.missing(reason: reason, plan: plan).first else { confirmingSign = true; return }
        if let target = ConsultationRecordRules.stepFor(reason: reason, plan: plan) { step = target }
        scrollTarget = first
    }

    // MARK: - Contexto y consulta sin firmar (S12)

    /// Reads what the patient asked for and, before a new start, whether another consultation is still unsigned.
    private func prepare() async {
        await loadContext()
        guard !autoStartTried else { return }
        if consultationId == nil && profile.hasPermission("consulta.iniciar") {
            let open = await vm.unsignedConsultations()
            if let other = ConsultationGuard.unsignedOther(open, current: nil) {
                unsignedOther = other
                askingUnsigned = true
                autoStartTried = true
                return
            }
        }
        await autoStart()
    }

    private func resume(_ other: UnsignedConsultation) {
        resumedOther = other
        context = nil
        consultationId = other.id
        Task { await loadContext() }
    }

    private func loadContext() async {
        if let resumedOther {
            context = await resumedContext(appointmentId: resumedOther.appointmentId, ticketId: resumedOther.ticketId)
            return
        }
        switch origin {
        case let .appointment(entry): context = ConsultationContextRules.of(appointment: entry, ticket: nil)
        case let .ticket(ticket): context = ConsultationContextRules.of(appointment: nil, ticket: ticket)
        case let .resume(open): context = await resumedContext(appointmentId: open.appointmentId, ticketId: open.ticketId)
        }
    }

    /// A resumed consultation finds its appointment in the agenda or its number in today's queue; best effort.
    private func resumedContext(appointmentId: String?, ticketId: String?) async -> VisitContext? {
        await vm.resumedContext(appointmentId: appointmentId, ticketId: ticketId,
                                canReadAgenda: profile.hasPermission("consulta.iniciar"), canReadQueue: profile.hasPermission("fila.ver"))
    }

    // MARK: - Autoguardado en el servidor (S12)

    /// Restarts the 2.5 s wait after each key; only an open consultation this doctor writes is saved.
    private func scheduleAutosave() {
        debounce?.cancel()
        guard editableNow, prefilledVersion != nil else { return }
        debounce = Task { @MainActor in
            try? await Task.sleep(nanoseconds: ConsultationAutosave.debounceNanoseconds)
            guard !Task.isCancelled else { return }
            await autosaveNow()
        }
    }

    /// Sends the notes now if they differ from the server's, through the draft PATCH with the current version. Waits for
    /// a save already in flight first. Returns the version the API answered with, or the known one when nothing was sent.
    @discardableResult
    private func autosaveNow() async -> Int? {
        if let running = inflight { _ = await running.value }
        guard editableNow, let id = consultationId, let current = version,
              ConsultationRules.draftErrors(reason: reason, physicalExam: exam, plan: plan).isEmpty,
              ConsultationAutosave.changed(savedReason: savedNotes.reason, savedExam: savedNotes.exam, savedPlan: savedNotes.plan,
                                           reason: reason, exam: exam, plan: plan),
              !saving.busy, !signFlow
        else { return version }
        let notes = (reason, exam, plan)
        let task = Task { @MainActor () -> Int? in
            guard let saved = await vm.autosave(consultationId: id, version: current, reason: notes.0, exam: notes.1, plan: notes.2)
            else { return nil }
            version = saved.version
            savedNotes = ConsultationDraft(reason: notes.0, exam: notes.1, plan: notes.2)
            savedFeedback = ConsultationAutosave.savedText(Date())
            persistDraft()
            return saved.version
        }
        inflight = task
        let result = await task.value
        inflight = nil
        return result ?? version
    }

    /// Cancels the pending wait and joins a PATCH in flight, so the next write uses the version it returned.
    private func joinAutosave() async {
        debounce?.cancel()
        debounce = nil
        if let running = inflight { _ = await running.value }
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
            // Lote 5 S3: one legend for the whole form; motive and plan carry the «*».
            RequiredLegend()
            WriteNotice(submission: autosaving, reload: loadDetail)
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
                if profile.hasPermission("admision.solicitar") {
                    if profile.staffId != nil {
                        AdmissionIndicationCard(consultationId: value.consultation.id, patientId: value.consultation.patientId)
                    } else {
                        // Row 12: never hidden silently; the doctor reads why it is not offered.
                        SectionCard(title: L.text("admission.title")) {
                            Text(verbatim: AdmissionIndicationRules.noStaffRecord).font(Typo.small).foregroundStyle(Theme.muted).fixedSize(horizontal: false, vertical: true)
                        }
                    }
                }
            case .recetaExamenes:
                prescriptionSection(value, editable: profile.hasPermission("recetas.emitir"))
                if profile.hasPermission("laboratorio.ordenar") { labSection(value) }
            case .cierre:
                signSection(value, editable: editable)
            }
            if let next = step.next {
                Button { step = next } label: {
                    Label { Text(verbatim: String(format: L.text("consultation.step.next"), L.text(next.titleKey))) } icon: { ClimesaIcon(.arrow, size: 18) }
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
        // S7 / Lote 5 S12: «Firmar consulta» lives in the bottom bar; here the doctor reads what is still missing and a
        // link takes them to that step.
        if let blocker = ConsultationRecordRules.signBlocker(reason: reason, plan: plan) {
            Text(verbatim: blocker).font(Typo.small).foregroundStyle(signErrors.isEmpty ? Theme.muted : Theme.danger).fixedSize(horizontal: false, vertical: true)
        }
        if ConsultationRecordRules.signBlocker(reason: reason, plan: plan) != nil, let target = ConsultationRecordRules.stepFor(reason: reason, plan: plan) {
            Button { step = target } label: {
                Label { Text(verbatim: String(format: L.text("consultation.sign.goTo"), L.text(target.titleKey))) } icon: { ClimesaIcon(.back, size: 18) }
                    .font(Typo.label).frame(minHeight: 44).contentShape(Rectangle())
            }
            .foregroundStyle(Theme.primaryText)
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
                    // Row 17: the state is a coloured tag, never plain text after the exams.
                    HStack(alignment: .firstTextBaseline, spacing: Spacing.s) {
                        Text(verbatim: ConsultationRecordRules.orderExams(order)).font(Typo.body).foregroundStyle(Theme.ink).fixedSize(horizontal: false, vertical: true)
                        Spacer(minLength: Spacing.s)
                        MedicoTag(order.state.rawValue, label: order.state.label)
                    }
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
                VitalSignsBlock(sign: sign, when: ClimesaDates.display(sign.takenAt, .time))
            }
        }
    }

    /// Lote 5 S3: full names, never «FC», «Temp» or «PA» (`ConsultationVitalsText`).
    static func vitalsText(_ sign: ConsultationDetail.VitalSigns) -> String {
        let parts = ConsultationVitalsText.parts(sign)
        return parts.isEmpty ? "—" : parts.map { "\($0.name): \($0.value)" }.joined(separator: " · ")
    }

    @ViewBuilder private func draftSection(_ value: ConsultationDetail, editable: Bool, planOnly: Bool) -> some View {
        SectionCard(title: L.text(planOnly ? "consultation.plan" : "consultation.notes")) {
            if editable {
                if planOnly {
                    MedicoTextArea(label: L.text("consultation.plan"), text: $plan, error: draftErrors["plan"] ?? signErrors[ConsultationForm.planKey],
                                   lines: 2...6, required: true)
                        .id(ConsultationForm.planKey)
                } else {
                    MedicoTextArea(label: L.text("consultation.reason"), text: $reason, error: draftErrors["reason"] ?? signErrors[ConsultationForm.reasonKey],
                                   lines: 2...5, required: true)
                        .id(ConsultationForm.reasonKey)
                    MedicoTextArea(label: L.text("consultation.exam"), text: $exam, error: draftErrors["physicalExam"])
                }
                draftStatus
                WriteNotice(submission: saving, reload: loadDetail)
            } else {
                if let text = value.consultation.reason, !text.isEmpty { readOnly("consultation.reason", text) }
                if let text = value.consultation.physicalExam, !text.isEmpty { readOnly("consultation.exam", text) }
                if let text = value.consultation.plan, !text.isEmpty { readOnly("consultation.plan", text) }
            }
        }
    }

    @ViewBuilder private func readOnly(_ key: String, _ text: String) -> some View {
        VStack(alignment: .leading, spacing: Spacing.xs) {
            Text(verbatim: L.text(key)).font(Typo.eyebrow).foregroundStyle(Theme.primaryText).textCase(.uppercase).tracking(Typo.eyebrowTracking)
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
        await vm.searchCie(cieQuery)
    }

    @ViewBuilder private func prescriptionSection(_ value: ConsultationDetail, editable: Bool) -> some View {
        SectionCard(title: L.text("consultation.prescriptions")) {
            ForEach(value.prescriptions) { prescription in
                VStack(alignment: .leading, spacing: Spacing.xs) {
                    Text(verbatim: ClimesaDates.short(prescription.issuedAt)).font(Typo.time).foregroundStyle(Theme.muted)
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
                    ClimesaSegmented(title: L.text("lab.priority"),
                                     options: [ClimesaSegmented<LabPriority>.Option(.rutina, LabPriority.rutina.label), ClimesaSegmented<LabPriority>.Option(.urgente, LabPriority.urgente.label)],
                                     selection: $priority)
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
        await vm.loadDetail(consultationId: id)
        // The server's version is the one the next write sends (a live event after our own save brings it too).
        if let summary = detail.value?.consultation, inflight == nil { version = summary.version }
        // El borrador se llena con lo guardado al abrir y cuando otra versión reemplaza la que se estaba editando.
        if let summary = detail.value?.consultation, prefilledVersion == nil || saving.lastFailure?.isVersionConflict == true
            || autosaving.lastFailure?.isVersionConflict == true {
            autosaving.clearFailure()
            let firstFill = prefilledVersion == nil
            reason = summary.reason ?? ""; exam = summary.physicalExam ?? ""; plan = summary.plan ?? ""
            savedNotes = ConsultationDraft(reason: reason, exam: exam, plan: plan)
            if firstFill { principal = ConsultationRecordRules.defaultPrincipal(detail.value?.diagnoses ?? []) }
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
        await vm.loadLabOrders(consultationId: id)
    }

    private func loadCatalog() async { await vm.loadCatalog() }

    // MARK: - Escrituras

    /// I-18: the consultation starts when the screen opens from «Atender» or «Iniciar»; one try, then a manual retry.
    private func autoStart() async {
        guard !autoStartTried else { return }
        if consultationId == nil && profile.hasPermission("consulta.iniciar") { await start() }
        autoStartTried = true
    }

    private func start() async {
        // The new consultation, the resumed one, or the one this doctor already started; nil keeps the manual retry.
        if let id = await vm.start(origin) { consultationId = id }
    }

    /// Saves the notes; returns the consultation version the API answered with, or nil if the save did not go through.
    @discardableResult
    private func save(_ value: ConsultationDetail) async -> Int? {
        // Lote 5 S12: a pending autosave goes first, so this save sends the version it returned (no 409).
        await joinAutosave()
        draftErrors = ConsultationRules.draftErrors(reason: reason, physicalExam: exam, plan: plan)
        guard draftErrors.isEmpty, let id = consultationId else { return nil }
        let saved = await vm.save(consultationId: id, version: version ?? value.consultation.version, reason: reason, exam: exam, plan: plan)
        if let saved {
            version = saved.version
            savedFeedback = ConsultationAutosave.savedByHandText(Date())
            // The notes are saved, so an earlier "not saved" error next to «Firmar» no longer applies.
            signSaveFailed = false
            // Las notas ya están en la API: el borrador local solo conserva el diagnóstico o la receta pendientes.
            savedNotes = ConsultationDraft(reason: reason, exam: exam, plan: plan)
            draftRecovered = false
            persistDraft()
        }
        await loadDetail()
        return saved?.version
    }

    private func addDiagnosis() async {
        codeError = ConsultationRules.diagnosisSelectionError(cieChoice)
        guard codeError == nil, let choice = cieChoice, let id = consultationId else { return }
        let text = note.trimmingCharacters(in: .whitespacesAndNewlines)
        let created = await vm.addDiagnosis(consultationId: id, code: choice.code, principal: principal, note: text.isEmpty ? nil : text)
        let ok = created != nil
        if ok { diagnosisNames[choice.code] = choice.description }
        if ok, let created { diagnosisNames[created.code] = created.description }
        if ok { cieChoice = nil; cieQuery = ""; cieResults.clear(); note = "" }
        await loadDetail()
        if ok { principal = ConsultationRecordRules.defaultPrincipal(detail.value?.diagnoses ?? []) }
    }

    private func prescribe() async {
        let items = lines.map(\.body)
        lineError = items.compactMap { ConsultationRules.prescriptionError($0) }.first
        guard lineError == nil, !items.isEmpty, let id = consultationId else { return }
        let ok = await vm.prescribe(consultationId: id, items: items, success: L.text("rx.issued"))
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
        let ok = await vm.orderLab(consultationId: id, exams: selectedExams.sorted(), priority: priority, success: L.text("lab.ordered"))
        if ok {
            orderedHere.formUnion(selectedExams)
            _ = DraftStore.shared.save(orderedHere, user: profile.id, key: ConsultationRecordRules.orderedKey(id))
            selectedExams = []
        }
        await loadLabOrders()
    }

    /// «Guardar borrador»: the notes go to the server now; the bar says «Borrador guardado a las …».
    private func saveDraft(_ value: ConsultationDetail) async {
        if notesPending { await save(value) } else { await joinAutosave(); savedFeedback = ConsultationAutosave.savedByHandText(Date()) }
    }

    private func sign(_ value: ConsultationDetail) async {
        guard !signFlow, let id = consultationId else { return }
        // Lote 5 S12: join a pending autosave before anything else, so the sign uses the version it returned.
        await joinAutosave()
        signFlow = true
        signSaveFailed = false
        defer { signFlow = false }
        var version = self.version ?? value.consultation.version
        // Signing never loses typed notes: they are saved first, then the consultation is signed at the version the
        // save returned.
        if notesPending {
            guard let saved = await save(value) else { signSaveFailed = true; return }
            version = saved
        }
        let signed = await vm.sign(consultationId: id, version: version, success: L.text("consultation.signed"))
        handoff = signed?.nextProposal
        if signed != nil, let key = draftKey {
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
            } else if let text = next.noProposalText {
                // D74: people wait, but with another doctor's appointment; "Nadie espera" would be false.
                Text(verbatim: text).font(Typo.body).foregroundStyle(Theme.ink).fixedSize(horizontal: false, vertical: true)
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
        // The view model clears the last undo failure when the call goes through.
        if let result = await vm.call(proposal) {
            handoff = nil
            lastCall = (result.id, result.version, proposal.code)
        }
    }

    private func undoCall() async {
        guard let last = lastCall else { return }
        let ok = await vm.undoCall(ticketId: last.id, version: last.version, success: String(format: L.text("queue.undone"), last.code))
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
                            if state == .hecho { ClimesaIcon(.check, size: 14).accessibilityHidden(true) }
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

/// S13 / D35 (owner) · «¿Firmar la consulta?»: the counts the signature closes, each zero as an amber chip with a warning
/// icon (never a block), then what signing does and the one primary «Firmar consulta».
private struct SignConfirmSheet: View {
    let counts: [ConsultationRecordRules.SignCount]
    let effect: String
    let confirm: () -> Void
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScreenFrame(title: "consultation.sign.confirm", onClose: { dismiss() }) {
                FlowLayout(spacing: Spacing.s) {
                    ForEach(counts, id: \.text) { count in
                        HStack(spacing: Spacing.xs) {
                            if count.empty { ClimesaIcon(.alert, size: 14).accessibilityHidden(true) }
                            Text(verbatim: count.text).font(Typo.label)
                        }
                        .padding(.horizontal, Spacing.m).padding(.vertical, Spacing.xs)
                        .foregroundStyle(count.empty ? Theme.warning : Theme.ink)
                        .background(count.empty ? Theme.warningSoft : Theme.soft, in: RoundedRectangle(cornerRadius: Radius.control))
                        .overlay(RoundedRectangle(cornerRadius: Radius.control).stroke(count.empty ? Theme.warning : Theme.line, lineWidth: 1))
                        .accessibilityElement(children: .combine)
                    }
                }
                Text(verbatim: effect).font(Typo.body).foregroundStyle(Theme.ink).fixedSize(horizontal: false, vertical: true)
                ClimesaButton(title: L.text("consultation.sign"), action: confirm)
            }
        }
        .presentationDetents([.medium, .large])
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
                        ClimesaIcon(.close, size: 22).frame(width: 44, height: 44).contentShape(Rectangle())
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

/// Lote 5 S3: one vital-signs reading, each sign on its own line with its full name and unit.
struct VitalSignsBlock: View {
    let sign: ConsultationDetail.VitalSigns
    let when: String

    var body: some View {
        let parts = ConsultationVitalsText.parts(sign)
        VStack(alignment: .leading, spacing: Spacing.xs) {
            Text(verbatim: when).font(Typo.time).foregroundStyle(Theme.muted)
            if parts.isEmpty { Text(verbatim: "—").font(Typo.body).foregroundStyle(Theme.muted) }
            ForEach(parts, id: \.name) { part in
                ViewThatFits(in: .horizontal) {
                    HStack(alignment: .firstTextBaseline, spacing: Spacing.s) {
                        Text(verbatim: part.name).font(Typo.small).foregroundStyle(Theme.muted)
                        Spacer(minLength: Spacing.s)
                        Text(verbatim: part.value).font(Typo.label).foregroundStyle(Theme.ink)
                    }
                    VStack(alignment: .leading, spacing: 2) {
                        Text(verbatim: part.name).font(Typo.small).foregroundStyle(Theme.muted)
                        Text(verbatim: part.value).font(Typo.label).foregroundStyle(Theme.ink)
                    }
                }
            }
        }
        .padding(.vertical, Spacing.s)
        .accessibilityElement(children: .combine)
    }
}
