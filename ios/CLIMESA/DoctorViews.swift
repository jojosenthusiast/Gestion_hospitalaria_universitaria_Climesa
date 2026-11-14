import SwiftUI

// Pantallas del Médico (docs/arquitectura/datos/pantallas.csv, I20 y I22 a I25; I21 está en ConsultationView.swift).

struct DoctorDay: Sendable {
    var agenda: [AgendaEntry]?
    var tickets: [QueueTicket]?
    var pendingResults: Int?
    var hospitalized: Int?
}

/// I20 · Mi día: citas del día, números de la fila, resultados por revisar y hospitalizados.
struct DoctorDayView: View {
    let profile: AccessProfile
    let go: (AppTab) -> Void
    @EnvironmentObject private var account: AccountModel
    @Environment(LiveViewModel.self) private var live
    @State private var loader = Loader<DoctorDay>()
    @State private var calling = Submission()

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            LoadState(loader: loader, retry: load) { day in
                summary(day)
                if let tickets = day.tickets { queueSection(tickets) }
                if let agenda = day.agenda { agendaSection(agenda) }
                let sections = AppSection.visible(for: "MED", profile: profile)
                if !sections.isEmpty {
                    SectionTitle("day.more")
                    ForEach(sections, id: \.self) { section in
                        NavigationLink { PatientSectionView(section: section, profile: profile) } label: {
                            HStack {
                                Image(systemName: section.symbol).frame(width: 28)
                                Text(LocalizedStringKey(section.titleKey)).font(Brand.body(17))
                                Spacer()
                                if section == .hospitalizados, let count = day.hospitalized { Text(verbatim: "\(count)").font(Brand.bold(17)) }
                                Image(systemName: "chevron.right").foregroundStyle(.secondary)
                            }.padding(16).background(.white)
                        }.buttonStyle(.plain)
                    }
                }
            }
        }
        .task(id: live.snapshot.version([.appointments, .consultations, .queue, .laboratory, .admissions])) { await load() }
    }

    @ViewBuilder private func summary(_ day: DoctorDay) -> some View {
        HStack(spacing: 10) {
            if let pending = day.pendingResults {
                Button { go(.resultados) } label: {
                    Card { Text(verbatim: "\(pending)").font(Brand.bold(30)); Text("day.results").font(Brand.body(13)) }
                }.buttonStyle(.plain)
            }
            if let agenda = day.agenda {
                Card { Text(verbatim: "\(agenda.count)").font(Brand.bold(30)); Text("day.appointments").font(Brand.body(13)) }
            }
        }
    }

    @ViewBuilder private func queueSection(_ tickets: [QueueTicket]) -> some View {
        SectionTitle("day.queue")
        let waiting = tickets.filter { $0.service == .consultaGeneral && $0.state == .enEspera }.count
        Card {
            Text(verbatim: String(format: L.text("day.queue.waiting"), waiting)).font(Brand.body(15))
            if account.can("fila.llamar"), let next = QueueRules.nextToCall(tickets) {
                PrimaryButton(title: "day.queue.callNext", busy: calling.busy) { Task { await call(next) } }
            }
            SubmissionNotice(submission: calling)
        }
        let called = tickets.filter { $0.state == .llamado || $0.state == .enAtencion }.sorted { $0.number < $1.number }
        ForEach(called) { ticket in
            Card {
                HStack {
                    Text(verbatim: "\(ticket.number)").font(Brand.bold(26))
                    VStack(alignment: .leading) {
                        Text(verbatim: ticket.patientName ?? ticket.service.label).font(Brand.body(15))
                        Pill(text: ticket.state.label, tone: .warning)
                    }
                    Spacer()
                }
                if account.can("consulta.iniciar") {
                    NavigationLink { ConsultationView(origin: .ticket(ticket), profile: profile) } label: { Text("day.attend").font(Brand.bold(15)) }
                }
            }
        }
    }

    @ViewBuilder private func agendaSection(_ agenda: [AgendaEntry]) -> some View {
        SectionTitle("day.agenda")
        if agenda.isEmpty { EmptyNote("day.agenda.none") }
        ForEach(agenda) { entry in
            Card {
                HStack {
                    Text(verbatim: ClimesaDates.display(entry.start, .time)).font(Brand.bold(18))
                    Spacer()
                    Pill(text: entry.consultationState?.label ?? entry.appointmentState.label, tone: entry.consultationState == .firmada ? .good : .neutral)
                }
                Text(verbatim: entry.patientName ?? L.text("day.patient.unknown")).font(Brand.body(16))
                if let reason = entry.reason, !reason.isEmpty { Text(verbatim: reason).font(Brand.body(13)).foregroundStyle(.secondary) }
                HStack(spacing: 18) {
                    if account.can("consulta.iniciar") && entry.appointmentState == .confirmada || entry.consultationId != nil {
                        NavigationLink { ConsultationView(origin: .appointment(entry), profile: profile) } label: { Text("day.consultation").font(Brand.bold(15)) }
                    }
                    if account.can("expediente.ver") {
                        NavigationLink {
                            ScreenFrame(title: "patients.record") { ClinicalHistoryView(patientId: entry.patientId, canRequestAccess: account.can("privacidad.solicitar_acceso")) }
                        } label: { Text("day.record").font(Brand.body(15)) }
                    }
                }
            }
        }
    }

    private func load() async {
        await loader.load {
            let api = try account.client()
            var day = DoctorDay()
            let today = ClimesaDates.localDay(Date())
            if profile.hasPermission("consulta.iniciar") {
                let entries = try await api.get("/consultas/agenda", as: [AgendaEntry].self)
                day.agenda = entries.filter { ClimesaDates.parse($0.start).map(ClimesaDates.localDay) == today }.sorted { $0.start < $1.start }
            }
            if profile.hasPermission("fila.ver") { day.tickets = try? await api.get("/fila", as: [QueueTicket].self) }
            if profile.hasPermission("resultados.ver"), let orders = try? await api.get("/laboratorio/ordenes", as: [LabOrder].self) {
                day.pendingResults = ReviewRules.pending(orders).count
            }
            if profile.hasPermission("admision.ver"), let admissions = try? await api.get("/admisiones", as: [Admission].self) {
                day.hospitalized = DischargeRules.current(admissions).count
            }
            return day
        }
    }

    private func call(_ ticket: QueueTicket) async {
        let body = VersionBody(version: ticket.version)
        await calling.run(ticket.id, body: body, success: String(format: L.text("day.queue.called"), ticket.number)) { key in
            _ = try await account.client().send("POST", "/fila/\(ticket.id)/llamar", body: body, key: key, as: QueueCallResult.self)
        }
        await load()
    }
}

