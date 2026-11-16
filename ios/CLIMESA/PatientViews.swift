import SwiftUI
import UIKit

// Pantallas del Paciente (docs/arquitectura/datos/pantallas.csv, I03 a I12). Solo llaman endpoints de
// contrato/openapi.json; cada una vuelve a pedir sus datos cuando sube su contador de tiempo real.

/// Cada tarjeta se pide por separado: la que falla muestra su error con «Reintentar» (CH-02); nil es "sin permiso".
struct PatientHome: Sendable {
    var ticket: Part<QueueTicket?>?
    var nextAppointment: Part<Appointment?>?
    var labs: Part<[LabOrder]>?
    var room: Part<Admission?>?
    var notices: Part<[PublicNotices.Notice]>?
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
                if let ticket = home.ticket {
                    if let error = ticket.error { failedCard("home.queue", error) } else { HomeQueueCard(ticket: ticket.value ?? nil) { go(.fila) } }
                }
                if let next = home.nextAppointment {
                    if let error = next.error { failedCard("home.appointment", error) } else { HomeAppointmentCard(appointment: next.value ?? nil) { go(.citas) } }
                }
                if let labs = home.labs {
                    if let error = labs.error { failedCard("home.labs", error) } else if let list = labs.value { HomeLabCard(labs: list) { go(.examenes) } }
                }
                if let room = home.room {
                    if let error = room.error { failedCard("room.eyebrow", error) } else if let current = room.value ?? nil { RoomCard(admission: current) }
                }
                if let notices = home.notices {
                    if let error = notices.error {
                        SectionTitle("home.notices")
                        SectionCard { PartError(message: error, retry: load) }
                    } else if let list = notices.value, !list.isEmpty {
                        SectionTitle("home.notices")
                        ForEach(list) { notice in NoticeCard(notice: notice) }
                    }
                }
            }
        }
        .task(id: live.snapshot.version([.queue, .appointments, .laboratory, .hospitalInfo, .admissions])) { await load() }
    }

    @ViewBuilder private func failedCard(_ eyebrow: String, _ message: String) -> some View {
        SectionCard(eyebrow: L.text(eyebrow)) { PartError(message: message, retry: load) }
    }

    private func load() async {
        await loader.load {
            let api = try account.client()
            let patientId = profile.patientId
            var home = PatientHome()
            if profile.hasPermission("fila.ver") {
                home.ticket = try await Part<QueueTicket?>.load {
                    let tickets = try await api.get("/fila", as: [QueueTicket].self)
                    return QueueRules.activeTicket(tickets)
                }
            }
            if profile.hasPermission("citas.ver") {
                home.nextAppointment = try await Part<Appointment?>.load {
                    let list = try await api.get("/citas", as: [Appointment].self)
                    return AppointmentRules.split(list, now: Date()).upcoming.first
                }
            }
            if patientId != nil, profile.hasPermission("resultados.ver") {
                home.labs = try await Part<[LabOrder]>.load { try await api.get("/me/laboratorio", as: [LabOrder].self) }
            }
            if patientId != nil, profile.hasPermission("admision.ver") {
                home.room = try await Part<Admission?>.load {
                    let admissions = try await api.get("/admisiones", as: [Admission].self)
                    return RoomRules.current(admissions, patientId: patientId)
                }
            }
            // MA-AVI-01: los avisos dirigidos a los roles de la persona además de los públicos.
            home.notices = try await Part<[PublicNotices.Notice]>.load { try await api.get("/me/avisos", as: PublicNotices.self).byPriority }
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
    @State private var rescheduling: Appointment?
    @State private var requesting = false

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            if account.can("citas.solicitar") { ClimesaButton(title: L.text("appointments.request")) { requesting = true } }
            PatientSubmissionNotice(submission: submission)
            if submission.lastFailure?.code == "version_conflicto" { ConflictBanner { Task { submission.error = nil; await load() } } }
            LoadState(loader: loader, retry: load) { list in
                // CITA-04: el reloj de interfaz (cada minuto) solo recalcula qué acciones siguen válidas; no pide datos.
                TimelineView(.everyMinute) { context in
                    let split = AppointmentRules.split(list, now: context.date)
                    VStack(alignment: .leading, spacing: 16) {
                        SectionTitle("appointments.upcoming")
                        if split.upcoming.isEmpty { EmptyStateView(title: L.text("appointments.upcoming.none"), symbol: "calendar") }
                        ForEach(split.upcoming) { item in
                            AppointmentRow(appointment: item, option: cancelOption(item, now: context.date), now: context.date, cancel: { cancelling = item }, reschedule: { rescheduling = item })
                        }
                        SectionTitle("appointments.past")
                        if split.past.isEmpty { EmptyStateView(title: L.text("appointments.past.none"), symbol: "clock.arrow.circlepath") }
                        ForEach(split.past) { item in AppointmentRow(appointment: item, option: .hidden, now: context.date, cancel: {}, reschedule: nil) }
                    }
                }
            }
        }
        .task(id: live.snapshot.version(.appointments)) { await load() }
        .sheet(item: $cancelling) { item in
            CancelAppointmentSheet(appointment: item, submission: submission, reload: load)
        }
        .sheet(item: $rescheduling) { item in RescheduleAppointmentSheet(appointment: item, reload: load) }
        .sheet(isPresented: $requesting) { RequestAppointmentSheet(reload: load) }
    }

    private func load() async { await loader.load { try await account.client().get("/citas", as: [Appointment].self) } }

    private func cancelOption(_ item: Appointment, now: Date) -> AppointmentRules.CancelOption {
        account.can("citas.cancelar") ? AppointmentRules.cancelOption(item, now: now) : .hidden
    }
}

