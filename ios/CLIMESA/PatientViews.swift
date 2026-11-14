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
                Card {
                    Text("home.unlinked.title").font(Brand.bold(18))
                    Text("home.unlinked.body").font(Brand.body(14)).foregroundStyle(.secondary)
                    Button("home.unlinked.action") { go(.mas) }
                }
            }
            LoadState(loader: loader, retry: load) { home in
                HomeQueueCard(ticket: home.ticket) { go(.fila) }
                HomeAppointmentCard(appointment: home.nextAppointment) { go(.citas) }
                if let labs = home.labs { HomeLabCard(labs: labs) { go(.examenes) } }
                if !home.notices.isEmpty {
                    SectionTitle("home.notices")
                    ForEach(home.notices) { notice in
                        Card { Text(verbatim: notice.title).font(Brand.bold(17)); Text(verbatim: notice.body).font(Brand.body(14)) }
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
        Card {
            SectionTitle("home.queue")
            if let ticket {
                Text(verbatim: "\(ticket.number)").font(Brand.bold(44))
                Pill(text: ticket.state.label, tone: ticket.state == .llamado ? .warning : .neutral)
            } else {
                EmptyNote("home.queue.none")
            }
            Button("home.open", action: open)
        }
    }
}

private struct HomeAppointmentCard: View {
    let appointment: Appointment?
    let open: () -> Void
    var body: some View {
        Card {
            SectionTitle("home.appointment")
            if let appointment {
                Text(verbatim: ClimesaDates.display(appointment.start)).font(Brand.bold(20))
                Text(verbatim: appointment.doctorName).font(Brand.body(14))
                Pill(text: appointment.state.label, tone: appointment.state == .confirmada ? .good : .neutral)
            } else {
                EmptyNote("home.appointment.none")
            }
            Button("home.open", action: open)
        }
    }
}

private struct HomeLabCard: View {
    let labs: [LabOrder]
    let open: () -> Void
    var body: some View {
        Card {
            SectionTitle("home.labs")
            let pending = labs.filter { $0.reviewedAt == nil && $0.state != .cancelado }.count
            let ready = labs.filter { $0.reviewedAt != nil }.count
            Text(verbatim: String(format: L.text("home.labs.summary"), pending, ready)).font(Brand.body(15))
            Button("home.open", action: open)
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
                Card { Text("queue.none.title").font(Brand.bold(20)); EmptyNote("queue.none.body") }
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
                Notice(text: office.map { String(format: L.text("queue.called.office"), $0) } ?? L.text("queue.called"))
                    .accessibilityAddTraits(.updatesFrequently)
            }
            Card {
                Text(verbatim: ticket.service.label).font(Brand.mono(12)).foregroundStyle(Brand.blue)
                Text(verbatim: "\(ticket.number)").font(Brand.bold(96)).minimumScaleFactor(0.5)
                Pill(text: ticket.state.label, tone: ticket.state == .llamado ? .warning : .neutral)
                if ticket.state == .enEspera, let board, let ahead = QueueRules.ahead(of: ticket.number, called: board.called) {
                    Text(verbatim: String(format: L.text("queue.ahead"), ahead)).font(Brand.body(16))
                    Text("queue.ahead.hint").font(Brand.body(12)).foregroundStyle(.secondary)
                }
                Text(verbatim: String(format: L.text("queue.issued"), ClimesaDates.display(ticket.issuedAt, .time))).font(Brand.body(13)).foregroundStyle(.secondary)
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
            if account.can("citas.solicitar") { PrimaryButton(title: "appointments.request") { requesting = true } }
            SubmissionNotice(submission: submission)
            LoadState(loader: loader, retry: load) { list in
                let split = AppointmentRules.split(list, now: Date())
                SectionTitle("appointments.upcoming")
                if split.upcoming.isEmpty { EmptyNote("appointments.upcoming.none") }
                ForEach(split.upcoming) { item in
                    AppointmentRow(appointment: item, cancel: cancelAction(item))
                }
                SectionTitle("appointments.past")
                if split.past.isEmpty { EmptyNote("appointments.past.none") }
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
        Card {
            HStack {
                Text(verbatim: ClimesaDates.display(appointment.start)).font(Brand.bold(17))
                Spacer()
                Pill(text: appointment.state.label, tone: appointment.state == .confirmada ? .good : (appointment.state == .rechazada ? .warning : .neutral))
            }
            Text(verbatim: appointment.doctorName).font(Brand.body(14))
            if let reason = appointment.reason, !reason.isEmpty { Text(verbatim: reason).font(Brand.body(13)).foregroundStyle(.secondary) }
            if let rejection = appointment.rejectionReason, !rejection.isEmpty {
                Text(verbatim: String(format: L.text("appointments.rejected.reason"), rejection)).font(Brand.body(13)).foregroundStyle(.red)
            }
            if let cancel { Button("appointments.cancel", role: .destructive, action: cancel) }
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
                Text(verbatim: "\(ClimesaDates.display(appointment.start)) · \(appointment.doctorName)").font(Brand.body(15))
                TextField("appointments.cancel.reason", text: $reason, axis: .vertical).lineLimit(3...6).padding(12).background(.white)
                FieldError(text: fieldError)
                SubmissionNotice(submission: submission)
                PrimaryButton(title: "appointments.cancel.confirm", busy: submission.busy) { Task { await send() } }
                Button("common.close") { dismiss() }
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
                        if value.slots.isEmpty { EmptyNote("appointments.slots.none") }
                        LazyVGrid(columns: [GridItem(.adaptive(minimum: 90))], spacing: 8) {
                            ForEach(value.slots, id: \.self) { period in
                                Button { slot = period } label: {
                                    Text(verbatim: ClimesaDates.display(period.start, .time)).font(Brand.body(14)).frame(maxWidth: .infinity).padding(10)
                                        .background(slot == period ? Brand.blue : Color.white).foregroundStyle(slot == period ? Color.white : Brand.ink)
                                }
                            }
                        }
                    }
                }
                TextField("appointments.reason", text: $reason, axis: .vertical).lineLimit(2...4).padding(12).background(.white)
                FieldError(text: AppointmentRules.requestReasonError(reason))
                SubmissionNotice(submission: submission)
                PrimaryButton(title: "appointments.submit", busy: submission.busy) { Task { await send() } }
                    .disabled(slot == nil || AppointmentRules.requestReasonError(reason) != nil)
                Button("common.close") { dismiss() }
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
                Card { Text("home.unlinked.title").font(Brand.bold(18)); EmptyNote("exams.unlinked") }
            } else {
                LoadState(loader: loader, retry: load) { orders in
                    if orders.isEmpty { EmptyNote("exams.none") }
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
        Card {
            HStack {
                Text(verbatim: order.items.map(\.name).joined(separator: ", ")).font(Brand.bold(16)).lineLimit(2)
                Spacer()
                Image(systemName: "chevron.right").foregroundStyle(.secondary)
            }
            if let name = order.patientName { Text(verbatim: name).font(Brand.body(14)) }
            HStack(spacing: 8) {
                Pill(text: status, tone: order.reviewedAt != nil ? .good : .neutral)
                if order.priority == .urgente { Pill(text: order.priority.label, tone: .warning) }
                if critical { Pill(text: L.text("results.critical"), tone: .danger) }
            }
            Text(verbatim: ClimesaDates.display(order.completedAt ?? order.createdAt)).font(Brand.body(12)).foregroundStyle(.secondary)
        }
    }
}

/// Detalle de una orden: cada examen con su valor y su marca (los rangos los decide el laboratorio).
struct LabOrderDetail: View {
    let order: LabOrder
    let showValues: Bool
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Pill(text: order.state.label)
            if !showValues { Notice(text: L.text("exams.waiting_review")) }
            ForEach(order.items) { item in
                Card {
                    Text(verbatim: "\(item.name) (\(item.code))").font(Brand.bold(16))
                    if showValues {
                        HStack {
                            Text(verbatim: PatientLabRules.valueText(item.result)).font(Brand.bold(22))
                            Spacer()
                            if let mark = item.result?.mark { Pill(text: mark.label, tone: mark.isCritical ? .danger : (mark == .normal ? .good : .warning)) }
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
                    HStack {
                        Image(systemName: section.symbol).frame(width: 28)
                        Text(LocalizedStringKey(section.titleKey)).font(Brand.body(17))
                        Spacer()
                        Image(systemName: "chevron.right").foregroundStyle(.secondary)
                    }.padding(16).background(.white)
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
                else { EmptyNote("exams.unlinked") }
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
                Notice(text: L.text("link.approved"))
            } else if rejected {
                Notice(text: L.text("link.rejected"), failure: true)
            } else if let result {
                Card {
                    Text("link.status").font(Brand.mono(12)).foregroundStyle(Brand.blue)
                    Pill(text: result.state.label, tone: result.state == .aprobada ? .good : .neutral)
                    EmptyNote("link.pending.body")
                }
            }
            if account.profile?.patientId == nil && (result == nil || rejected) {
                Text("link.intro").font(Brand.body(15)).foregroundStyle(.secondary)
                Card {
                    TextField("link.dui", text: $dui).keyboardType(.numbersAndPunctuation)
                    FieldError(text: errors["dui"])
                    DatePicker("link.birth", selection: $birth, in: ...Date(), displayedComponents: .date)
                    FieldError(text: errors["birth"])
                }
                SubmissionNotice(submission: submission)
                PrimaryButton(title: "link.submit", busy: submission.busy) { Task { await send() } }
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
        Card {
            Text("access.title").font(Brand.bold(18))
            if let requested {
                Pill(text: requested.state.label, tone: requested.state == .aprobado ? .good : .neutral)
                EmptyNote("access.pending.body")
            } else {
                EmptyNote("access.body")
                TextField("access.reason", text: $reason, axis: .vertical).lineLimit(2...5).padding(10).background(Brand.paper)
                FieldError(text: errors["motivo"])
                Stepper(value: $hours, in: 1...24) { Text(verbatim: String(format: L.text("access.hours"), hours)) }
                FieldError(text: errors["horas"])
                SubmissionNotice(submission: submission)
                PrimaryButton(title: "access.submit", busy: submission.busy) { Task { await requestAccess() } }
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
            Card {
                Text(verbatim: history.patient.fullName ?? history.patient.record).font(Brand.bold(20))
                Text(verbatim: history.patient.record).font(Brand.mono(12))
                Pill(text: history.access.label, tone: history.access == .accesoExcepcional ? .warning : .neutral)
            }
            SectionTitle("history.consultations")
            if history.consultations.isEmpty { EmptyNote("history.none") }
            ForEach(history.consultations) { consultation in
                NavigationLink {
                    ScreenFrame(title: "history.consultation") { ConsultationRecord(consultation: consultation) }
                } label: {
                    Card {
                        HStack {
                            Text(verbatim: ClimesaDates.display(consultation.signedAt ?? consultation.startedAt)).font(Brand.bold(16))
                            Spacer()
                            Pill(text: consultation.state.label)
                        }
                        Text(verbatim: consultation.doctor.name ?? L.text("history.doctor.unknown")).font(Brand.body(14))
                        if !consultation.diagnoses.isEmpty {
                            Text(verbatim: consultation.diagnoses.map { "\($0.code) \($0.description)" }.joined(separator: " · ")).font(Brand.body(13)).foregroundStyle(.secondary).lineLimit(2)
                        }
                    }
                }.buttonStyle(.plain)
            }
            SectionTitle("history.laboratory")
            if history.laboratory.isEmpty { EmptyNote("history.none") }
            ForEach(history.laboratory) { order in
                Card {
                    HStack { Text(verbatim: ClimesaDates.display(order.createdAt, .date)).font(Brand.bold(15)); Spacer(); Pill(text: order.state.label) }
                    ForEach(order.items) { item in
                        HStack {
                            Text(verbatim: item.name).font(Brand.body(14))
                            Spacer()
                            if let result = item.result {
                                Text(verbatim: "\(PatientLabRules.valueText(LabItemResult(value: result.value, text: result.text, mark: result.mark))) \(item.unit ?? "")").font(Brand.body(14))
                                if let mark = result.mark { Pill(text: mark.label, tone: mark.isCritical ? .danger : .neutral) }
                            }
                        }
                    }
                }
            }
            SectionTitle("history.admissions")
            if history.admissions.isEmpty { EmptyNote("history.none") }
            ForEach(history.admissions) { admission in
                Card {
                    HStack { Text(verbatim: ClimesaDates.display(admission.createdAt, .date)).font(Brand.bold(15)); Spacer(); Pill(text: admission.state.label) }
                    if let name = admission.doctor.name { Text(verbatim: name).font(Brand.body(14)) }
                }
            }
        }
    }
}

private struct ConsultationRecord: View {
    let consultation: ClinicalHistory.Consultation
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Card {
                Text(verbatim: ClimesaDates.display(consultation.signedAt ?? consultation.startedAt)).font(Brand.bold(18))
                Text(verbatim: [consultation.doctor.name, consultation.doctor.specialty].compactMap { $0 }.joined(separator: " · ")).font(Brand.body(14))
            }
            if let reason = consultation.reason, !reason.isEmpty { LabeledText(label: "consultation.reason", text: reason) }
            if let exam = consultation.physicalExam, !exam.isEmpty { LabeledText(label: "consultation.exam", text: exam) }
            if let plan = consultation.plan, !plan.isEmpty { LabeledText(label: "consultation.plan", text: plan) }
            SectionTitle("consultation.diagnoses")
            ForEach(Array(consultation.diagnoses.enumerated()), id: \.offset) { _, diagnosis in
                Card {
                    Text(verbatim: "\(diagnosis.code) · \(diagnosis.description)").font(Brand.body(15))
                    if diagnosis.principal { Pill(text: L.text("consultation.principal"), tone: .good) }
                }
            }
            SectionTitle("consultation.prescriptions")
            ForEach(consultation.prescriptions) { prescription in
                Card {
                    ForEach(Array(prescription.items.enumerated()), id: \.offset) { _, item in
                        Text(verbatim: "\(item.medication) \(item.dose) · \(item.route) · \(item.frequency) · \(item.duration)").font(Brand.body(14))
                        if let instructions = item.instructions, !instructions.isEmpty { Text(verbatim: instructions).font(Brand.body(12)).foregroundStyle(.secondary) }
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
        Card { Text(label).font(Brand.mono(11)).foregroundStyle(Brand.blue); Text(verbatim: text).font(Brand.body(15)) }
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
            VStack(alignment: .leading, spacing: 8) {
                Text("ambulance.emergency").font(Brand.bold(18))
                if let call = URL(string: "tel:911") { Link(destination: call) { Text("ambulance.call911").font(Brand.bold(16)) } }
            }.padding(18).frame(maxWidth: .infinity, alignment: .leading).background(Color.red.opacity(0.12)).foregroundStyle(Color.red)
            if let created {
                Card {
                    Text("ambulance.status").font(Brand.mono(12)).foregroundStyle(Brand.blue)
                    Pill(text: created.state.label, tone: created.state == .confirmada ? .good : .neutral)
                    Text(verbatim: created.notice).font(Brand.body(14))
                    if let update = updateText { Notice(text: update) }
                }
            } else {
                Card {
                    TextField("ambulance.address", text: $address, axis: .vertical).lineLimit(1...3)
                    FieldError(text: errors["address"])
                    TextField("ambulance.municipality", text: $municipality)
                    TextField("ambulance.reason", text: $reason, axis: .vertical).lineLimit(2...5)
                    FieldError(text: errors["reason"])
                    TextField("ambulance.phone", text: $phone).keyboardType(.phonePad).textContentType(.telephoneNumber)
                    FieldError(text: errors["contactPhone"])
                }
                SubmissionNotice(submission: submission)
                PrimaryButton(title: "ambulance.submit", busy: submission.busy) { Task { await send() } }
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
            if rows.isEmpty { EmptyNote("accesses.none") }
            ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
                Card {
                    HStack { Text(verbatim: ClimesaDates.display(row.date)).font(Brand.bold(15)); Spacer(); Text(verbatim: row.role).font(Brand.mono(12)) }
                    Text(verbatim: row.reason).font(Brand.body(14))
                    Text(verbatim: row.dataType).font(Brand.body(12)).foregroundStyle(.secondary)
                    if row.exceptional { Pill(text: L.text("accesses.exceptional"), tone: .warning) }
                }
            }
        }
        .task(id: live.snapshot.version(.access)) { await load() }
    }

    private func load() async { await loader.load { try await account.client().get("/me/accesos", as: [MyAccess].self) } }
}
