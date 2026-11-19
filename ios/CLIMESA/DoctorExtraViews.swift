import SwiftUI

// Pantallas del Médico de la ronda 3: agenda completa, expediente con habitación y ambulancia con bitácora filtrable.

/// Agenda de las citas de sus pacientes, por día: próximas primero y las anteriores en un bloque aparte.
struct DoctorAgendaView: View {
    let profile: AccessProfile
    @EnvironmentObject private var account: AccountModel
    @Environment(LiveViewModel.self) private var live
    @State private var loader = Loader<[AgendaEntry]>()
    @State private var showPast = false

    var body: some View {
        LoadState(loader: loader, retry: load) { entries in
            let upcoming = AgendaRules.upcoming(entries, now: Date())
            let past = AgendaRules.past(entries, now: Date())
            if upcoming.isEmpty { EmptyStateView(title: L.text("agenda.none")) }
            ForEach(upcoming) { day in dayCard(day) }
            if !past.isEmpty {
                Toggle("agenda.past", isOn: $showPast).font(Typo.label).tint(Theme.primary)
                if showPast { ForEach(past) { day in dayCard(day) } }
            }
        }
        .task(id: live.snapshot.version([.appointments, .consultations])) { await load() }
    }

    @ViewBuilder private func dayCard(_ day: AgendaDay) -> some View {
        SectionCard(title: day.entries.first.map { ClimesaDates.shortDay($0.start) } ?? "—") {
            ForEach(Array(day.entries.enumerated()), id: \.element.id) { index, entry in
                if index > 0 { Divider().overlay(Theme.line) }
                row(entry)
            }
        }
    }

    @ViewBuilder private func row(_ entry: AgendaEntry) -> some View {
        let content = VStack(alignment: .leading, spacing: Spacing.s) {
            ListRow(title: entry.patientName ?? L.text("day.patient.unknown"), subtitle: entry.reason, meta: ClimesaDates.display(entry.start, .time)) {
                if let state = entry.consultationState { MedicoTag(state.rawValue, label: state.label) }
                else { MedicoTag(entry.appointmentState.rawValue, label: entry.appointmentState.label) }
            }
            CategoryMarks(categories: entry.categories)
        }
        if account.can("expediente.ver") {
            NavigationLink { PatientRecordScreen(patientId: entry.patientId) } label: { content }.buttonStyle(.plain)
        } else {
            content
        }
    }

    private func load() async { await loader.load { try await account.client().get("/consultas/agenda", as: [AgendaEntry].self) } }
}

/// Expediente de un paciente que ve el médico: habitación asignada y historial clínico.
/// Sin relación de atención la API responde 403 y la pantalla explica que solo ve el médico tratante.
struct PatientRecordScreen: View {
    let patientId: String
    @EnvironmentObject private var account: AccountModel
    @State private var externalOpen = false
    @State private var externalNotice: String?
    /// D4: goes up after an external result is recorded, so the history (and its lab results) is read again.
    @State private var historyRefresh = 0

    var body: some View {
        ScreenFrame(title: "patients.record") {
            DoctorPatientRoom(patientId: patientId)
            DoctorPatientVitals(patientId: patientId)
            if let externalNotice { PatientNotice(text: externalNotice) }
            // D4 · rule 8: the action depends on `laboratorio.ordenar`, never on the role; it shows inside the patient card
            // only once the history was read (403 without a care relationship), as on Android.
            ClinicalHistoryView(patientId: patientId, viewerIsPatient: false,
                                recordExternal: { externalNotice = nil; externalOpen = true }).id(historyRefresh)
        }
        .sheet(isPresented: $externalOpen) {
            ExternalRecordSheet(patientId: patientId, reload: { historyRefresh += 1 }) { message in externalNotice = message }
        }
    }
}

