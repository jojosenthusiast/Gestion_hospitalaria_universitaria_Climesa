import SwiftUI
import UIKit

// Pantallas del Paciente (docs/arquitectura/datos/pantallas.csv, I03 a I12). Solo llaman endpoints de
// contrato/openapi.json; cada una vuelve a pedir sus datos cuando sube su contador de tiempo real.

struct PatientHome: Sendable {
    var ticket: QueueTicket?
    var nextAppointment: Appointment?
    var labs: [LabOrder]?
    var notices: [PublicNotices.Notice]
}

/// I04 · Inicio del paciente.
struct PatientHomeView: View {
    let profile: AccessProfile
    let go: (AppTab) -> Void
    @EnvironmentObject private var account: AccountModel
    @Environment(LiveViewModel.self) private var live
    @State private var loader = Loader<PatientHome>()

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            if profile.patientId == nil {
                SectionCard {
                    Text("home.unlinked.title").font(Typo.subheading).foregroundStyle(Theme.ink)
                    Text("home.unlinked.body").font(Typo.small).foregroundStyle(Theme.muted)
                    ClimesaButton(title: L.text("home.unlinked.action"), kind: .secondary) { go(.mas) }
                }
            }
            LoadState(loader: loader, retry: load) { home in
                HomeQueueCard(ticket: home.ticket) { go(.fila) }
                HomeAppointmentCard(appointment: home.nextAppointment) { go(.citas) }
                if let labs = home.labs { HomeLabCard(labs: labs) { go(.examenes) } }
                if !home.notices.isEmpty {
                    SectionTitle("home.notices")
                    ForEach(home.notices) { notice in
                        SectionCard(title: notice.title) { Text(verbatim: notice.body).font(Typo.body).foregroundStyle(Theme.ink) }
                    }
                }
            }
        }
        .task(id: live.snapshot.version([.queue, .appointments, .laboratory, .hospitalInfo])) { await load() }
    }

    private func load() async {
        await loader.load {
            let api = try account.client()
            var home = PatientHome(ticket: nil, nextAppointment: nil, labs: nil, notices: [])
            if profile.hasPermission("fila.ver"), let tickets = try? await api.get("/fila", as: [QueueTicket].self) {
                home.ticket = QueueRules.activeTicket(tickets)
            }
            if profile.hasPermission("citas.ver"), let list = try? await api.get("/citas", as: [Appointment].self) {
                home.nextAppointment = AppointmentRules.split(list, now: Date()).upcoming.first
            }
            if profile.patientId != nil, profile.hasPermission("resultados.ver") {
                home.labs = try? await api.get("/me/laboratorio", as: [LabOrder].self)
            }
            home.notices = (try? await api.get("/publico/avisos", as: PublicNotices.self))?.notices ?? []
            return home
        }
    }
}

private struct HomeQueueCard: View {
    let ticket: QueueTicket?
    let open: () -> Void
    var body: some View {
        SectionCard(eyebrow: L.text("home.queue")) {
            if let ticket {
                HStack(alignment: .center) {
                    Text(verbatim: "\(ticket.number)").font(Typo.stat).foregroundStyle(Theme.ink)
                        .accessibilityLabel(Text(verbatim: "\(L.text("ds.paciente.queue.number")) \(ticket.number)"))
                    Spacer()
                    PatientTag(ticket.state.rawValue, label: ticket.state.label)
                }
            } else {
                EmptyNote("home.queue.none")
            }
            ClimesaButton(title: L.text("home.open"), kind: .secondary, action: open)
        }
    }
}

private struct HomeAppointmentCard: View {
    let appointment: Appointment?
    let open: () -> Void
    var body: some View {
        SectionCard(eyebrow: L.text("home.appointment")) {
            if let appointment {
                ListRow(title: ClimesaDates.display(appointment.start), subtitle: appointment.doctorName) {
                    PatientTag(appointment.state.rawValue, label: appointment.state.label)
                }
            } else {
                EmptyNote("home.appointment.none")
            }
            ClimesaButton(title: L.text("home.open"), kind: .secondary, action: open)
        }
    }
}

private struct HomeLabCard: View {
    let labs: [LabOrder]
    let open: () -> Void
    var body: some View {
        SectionCard(eyebrow: L.text("home.labs")) {
            let pending = labs.filter { $0.reviewedAt == nil && $0.state != .cancelado }.count
            let ready = labs.filter { $0.reviewedAt != nil }.count
            HStack(spacing: Spacing.m) {
                StatTile(value: String(pending), label: L.text("ds.paciente.home.pending"))
                StatTile(value: String(ready), label: L.text("ds.paciente.home.ready"))
            }
            ClimesaButton(title: L.text("home.open"), kind: .secondary, action: open)
        }
    }
}