/// Pestaña Pacientes: buscar y abrir el expediente (I22).
struct DoctorPatientsView: View {
    @EnvironmentObject private var account: AccountModel
    @State private var query = ""
    @State private var loader = Loader<[PatientCandidate]>()

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                TextField("patients.search", text: $query).textInputAutocapitalization(.words).autocorrectionDisabled().onSubmit { Task { await search() } }
                Button { Task { await search() } } label: { Image(systemName: "magnifyingglass") }
            }.padding(14).background(.white)
            EmptyNote("patients.search.hint")
            LoadState(loader: loader, retry: search) { rows in
                if rows.isEmpty { EmptyNote("patients.none") }
                ForEach(rows) { patient in
                    NavigationLink {
                        ScreenFrame(title: "patients.record") { ClinicalHistoryView(patientId: patient.id, canRequestAccess: account.can("privacidad.solicitar_acceso")) }
                    } label: {
                        Card {
                            HStack { Text(verbatim: patient.fullName).font(Brand.bold(16)); Spacer(); Image(systemName: "chevron.right").foregroundStyle(.secondary) }
                            Text(verbatim: patient.record).font(Brand.mono(12))
                            if !patient.active { Pill(text: L.text("patients.inactive"), tone: .warning) }
                        }
                    }.buttonStyle(.plain)
                }
            }
        }
    }

    private func search() async {
        let text = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard text.count >= 2 else { loader.clear(); return }
        await loader.load { try await account.client().get("/pacientes?query=\(Query.encode(text))&limit=20", as: [PatientCandidate].self) }
    }
}

/// I23 · Resultados por revisar: críticos arriba en rojo; detalle con valores y marca; marcar revisado.
struct ResultsReviewView: View {
    @EnvironmentObject private var account: AccountModel
    @Environment(LiveViewModel.self) private var live
    @State private var loader = Loader<[LabOrder]>()