/// Habitación del paciente si está hospitalizado a cargo de este médico (`/admisiones` ya filtra por relación de atención).
private struct DoctorPatientRoom: View {
    let patientId: String
    @EnvironmentObject private var account: AccountModel
    @Environment(LiveViewModel.self) private var live
    @State private var loader = Loader<[Admission]>()

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.s) {
            // CH-02: si la lectura falla se dice, en vez de parecer que el paciente no está hospitalizado.
            if let error = loader.error {
                SectionCard(title: L.text("room.eyebrow")) { PartError(message: error, failure: loader.failure, retry: load) }
            } else if let room = loader.value.flatMap({ RoomRules.current($0, patientId: patientId) }) {
                RoomCard(admission: room)
                Text("room.treating_only").font(Typo.caption).foregroundStyle(Theme.muted)
            }
        }
        .task(id: live.snapshot.version(.admissions)) { await load() }
    }

    private func load() async {
        guard account.can("admision.ver") else { loader.clear(); return }
        await loader.load { try await account.client().get("/admisiones", as: [Admission].self) }
    }
}

/// Row 4: últimos signos vitales del paciente, solo lectura (`GET /pacientes/{id}/signos`, permiso `signos.registrar`).
/// Sin relación de atención la API responde 403: la tarjeta no se muestra y el expediente ya explica por qué.
private struct DoctorPatientVitals: View {
    let patientId: String
    @EnvironmentObject private var account: AccountModel
    @Environment(LiveViewModel.self) private var live
    @State private var loader = Loader<PatientVitalsHistory?>()
    @State private var entryOpen = false
    @State private var notice: String?

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.s) {
            if let error = loader.error {
                SectionCard(title: L.text("consultation.vitals")) { PartError(message: error, failure: loader.failure, retry: load) }
            } else if let history = loader.value ?? nil {
                let items = PatientVitalsRules.latest(history.items)
                SectionCard(title: L.text("consultation.vitals")) {
                    if items.isEmpty { Text("consultation.vitals.none").font(Typo.small).foregroundStyle(Theme.muted) }
                    ForEach(Array(items.enumerated()), id: \.element.id) { index, sign in
                        if index > 0 { Divider().overlay(Theme.line) }
                        VitalSignsBlock(sign: sign, when: ClimesaDates.short(sign.takenAt))
                    }
                    // D5 · rule 8: recording depends on `signos.registrar`, never on the role.
                    if VitalsEntryRules.canRecord(account.profile) {
                        CrudButton(kind: .create, label: L.text("vitals.entry.open")) { notice = nil; entryOpen = true }
                    }
                }
                if let notice { PatientNotice(text: notice) }
            }
        }
        .task(id: live.snapshot.version([.consultations, .admissions])) { await load() }
        .sheet(isPresented: $entryOpen) {
            VitalsEntrySheet(patientId: patientId, admissionId: (loader.value ?? nil)?.admissionId) { message in
                notice = message
                Task { await load() }
            }
        }
    }

    private func load() async {
        guard account.can("signos.registrar") else { loader.clear(); return }
        await loader.load {
            do { return try await account.client().get("/pacientes/\(patientId)/signos", as: PatientVitalsHistory.self) }
            catch let failure as APIFailure where failure.isForbidden { return nil }
        }
    }
}

/// D5 · «Registrar signos vitales» from the record: the same measures, limits and messages as Android (`VitalsEntryRules`).
/// Only filled measures are sent to `POST /pacientes/{id}/signos`, linked to the active admission when there is one.
private struct VitalsEntrySheet: View {
    let patientId: String
    let admissionId: String?
    let onDone: (String) -> Void
    @EnvironmentObject private var account: AccountModel
    @Environment(\.dismiss) private var dismiss
    @State private var values: [VitalEntryMeasure: String] = [:]
    @State private var note = ""
    @State private var problem: String?
    @State private var submission = Submission()