/// I05 · Mi turno en fila: número grande, cuántos faltan y consultorio al ser llamado. Vibra al pasar a "Llamado".
struct PatientQueueView: View {
    @EnvironmentObject private var account: AccountModel
    @Environment(LiveViewModel.self) private var live
    @State private var tickets = Loader<[QueueTicket]>()
    @State private var board = Loader<PublicQueue>()
    @State private var lastState: QueueState?

    var body: some View {
        LoadState(loader: tickets, retry: load) { list in
            if let ticket = QueueRules.activeTicket(list) {
                QueueTicketCard(ticket: ticket, board: board.value)
            } else {
                EmptyStateView(title: L.text("queue.none.title"), message: L.text("queue.none.body"), symbol: "person.2")
            }
        }
        .task(id: live.snapshot.version(.queue)) { await load() }
    }

    private func load() async {
        await tickets.load { try await account.client().get("/fila", as: [QueueTicket].self) }
        guard let ticket = tickets.value.flatMap({ QueueRules.activeTicket($0) }) else { lastState = nil; return }
        await board.load { try await account.client().get("/publico/fila/\(ticket.service.rawValue)", as: PublicQueue.self) }
        if ticket.state == .llamado, let previous = lastState, previous != .llamado {
            UINotificationFeedbackGenerator().notificationOccurred(.warning)
        }
        lastState = ticket.state
    }
}

private struct QueueTicketCard: View {
    let ticket: QueueTicket
    let board: PublicQueue?
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            if ticket.state == .llamado {
                let office = board.flatMap { QueueRules.office(for: ticket.number, called: $0.called) }
                PatientNotice(text: office.map { String(format: L.text("queue.called.office"), $0) } ?? L.text("queue.called"))
            }
            SectionCard(eyebrow: ticket.service.label) {
                HStack(alignment: .firstTextBaseline) {
                    Text(verbatim: "\(ticket.number)").font(.custom("DMSans-Bold", size: 96, relativeTo: .largeTitle)).foregroundStyle(Theme.ink).minimumScaleFactor(0.5)
                        .accessibilityLabel(Text(verbatim: "\(L.text("ds.paciente.queue.number")) \(ticket.number)"))
                    Spacer()
                    LiveIndicator()
                }
                PatientTag(ticket.state.rawValue, label: ticket.state.label)
                if ticket.state == .enEspera, let board, let ahead = QueueRules.ahead(of: ticket.number, called: board.called) {
                    StatTile(value: String(ahead), label: String(format: L.text("queue.ahead"), ahead))
                    Text("queue.ahead.hint").font(Typo.caption).foregroundStyle(Theme.muted)
                }
                Text(verbatim: String(format: L.text("queue.issued"), ClimesaDates.display(ticket.issuedAt, .time))).font(Typo.small).foregroundStyle(Theme.muted)
            }
        }
    }
}

/// I06 · Mis citas: próximas y pasadas; pedir y cancelar.
struct PatientAppointmentsView: View {
    @EnvironmentObject private var account: AccountModel
    @Environment(LiveViewModel.self) private var live
    @State private var loader = Loader<[Appointment]>()
    @State private var submission = Submission()
    @State private var cancelling: Appointment?
    @State private var requesting = false

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            if account.can("citas.solicitar") { ClimesaButton(title: L.text("appointments.request")) { requesting = true } }
            PatientSubmissionNotice(submission: submission)
            if submission.lastFailure?.code == "version_conflicto" { ConflictBanner { Task { submission.error = nil; await load() } } }
            LoadState(loader: loader, retry: load) { list in
                let split = AppointmentRules.split(list, now: Date())
                SectionTitle("appointments.upcoming")
                if split.upcoming.isEmpty { EmptyStateView(title: L.text("appointments.upcoming.none"), symbol: "calendar") }
                ForEach(split.upcoming) { item in
                    AppointmentRow(appointment: item, cancel: cancelAction(item))
                }
                SectionTitle("appointments.past")
                if split.past.isEmpty { EmptyStateView(title: L.text("appointments.past.none"), symbol: "clock.arrow.circlepath") }
                ForEach(split.past) { item in AppointmentRow(appointment: item, cancel: nil) }
            }
        }
        .task(id: live.snapshot.version(.appointments)) { await load() }
        .sheet(item: $cancelling) { item in
            CancelAppointmentSheet(appointment: item, submission: submission, reload: load)
        }
        .sheet(isPresented: $requesting) { RequestAppointmentSheet(reload: load) }
    }

    private func load() async { await loader.load { try await account.client().get("/citas", as: [Appointment].self) } }

    private func cancelAction(_ item: Appointment) -> (() -> Void)? {
        guard account.can("citas.cancelar"), AppointmentRules.canCancel(item, now: Date()) else { return nil }
        return { cancelling = item }
    }
}