    var body: some View {
        LoadState(loader: loader, retry: load) { orders in
            let pending = ReviewRules.pending(orders)
            if pending.isEmpty { EmptyNote("results.none") }
            ForEach(pending) { order in
                NavigationLink { ReviewDetailView(order: order, reload: load) } label: {
                    LabOrderRow(order: order, status: L.text("results.toReview"), critical: ReviewRules.isCritical(order))
                }.buttonStyle(.plain)
            }
        }
        .task(id: live.snapshot.version(.laboratory)) { await load() }
    }

    private func load() async { await loader.load { try await account.client().get("/laboratorio/ordenes", as: [LabOrder].self) } }
}

private struct ReviewDetailView: View {
    let order: LabOrder
    let reload: () async -> Void
    @EnvironmentObject private var account: AccountModel
    @Environment(\.dismiss) private var dismiss
    @State private var submission = Submission()

    var body: some View {
        ScreenFrame(title: "results.detail") {
            if let name = order.patientName { Text(verbatim: name).font(Brand.bold(18)) }
            if ReviewRules.isCritical(order) { Notice(text: L.text("results.critical.notice"), failure: true) }
            LabOrderDetail(order: order, showValues: true)
            SubmissionNotice(submission: submission)
            if account.can("laboratorio.revisar") {
                PrimaryButton(title: "results.markReviewed", busy: submission.busy) { Task { await review() } }
            }
            if account.can("expediente.ver") {
                NavigationLink {
                    ScreenFrame(title: "patients.record") { ClinicalHistoryView(patientId: order.patientId, canRequestAccess: account.can("privacidad.solicitar_acceso")) }
                } label: { Text("day.record").font(Brand.body(15)) }
            }
        }
    }

    private func review() async {
        let body = VersionBody(version: order.version)
        let ok = await submission.run(order.id, body: body) { key in
            _ = try await account.client().send("POST", "/laboratorio/ordenes/\(order.id)/revisar", body: body, key: key, as: LabReviewResult.self)
        }
        await reload()
        if ok { dismiss() }
    }
}

/// I24 · Mis hospitalizados: paciente, cama y estado; firmar alta con pendientes y responsables.
struct HospitalizedView: View {
    @EnvironmentObject private var account: AccountModel
    @Environment(LiveViewModel.self) private var live
    @State private var loader = Loader<[Admission]>()

    var body: some View {
        LoadState(loader: loader, retry: load) { admissions in
            let current = DischargeRules.current(admissions)
            if current.isEmpty { EmptyNote("hospitalized.none") }
            ForEach(current) { admission in
                Card {
                    HStack {
                        Text(verbatim: admission.patientName ?? L.text("day.patient.unknown")).font(Brand.bold(16))
                        Spacer()
                        Pill(text: admission.state.label, tone: admission.state == .hospitalizado ? .good : .warning)
                    }
                    Text(verbatim: admission.bed.isEmpty ? L.text("hospitalized.noBed") : String(format: L.text("hospitalized.bed"), admission.bed)).font(Brand.body(14))
                    Text(verbatim: admission.requestedCategory.label + (admission.isolation ? " · " + L.text("hospitalized.isolation") : "")).font(Brand.mono(11))
                    if admission.state == .hospitalizado && account.can("alta.firmar") {
                        NavigationLink { DischargeView(admission: admission, reload: load) } label: { Text("hospitalized.discharge").font(Brand.bold(15)) }
                    }
                }
            }
        }
        .task(id: live.snapshot.version(.admissions)) { await load() }
    }

    private func load() async { await loader.load { try await account.client().get("/admisiones", as: [Admission].self) } }
}

private struct PendingLine: Identifiable {
    let id = UUID()
    var description = ""
    var responsible = ""
}

private struct DischargeView: View {
    let admission: Admission
    let reload: () async -> Void
    @EnvironmentObject private var account: AccountModel
    @Environment(\.dismiss) private var dismiss
    @State private var submission = Submission()
    @State private var type: DischargeType = .medica
    @State private var summary = ""
    @State private var consent = false
    @State private var pending: [PendingLine] = []
    @State private var errors: [String: String] = [:]