    var body: some View {
        NavigationStack {
            ScreenFrame(title: "vitals.entry.title", onClose: { if !submission.busy { dismiss() } }) {
                SectionCard(title: L.text("vitals.entry.measures")) {
                    Text("vitals.entry.hint").font(Typo.small).foregroundStyle(Theme.muted).fixedSize(horizontal: false, vertical: true)
                    ForEach(VitalEntryMeasure.allCases, id: \.self) { measure in
                        FormField(label: "\(measure.label) (\(measure.unit))", text: binding(measure), hint: measure.rangeText,
                                  error: VitalsEntryRules.fieldError(measure, values[measure] ?? ""))
                            .keyboardType(measure.decimals ? .decimalPad : .numberPad)
                    }
                }
                .disabled(submission.busy)
                VStack(alignment: .leading, spacing: Spacing.xs) {
                    MedicoTextArea(label: L.text("vitals.entry.note"), text: $note, error: submission.fieldErrors["note"], lines: 2...4)
                    CharacterCounter(count: note.count, range: 0...VitalsEntryRules.noteMaximum)
                }
                .disabled(submission.busy)
                if let problem { PatientNotice(text: problem, failure: true) }
                SubmissionNotice(submission: submission)
                ClimesaButton(title: L.text("vitals.entry.save"), loading: submission.busy) { Task { await save() } }
            }
        }
        .interactiveDismissDisabled(submission.busy)
    }

    private func binding(_ measure: VitalEntryMeasure) -> Binding<String> {
        Binding(get: { values[measure] ?? "" }, set: { values[measure] = String($0.prefix(6)) })
    }

    private func save() async {
        problem = VitalsEntryRules.formError(values, note: note)
        guard problem == nil else { return }
        let body = VitalsEntryRules.body(values, note: note, admissionId: admissionId)
        let ok = await submission.run(patientId, body: body) { key in
            _ = try await account.client().send("POST", VitalsEntryRules.path(patientId), body: body, key: key, as: VitalsEntrySaved.self)
        }
        guard ok else { return }
        onDone(L.text("vitals.entry.done"))
        dismiss()
    }
}

/// D4 · «Registrar resultado externo» (R7 C-5): an exam the patient had done elsewhere without an order. The values and the
/// file reference go first (`POST /laboratorio/pacientes/{id}/resultado-externo`), then the file with its progress, as
/// `ExternalResultSheet` does; if the upload fails the values stay saved and «Reintentar» uploads the same bytes.
private struct ExternalRecordSheet: View {
    let patientId: String
    let reload: () -> Void
    let onDone: (String) -> Void
    @EnvironmentObject private var account: AccountModel
    @Environment(\.dismiss) private var dismiss
    @State private var catalog = Loader<[LabExam]>()
    @State private var place = ""
    @State private var query = ""
    @State private var exams: [LabExam] = []
    @State private var values: [String: String] = [:]
    @State private var file: LabExternalFile?
    @State private var note = ""
    @State private var problem: String?
    @State private var flow = ExternalResultFlow()
    @State private var valuesSubmission = Submission()
    @State private var upload = FileUpload()

    var body: some View {
        NavigationStack {
            ScreenFrame(title: "record.external.open", onClose: { if !flow.busy { dismiss() } }) {
                Text("record.external.intro").font(Typo.small).foregroundStyle(Theme.muted).fixedSize(horizontal: false, vertical: true)
                FormField(label: L.text("record.external.place"), text: $place, hint: L.text("record.external.placeHint"))
                    .disabled(!flow.canEdit)
                SectionCard(title: L.text("record.external.exams")) {
                    ForEach(exams) { exam in
                        HStack(alignment: .bottom, spacing: Spacing.s) {
                            FormField(label: label(exam), text: binding(exam)).keyboardType(exam.numeric ? .decimalPad : .default)
                            Button(L.text("record.external.remove")) { remove(exam) }.font(Typo.label).foregroundStyle(Theme.primaryText)
                                .frame(minHeight: Spacing.control)
                        }
                    }
                    examPicker
                }
                .disabled(!flow.canEdit)
                SectionCard(title: L.text("results.externalLoad.file")) {
                    ExternalFilePicker(file: $file, problem: $problem).disabled(!flow.canEdit)
                }
                VStack(alignment: .leading, spacing: Spacing.xs) {
                    MedicoTextArea(label: L.text("results.externalLoad.note"), text: $note, error: valuesSubmission.fieldErrors["note"], lines: 2...4)
                    CharacterCounter(count: note.trimmingCharacters(in: .whitespacesAndNewlines).count, range: 0...LabExternalRules.noteMaximum)
                }
                .disabled(!flow.canEdit)
                if let problem { PatientNotice(text: problem, failure: true) }
                status
                ClimesaButton(title: L.text(flow.filePending ? "results.externalLoad.retry" : "record.external.save"), loading: flow.busy) {
                    Task { await save() }
                }
            }
        }
        .interactiveDismissDisabled(flow.busy)
        .task { await catalog.load { try await account.client().get("/laboratorio/catalogo", as: [LabExam].self) } }
    }