private struct AppointmentRow: View {
    let appointment: Appointment
    let cancel: (() -> Void)?
    var body: some View {
        SectionCard {
            ListRow(title: ClimesaDates.display(appointment.start), subtitle: appointment.doctorName, meta: appointment.reason) {
                PatientTag(appointment.state.rawValue, label: appointment.state.label)
            }
            if let rejection = appointment.rejectionReason, !rejection.isEmpty {
                Text(verbatim: String(format: L.text("appointments.rejected.reason"), rejection)).font(Typo.small).foregroundStyle(Theme.danger)
            }
            if let cancel { ClimesaButton(title: L.text("appointments.cancel"), kind: .destructive, action: cancel) }
        }
    }
}

private struct CancelAppointmentSheet: View {
    let appointment: Appointment
    let submission: Submission
    let reload: () async -> Void
    @EnvironmentObject private var account: AccountModel
    @Environment(\.dismiss) private var dismiss
    @State private var reason = ""
    @State private var fieldError: String?

    var body: some View {
        NavigationStack {
            ScreenFrame(title: "appointments.cancel.title") {
                SectionCard {
                    ListRow(title: ClimesaDates.display(appointment.start), subtitle: appointment.doctorName)
                }
                PatientTextArea(label: L.text("appointments.cancel.reason"), text: $reason, lines: 3...6, error: fieldError)
                PatientSubmissionNotice(submission: submission)
                if submission.lastFailure?.code == "version_conflicto" { ConflictBanner { Task { await reload(); dismiss() } } }
                ClimesaButton(title: L.text("appointments.cancel.confirm"), kind: .destructive, loading: submission.busy) { Task { await send() } }
                ClimesaButton(title: L.text("common.close"), kind: .secondary) { dismiss() }
            }
        }
    }

    private func send() async {
        fieldError = AppointmentRules.cancelReasonError(reason)
        guard fieldError == nil else { return }
        let body = AppointmentCancelBody(version: appointment.version, reason: reason.trimmingCharacters(in: .whitespacesAndNewlines))
        let ok = await submission.run(appointment.id, body: body, success: L.text("appointments.cancelled")) { key in
            _ = try await account.client().send("POST", "/citas/\(appointment.id)/cancelar", body: body, key: key, as: AppointmentCommandResult.self)
        }
        await reload()
        if ok { dismiss() }
    }
}

private struct RequestAppointmentSheet: View {
    let reload: () async -> Void
    @EnvironmentObject private var account: AccountModel
    @Environment(\.dismiss) private var dismiss
    @State private var catalog = Loader<AppointmentCatalogs>()
    @State private var availability = Loader<Availability>()
    @State private var submission = Submission()
    @State private var doctorId = ""
    @State private var day = Date()
    @State private var slot: Period?
    @State private var reason = ""

    var body: some View {
        NavigationStack {
            ScreenFrame(title: "appointments.request.title") {
                LoadState(loader: catalog, retry: loadCatalog) { value in
                    Picker("appointments.doctor", selection: $doctorId) {
                        Text("appointments.doctor.choose").tag("")
                        ForEach(value.doctors.filter(\.active)) { doctor in
                            Text(verbatim: doctor.specialty.map { "\(doctor.fullName) · \($0)" } ?? doctor.fullName).tag(doctor.id)
                        }
                    }.pickerStyle(.menu)
                }
                DatePicker("appointments.date", selection: $day, in: Date()..., displayedComponents: .date)
                if !doctorId.isEmpty {
                    SectionTitle("appointments.slots")
                    LoadState(loader: availability, retry: loadSlots) { value in
                        if value.slots.isEmpty { EmptyStateView(title: L.text("appointments.slots.none"), symbol: "calendar.badge.exclamationmark") }
                        LazyVGrid(columns: [GridItem(.adaptive(minimum: 90))], spacing: 8) {
                            ForEach(value.slots, id: \.self) { period in
                                Button { slot = period } label: {
                                    Text(verbatim: ClimesaDates.display(period.start, .time)).font(Typo.label).frame(maxWidth: .infinity, minHeight: Spacing.control)
                                        .background(slot == period ? Theme.primary : Theme.surface, in: RoundedRectangle(cornerRadius: Radius.control))
                                        .overlay(RoundedRectangle(cornerRadius: Radius.control).stroke(slot == period ? Theme.primary : Theme.controlLine, lineWidth: 1))
                                        .foregroundStyle(slot == period ? Theme.onPrimary : Theme.ink)
                                }
                            }
                        }
                    }
                }
                PatientTextArea(label: L.text("appointments.reason"), text: $reason, lines: 2...4, error: AppointmentRules.requestReasonError(reason))
                PatientSubmissionNotice(submission: submission)
                ClimesaButton(title: L.text("appointments.submit"), loading: submission.busy) { Task { await send() } }
                    .disabled(slot == nil || AppointmentRules.requestReasonError(reason) != nil)
                ClimesaButton(title: L.text("common.close"), kind: .secondary) { dismiss() }
            }
            .task { await loadCatalog() }
            .task(id: "\(doctorId)|\(ClimesaDates.localDay(day))") { slot = nil; await loadSlots() }
        }
    }

