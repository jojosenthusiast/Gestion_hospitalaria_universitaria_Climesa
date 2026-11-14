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
        VStack(alignment: .leading, spacing: Spacing.l) {
            LoadState(loader: loader, retry: load) { day in
                summary(day)
                if let tickets = day.tickets { queueSection(tickets) }
                if let agenda = day.agenda { agendaSection(agenda) }
                moreSection(day)
            }
        }
        .task(id: live.snapshot.version([.appointments, .consultations, .queue, .laboratory, .admissions])) { await load() }
    }

    @ViewBuilder private func summary(_ day: DoctorDay) -> some View {
        LazyVGrid(columns: [GridItem(.flexible(), spacing: Spacing.m), GridItem(.flexible(), spacing: Spacing.m)], spacing: Spacing.m) {
            if let pending = day.pendingResults {
                Button { go(.resultados) } label: { StatTile(value: "\(pending)", label: L.text("day.results")) }.buttonStyle(.plain)
            }
            if let agenda = day.agenda { StatTile(value: "\(agenda.count)", label: L.text("day.appointments")) }
            if let tickets = day.tickets {
                StatTile(value: "\(tickets.filter { $0.service == .consultaGeneral && $0.state == .enEspera }.count)", label: L.text("ds.medico.stat.waiting"))
            }
            if let count = day.hospitalized { StatTile(value: "\(count)", label: L.text("ds.medico.stat.hospitalized")) }
        }
    }

    @ViewBuilder private func queueSection(_ tickets: [QueueTicket]) -> some View {
        let waiting = tickets.filter { $0.service == .consultaGeneral && $0.state == .enEspera }.count
        SectionCard(title: L.text("day.queue")) {
            Text(verbatim: String(format: L.text("day.queue.waiting"), waiting)).font(Typo.body).foregroundStyle(Theme.ink)
            if account.can("fila.llamar"), let next = QueueRules.nextToCall(tickets) {
                ClimesaButton(title: L.text("day.queue.callNext"), loading: calling.busy) { Task { await call(next) } }
            }
            WriteNotice(submission: calling, reload: load)
        }
        let called = tickets.filter { $0.state == .llamado || $0.state == .enAtencion }.sorted { $0.number < $1.number }
        ForEach(called) { ticket in
            SectionCard {
                ListRow(title: ticket.patientName ?? ticket.service.label, subtitle: String(format: L.text("consultation.ticket"), ticket.number)) {
                    MedicoTag(ticket.state.rawValue, label: ticket.state.label)
                }
                if account.can("consulta.iniciar") {
                    NavigationLink { ConsultationView(origin: .ticket(ticket), profile: profile) } label: { Text("day.attend") }
                        .buttonStyle(ClimesaButtonStyle())
                }
            }
        }
    }

    @ViewBuilder private func agendaSection(_ agenda: [AgendaEntry]) -> some View {
        if agenda.isEmpty {
            SectionCard(title: L.text("day.agenda")) { EmptyStateView(title: L.text("day.agenda.none")) }
        } else {
            Text("day.agenda").font(Typo.eyebrow).foregroundStyle(Theme.primaryText).textCase(.uppercase).accessibilityAddTraits(.isHeader)
        }
        ForEach(agenda) { entry in
            SectionCard {
                ListRow(title: entry.patientName ?? L.text("day.patient.unknown"), subtitle: entry.reason, meta: ClimesaDates.display(entry.start, .time)) {
                    if let state = entry.consultationState { MedicoTag(state.rawValue, label: state.label) }
                    else { MedicoTag(entry.appointmentState.rawValue, label: entry.appointmentState.label) }
                }
                HStack(spacing: Spacing.m) {
                    if account.can("consulta.iniciar") && entry.appointmentState == .confirmada || entry.consultationId != nil {
                        NavigationLink { ConsultationView(origin: .appointment(entry), profile: profile) } label: { Text("day.consultation") }
                            .buttonStyle(ClimesaButtonStyle())
                    }
                    if account.can("expediente.ver") {
                        NavigationLink {
                            PatientRecordScreen(patientId: entry.patientId)
                        } label: { Text("day.record") }
                            .buttonStyle(ClimesaButtonStyle(kind: .secondary))
                    }
                }
            }
        }
    }

    @ViewBuilder private func moreSection(_ day: DoctorDay) -> some View {
        let sections = AppSection.visible(for: "MED", profile: profile).filter { [.agenda, .hospitalizados, .llegadaAmbulancia].contains($0) }
        if !sections.isEmpty {
            SectionCard(title: L.text("day.more")) {
                ForEach(Array(sections.enumerated()), id: \.element) { index, section in
                    if index > 0 { Divider().overlay(Theme.line) }
                    NavigationLink { PatientSectionView(section: section, profile: profile) } label: {
                        HStack(spacing: Spacing.m) {
                            Image(systemName: section.symbol).foregroundStyle(Theme.primaryText).frame(width: 28).accessibilityHidden(true)
                            ListRow(title: L.text(section.titleKey)) {
                                HStack(spacing: Spacing.s) {
                                    if section == .hospitalizados, let count = day.hospitalized { Text(verbatim: "\(count)").font(Typo.label).foregroundStyle(Theme.ink) }
                                    Image(systemName: "chevron.right").foregroundStyle(Theme.muted).accessibilityHidden(true)
                                }
                            }
                        }
                    }.buttonStyle(.plain)
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
        VStack(alignment: .leading, spacing: Spacing.l) {
            SectionCard {
                FormField(label: L.text("patients.search"), text: $query, hint: L.text("patients.search.hint"))
                    .textInputAutocapitalization(.words).autocorrectionDisabled().submitLabel(.search)
                    .onSubmit { Task { await search() } }
                ClimesaButton(title: L.text("ds.medico.search"), loading: loader.loading) { Task { await search() } }
                Text("patients.treating_only").font(Typo.caption).foregroundStyle(Theme.muted)
            }
            LoadState(loader: loader, retry: search) { rows in
                if rows.isEmpty { EmptyStateView(title: L.text("patients.none"), symbol: "magnifyingglass") }
                ForEach(rows) { patient in
                    NavigationLink {
                        PatientRecordScreen(patientId: patient.id)
                    } label: {
                        SectionCard {
                            ListRow(title: patient.fullName, meta: patient.record) {
                                HStack(spacing: Spacing.s) {
                                    if !patient.active { StatusTag("inactivo", label: L.text("patients.inactive")) }
                                    Image(systemName: "chevron.right").foregroundStyle(Theme.muted).accessibilityHidden(true)
                                }
                            }
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
            if pending.isEmpty { EmptyStateView(title: L.text("results.none"), symbol: "checkmark.circle") }
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
            if let name = order.patientName { Text(verbatim: name).font(Typo.heading).foregroundStyle(Theme.ink) }
            if ReviewRules.isCritical(order) { MedicoAlert(text: L.text("results.critical.notice")) }
            LabOrderDetail(order: order, showValues: true)
            WriteNotice(submission: submission, reload: reload)
            if account.can("laboratorio.revisar") {
                ClimesaButton(title: L.text("results.markReviewed"), loading: submission.busy) { Task { await review() } }
            }
            if account.can("expediente.ver") {
                NavigationLink {
                    PatientRecordScreen(patientId: order.patientId)
                } label: { Text("day.record") }
                    .buttonStyle(ClimesaButtonStyle(kind: .secondary))
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
            if current.isEmpty { EmptyStateView(title: L.text("hospitalized.none"), symbol: "bed.double") }
            ForEach(current) { admission in
                SectionCard {
                    ListRow(
                        title: admission.patientName ?? L.text("day.patient.unknown"),
                        subtitle: admission.bed.isEmpty ? L.text("hospitalized.noBed") : String(format: L.text("hospitalized.bed"), admission.bed),
                        meta: admission.requestedCategory.label + (admission.isolation ? " · " + L.text("hospitalized.isolation") : "")
                    ) { MedicoTag(admission.state.rawValue, label: admission.state.label) }
                    if admission.state == .hospitalizado && account.can("alta.firmar") {
                        NavigationLink { DischargeView(admission: admission, reload: load) } label: { Text("hospitalized.discharge") }
                            .buttonStyle(ClimesaButtonStyle(kind: .secondary))
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
            Text(verbatim: admission.patientName ?? L.text("day.patient.unknown")).font(Typo.heading).foregroundStyle(Theme.ink)
            SectionCard {
                VStack(alignment: .leading, spacing: Spacing.s) {
                    Text("discharge.type").font(Typo.label).foregroundStyle(Theme.ink)
                    Picker("discharge.type", selection: $type) {
                        ForEach(DischargeType.allCases, id: \.self) { Text(verbatim: $0.label).tag($0) }
                    }.pickerStyle(.segmented)
                }
                MedicoTextArea(label: L.text("discharge.summary"), text: $summary, error: errors["summary"])
                if type == .voluntaria {
                    Toggle("discharge.consent", isOn: $consent).font(Typo.body).tint(Theme.primary)
                    FieldError(text: errors["voluntaryConsent"])
                }
            }
            SectionCard(title: L.text("discharge.pending")) {
                ForEach($pending) { $line in
                    FormField(label: L.text("discharge.pending.description"), text: $line.description)
                    FormField(label: L.text("discharge.pending.responsible"), text: $line.responsible)
                }
                FieldError(text: errors["pending"])
                ClimesaButton(title: L.text("discharge.pending.add"), kind: .secondary) { pending.append(PendingLine()) }
            }
            WriteNotice(submission: submission, reload: reload)
            ClimesaButton(title: L.text("discharge.sign"), loading: submission.busy) { Task { await sign() } }
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
                SectionCard {
                    ListRow(
                        title: arrival.status.unit.plate,
                        subtitle: "\(service.origin) → \(service.destination)",
                        meta: String(format: L.text("arrival.dispatched"), ClimesaDates.display(service.dispatchedAt, .time))
                    ) { MedicoTag(service.priority.rawValue, label: service.priority.label) }
                }
                if let view = arrival.prehospital {
                    if !view.clinical { Text("arrival.noClinical").font(Typo.small).foregroundStyle(Theme.muted) }
                    ForEach(view.reports) { report in PrehospitalReportCard(report: report) }
                } else { Text("arrival.noReport").font(Typo.small).foregroundStyle(Theme.muted) }
                Text("arrival.receive.pending").font(Typo.small).foregroundStyle(Theme.muted)
            } else {
                EmptyStateView(title: L.text("arrival.none"), symbol: "cross.case")
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
        SectionCard(title: L.text("ds.medico.prehospital")) {
            HStack {
                MedicoTag(report.priority.rawValue, label: report.priority.label)
                Spacer()
                Text(verbatim: ClimesaDates.display(report.capturedAt, .time)).font(Typo.mono).foregroundStyle(Theme.muted)
            }
            if let eta = report.estimatedArrival { Text(verbatim: String(format: L.text("arrival.eta"), ClimesaDates.display(eta, .time))).font(Typo.heading).foregroundStyle(Theme.ink) }
            if let reason = report.reason { Text(verbatim: reason).font(Typo.body).foregroundStyle(Theme.ink) }
            if let signs = report.vitalSigns, !signs.isEmpty {
                ForEach(signs.keys.sorted(), id: \.self) { key in
                    HStack { Text(verbatim: key).font(Typo.mono).foregroundStyle(Theme.muted); Spacer(); Text(verbatim: signs[key]?.text ?? "").font(Typo.body).foregroundStyle(Theme.ink) }
                }
            }
        }
    }
}
