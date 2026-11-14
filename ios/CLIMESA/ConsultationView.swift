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
            Text(verbatim: patientName).font(Brand.bold(20))
            if consultationId == nil {
                SubmissionNotice(submission: starting)
                if profile.hasPermission("consulta.iniciar") {
                    PrimaryButton(title: "consultation.start", busy: starting.busy) { Task { await start() } }
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
        Pill(text: value.consultation.state.label, tone: value.consultation.state == .firmada ? .good : .neutral)
        vitalSigns(value.vitalSigns)
        draftSection(value, editable: editable)
        diagnosesSection(value, editable: editable)
        prescriptionSection(value, editable: editable && profile.hasPermission("recetas.emitir"))
        if editable && profile.hasPermission("laboratorio.ordenar") { labSection(value) }
        if editable && profile.hasPermission("admision.solicitar") && profile.staffId != nil { admissionSection(value) }
        if editable {
            SubmissionNotice(submission: signing)
            PrimaryButton(title: "consultation.sign", busy: signing.busy) { Task { await sign(value) } }
        }
    }

    @ViewBuilder private func vitalSigns(_ signs: [ConsultationDetail.VitalSigns]) -> some View {
        SectionTitle("consultation.vitals")
        if signs.isEmpty { EmptyNote("consultation.vitals.none") }
        ForEach(signs) { sign in
            Card {
                Text(verbatim: ClimesaDates.display(sign.takenAt, .time)).font(Brand.mono(12))
                Text(verbatim: Self.vitalsText(sign)).font(Brand.body(14))
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
        SectionTitle("consultation.notes")
        if editable {
            Card {
                TextField("consultation.reason", text: $reason, axis: .vertical).lineLimit(2...5)
                FieldError(text: draftErrors["reason"])
                TextField("consultation.exam", text: $exam, axis: .vertical).lineLimit(3...8)
                FieldError(text: draftErrors["physicalExam"])
                TextField("consultation.plan", text: $plan, axis: .vertical).lineLimit(2...6)
                FieldError(text: draftErrors["plan"])
            }
            SubmissionNotice(submission: saving)
            Button("consultation.save") { Task { await save(value) } }.disabled(saving.busy)
        } else {
            if let text = value.consultation.reason, !text.isEmpty { LabeledText(label: "consultation.reason", text: text) }
            if let text = value.consultation.physicalExam, !text.isEmpty { LabeledText(label: "consultation.exam", text: text) }
            if let text = value.consultation.plan, !text.isEmpty { LabeledText(label: "consultation.plan", text: text) }
        }
    }

    @ViewBuilder private func diagnosesSection(_ value: ConsultationDetail, editable: Bool) -> some View {
        SectionTitle("consultation.diagnoses")
        ForEach(value.diagnoses) { diagnosis in
            Card {
                Text(verbatim: diagnosis.code).font(Brand.bold(16))
                if diagnosis.principal { Pill(text: L.text("consultation.principal"), tone: .good) }
                if let text = diagnosis.note, !text.isEmpty { Text(verbatim: text).font(Brand.body(13)) }
            }
        }
        if editable {
            Card {
                TextField("consultation.diagnosis.code", text: $code).textInputAutocapitalization(.characters).autocorrectionDisabled()
                FieldError(text: codeError)
                Toggle("consultation.principal", isOn: $principal)
                TextField("consultation.diagnosis.note", text: $note, axis: .vertical).lineLimit(1...3)
                EmptyNote("consultation.diagnosis.hint")
            }
            SubmissionNotice(submission: diagnosing)
            Button("consultation.diagnosis.add") { Task { await addDiagnosis() } }.disabled(diagnosing.busy)
        }
    }

    @ViewBuilder private func prescriptionSection(_ value: ConsultationDetail, editable: Bool) -> some View {
        SectionTitle("consultation.prescriptions")
        ForEach(value.prescriptions) { prescription in
            Card {
                Text(verbatim: ClimesaDates.display(prescription.issuedAt)).font(Brand.mono(12))
                ForEach(Array(prescription.items.enumerated()), id: \.offset) { _, item in
                    Text(verbatim: "\(item.medication) \(item.dose) · \(item.route) · \(item.frequency) · \(item.duration)").font(Brand.body(14))
                }
            }
        }
        if editable {
            ForEach($lines) { $line in
                Card {
                    TextField("rx.medication", text: $line.medication)
                    HStack { TextField("rx.dose", text: $line.dose); TextField("rx.route", text: $line.route) }
                    HStack { TextField("rx.frequency", text: $line.frequency); TextField("rx.duration", text: $line.duration) }
                    TextField("rx.instructions", text: $line.instructions)
                }
            }
            FieldError(text: lineError)
            HStack(spacing: 20) {
                Button("rx.addLine") { lines.append(PrescriptionDraft()) }
                Button("rx.issue") { Task { await prescribe() } }.disabled(prescribing.busy)
            }
            SubmissionNotice(submission: prescribing)
        }
    }

    @ViewBuilder private func labSection(_ value: ConsultationDetail) -> some View {
        SectionTitle("lab.order")
        LoadState(loader: catalog, retry: loadCatalog) { exams in
            Card {
                ForEach(exams) { item in
                    Toggle(isOn: Binding(get: { selectedExams.contains(item.id) }, set: { on in
                        if on { selectedExams.insert(item.id) } else { selectedExams.remove(item.id) }
                    })) {
                        Text(verbatim: item.isPanel ? "\(item.name) · \(L.text("lab.panel"))" : item.name).font(Brand.body(14))
                    }
                }
                Picker("lab.priority", selection: $priority) {
                    Text(verbatim: LabPriority.rutina.label).tag(LabPriority.rutina)
                    Text(verbatim: LabPriority.urgente.label).tag(LabPriority.urgente)
                }.pickerStyle(.segmented)
            }
        }
        .task { if catalog.value == nil { await loadCatalog() } }
        SubmissionNotice(submission: ordering)
        Button("lab.submit") { Task { await order(value) } }.disabled(selectedExams.isEmpty || ordering.busy)
    }

    @ViewBuilder private func admissionSection(_ value: ConsultationDetail) -> some View {
        SectionTitle("admission.title")
        Card {
            Picker("admission.category", selection: $category) {
                Text(verbatim: RoomCategory.semiprivada.label).tag(RoomCategory.semiprivada)
                Text(verbatim: RoomCategory.vip.label).tag(RoomCategory.vip)
            }.pickerStyle(.segmented)
            Toggle("admission.isolation", isOn: $isolation)
            TextField("admission.reason", text: $admissionReason, axis: .vertical).lineLimit(2...4)
            FieldError(text: admissionError)
        }
        SubmissionNotice(submission: admitting)
        Button("admission.submit") { Task { await admit(value) } }.disabled(admitting.busy)
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
        if ok, let started { consultationId = started.id }
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