    private func loadCatalog() async { await catalog.load { try await account.client().get("/citas/catalogos", as: AppointmentCatalogs.self) } }

    private func loadSlots() async {
        guard !doctorId.isEmpty else { availability.clear(); return }
        let path = "/citas/disponibilidad?doctorId=\(Query.encode(doctorId))&date=\(ClimesaDates.localDay(day))"
        await availability.load { try await account.client().get(path, as: Availability.self) }
    }

    private func send() async {
        guard let slot else { return }
        let text = reason.trimmingCharacters(in: .whitespacesAndNewlines)
        let body = AppointmentRequestBody(doctorId: doctorId, start: slot.start, end: slot.end, reason: text.isEmpty ? nil : text)
        let ok = await submission.run(body: body, success: L.text("appointments.requested")) { key in
            _ = try await account.client().send("POST", "/citas/solicitudes", body: body, key: key, as: AppointmentCommandResult.self)
        }
        if ok { await reload(); dismiss() }
        else if submission.lastFailure?.code == "franja_ocupada" { self.slot = nil; await loadSlots() }
    }
}

/// I07 · Mis exámenes: estado siempre; valores solo después de la revisión médica.
struct PatientExamsView: View {
    let profile: AccessProfile
    @EnvironmentObject private var account: AccountModel
    @Environment(LiveViewModel.self) private var live
    @State private var loader = Loader<[LabOrder]>()

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            if profile.patientId == nil {
                EmptyStateView(title: L.text("home.unlinked.title"), message: L.text("exams.unlinked"), symbol: "link")
            } else {
                LoadState(loader: loader, retry: load) { orders in
                    if orders.isEmpty { EmptyStateView(title: L.text("exams.none"), symbol: "testtube.2") }
                    ForEach(orders) { order in
                        NavigationLink {
                            ScreenFrame(title: "exams.detail") { LabOrderDetail(order: order, showValues: PatientLabRules.showsValues(order)) }
                        } label: {
                            LabOrderRow(order: order, status: PatientLabRules.statusText(order), critical: false)
                        }.buttonStyle(.plain)
                    }
                }
            }
        }
        .task(id: live.snapshot.version(.laboratory)) { if profile.patientId != nil { await load() } }
    }

    private func load() async { await loader.load { try await account.client().get("/me/laboratorio", as: [LabOrder].self) } }
}

struct LabOrderRow: View {
    let order: LabOrder
    let status: String
    let critical: Bool
    var body: some View {
        SectionCard {
            ListRow(title: order.items.map(\.name).joined(separator: ", "), subtitle: order.patientName,
                    meta: ClimesaDates.display(order.completedAt ?? order.createdAt)) {
                Image(systemName: "chevron.right").foregroundStyle(Theme.muted).accessibilityHidden(true)
            }
            HStack(spacing: Spacing.s) {
                PatientTag(order.reviewedAt != nil ? "firmada" : order.state.rawValue, label: status)
                if order.priority == .urgente { PatientTag("llamado", label: order.priority.label) }
                if critical { PatientTag("critico_alto", label: L.text("results.critical")) }
            }
        }
    }
}