    @ViewBuilder private var examPicker: some View {
        if let error = catalog.error {
            PartError(message: error) { await catalog.load { try await account.client().get("/laboratorio/catalogo", as: [LabExam].self) } }
        } else if let all = catalog.value {
            FormField(label: L.text("record.external.search"), text: $query)
            let typed = query.trimmingCharacters(in: .whitespacesAndNewlines)
            if typed.count >= 2 {
                let matches = Array(ExternalRecordRules.options(all, picked: exams, query: typed).prefix(6))
                if matches.isEmpty { Text("record.external.noMatch").font(Typo.small).foregroundStyle(Theme.muted) }
                ForEach(matches) { exam in
                    Button { add(exam) } label: {
                        Label { Text(verbatim: "\(exam.name) · \(exam.code)") } icon: { ClimesaIcon(.plus, size: 18) }
                            .font(Typo.body).foregroundStyle(Theme.primaryText).frame(maxWidth: .infinity, minHeight: Spacing.control, alignment: .leading)
                    }
                    .buttonStyle(.plain)
                }
            }
        } else {
            HStack(spacing: Spacing.s) {
                ProgressView().tint(Theme.primary)
                Text("record.external.catalogLoading").font(Typo.small).foregroundStyle(Theme.muted)
            }
        }
    }

    @ViewBuilder private var status: some View {
        switch flow.status {
        case .saving:
            UploadProgressRow(progress: nil)
        case .uploading:
            UploadProgressRow(progress: upload.progress)
        case let .failed(message):
            if flow.filePending {
                VStack(alignment: .leading, spacing: Spacing.xs) {
                    Text("results.externalLoad.filePending").font(Typo.label).foregroundStyle(Theme.danger)
                    Text(verbatim: message).font(Typo.small).foregroundStyle(Theme.ink).fixedSize(horizontal: false, vertical: true)
                }
                .padding(Spacing.l).frame(maxWidth: .infinity, alignment: .leading)
                .background(Theme.dangerSoft, in: RoundedRectangle(cornerRadius: Radius.card))
                .overlay(RoundedRectangle(cornerRadius: Radius.card).stroke(Theme.danger, lineWidth: 1))
                .accessibilityElement(children: .combine)
            } else {
                PatientNotice(text: message, failure: true)
            }
        case .editing, .done:
            EmptyView()
        }
    }

    private func label(_ exam: LabExam) -> String {
        guard exam.numeric, let unit = exam.unit, !unit.isEmpty else { return exam.name }
        return "\(exam.name) (\(unit))"
    }

    private func binding(_ exam: LabExam) -> Binding<String> {
        Binding(get: { values[exam.id] ?? "" }, set: { values[exam.id] = String($0.prefix(ExternalRecordRules.textMaximum)) })
    }

    private func add(_ exam: LabExam) {
        guard exams.count < ExternalRecordRules.examMaximum, !exams.contains(where: { $0.id == exam.id }) else { return }
        exams.append(exam); query = ""
    }