    var body: some View {
        ScreenFrame(title: "hospitalized.discharge") {
            Text(verbatim: admission.patientName ?? L.text("day.patient.unknown")).font(Brand.bold(18))
            Card {
                Picker("discharge.type", selection: $type) {
                    ForEach(DischargeType.allCases, id: \.self) { Text(verbatim: $0.label).tag($0) }
                }.pickerStyle(.segmented)
                TextField("discharge.summary", text: $summary, axis: .vertical).lineLimit(3...8)
                FieldError(text: errors["summary"])
                if type == .voluntaria {
                    Toggle("discharge.consent", isOn: $consent)
                    FieldError(text: errors["voluntaryConsent"])
                }
            }
            SectionTitle("discharge.pending")
            ForEach($pending) { $line in
                Card {
                    TextField("discharge.pending.description", text: $line.description)
                    TextField("discharge.pending.responsible", text: $line.responsible)
                }
            }
            FieldError(text: errors["pending"])
            Button("discharge.pending.add") { pending.append(PendingLine()) }
            SubmissionNotice(submission: submission)
            PrimaryButton(title: "discharge.sign", busy: submission.busy) { Task { await sign() } }
        }
    }

    private func sign() async {
        let lines = pending.map { DischargePendingBody(description: $0.description.trimmingCharacters(in: .whitespaces), responsible: $0.responsible.trimmingCharacters(in: .whitespaces)) }
        errors = DischargeRules.errors(type: type, summary: summary, voluntaryConsent: consent, pending: lines)
        guard errors.isEmpty else { return }
        let text = summary.trimmingCharacters(in: .whitespacesAndNewlines)
        let body = DischargeBody(type: type, version: admission.version, summary: text.isEmpty ? nil : text, voluntaryConsent: type == .voluntaria ? consent : nil, pending: lines)
        let ok = await submission.run(admission.id, body: body) { key in
            _ = try await account.client().send("POST", "/admisiones/\(admission.id)/alta", body: body, key: key, as: AdmissionCommandResult.self)
        }
        await reload()
        if ok { dismiss() }
    }
}

struct AmbulanceArrival: Sendable {
    var status: AmbulanceStatus
    var prehospital: PrehospitalView?
}

/// I25 · Llegada de ambulancia: prioridad, hora estimada, motivo y signos del reporte prehospital.
struct AmbulanceArrivalView: View {
    @EnvironmentObject private var account: AccountModel
    @Environment(LiveViewModel.self) private var live
    @State private var loader = Loader<AmbulanceArrival>()

    var body: some View {
        LoadState(loader: loader, retry: load) { arrival in
            if let service = arrival.status.activeService {
                Card {
                    HStack { Text(verbatim: arrival.status.unit.plate).font(Brand.bold(18)); Spacer(); Pill(text: service.priority.label, tone: service.priority == .roja ? .danger : .warning) }
                    Text(verbatim: "\(service.origin) → \(service.destination)").font(Brand.body(14))
                    Text(verbatim: String(format: L.text("arrival.dispatched"), ClimesaDates.display(service.dispatchedAt, .time))).font(Brand.body(12)).foregroundStyle(.secondary)
                }
                if let view = arrival.prehospital {
                    if !view.clinical { EmptyNote("arrival.noClinical") }
                    ForEach(view.reports) { report in PrehospitalReportCard(report: report) }
                } else { EmptyNote("arrival.noReport") }
                EmptyNote("arrival.receive.pending")
            } else {
                EmptyNote("arrival.none")
            }
        }
        .task(id: live.snapshot.version(.ambulance)) { await load() }
    }

    private func load() async {
        await loader.load {
            let api = try account.client()
            let status = try await api.get("/ambulancia", as: AmbulanceStatus.self)
            var arrival = AmbulanceArrival(status: status, prehospital: nil)
            if let service = status.activeService, service.hasPrehospital {
                arrival.prehospital = try await api.get("/ambulancia/servicios/\(service.id)/prehospital", as: PrehospitalView.self)
            }
            return arrival
        }
    }
}

private struct PrehospitalReportCard: View {
    let report: PrehospitalView.Report
    var body: some View {
        Card {
            HStack { Pill(text: report.priority.label, tone: report.priority == .roja ? .danger : .warning); Spacer(); Text(verbatim: ClimesaDates.display(report.capturedAt, .time)).font(Brand.mono(12)) }
            if let eta = report.estimatedArrival { Text(verbatim: String(format: L.text("arrival.eta"), ClimesaDates.display(eta, .time))).font(Brand.bold(18)) }
            if let reason = report.reason { Text(verbatim: reason).font(Brand.body(15)) }
            if let signs = report.vitalSigns, !signs.isEmpty {
                ForEach(signs.keys.sorted(), id: \.self) { key in
                    HStack { Text(verbatim: key).font(Brand.mono(12)); Spacer(); Text(verbatim: signs[key]?.text ?? "").font(Brand.body(14)) }
                }
            }
        }
    }
}