/// Detalle de una orden: cada examen con su valor y su marca (los rangos los decide el laboratorio).
struct LabOrderDetail: View {
    let order: LabOrder
    let showValues: Bool
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            PatientTag(order.state.rawValue, label: order.state.label)
            if !showValues { PatientNotice(text: L.text("exams.waiting_review")) }
            ForEach(order.items) { item in
                SectionCard(title: "\(item.name) (\(item.code))") {
                    if showValues {
                        HStack {
                            Text(verbatim: PatientLabRules.valueText(item.result)).font(Typo.heading).foregroundStyle(Theme.ink)
                            Spacer()
                            if let mark = item.result?.mark { PatientTag(mark.rawValue, label: mark.label) }
                        }
                    }
                }
            }
        }
    }
}

/// Más (paciente): secciones según permisos del catálogo.
struct PatientMoreView: View {
    let profile: AccessProfile
    let role: String
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            ForEach(AppSection.visible(for: role, profile: profile), id: \.self) { section in
                NavigationLink { PatientSectionView(section: section, profile: profile) } label: {
                    SectionCard {
                        HStack(spacing: Spacing.m) {
                            Image(systemName: section.symbol).foregroundStyle(Theme.primaryText).frame(width: 28).accessibilityHidden(true)
                            Text(LocalizedStringKey(section.titleKey)).font(Typo.subheading).foregroundStyle(Theme.ink)
                            Spacer()
                            Image(systemName: "chevron.right").foregroundStyle(Theme.muted).accessibilityHidden(true)
                        }
                    }
                }.buttonStyle(.plain)
            }
        }
    }
}

struct PatientSectionView: View {
    let section: AppSection
    let profile: AccessProfile
    var body: some View {
        ScreenFrame(title: LocalizedStringKey(section.titleKey)) {
            switch section {
            case .vinculacion: LinkRecordView()
            case .historial:
                if let patientId = profile.patientId { ClinicalHistoryView(patientId: patientId, canRequestAccess: false) }
                else { EmptyStateView(title: L.text("home.unlinked.title"), message: L.text("exams.unlinked"), symbol: "link") }
            case .ambulancia: AmbulanceRequestView()
            case .hospital: HospitalInfoView()
            case .accesos: MyAccessView()
            case .perfil: ProfileContent(profile: profile)
            case .hospitalizados: HospitalizedView()
            case .llegadaAmbulancia: AmbulanceArrivalView()
            }
        }
    }
}

/// I03 · Vincular expediente: DUI y fecha de nacimiento; cambia sola al aprobarse (`vinculacion.resuelta`).
struct LinkRecordView: View {
    @EnvironmentObject private var account: AccountModel
    @Environment(LiveViewModel.self) private var live
    @State private var submission = Submission()
    @State private var dui = ""
    @State private var birth = Calendar.current.date(byAdding: .year, value: -30, to: Date()) ?? Date()
    @State private var errors: [String: String] = [:]
    @State private var result: LinkRequestResult?
    @State private var rejected = false

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            if account.profile?.patientId != nil {
                PatientNotice(text: L.text("link.approved"))
            } else if rejected {
                PatientNotice(text: L.text("link.rejected"), failure: true)
            } else if let result {
                SectionCard(eyebrow: L.text("link.status")) {
                    PatientTag(result.state.rawValue, label: result.state.label)
                    EmptyNote("link.pending.body")
                }
            }
            if account.profile?.patientId == nil && (result == nil || rejected) {
                Text("link.intro").font(Typo.body).foregroundStyle(Theme.muted)
                SectionCard {
                    FormField(label: L.text("link.dui"), text: $dui, error: errors["dui"])
                        .keyboardType(.numbersAndPunctuation)
                    VStack(alignment: .leading, spacing: Spacing.s) {
                        DatePicker("link.birth", selection: $birth, in: ...Date(), displayedComponents: .date).font(Typo.label).foregroundStyle(Theme.ink)
                        FieldError(text: errors["birth"])
                    }
                }
                PatientSubmissionNotice(submission: submission)
                ClimesaButton(title: L.text("link.submit"), loading: submission.busy) { Task { await send() } }
            }
        }
        .task(id: live.snapshot.version(.link)) {
            guard result != nil, live.snapshot.lastEvent?.type == "vinculacion.resuelta" else { return }
            await account.refreshProfile()
            if account.profile?.patientId == nil { rejected = true }
        }
    }

    private func send() async {
        let day = Self.dayText(birth)
        errors = LinkRules.errors(dui: dui, birth: day, today: Date())
        guard errors.isEmpty else { return }
        let body = LinkRules.body(dui: dui, birth: day)
        var created: LinkRequestResult?
        let ok = await submission.run(body: body) { key in
            created = try await account.client().send("POST", "/cuentas/vinculacion", body: body, key: key, as: LinkRequestResult.self)
        }
        if ok, let created { result = created; rejected = false }
    }

    /// La fecha elegida en el calendario del dispositivo, como `yyyy-MM-dd`.
    static func dayText(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = .current
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }
}