    private func remove(_ exam: LabExam) {
        exams.removeAll { $0.id == exam.id }; values[exam.id] = nil
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
        problem = ExternalRecordRules.error(place: place, exams: exams, values: values, file: file, note: note)
        guard problem == nil, let file else { return }
        let body = ExternalRecordRules.body(place: place, file: file, exams: exams, values: values, note: note)
        flow.begin()
        var saved: LabExternalRecordSaved?
        let ok = await valuesSubmission.run(patientId, body: body) { key in
            saved = try await account.client().send("POST", ExternalRecordRules.path(patientId), body: body, key: key, as: LabExternalRecordSaved.self)
        }
        guard ok, let saved else {
            flow.fail(valuesSubmission.error ?? L.text("results.externalLoad.failed"))
            return
        }
        flow.valuesSaved(attachmentId: saved.attachmentId)
        reload()
        if case let .upload(attachmentId) = flow.next { await sendFile(attachmentId) } else { finish() }
    }

    private func sendFile(_ attachmentId: String) async {
        guard let file else { return }
        flow.begin()
        if await upload.send(file, attachmentId: attachmentId, account: account) {
            flow.fileStored()
            finish()
        } else {
            flow.fail(upload.error ?? LabAttachmentRules.uploadFallback)
        }
    }

    private func finish() {
        onDone(L.text(flow.status == .done(withFile: true) ? "record.external.done" : "record.external.doneNoFile"))
        dismiss()
    }
}