/// Una cita con solo las acciones válidas para su estado y su hora (CITA-04): el plazo para cancelar se ve antes de
/// tocar el botón y, dentro del plazo, el botón queda desactivado con el motivo.
private struct AppointmentRow: View {
    let appointment: Appointment
    let option: AppointmentRules.CancelOption
    let now: Date
    let cancel: () -> Void
    let reschedule: (() -> Void)?
    var body: some View {
        SectionCard {
            ListRow(title: ClimesaDates.display(appointment.start), subtitle: appointment.doctorName, meta: appointment.reason) {
                PatientTag(appointment.state.rawValue, label: appointment.state.label)
            }
            if let rejection = appointment.rejectionReason, !rejection.isEmpty {
                Text(verbatim: String(format: L.text("appointments.rejected.reason"), rejection)).font(Typo.small).foregroundStyle(Theme.danger)
            }
            switch option {
            case .hidden: EmptyView()
            case let .allowed(deadline):
                Label { Text(verbatim: AppointmentRules.cancelDeadlineText(deadline, now: now)) } icon: { Image(systemName: "clock") }
                    .font(Typo.small).foregroundStyle(Theme.muted)
                ClimesaButton(title: L.text("appointments.cancel"), kind: .destructive, action: cancel)
            case .tooLate:
                ClimesaButton(title: L.text("appointments.cancel"), kind: .destructive, action: cancel).disabled(true)
                Text(verbatim: AppointmentRules.cancelTooLateText()).font(Typo.small).foregroundStyle(Theme.muted)
            case let .blocked(reason):
                ClimesaButton(title: L.text("appointments.cancel"), kind: .destructive, action: cancel).disabled(true)
                Text(verbatim: reason).font(Typo.small).foregroundStyle(Theme.muted)
            }
            // CITA-02: reprogramar solo si el servidor lo permite; si no, el motivo.
            if let text = AppointmentRules.rescheduleText(appointment) {
                Text(verbatim: text).font(Typo.small).foregroundStyle(appointment.reschedule?.state == .rechazada ? Theme.danger : Theme.muted)
            }
            if let reschedule {
                if AppointmentRules.canReschedule(appointment) {
                    ClimesaButton(title: L.text("appointments.reschedule"), kind: .secondary, action: reschedule)
                } else if let reason = AppointmentRules.blockedReason(appointment, .reprogramar), appointment.reschedule?.state != .pendiente {
                    Text(verbatim: "\(L.text("appointments.reschedule")): \(reason)").font(Typo.small).foregroundStyle(Theme.muted)
                }
            }
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
                PatientTextArea(label: L.text("appointments.cancel.reason"), text: $reason, lines: 3...6, error: fieldError ?? submission.fieldErrors["reason"])
                CharacterCounter(count: reason.trimmingCharacters(in: .whitespacesAndNewlines).count, range: 10...500)
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

/// CITA-02: pedir otra franja libre del mismo médico; la cita actual sigue vigente hasta que la acepten.
private struct RescheduleAppointmentSheet: View {
    let appointment: Appointment
    let reload: () async -> Void
    @EnvironmentObject private var account: AccountModel
    @Environment(\.dismiss) private var dismiss
    @State private var availability = Loader<Availability>()
    @State private var submission = Submission()
    @State private var day = Date()
    @State private var slot: Period?

    var body: some View {
        NavigationStack {
            ScreenFrame(title: "appointments.reschedule.title") {
                SectionCard { ListRow(title: ClimesaDates.display(appointment.start), subtitle: appointment.doctorName) }
                Text("appointments.reschedule.intro").font(Typo.small).foregroundStyle(Theme.muted)
                DatePicker("appointments.date", selection: $day, in: Date()..., displayedComponents: .date)
                    .environment(\.timeZone, ClimesaDates.zone).environment(\.calendar, ClimesaDates.calendar)
                SectionTitle("appointments.slots")
                LoadState(loader: availability, retry: loadSlots) { value in
                    let free = value.slots.filter { $0.start != appointment.start }
                    if free.isEmpty { EmptyStateView(title: L.text("appointments.slots.none"), symbol: "calendar.badge.exclamationmark") }
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 90))], spacing: 8) {
                        ForEach(free, id: \.self) { period in
                            Button { slot = period } label: {
                                Text(verbatim: ClimesaDates.display(period.start, .time)).font(Typo.label).frame(maxWidth: .infinity, minHeight: Spacing.control)
                                    .background(slot == period ? Theme.primary : Theme.surface, in: RoundedRectangle(cornerRadius: Radius.control))
                                    .overlay(RoundedRectangle(cornerRadius: Radius.control).stroke(slot == period ? Theme.primary : Theme.controlLine, lineWidth: 1))
                                    .foregroundStyle(slot == period ? Theme.onPrimary : Theme.ink)
                            }
                        }
                    }
                }
                PatientSubmissionNotice(submission: submission)
                ClimesaButton(title: L.text("appointments.reschedule.submit"), loading: submission.busy) { Task { await send() } }.disabled(slot == nil)
                ClimesaButton(title: L.text("common.close"), kind: .secondary) { dismiss() }
            }
            .task(id: ClimesaDates.localDay(day)) { slot = nil; await loadSlots() }
        }
    }

    private func loadSlots() async {
        let path = "/citas/disponibilidad?doctorId=\(Query.encode(appointment.doctorId))&date=\(ClimesaDates.localDay(day))"
        await availability.load { try await account.client().get(path, as: Availability.self) }
    }

    private func send() async {
        guard let slot else { return }
        let body = AppointmentRescheduleBody(version: appointment.version, start: slot.start, end: slot.end)
        let ok = await submission.run(appointment.id, body: body, success: L.text("appointments.reschedule.sent")) { key in
            _ = try await account.client().send("POST", "/citas/\(appointment.id)/reprogramar", body: body, key: key, as: AppointmentCommandResult.self)
        }
        if ok { await reload(); dismiss() }
        else if submission.lastFailure?.code == "franja_ocupada" { self.slot = nil; await loadSlots() }
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
                // El día de la cita es el de El Salvador, no el de la zona horaria del teléfono.
                DatePicker("appointments.date", selection: $day, in: Date()..., displayedComponents: .date)
                    .environment(\.timeZone, ClimesaDates.zone).environment(\.calendar, ClimesaDates.calendar)
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
                PatientTextArea(label: L.text("appointments.reason"), text: $reason, lines: 2...4, error: AppointmentRules.requestReasonError(reason) ?? submission.fieldErrors["reason"])
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
    @State private var filter: LabFilter = .all

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            if profile.patientId == nil {
                EmptyStateView(title: L.text("home.unlinked.title"), message: L.text("exams.unlinked"), symbol: "link")
            } else {
                LoadState(loader: loader, retry: load) { orders in
                    Picker("exams.filter", selection: $filter) {
                        ForEach(LabFilter.allCases, id: \.self) { Text(LocalizedStringKey($0.titleKey)).tag($0) }
                    }.pickerStyle(.segmented)
                    let shown = filter.apply(orders)
                    if shown.isEmpty { EmptyStateView(title: L.text(orders.isEmpty ? "exams.none" : "exams.filter.none"), symbol: "testtube.2") }
                    ForEach(shown) { order in
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
            // Solo el paciente ve este aviso (sin valores): el médico ve los valores y su propia etiqueta.
            if !showValues { PatientNotice(text: L.text(ReviewRules.isAmendedPendingReview(order) ? "exams.amended" : "exams.waiting_review")) }
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
struct MoreView: View {
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
                if let patientId = profile.patientId { ClinicalHistoryView(patientId: patientId) }
                else { EmptyStateView(title: L.text("home.unlinked.title"), message: L.text("exams.unlinked"), symbol: "link") }
            case .ambulancia: AmbulanceRequestView()
            case .hospital: HospitalInfoView()
            case .ubicacion: LocationView()
            case .misDatos: MyDataView(profile: profile)
            case .miHabitacion: MyRoomView(profile: profile)
            case .agenda: DoctorAgendaView(profile: profile)
            case .ambulanciaEstado: AmbulanceOverviewView()
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
/// Sin relación de atención, la API responde 403 y se muestra su mensaje.
struct ClinicalHistoryView: View {
    let patientId: String
    /// Quién mira: el paciente su propio historial o el médico el de un paciente (solo el tratante lo ve).
    var viewerIsPatient = true
    @EnvironmentObject private var account: AccountModel
    @Environment(LiveViewModel.self) private var live
    @State private var loader = Loader<ClinicalHistory>()

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            if let denied = RecordAccess.deniedMessage(for: loader.failure, viewerIsPatient: viewerIsPatient) {
                EmptyStateView(title: L.text("history.forbidden.title"), message: denied, symbol: "lock.shield")
            } else {
                LoadState(loader: loader, retry: load) { history in HistoryContent(history: history) }
            }
        }
        .task(id: live.snapshot.version([.consultations, .laboratory, .admissions, .access, .patient])) { await load() }
    }

    private func load() async {
        await loader.load { try await account.client().get("/pacientes/\(patientId)/historial", as: ClinicalHistory.self) }
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
/// MA-AMB-05: el estado sale de `GET /ambulancia/solicitudes/mias` (sobrevive a cerrar la app) y se vuelve a pedir con cada
/// evento de ambulancia del canal propio; "Cancelar solicitud" solo aparece cuando la API la permite.
struct AmbulanceRequestView: View {
    @EnvironmentObject private var account: AccountModel
    @Environment(LiveViewModel.self) private var live
    @State private var loader = Loader<[OwnAmbulanceRequest]>()
    @State private var submission = Submission()
    @State private var cancelling: OwnAmbulanceRequest?
    @State private var cancelReason = ""
    @State private var address = ""
    @State private var municipality = ""
    @State private var reason = ""
    @State private var phone = ""
    @State private var errors: [String: String] = [:]

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            VStack(alignment: .leading, spacing: Spacing.s) {
                Text("ambulance.emergency").font(Typo.subheading)
                if let call = URL(string: "tel:911") { Link(destination: call) { Text("ambulance.call911").font(Typo.label).underline() } }
            }
            .padding(Spacing.l).frame(maxWidth: .infinity, alignment: .leading)
            .foregroundStyle(Theme.danger).background(Theme.dangerSoft, in: RoundedRectangle(cornerRadius: Radius.card))
            .overlay(RoundedRectangle(cornerRadius: Radius.card).stroke(Theme.danger, lineWidth: 1))
            LoadState(loader: loader, retry: load) { requests in
                if let active = AmbulanceRules.active(requests) { activeCard(active) } else { form }
            }
        }
        .task(id: live.snapshot.version(.ambulance)) { await load() }
        .sheet(item: $cancelling) { request in cancelSheet(request) }
    }

    private func activeCard(_ request: OwnAmbulanceRequest) -> some View {
        SectionCard(eyebrow: L.text("ambulance.status")) {
            PatientTag(request.state.rawValue, label: request.state.label)
            Text(verbatim: AmbulanceRules.progress(request)).font(Typo.body).foregroundStyle(Theme.ink)
            Text(verbatim: request.address).font(Typo.small).foregroundStyle(Theme.muted)
            if let service = request.service {
                ForEach(["salida", "en_escena", "trasladando", "en_hospital"], id: \.self) { type in
                    let done = service.milestones.first { $0.type == type }
                    HStack {
                        Text(verbatim: AmbulanceRules.milestoneLabel(type)).font(Typo.small).foregroundStyle(done == nil ? Theme.muted : Theme.ink)
                        Spacer()
                        Text(verbatim: done.map { ClimesaDates.display($0.occurredAt, .time) } ?? "—").font(Typo.mono).foregroundStyle(Theme.muted)
                    }
                }
            }
            Text(verbatim: request.notice).font(Typo.small).foregroundStyle(Theme.muted)
            PatientSubmissionNotice(submission: submission)
            if request.canCancel {
                ClimesaButton(title: L.text("ambulance.cancel"), kind: .secondary, loading: submission.busy) { cancelReason = ""; cancelling = request }
            }
        }
    }

    private func cancelSheet(_ request: OwnAmbulanceRequest) -> some View {
        NavigationStack {
            ScreenFrame(title: "ambulance.cancel") {
                Text("ambulance.cancel.detail").font(Typo.body).foregroundStyle(Theme.ink)
                PatientTextArea(label: L.text("ambulance.cancel.reason"), text: $cancelReason, lines: 2...4, error: nil)
                ClimesaButton(title: L.text("ambulance.cancel"), kind: .destructive, loading: submission.busy) { Task { await cancel(request) } }
                ClimesaButton(title: L.text("common.close"), kind: .secondary) { cancelling = nil }
            }
        }
    }

    private var form: some View {
        VStack(alignment: .leading, spacing: 16) {
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

    private func load() async { await loader.load { try await account.client().get("/ambulancia/solicitudes/mias", as: [OwnAmbulanceRequest].self) } }

    private func cancel(_ request: OwnAmbulanceRequest) async {
        let body = AmbulanceCancelBody(version: request.version, reason: cancelReason)
        let ok = await submission.run(request.id, body: body, success: L.text("ambulance.cancel.done")) { key in
            _ = try await account.client().send("POST", "/ambulancia/solicitudes/\(request.id)/cancelar", body: body, key: key, as: AmbulanceRequestStateResult.self)
        }
        if ok { cancelling = nil }
        await load()
    }

    private func send() async {
        errors = AmbulanceRules.errors(address: address, reason: reason, phone: phone)
        guard errors.isEmpty else { return }
        let body = AmbulanceRules.body(address: address, municipality: municipality, reason: reason, phone: phone)
        let ok = await submission.run(body: body) { key in
            _ = try await account.client().send("POST", "/ambulancia/solicitudes", body: body, key: key, as: AmbulanceRequestCreated.self)
        }
        if ok { await load() }
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
                    ListRow(title: ClimesaDates.display(row.date), subtitle: row.reason, meta: "\(row.role) · \(row.dataType)")
                }
            }
        }
        .task(id: live.snapshot.version(.access)) { await load() }
    }

    private func load() async { await loader.load { try await account.client().get("/me/accesos", as: [MyAccess].self) } }
}