/// I08 (paciente) e I22 (médico) · Historial: consultas, diagnósticos, recetas, resultados y hospitalizaciones.
/// Si el médico no es tratante (403), puede pedir acceso excepcional con motivo y duración.
struct ClinicalHistoryView: View {
    let patientId: String
    let canRequestAccess: Bool
    @EnvironmentObject private var account: AccountModel
    @Environment(LiveViewModel.self) private var live
    @State private var loader = Loader<ClinicalHistory>()
    @State private var submission = Submission()
    @State private var reason = ""
    @State private var hours = 4
    @State private var errors: [String: String] = [:]
    @State private var requested: ExceptionalAccess?

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            LoadState(loader: loader, retry: load) { history in HistoryContent(history: history) }
            if canRequestAccess && loader.failure?.isForbidden == true { accessForm }
        }
        .task(id: live.snapshot.version([.consultations, .laboratory, .admissions, .access, .patient])) { await load() }
    }

    @ViewBuilder private var accessForm: some View {
        SectionCard(title: L.text("access.title")) {
            if let requested {
                PatientTag(requested.state.rawValue, label: requested.state.label)
                EmptyNote("access.pending.body")
            } else {
                EmptyNote("access.body")
                PatientTextArea(label: L.text("access.reason"), text: $reason, lines: 2...5, error: errors["motivo"])
                Stepper(value: $hours, in: 1...24) { Text(verbatim: String(format: L.text("access.hours"), hours)).font(Typo.body).foregroundStyle(Theme.ink) }
                FieldError(text: errors["horas"])
                PatientSubmissionNotice(submission: submission)
                ClimesaButton(title: L.text("access.submit"), loading: submission.busy) { Task { await requestAccess() } }
            }
        }
    }

    private func load() async {
        await loader.load { try await account.client().get("/pacientes/\(patientId)/historial", as: ClinicalHistory.self) }
    }

    private func requestAccess() async {
        errors = ExceptionalAccessRules.errors(reason: reason, hours: hours)
        guard errors.isEmpty else { return }
        let body = ExceptionalAccessBody(patientId: patientId, reason: reason.trimmingCharacters(in: .whitespacesAndNewlines), hours: hours)
        var created: ExceptionalAccess?
        let ok = await submission.run(body: body) { key in
            created = try await account.client().send("POST", "/accesos-excepcionales", body: body, key: key, as: ExceptionalAccess.self)
        }
        if ok { requested = created }
    }
}

private struct HistoryContent: View {
    let history: ClinicalHistory
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionCard {
                ListRow(title: history.patient.fullName ?? history.patient.record, meta: history.patient.record) {
                    PatientTag(history.access.rawValue, label: history.access.label)
                }
            }
            SectionTitle("history.consultations")
            if history.consultations.isEmpty { EmptyStateView(title: L.text("history.none"), symbol: "stethoscope") }
            ForEach(history.consultations) { consultation in
                NavigationLink {
                    ScreenFrame(title: "history.consultation") { ConsultationRecord(consultation: consultation) }
                } label: {
                    SectionCard {
                        ListRow(title: ClimesaDates.display(consultation.signedAt ?? consultation.startedAt),
                                subtitle: consultation.doctor.name ?? L.text("history.doctor.unknown"),
                                meta: consultation.diagnoses.isEmpty ? nil : consultation.diagnoses.map { "\($0.code) \($0.description)" }.joined(separator: " · ")) {
                            PatientTag(consultation.state.rawValue, label: consultation.state.label)
                        }
                    }
                }.buttonStyle(.plain)
            }
            SectionTitle("history.laboratory")
            if history.laboratory.isEmpty { EmptyStateView(title: L.text("history.none"), symbol: "testtube.2") }
            ForEach(history.laboratory) { order in
                SectionCard {
                    ListRow(title: ClimesaDates.display(order.createdAt, .date)) { PatientTag(order.state.rawValue, label: order.state.label) }
                    ForEach(order.items) { item in
                        HStack {
                            Text(verbatim: item.name).font(Typo.small).foregroundStyle(Theme.ink)
                            Spacer()
                            if let result = item.result {
                                Text(verbatim: "\(PatientLabRules.valueText(LabItemResult(value: result.value, text: result.text, mark: result.mark))) \(item.unit ?? "")").font(Typo.mono).foregroundStyle(Theme.ink)
                                if let mark = result.mark { PatientTag(mark.rawValue, label: mark.label) }
                            }
                        }
                    }
                }
            }
            SectionTitle("history.admissions")
            if history.admissions.isEmpty { EmptyStateView(title: L.text("history.none"), symbol: "bed.double") }
            ForEach(history.admissions) { admission in
                SectionCard {
                    ListRow(title: ClimesaDates.display(admission.createdAt, .date), subtitle: admission.doctor.name) {
                        PatientTag(admission.state.rawValue, label: admission.state.label)
                    }
                }
            }
        }
    }
}

