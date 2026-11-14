import SwiftUI

/// Desde dónde se abre la consulta: una cita de la agenda o un número llamado de la fila.
enum ConsultationOrigin {
    case appointment(AgendaEntry)
    case ticket(QueueTicket)
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

/// I21 · Consulta: signos (de asistente), motivo, examen, diagnósticos CIE-10, receta, órdenes de laboratorio,
/// indicación de hospitalización; guardar y firmar. La API decide las transiciones y exige la versión vigente.
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
    @State private var admitting = Submission()
    @State private var signing = Submission()
    @State private var prefilledVersion: Int?
    @State private var reason = ""
    @State private var exam = ""
    @State private var plan = ""
    @State private var draftErrors: [String: String] = [:]
    @State private var code = ""
    @State private var principal = true
    @State private var note = ""
    @State private var codeError: String?
    @State private var lines: [PrescriptionDraft] = [PrescriptionDraft()]
    @State private var lineError: String?
    @State private var selectedExams: Set<String> = []
    @State private var priority: LabPriority = .rutina
    @State private var category: RoomCategory = .semiprivada
    @State private var isolation = false
    @State private var admissionReason = ""
    @State private var admissionError: String?

    init(origin: ConsultationOrigin, profile: AccessProfile) {
        self.origin = origin
        self.profile = profile
        if case let .appointment(entry) = origin { _consultationId = State(initialValue: entry.consultationId) }
    }

    private var patientName: String {
        switch origin {
        case let .appointment(entry): return entry.patientName ?? L.text("day.patient.unknown")
        case let .ticket(ticket): return ticket.patientName ?? String(format: L.text("consultation.ticket"), ticket.number)
        }
    }

    var body: some View {
        ScreenFrame(title: "consultation.title") {
            Text(verbatim: patientName).font(Typo.heading).foregroundStyle(Theme.ink)
            if consultationId == nil {
                WriteNotice(submission: starting, reload: loadDetail)
                if profile.hasPermission("consulta.iniciar") {
                    ClimesaButton(title: L.text("consultation.start"), loading: starting.busy) { Task { await start() } }
                }
            } else {
                LoadState(loader: detail, retry: loadDetail) { value in
                    editor(value)
                }
            }
        }
        .task(id: "\(consultationId ?? "-")|\(live.snapshot.version(.consultations))") { await loadDetail() }
    }