/// Estado de la ambulancia (unidad, motivo de bloqueo, servicio activo) y, con permiso, la bitácora con filtros.
struct AmbulanceOverviewView: View {
    @EnvironmentObject private var account: AccountModel
    @Environment(LiveViewModel.self) private var live
    @State private var status = Loader<AmbulanceStatus>()
    @State private var log = Loader<[AmbulanceLogEntry]>()
    @State private var query = AmbulanceLogQuery()
    @State private var filtersOpen = false
    /// Past days of the log stay folded until opened.
    @State private var pastOpen = false
    /// Filters of the last request, so a filter change reloads once and the first appearance does not load twice.
    @State private var filtersApplied: String?

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.l) {
            LoadState(loader: status, retry: loadStatus) { value in statusSection(value) }
            if account.can("ambulancia.ver_bitacora") {
                logSection
            } else {
                PatientNotice(text: L.text("ambulance.log.restricted"))
            }
        }
        .task(id: live.snapshot.version(.ambulance)) {
            await loadStatus()
            if account.can("ambulancia.ver_bitacora") { await loadLog() }
        }
        // S13: priority, state and dates apply as soon as they change; there is no separate «Aplicar» step.
        .task(id: query.autoApplyKey) {
            guard filtersApplied != nil, filtersApplied != query.autoApplyKey, account.can("ambulancia.ver_bitacora") else { return }
            await loadLog()
        }
    }

    @ViewBuilder private func statusSection(_ value: AmbulanceStatus) -> some View {
        // Owner obs. 19: one header with the unit, its real state (never «Disponible» under a dispatch block), the
        // block's reason and whether a service is active.
        let tag = AmbulanceLogRules.unitTag(value)
        SectionCard(eyebrow: L.text("ambulance.unit")) {
            ListRow(title: value.unit.plate, subtitle: value.dispatchBlock?.message ?? value.unit.stateReason, meta: value.unit.stateSince.map { String(format: L.text("ambulance.since"), ClimesaDates.short($0)) }) {
                StatusTag(tag.value, label: tag.label)
            }
            if let line = AmbulanceLogRules.serviceLine(value) {
                Label { Text(verbatim: line) } icon: { ClimesaIcon(.ambulance, size: 18).accessibilityHidden(true) }
                    .labelStyle(.titleAndIcon).font(Typo.label).foregroundStyle(Theme.ink)
            }
            if let crew = AmbulanceLogRules.crewNotice(value) {
                Text(verbatim: crew).font(Typo.small).foregroundStyle(Theme.ink)
            }
            if let block = value.dispatchBlock {
                // A dispatch block is a warning, not a critical value: warning tone, red stays for critical. Its reason
                // is already the header's subtitle; this line says what to do.
                HStack(alignment: .top, spacing: Spacing.s) {
                    ClimesaIcon(.alert, size: 18).foregroundStyle(Theme.warning).accessibilityHidden(true)
                    Text(verbatim: AmbulanceLogRules.blockAdvice(block, canPlanShifts: account.can("turnos.planificar"))).font(Typo.small).foregroundStyle(Theme.ink).fixedSize(horizontal: false, vertical: true)
                }
            }
            ReadOnlyBadge(who: "Jefatura de Operaciones", what: "el estado de la ambulancia")
        }
        if let service = value.activeService {
            SectionCard(eyebrow: L.text("ambulance.active")) {
                ListRow(title: "\(service.origin) → \(service.destination)", meta: String(format: L.text("arrival.dispatched"), ClimesaDates.display(service.dispatchedAt, .time))) {
                    MedicoTag(service.priority.rawValue, label: service.priority.label)
                }
                if AmbulanceLogRules.isUnclosed(dispatchedAt: service.dispatchedAt) { PriorityBadge(.urgente, label: L.text("ambulance.unclosed")) }
                if let milestones = service.milestones {
                    ForEach(["salida", "en_escena", "trasladando", "en_hospital", "finalizado"], id: \.self) { type in
                        let done = milestones.first { $0.type == type }
                        HStack {
                            Text(verbatim: AmbulanceRules.milestoneLabel(type)).font(Typo.small).foregroundStyle(done == nil ? Theme.muted : Theme.ink)
                            Spacer()
                            Text(verbatim: done.map { ClimesaDates.display($0.occurredAt, .time) } ?? "—").font(Typo.time).foregroundStyle(Theme.muted)
                        }
                    }
                }
            }
        }
    }

    @ViewBuilder private var logSection: some View {
        SectionTitle("ambulance.log")
        SectionCard {
            FormField(label: L.text("ambulance.log.search"), text: $query.text, hint: L.text("ambulance.log.search.hint"))
                .textInputAutocapitalization(.never).autocorrectionDisabled().submitLabel(.search)
                .onSubmit { Task { await loadLog() } }
            Button { filtersOpen.toggle() } label: {
                HStack {
                    ClimesaIcon(.filter, size: 18).accessibilityHidden(true)
                    Text(verbatim: query.activeCount == 0 ? L.text("ambulance.log.filters") : String(format: L.text("ambulance.log.filters.active"), query.activeCount)).font(Typo.label)
                    Spacer()
                    Image(systemName: filtersOpen ? "chevron.up" : "chevron.down").accessibilityHidden(true)
                }.foregroundStyle(Theme.primaryText).frame(minHeight: Spacing.control)
            }
            if filtersOpen { filterPanel }
            if query.activeCount > 0 {
                ClimesaButton(title: L.text("ambulance.log.clear"), kind: .secondary) {
                    // Only the text was active: no filter key changes, so reload here.
                    let textOnly = query.autoApplyKey == AmbulanceLogQuery().autoApplyKey
                    query = AmbulanceLogQuery()
                    if textOnly { Task { await loadLog() } }
                }
            }
        }
        LoadState(loader: log, retry: loadLog) { entries in
            if entries.isEmpty { EmptyStateView(title: L.text("ambulance.log.none")) }
            // Day-grouped: today open, the past days folded (open by themselves when nothing happened today).
            let days = AmbulanceLogRules.days(entries)
            if let today = days.today { dayGroup(ClimesaDates.localDay(Date()), today) }
            if !days.past.isEmpty {
                DisclosureGroup(isExpanded: Binding(get: { pastOpen || days.today == nil }, set: { pastOpen = $0 })) {
                    ForEach(days.past) { group in dayGroup(group.day, group.entries) }
                } label: {
                    Text(verbatim: String(format: L.text("ambulance.log.pastDays"), days.past.reduce(0) { $0 + $1.entries.count })).font(Typo.label).foregroundStyle(Theme.muted)
                }
            }
        }
    }

    @ViewBuilder private var filterPanel: some View {
        VStack(alignment: .leading, spacing: Spacing.m) {
            // Each priority filters with the triage colour its rows wear.
            Text("ambulance.log.priority").font(Typo.label).foregroundStyle(Theme.ink)
            FlowLayout(spacing: Spacing.s) {
                StatusFilterChip(label: L.text("ambulance.log.any"), selected: query.priority == nil) { query.priority = nil }
                ForEach([AmbulancePriority.roja, .naranja, .amarilla, .verde], id: \.self) { priority in
                    StatusFilterChip(label: priority.label, priority: AmbulanceLogRules.priorityLevel(priority), selected: query.priority == priority) { query.priority = priority }
                }
            }
            // Each final state filters with the badge its rows wear.
            Text("ambulance.log.state").font(Typo.label).foregroundStyle(Theme.ink)
            FlowLayout(spacing: Spacing.s) {
                StatusFilterChip(label: L.text("ambulance.log.any"), selected: query.finalState == nil) { query.finalState = nil }
                ForEach(AmbulanceFinalState.allCases, id: \.self) { state in
                    StatusFilterChip(label: state.label, status: state.statusValue, selected: query.finalState == state) { query.finalState = state }
                }
            }
            Toggle("ambulance.log.from", isOn: dayToggle(\.from)).tint(Theme.primary)
            if query.from != nil { DatePicker("ambulance.log.from", selection: dayBinding(\.from), displayedComponents: .date).labelsHidden()
                .environment(\.timeZone, ClimesaDates.zone).environment(\.calendar, ClimesaDates.calendar) }
            Toggle("ambulance.log.to", isOn: dayToggle(\.to)).tint(Theme.primary)
            if query.to != nil { DatePicker("ambulance.log.to", selection: dayBinding(\.to), displayedComponents: .date).labelsHidden()
                .environment(\.timeZone, ClimesaDates.zone).environment(\.calendar, ClimesaDates.calendar) }
            FieldError(text: query.rangeError)
        }
    }

    @ViewBuilder private func dayGroup(_ day: String, _ entries: [AmbulanceLogEntry]) -> some View {
        Text(verbatim: ClimesaDates.shortDay(day)).font(Typo.label).foregroundStyle(Theme.ink).padding(.top, Spacing.s)
            .accessibilityAddTraits(.isHeader)
        ForEach(entries) { entry in logRow(entry) }
    }

    @ViewBuilder private func logRow(_ entry: AmbulanceLogEntry) -> some View {
        SectionCard {
            ListRow(title: "\(entry.origin) → \(entry.destination)", subtitle: [AmbulanceLogRules.typeLabel(entry.type), entry.municipality].compactMap { $0 }.joined(separator: " · "),
                    meta: ClimesaDates.short(entry.dispatchedAt)) {
                MedicoTag(entry.priority.rawValue, label: entry.priority.label)
            }
            HStack(spacing: Spacing.s) {
                let tag = AmbulanceLogRules.finalTag(entry)
                MedicoTag(tag.value, label: tag.label)
                if let response = AmbulanceLogRules.responseText(entry.responseMinutes) { Text(verbatim: response).font(Typo.small).foregroundStyle(Theme.muted) }
            }
            if !entry.crew.isEmpty {
                Text(verbatim: entry.crew.map(\.name).joined(separator: ", ")).font(Typo.small).foregroundStyle(Theme.muted)
            }
        }
    }

    private func dayToggle(_ keyPath: WritableKeyPath<AmbulanceLogQuery, String?>) -> Binding<Bool> {
        Binding(get: { query[keyPath: keyPath] != nil },
                set: { query[keyPath: keyPath] = $0 ? ClimesaDates.localDay(Date()) : nil })
    }

    private func dayBinding(_ keyPath: WritableKeyPath<AmbulanceLogQuery, String?>) -> Binding<Date> {
        Binding(get: { ClimesaDates.pickerDate(day: query[keyPath: keyPath]) ?? Date() },
                set: { query[keyPath: keyPath] = ClimesaDates.localDay($0) })
    }

    private func loadStatus() async { await status.load { try await account.client().get("/ambulancia", as: AmbulanceStatus.self) } }

    private func loadLog() async {
        guard query.rangeError == nil else { return }
        filtersApplied = query.autoApplyKey
        let path = query.path
        await log.load { try await account.client().get(path, as: [AmbulanceLogEntry].self) }
    }
}