private struct ConsultationRecord: View {
    let consultation: ClinicalHistory.Consultation
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionCard {
                ListRow(title: ClimesaDates.display(consultation.signedAt ?? consultation.startedAt),
                        subtitle: [consultation.doctor.name, consultation.doctor.specialty].compactMap { $0 }.joined(separator: " · "))
            }
            if let reason = consultation.reason, !reason.isEmpty { LabeledText(label: "consultation.reason", text: reason) }
            if let exam = consultation.physicalExam, !exam.isEmpty { LabeledText(label: "consultation.exam", text: exam) }
            if let plan = consultation.plan, !plan.isEmpty { LabeledText(label: "consultation.plan", text: plan) }
            SectionTitle("consultation.diagnoses")
            ForEach(Array(consultation.diagnoses.enumerated()), id: \.offset) { _, diagnosis in
                SectionCard {
                    ListRow(title: "\(diagnosis.code) · \(diagnosis.description)") {
                        if diagnosis.principal { PatientTag("activo", label: L.text("consultation.principal")) }
                    }
                }
            }
            SectionTitle("consultation.prescriptions")
            ForEach(consultation.prescriptions) { prescription in
                SectionCard {
                    ForEach(Array(prescription.items.enumerated()), id: \.offset) { _, item in
                        ListRow(title: "\(item.medication) \(item.dose)", subtitle: "\(item.route) · \(item.frequency) · \(item.duration)", meta: item.instructions)
                    }
                }
            }
        }
    }
}

struct LabeledText: View {
    let label: LocalizedStringKey
    let text: String
    var body: some View {
        SectionCard { Text(label).font(Typo.eyebrow).foregroundStyle(Theme.primaryText).textCase(.uppercase); Text(verbatim: text).font(Typo.body).foregroundStyle(Theme.ink) }
    }
}

/// I09 · Pedir ambulancia: aviso del 911, ubicación, motivo y teléfono. Queda "por confirmar" (la central llama).
struct AmbulanceRequestView: View {
    @EnvironmentObject private var account: AccountModel
    @Environment(LiveViewModel.self) private var live
    @State private var submission = Submission()
    @State private var address = ""
    @State private var municipality = ""
    @State private var reason = ""
    @State private var phone = ""
    @State private var errors: [String: String] = [:]
    @State private var created: AmbulanceRequestCreated?

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            VStack(alignment: .leading, spacing: Spacing.s) {
                Text("ambulance.emergency").font(Typo.subheading)
                if let call = URL(string: "tel:911") { Link(destination: call) { Text("ambulance.call911").font(Typo.label).underline() } }
            }
            .padding(Spacing.l).frame(maxWidth: .infinity, alignment: .leading)
            .foregroundStyle(Theme.danger).background(Theme.dangerSoft, in: RoundedRectangle(cornerRadius: Radius.card))
            .overlay(RoundedRectangle(cornerRadius: Radius.card).stroke(Theme.danger, lineWidth: 1))
            if let created {
                SectionCard(eyebrow: L.text("ambulance.status")) {
                    PatientTag(created.state.rawValue, label: created.state.label)
                    Text(verbatim: created.notice).font(Typo.body).foregroundStyle(Theme.ink)
                    if let update = updateText { LiveIndicator(); PatientNotice(text: update) }
                }
            } else {
                SectionCard {
                    PatientTextArea(label: L.text("ambulance.address"), text: $address, lines: 1...3, error: errors["address"])
                    FormField(label: L.text("ambulance.municipality"), text: $municipality)
                    PatientTextArea(label: L.text("ambulance.reason"), text: $reason, lines: 2...5, error: errors["reason"])
                    FormField(label: L.text("ambulance.phone"), text: $phone, error: errors["contactPhone"])
                        .keyboardType(.phonePad).textContentType(.telephoneNumber)
                }
                PatientSubmissionNotice(submission: submission)
                ClimesaButton(title: L.text("ambulance.submit"), loading: submission.busy) { Task { await send() } }
            }
        }
    }

    /// Los eventos delgados no traen el estado nuevo y el paciente no tiene lectura de su solicitud (ver preguntas-abiertas).
    private var updateText: String? {
        guard let created, let event = live.snapshot.lastEvent, event.id == created.id || event.type == "ambulancia.hito" else { return nil }
        guard event.type.hasPrefix("ambulancia.") else { return nil }
        return L.text(event.type == "ambulancia.hito" ? "ambulance.update.milestone" : "ambulance.update.state")
    }

    private func send() async {
        errors = AmbulanceRules.errors(address: address, reason: reason, phone: phone)
        guard errors.isEmpty else { return }
        let body = AmbulanceRules.body(address: address, municipality: municipality, reason: reason, phone: phone)
        var result: AmbulanceRequestCreated?
        let ok = await submission.run(body: body) { key in
            result = try await account.client().send("POST", "/ambulancia/solicitudes", body: body, key: key, as: AmbulanceRequestCreated.self)
        }
        if ok { created = result }
    }
}