    @ViewBuilder private func editor(_ value: ConsultationDetail) -> some View {
        let editable = ConsultationRules.isEditable(value.consultation.state) && profile.hasPermission("consulta.registrar")
        MedicoTag(value.consultation.state.rawValue, label: value.consultation.state.label)
        vitalSigns(value.vitalSigns)
        draftSection(value, editable: editable)
        diagnosesSection(value, editable: editable)
        prescriptionSection(value, editable: editable && profile.hasPermission("recetas.emitir"))
        if editable && profile.hasPermission("laboratorio.ordenar") { labSection(value) }
        if editable && profile.hasPermission("admision.solicitar") && profile.staffId != nil { admissionSection(value) }
        if editable {
            WriteNotice(submission: signing, reload: loadDetail)
            ClimesaButton(title: L.text("consultation.sign"), loading: signing.busy) { Task { await sign(value) } }
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

    @ViewBuilder private func draftSection(_ value: ConsultationDetail, editable: Bool) -> some View {
        SectionCard(title: L.text("consultation.notes")) {
            if editable {
                MedicoTextArea(label: L.text("consultation.reason"), text: $reason, error: draftErrors["reason"], lines: 2...5)
                MedicoTextArea(label: L.text("consultation.exam"), text: $exam, error: draftErrors["physicalExam"])
                MedicoTextArea(label: L.text("consultation.plan"), text: $plan, error: draftErrors["plan"], lines: 2...6)
                WriteNotice(submission: saving, reload: loadDetail)
                ClimesaButton(title: L.text("consultation.save"), kind: .secondary, loading: saving.busy) { Task { await save(value) } }
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

    @ViewBuilder private func diagnosesSection(_ value: ConsultationDetail, editable: Bool) -> some View {
        SectionCard(title: L.text("consultation.diagnoses")) {
            ForEach(value.diagnoses) { diagnosis in
                ListRow(title: diagnosis.code, subtitle: diagnosis.note) {
                    if diagnosis.principal { StatusTag("activo", label: L.text("consultation.principal")) }
                }
            }
            if editable {
                FormField(label: L.text("consultation.diagnosis.code"), text: $code, hint: L.text("consultation.diagnosis.hint"), error: codeError)
                    .textInputAutocapitalization(.characters).autocorrectionDisabled()
                Toggle("consultation.principal", isOn: $principal).font(Typo.body).tint(Theme.primary)
                FormField(label: L.text("consultation.diagnosis.note"), text: $note)
                WriteNotice(submission: diagnosing, reload: loadDetail)
                ClimesaButton(title: L.text("consultation.diagnosis.add"), kind: .secondary, loading: diagnosing.busy) { Task { await addDiagnosis() } }
            }
        }
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
                    VStack(alignment: .leading, spacing: Spacing.m) {
                        FormField(label: L.text("rx.medication"), text: $line.medication)
                        HStack(alignment: .top, spacing: Spacing.m) {
                            FormField(label: L.text("rx.dose"), text: $line.dose)
                            FormField(label: L.text("rx.route"), text: $line.route)
                        }
                        HStack(alignment: .top, spacing: Spacing.m) {
                            FormField(label: L.text("rx.frequency"), text: $line.frequency)
                            FormField(label: L.text("rx.duration"), text: $line.duration)
                        }
                        FormField(label: L.text("rx.instructions"), text: $line.instructions)
                    }
                }
                if let lineError { Text(verbatim: lineError).font(Typo.caption).foregroundStyle(Theme.danger) }
                ClimesaButton(title: L.text("rx.addLine"), kind: .secondary) { lines.append(PrescriptionDraft()) }
                WriteNotice(submission: prescribing, reload: loadDetail)
                ClimesaButton(title: L.text("rx.issue"), loading: prescribing.busy) { Task { await prescribe() } }
            }
        }
    }

    @ViewBuilder private func labSection(_ value: ConsultationDetail) -> some View {
        SectionCard(title: L.text("lab.order")) {
            LoadState(loader: catalog, retry: loadCatalog) { exams in
                ForEach(exams) { item in
                    Toggle(isOn: Binding(get: { selectedExams.contains(item.id) }, set: { on in
                        if on { selectedExams.insert(item.id) } else { selectedExams.remove(item.id) }
                    })) {
                        Text(verbatim: item.isPanel ? "\(item.name) · \(L.text("lab.panel"))" : item.name).font(Typo.body).foregroundStyle(Theme.ink)
                    }.tint(Theme.primary)
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
            WriteNotice(submission: ordering, reload: loadDetail)
            ClimesaButton(title: L.text("lab.submit"), loading: ordering.busy) { Task { await order(value) } }
                .disabled(selectedExams.isEmpty || ordering.busy)
        }
    }

    @ViewBuilder private func admissionSection(_ value: ConsultationDetail) -> some View {
        SectionCard(title: L.text("admission.title")) {
            VStack(alignment: .leading, spacing: Spacing.s) {
                Text("admission.category").font(Typo.label).foregroundStyle(Theme.ink)
                Picker("admission.category", selection: $category) {
                    Text(verbatim: RoomCategory.semiprivada.label).tag(RoomCategory.semiprivada)
                    Text(verbatim: RoomCategory.vip.label).tag(RoomCategory.vip)
                }.pickerStyle(.segmented)
            }
            Toggle("admission.isolation", isOn: $isolation).font(Typo.body).tint(Theme.primary)
            MedicoTextArea(label: L.text("admission.reason"), text: $admissionReason, error: admissionError, lines: 2...4)
            WriteNotice(submission: admitting, reload: loadDetail)
            ClimesaButton(title: L.text("admission.submit"), loading: admitting.busy) { Task { await admit(value) } }
        }
    }

    // MARK: - Lecturas

    private func loadDetail() async {
        guard let id = consultationId else { return }
        await detail.load { try await account.client().get("/consultas/\(id)/detalle", as: ConsultationDetail.self) }
        // El borrador se llena con lo guardado al abrir y cuando otra versión reemplaza la que se estaba editando.
        if let summary = detail.value?.consultation, prefilledVersion == nil || saving.lastFailure?.isVersionConflict == true {
            reason = summary.reason ?? ""; exam = summary.physicalExam ?? ""; plan = summary.plan ?? ""
            prefilledVersion = summary.version
        }
    }

    private func loadCatalog() async { await catalog.load { try await account.client().get("/laboratorio/catalogo", as: [LabExam].self) } }

    // MARK: - Escrituras

    private func start() async {
        let body: ConsultationStartBody
        switch origin {
        case let .appointment(entry): body = ConsultationStartBody(appointmentId: entry.appointmentId)
        case let .ticket(ticket): body = ConsultationStartBody(ticketId: ticket.id)
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

    private func save(_ value: ConsultationDetail) async {
        draftErrors = ConsultationRules.draftErrors(reason: reason, physicalExam: exam, plan: plan)
        guard draftErrors.isEmpty, let id = consultationId else { return }
        let body = ConsultationUpdateBody(version: value.consultation.version, reason: reason, physicalExam: exam, plan: plan)
        await saving.run(id, body: body, success: L.text("consultation.saved")) { key in
            _ = try await account.client().send("PATCH", "/consultas/\(id)", body: body, key: key, as: ConsultationCommandResult.self)
        }
        await loadDetail()
    }

    private func addDiagnosis() async {
        codeError = ConsultationRules.diagnosisCodeError(code)
        guard codeError == nil, let id = consultationId else { return }
        let text = note.trimmingCharacters(in: .whitespacesAndNewlines)
        let body = DiagnosisBody(code: code.trimmingCharacters(in: .whitespaces).uppercased(), principal: principal, note: text.isEmpty ? nil : text)
        let ok = await diagnosing.run(body: body) { key in
            _ = try await account.client().send("POST", "/consultas/\(id)/diagnosticos", body: body, key: key, as: DiagnosisCreated.self)
        }
        if ok { code = ""; note = ""; principal = false }
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
        let body = LabOrderBody(consultationId: value.consultation.id, exams: selectedExams.sorted(), priority: priority)
        let ok = await ordering.run(body: body, success: L.text("lab.ordered")) { key in
            _ = try await account.client().send("POST", "/laboratorio/ordenes", body: body, key: key, as: LabOrderCreated.self)
        }
        if ok { selectedExams = [] }
    }

    private func admit(_ value: ConsultationDetail) async {
        admissionError = DischargeRules.admissionReasonError(admissionReason)
        guard admissionError == nil, let staffId = profile.staffId else { return }
        let text = admissionReason.trimmingCharacters(in: .whitespacesAndNewlines)
        let body = AdmissionBody(patientId: value.consultation.patientId, consultationId: value.consultation.id, category: category,
                                 isolation: isolation, attendingDoctorId: staffId, reason: text.isEmpty ? nil : text)
        await admitting.run(body: body, success: L.text("admission.done")) { key in
            _ = try await account.client().send("POST", "/admisiones/indicaciones", body: body, key: key, as: AdmissionCommandResult.self)
        }
    }

    private func sign(_ value: ConsultationDetail) async {
        guard let id = consultationId else { return }
        let body = VersionBody(version: value.consultation.version)
        await signing.run(id, body: body, success: L.text("consultation.signed")) { key in
            _ = try await account.client().send("POST", "/consultas/\(id)/firmar", body: body, key: key, as: ConsultationCommandResult.self)
        }
        await loadDetail()
    }
}