struct HospitalInfo: Sendable {
    var occupancy: PublicOccupancy?
    var doctors: DoctorsOnDuty?
    var notices: PublicNotices?
}

/// I10 · Información del hospital: ocupación general, médicos de turno y avisos (datos públicos).
struct HospitalInfoView: View {
    @EnvironmentObject private var account: AccountModel
    @Environment(LiveViewModel.self) private var live
    @State private var loader = Loader<HospitalInfo>()

    var body: some View {
        LoadState(loader: loader, retry: load) { info in
            SectionTitle("hospital.occupancy")
            if let rows = info.occupancy?.rows, !rows.isEmpty {
                ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
                    StatTile(value: String(row.free), label: String(format: L.text("hospital.beds"), row.free, row.beds),
                             title: row.floor.map { String(format: L.text("hospital.floor"), $0) } ?? row.category.label)
                }
            } else { EmptyStateView(title: L.text("hospital.unavailable"), symbol: "building.2") }
            SectionTitle("hospital.doctors")
            if let doctors = info.doctors?.doctors, !doctors.isEmpty {
                SectionCard {
                    ForEach(Array(doctors.enumerated()), id: \.offset) { index, doctor in
                        if index > 0 { Divider().overlay(Theme.line) }
                        ListRow(title: doctor.name, subtitle: [doctor.specialty, doctor.area].compactMap { $0 }.joined(separator: " · "),
                                meta: doctor.until.map { String(format: L.text("hospital.until"), ClimesaDates.display($0, .time)) })
                    }
                }
            } else { EmptyStateView(title: L.text("hospital.doctors.none"), symbol: "stethoscope") }
            SectionTitle("home.notices")
            if let notices = info.notices?.notices, !notices.isEmpty {
                ForEach(notices) { notice in SectionCard(title: notice.title) { Text(verbatim: notice.body).font(Typo.body).foregroundStyle(Theme.ink) } }
            } else { EmptyStateView(title: L.text("hospital.notices.none"), symbol: "bell") }
        }
        .task(id: live.snapshot.version(.hospitalInfo)) { await load() }
    }

    private func load() async {
        await loader.load {
            let api = try account.client()
            var info = HospitalInfo()
            info.occupancy = try? await api.get("/publico/ocupacion", as: PublicOccupancy.self)
            info.doctors = try? await api.get("/publico/medicos-de-turno", as: DoctorsOnDuty.self)
            info.notices = try? await api.get("/publico/avisos", as: PublicNotices.self)
            if info.occupancy == nil && info.doctors == nil && info.notices == nil { throw APIFailure.transport }
            return info
        }
    }
}

/// I11 · Quién vio mi expediente: fecha, rol y motivo de cada acceso.
struct MyAccessView: View {
    @EnvironmentObject private var account: AccountModel
    @Environment(LiveViewModel.self) private var live
    @State private var loader = Loader<[MyAccess]>()

    var body: some View {
        LoadState(loader: loader, retry: load) { rows in
            if rows.isEmpty { EmptyStateView(title: L.text("accesses.none"), symbol: "eye.slash") }
            ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
                SectionCard {
                    ListRow(title: ClimesaDates.display(row.date), subtitle: row.reason, meta: "\(row.role) · \(row.dataType)") {
                        if row.exceptional { PatientTag("acceso_excepcional", label: L.text("accesses.exceptional")) }
                    }
                }
            }
        }
        .task(id: live.snapshot.version(.access)) { await load() }
    }

    private func load() async { await loader.load { try await account.client().get("/me/accesos", as: [MyAccess].self) } }
}
