import SwiftUI
import UIKit

// Pantallas del Paciente (docs/arquitectura/datos/pantallas.csv, I03 a I12). Solo llaman endpoints de
// contrato/openapi.json; cada una vuelve a pedir sus datos cuando sube su contador de tiempo real.

/// Cada tarjeta se pide por separado: la que falla muestra su error con «Reintentar» (CH-02); nil es "sin permiso".
struct PatientHome: Sendable {
    var ticket: Part<QueueTicket?>?
    /// Every upcoming appointment, so Inicio can split today's from the next one (G6).
    var upcoming: Part<[Appointment]>?
    var labs: Part<[LabOrder]>?
    var room: Part<Admission?>?
    /// Office of a called ticket, from the public board ("Pasa al consultorio 2").
    var office: String?
}

/// I04 · Inicio del paciente. S11: los avisos viven en Avisos (Más); aquí solo sale el crítico destacado.
/// G6: Vincular (while not linked), then today's number, «Hoy tienes cita», the next step, new results and shortcuts.
struct PatientHomeView: View {
    let profile: AccessProfile
    let go: (AppTab) -> Void
    @EnvironmentObject private var account: AccountModel
    @Environment(LiveViewModel.self) private var live
    @State private var loader = Loader<PatientHome>()
    /// D1: the session's inbox (RoleTabsView loads it), so the banner and Avisos agree.
    @Environment(NoticeInboxModel.self) private var notices
    /// G-7 (no "seen" in the API): the last visit to «Mis exámenes», read again each time Inicio shows.
    @State private var seenAt: Date?
    @State private var requesting = false
    @State private var requestSent = false
    /// Owner rule: only the two most urgent pending blocks show; the rest fold behind one line.
    @State private var expanded = false
    /// The call already closed with «Entendido» ("id#calls"), shared with «Mi turno» so it is never shown twice.
    @AppStorage(PatientTurnRules.dismissedKey) private var dismissedCall = ""

    private var linked: Bool { profile.patientId != nil }
    private var calledTicket: QueueTicket? { (loader.value?.ticket?.value ?? nil).flatMap { $0.state == .llamado ? $0 : nil } }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            // D68: the banner also stays to confirm «Enterado» or «Recordarme» where they were asked.
            if !NoticeRules.banner(notices.inbox, hiding: notices.hidden).isEmpty || notices.bannerDone != nil { CriticalNoticeBanner(model: notices) }
            if !linked { linkCard }
            if requestSent { PatientNotice(text: L.text("appointments.category.sent")) }
            LoadState(loader: loader, retry: load) { home in
                let upcoming = home.upcoming?.value ?? []
                let today = PatientHomeRules.appointmentToday(upcoming, now: Date())
                let hasTicket = home.ticket.map { $0.error != nil || ($0.value ?? nil) != nil } ?? false
                let blocks = PatientHomeRules.blocks(linked: linked, hasTicket: hasTicket, appointmentToday: today != nil)
                ForEach(AttentionFold.shown(PatientHomeRules.pending(blocks), expanded: expanded), id: \.self) { block in
                    switch block {
                    case .link:
                        EmptyView()
                    case .ticket:
                        if let ticket = home.ticket {
                            if let error = ticket.error { failedCard("home.queue", error) } else { HomeQueueCard(ticket: ticket.value ?? nil, office: home.office) { go(.fila) } }
                        }
                    case .today:
                        if let today { HomeAppointmentCard(eyebrow: L.text("home.appointment.today"), appointment: today) { go(.citas) } }
                    case .next:
                        if let part = home.upcoming {
                            if let error = part.error { failedCard("home.appointment", error) }
                            else { HomeAppointmentCard(eyebrow: L.text("home.appointment"), appointment: PatientHomeRules.nextAppointment(upcoming, now: Date())) { go(.citas) } }
                        }
                    case .results:
                        if let labs = home.labs {
                            if let error = labs.error { failedCard("home.labs", error) }
                            else if let list = labs.value { HomeLabCard(labs: list, fresh: PatientResultsRules.newCount(list, seenAt: seenAt, now: Date())) { go(.examenes) } }
                        }
                        if let room = home.room {
                            if let error = room.error { failedCard("room.eyebrow", error) } else if let current = room.value ?? nil { RoomCard(admission: current) }
                        }
                    case .shortcuts:
                        shortcuts
                    }
                }
                AttentionFoldToggle(count: PatientHomeRules.pending(blocks).count, expanded: $expanded)
                if blocks.contains(.shortcuts) { shortcuts }
            }
        }
        .task(id: live.snapshot.version([.queue, .appointments, .laboratory, .hospitalInfo, .admissions])) { await load() }
        // Called while on Inicio: the same full-screen «Pasa al consultorio N» as «Mi turno».
        .fullScreenCover(isPresented: Binding(
            get: { PatientTurnRules.shouldPresent(calledTicket, dismissed: dismissedCall) },
            set: { shown in if !shown { dismissedCall = PatientTurnRules.callKey(calledTicket) ?? dismissedCall } }
        )) {
            if let ticket = calledTicket {
                CalledCover(ticket: ticket, office: loader.value?.office) { dismissedCall = PatientTurnRules.callKey(ticket) ?? "" }
            }
        }
        .onAppear { readSeen() }
        .sheet(isPresented: $requesting) {
            CategoryRequestSheet(reload: load) { requestSent = true }
        }
        .task(id: requestSent) {
            // The confirmation stays a few seconds, then gives the space back.
            guard requestSent else { return }
            try? await Task.sleep(nanoseconds: 6_000_000_000)
            if !Task.isCancelled { requestSent = false }
        }
    }

    /// S13: while the account is not linked, linking is the one thing to do: open its status (U12: by email) in one tap.
    @ViewBuilder private var linkCard: some View {
        SectionCard {
            Text("home.unlinked.title").font(Typo.subheading).foregroundStyle(Theme.ink)
            Text("home.unlinked.body").font(Typo.small).foregroundStyle(Theme.muted)
            if profile.hasPermission(AppSection.vinculacion.requiredPermission ?? "") {
                NavigationLink { PatientSectionView(section: .vinculacion, profile: profile) } label: { Text("home.unlinked.action") }
                    .buttonStyle(ClimesaButtonStyle())
            } else {
                ClimesaButton(title: L.text("home.unlinked.action"), kind: .secondary) { go(.mas) }
            }
        }
    }

    /// G6 shortcuts: two columns of 44 pt+ tiles, each only with its permission.
    @ViewBuilder private var shortcuts: some View {
        let items = PatientHomeRules.shortcuts(linked: linked, can: profile.hasPermission)
        if !items.isEmpty {
            LazyVGrid(columns: [GridItem(.flexible(), spacing: Spacing.m), GridItem(.flexible(), spacing: Spacing.m)], spacing: Spacing.m) {
                ForEach(items, id: \.self) { item in
                    switch item {
                    case .requestAppointment:
                        Button { requesting = true } label: { ShortcutTile(item: item) }.buttonStyle(.plain)
                    case .ambulance:
                        NavigationLink { PatientSectionView(section: .ambulancia, profile: profile) } label: { ShortcutTile(item: item) }.buttonStyle(.plain)
                    case .exams:
                        Button { go(.examenes) } label: { ShortcutTile(item: item) }.buttonStyle(.plain)
                    case .hospital:
                        NavigationLink { PatientSectionView(section: .hospital, profile: profile) } label: { ShortcutTile(item: item) }.buttonStyle(.plain)
                    }
                }
            }
        }
    }

    @ViewBuilder private func failedCard(_ eyebrow: String, _ message: String) -> some View {
        SectionCard(eyebrow: L.text(eyebrow)) { PartError(message: message, retry: load) }
    }

    private func readSeen() {
        seenAt = DraftStore.shared.load(PatientResultsRules.Seen.self, user: profile.id, key: PatientResultsRules.seenKey)?.date
    }

    private func load() async {
        readSeen()
        await loader.load {
            let api = try account.client()
            let patientId = profile.patientId
            var home = PatientHome()
            if profile.hasPermission("fila.ver") {
                home.ticket = try await Part<QueueTicket?>.load {
                    let tickets = try await api.get("/fila", as: [QueueTicket].self)
                    return QueueRules.activeTicket(tickets)
                }
                // Called: the public board says which office to go to (B5), as «Mi turno» does.
                if let ticket = home.ticket?.value ?? nil, ticket.state == .llamado,
                   let board = try? await api.get("/publico/fila/\(ticket.service.rawValue)", as: PublicQueue.self) {
                    home.office = QueueRules.office(for: ticket.number, called: board.called)
                }
            }
            // Unlinked, `GET /citas` answers 403: Inicio asks to link instead of showing an error card.
            if patientId != nil, profile.hasPermission("citas.ver") {
                home.upcoming = try await Part<[Appointment]>.load {
                    let list = try await api.get(PatientAppointmentRange.path(now: Date()), as: [Appointment].self)
                    return AppointmentRules.split(list, now: Date()).upcoming
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
            return home
        }
    }
}

/// One shortcut of Inicio: symbol and title, the whole tile tappable.
private struct ShortcutTile: View {
    let item: PatientHomeRules.Shortcut
    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.s) {
            ClimesaIcon(item.icon, size: 24).foregroundStyle(Theme.primaryText).accessibilityHidden(true)
            Text(verbatim: item.title).font(Typo.label).foregroundStyle(Theme.ink).lineLimit(2).fixedSize(horizontal: false, vertical: true)
        }
        .padding(Spacing.m)
        .frame(maxWidth: .infinity, minHeight: 72, alignment: .leading)
        .background(Theme.surface, in: RoundedRectangle(cornerRadius: Radius.card))
        .overlay(RoundedRectangle(cornerRadius: Radius.card).stroke(Theme.line, lineWidth: 1))
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isButton)
    }
}

/// S13: a home card opens its tab when tapped; a compact "Ver ›" replaces a full-width button per card.
private struct HomeCardLink<Content: View>: View {
    let eyebrow: String
    let open: () -> Void
    @ViewBuilder let content: () -> Content

    var body: some View {
        Button(action: open) {
            SectionCard(eyebrow: eyebrow) {
                content()
                HStack(spacing: Spacing.xs) {
                    Spacer()
                    Text("home.open").font(Typo.label).foregroundStyle(Theme.primaryText)
                    ClimesaIcon(.chevron, size: 14).foregroundStyle(Theme.primaryText).accessibilityHidden(true)
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isButton)
    }
}

private struct HomeQueueCard: View {
    let ticket: QueueTicket?
    var office: String? = nil
    let open: () -> Void
    var body: some View {
        HomeCardLink(eyebrow: L.text("home.queue"), open: open) {
            if let ticket {
                HStack(alignment: .center) {
                    Text(verbatim: "\(ticket.number)").font(Typo.stat).foregroundStyle(Theme.ink)
                        .accessibilityLabel(Text(verbatim: "\(L.text("ds.paciente.queue.number")) \(ticket.number)"))
                    Spacer()
                    PatientTag(ticket.state.rawValue, label: ticket.state.label)
                }
                // Android Inicio: "Es tu turno · Pasa al consultorio N" (only the call line when the office is unknown).
                if ticket.state == .llamado {
                    Text(verbatim: PatientTurnRules.homeLine(office: office)).font(Typo.subheading).foregroundStyle(Theme.ink)
                }
            } else {
                EmptyNote("home.queue.none")
            }
        }
    }
}

private struct HomeAppointmentCard: View {
    let eyebrow: String
    let appointment: Appointment?
    let open: () -> Void
    var body: some View {
        HomeCardLink(eyebrow: eyebrow, open: open) {
            if let appointment {
                ListRow(title: ClimesaDates.short(appointment.start), subtitle: appointment.doctorName) {
                    PatientTag(appointment.state.rawValue, label: appointment.state.label)
                }
                CategoryMarks(categories: appointment.categories)
            } else {
                EmptyNote("home.appointment.none")
            }
        }
    }
}

private struct HomeLabCard: View {
    let labs: [LabOrder]
    /// G6: released after the last visit to «Mis exámenes» (and in the last 7 days); 0 once seen.
    let fresh: Int
    let open: () -> Void
    var body: some View {
        HomeCardLink(eyebrow: fresh > 0 ? PatientResultsRules.title(fresh) : L.text("home.labs"), open: open) {
            let pending = PatientLabRules.pendingCount(labs)
            HStack(spacing: Spacing.m) {
                // I-10: figures inside the card are plain, not cards of their own.
                StatTile(value: String(pending), label: L.text("ds.paciente.home.pending"), plain: true)
                StatTile(value: String(fresh), label: L.text("home.labs.new"), plain: true)
            }
        }
    }
}

/// I05 · Mi turno en fila: número grande, cuántos faltan y consultorio al ser llamado. Vibra al pasar a "Llamado".
/// B5: "N personas antes de ti" while waiting; when called, a full-screen «Pasa al consultorio N», once per call.
struct PatientQueueView: View {
    @EnvironmentObject private var account: AccountModel
    @Environment(LiveViewModel.self) private var live
    @State private var tickets = Loader<[QueueTicket]>()
    @State private var board = Loader<PublicQueue>()
    @State private var lastState: QueueState?
    /// The call the patient already closed with «Entendido» ("id#calls"); a new call shows the notice again. Shared
    /// with Inicio, so a call closed there does not show again here.
    @AppStorage(PatientTurnRules.dismissedKey) private var dismissedCall = ""

    private var active: QueueTicket? { tickets.value.flatMap { QueueRules.activeTicket($0) } }

    var body: some View {
        LoadState(loader: tickets, retry: load) { list in
            if let ticket = QueueRules.activeTicket(list) {
                QueueTicketCard(ticket: ticket, board: board.value)
            } else {
                EmptyStateView(title: L.text("queue.none.title"), message: L.text("queue.none.body"))
            }
        }
        .task(id: live.snapshot.version(.queue)) { await load() }
        .fullScreenCover(isPresented: Binding(
            get: { PatientTurnRules.shouldPresent(active, dismissed: dismissedCall) },
            set: { shown in if !shown { dismissedCall = PatientTurnRules.callKey(active) ?? dismissedCall } }
        )) {
            if let ticket = active {
                CalledCover(ticket: ticket, office: board.value.flatMap { QueueRules.office(for: ticket.number, called: $0.called) }) {
                    dismissedCall = PatientTurnRules.callKey(ticket) ?? ""
                }
            }
        }
    }

    private func load() async {
        await tickets.load { try await account.client().get("/fila", as: [QueueTicket].self) }
        guard let ticket = active else { lastState = nil; return }
        await board.load { try await account.client().get("/publico/fila/\(ticket.service.rawValue)", as: PublicQueue.self) }
        if ticket.state == .llamado, let previous = lastState, previous != .llamado {
            UINotificationFeedbackGenerator().notificationOccurred(.warning)
        }
        lastState = ticket.state
    }
}

/// B5: the call fills the screen with where to go, large enough to read across the waiting room, and vibrates.
private struct CalledCover: View {
    let ticket: QueueTicket
    let office: String?
    let close: () -> Void

    var body: some View {
        VStack(spacing: Spacing.space6) {
            Spacer()
            ClimesaIcon(.bell, size: 56).foregroundStyle(Theme.onPrimary).accessibilityHidden(true)
            Text(verbatim: PatientTurnRules.calledTitle(office: office))
                .font(Typo.number(40)).foregroundStyle(Theme.onPrimary).multilineTextAlignment(.center).minimumScaleFactor(0.5)
                .accessibilityAddTraits(.isHeader)
            Text(verbatim: "\(L.text("ds.paciente.queue.number")) \(ticket.number)")
                .font(Typo.subheading).foregroundStyle(Theme.onPrimary.opacity(0.85))
            Spacer()
            Button(action: close) {
                Text("queue.called.ok").font(Typo.label).frame(maxWidth: .infinity, minHeight: 52)
                    .foregroundStyle(Theme.primary)
                    .background(Theme.onPrimary, in: RoundedRectangle(cornerRadius: Radius.control))
            }
            .buttonStyle(.plain)
        }
        .padding(Spacing.space6)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.primary.ignoresSafeArea())
        .accessibilityElement(children: .contain)
        .onAppear { UINotificationFeedbackGenerator().notificationOccurred(.success) }
    }
}

private struct QueueTicketCard: View {
    let ticket: QueueTicket
    let board: PublicQueue?
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            if ticket.state == .llamado {
                let office = board.flatMap { QueueRules.office(for: ticket.number, called: $0.called) }
                PatientNotice(text: PatientTurnRules.calledTitle(office: office))
            }
            // S9: the ticket wears its area (code chip and tinted surface), like the web board.
            VStack(alignment: .leading, spacing: Spacing.m) {
                HStack(spacing: Spacing.s) {
                    AreaTag(QueueBoardRules.area(ticket))
                    Text(verbatim: ticket.service.label).font(Typo.eyebrow).foregroundStyle(Theme.primaryText).textCase(.uppercase).tracking(Typo.eyebrowTracking)
                }
                HStack(alignment: .firstTextBaseline) {
                    Text(verbatim: "\(ticket.number)").font(Typo.number(96)).foregroundStyle(Theme.ink).minimumScaleFactor(0.5)
                        .accessibilityLabel(Text(verbatim: "\(L.text("ds.paciente.queue.number")) \(ticket.number)"))
                }
                PatientTag(ticket.state.rawValue, label: ticket.state.label)
                if ticket.state == .enEspera, let ahead = PatientTurnRules.ahead(ticket, called: board?.called) {
                    // B5: one sentence, not a bare figure ("3 personas antes de ti", "Eres el siguiente"). The server's
                    // `ahead` when it sends one; otherwise the estimate from the public board.
                    Text(verbatim: PatientTurnRules.aheadText(ahead)).font(Typo.subheading).foregroundStyle(Theme.ink)
                }
                Text(verbatim: String(format: L.text("queue.issued"), ClimesaDates.display(ticket.issuedAt, .time))).font(Typo.small).foregroundStyle(Theme.muted)
            }
            .padding(Spacing.l)
            .frame(maxWidth: .infinity, alignment: .leading)
            .areaSurface(QueueBoardRules.area(ticket))
        }
    }
}

/// I06 · Mis citas: próximas y pasadas; pedir y cancelar.
struct PatientAppointmentsView: View {
    @EnvironmentObject private var account: AccountModel
    @Environment(LiveViewModel.self) private var live
    @State private var loader = Loader<[Appointment]>()
    @State private var submission = Submission()
    /// D-8: keys of the cancel bodies per appointment; outlives the sheet so a retry replays the same key.
    @State private var cancelFlow = PatientCancelFlow()
    @State private var cancelling: Appointment?
    @State private var rescheduling: Appointment?
    @State private var requesting = false
    @State private var requests = Loader<[CategoryRequest]>()
    /// The sheet closes on success, so the confirmation lives here (web `MyRequests` `sent`).
    @State private var requestSent = false

    /// Unlinked, the API refuses every appointment read and request (403 "La cuenta no está vinculada").
    private var linked: Bool { account.profile?.patientId != nil }

    var body: some View {
        if linked { content } else {
            EmptyStateView(title: L.text("appointments.unlinked.title"), message: L.text("appointments.unlinked.body"))
        }
    }

    @ViewBuilder private var content: some View {
        VStack(alignment: .leading, spacing: Spacing.space4) {
            // Fase 2, flujo A: se pide por motivo, no eligiendo entre todos los médicos; recepción asigna médico y hora.
            // S1 / I-25: «Pedir cita» is the screen's primary action, in the bar (HIG), not a full-width button.
            if requestSent { PatientNotice(text: L.text("appointments.category.sent")) }
            PatientSubmissionNotice(submission: submission)
            if let message = requests.error {
                SectionCard(title: L.text("appointments.category.mine")) { PartError(message: message, retry: load) }
            } else if let mine = requests.value, !mine.isEmpty {
                MyCategoryRequests(requests: mine, submission: submission, reload: load)
            }
            if submission.lastFailure?.code == "version_conflicto" { ConflictBanner { Task { submission.clearFailure(); await load() } } }
            LoadState(loader: loader, retry: load) { list in
                // CITA-04: el reloj de interfaz (cada minuto) solo recalcula qué acciones siguen válidas; no pide datos.
                TimelineView(.everyMinute) { context in
                    let split = AppointmentRules.split(list, now: context.date)
                    VStack(alignment: .leading, spacing: Spacing.space4) {
                        // I-26: one empty state per screen; inside a section, one line.
                        if split.upcoming.isEmpty && split.past.isEmpty {
                            EmptyStateView(title: L.text("appointments.upcoming.none"))
                        } else {
                            if let next = split.upcoming.first {
                                // A1: the next appointment leads, on its own card; the others follow.
                                SectionCard(title: L.text("appointments.next")) {
                                    AppointmentRow(appointment: next, option: cancelOption(next, now: context.date), now: context.date, cancel: { cancelling = next }, reschedule: { rescheduling = next })
                                }
                                let later = Array(split.upcoming.dropFirst())
                                // The rest grouped by day like the agenda ("Mañana · jue 19 nov", "Jue 26 nov").
                                ForEach(AppointmentRules.byDay(later)) { day in
                                    ListCard(title: ClimesaDates.shortDay(day.day, now: context.date), items: day.appointments) { item in
                                        AppointmentRow(appointment: item, option: cancelOption(item, now: context.date), now: context.date, cancel: { cancelling = item }, reschedule: { rescheduling = item })
                                    }
                                }
                            } else {
                                SectionCard(title: L.text("appointments.upcoming")) { EmptyNote("appointments.upcoming.none") }
                            }
                            if !split.past.isEmpty {
                                // A5: past appointments stay folded under the upcoming ones.
                                SectionCard {
                                    DisclosureGroup {
                                        ForEach(AppointmentRules.byDay(split.past)) { day in
                                            Text(verbatim: ClimesaDates.shortDay(day.day, now: context.date)).font(Typo.eyebrow).foregroundStyle(Theme.muted)
                                                .textCase(.uppercase).padding(.top, Spacing.s).accessibilityAddTraits(.isHeader)
                                            ForEach(Array(day.appointments.enumerated()), id: \.element.id) { index, item in
                                                if index > 0 { Divider().overlay(Theme.line) }
                                                AppointmentRow(appointment: item, option: .hidden, now: context.date, cancel: {}, reschedule: nil)
                                            }
                                        }
                                    } label: {
                                        Text(verbatim: AppointmentRules.pastTitle(split.past.count)).font(Typo.label).foregroundStyle(Theme.ink).frame(minHeight: 44)
                                    }
                                    .tint(Theme.primaryText)
                                }
                            }
                        }
                    }
                }
            }
        }
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                if account.can("citas.solicitar") {
                    Button(L.text("appointments.request")) { requestSent = false; requesting = true }
                }
            }
        }
        .task(id: live.snapshot.version(.appointments)) { await load() }
        .task(id: requestSent) {
            // A1: the confirmation stays a few seconds and when the screen comes back it is gone.
            guard requestSent else { return }
            try? await Task.sleep(nanoseconds: 6_000_000_000)
            if !Task.isCancelled { requestSent = false }
        }
        .onDisappear { requestSent = false }
        .sheet(item: $cancelling) { item in
            CancelAppointmentSheet(appointment: item, submission: submission, flow: cancelFlow, reload: load)
        }
        .sheet(item: $rescheduling) { item in RescheduleAppointmentSheet(appointment: item, reload: load) }
        .sheet(isPresented: $requesting) { CategoryRequestSheet(reload: load) { requestSent = true } }
    }

    private func load() async {
        await loader.load { try await account.client().get(PatientAppointmentRange.path(now: Date()), as: [Appointment].self) }
        await requests.load { try await account.client().get(CategoryRequestRules.path, as: [CategoryRequest].self) }
    }

    private func cancelOption(_ item: Appointment, now: Date) -> AppointmentRules.CancelOption {
        account.can("citas.cancelar") ? AppointmentRules.cancelOption(item, now: now) : .hidden
    }
}

/// Una cita con solo las acciones válidas para su estado y su hora (CITA-04). I-12 / I-13: las acciones van en un menú
/// compacto de la fila; lo que el servidor bloquea no se muestra ni se explica con su motivo interno. El plazo para
/// cancelar (regla de la app, no del servidor) queda como una línea corta.
private struct AppointmentRow: View {
    let appointment: Appointment
    let option: AppointmentRules.CancelOption
    let now: Date
    let cancel: () -> Void
    let reschedule: (() -> Void)?

    private var canCancel: Bool { if case .allowed = option { return true }; return false }
    private var canReschedule: Bool { reschedule != nil && AppointmentRules.canReschedule(appointment) }

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.s) {
            HStack(alignment: .center, spacing: Spacing.s) {
                ListRow(title: ClimesaDates.short(appointment.start, now: now), subtitle: appointment.doctorName, meta: appointment.reason) {
                    PatientTag(appointment.state.rawValue, label: appointment.state.label)
                }
                if canCancel || canReschedule {
                    Menu {
                        if canReschedule, let reschedule { Button(L.text("appointments.reschedule"), action: reschedule) }
                        if canCancel { Button(L.text("appointments.cancel"), role: .destructive, action: cancel) }
                    } label: {
                        Image(systemName: "ellipsis.circle").font(Typo.heading).foregroundStyle(Theme.primaryText)
                            .frame(width: 44, height: 44).contentShape(Rectangle())
                    }
                    .accessibilityLabel(Text("appointments.actions"))
                }
            }
            CategoryMarks(categories: appointment.categories)
            if let rejection = appointment.rejectionReason, !rejection.isEmpty {
                Text(verbatim: String(format: L.text("appointments.rejected.reason"), rejection)).font(Typo.small).foregroundStyle(Theme.warning)
            }
            switch option {
            case let .allowed(deadline):
                Label { Text(verbatim: AppointmentRules.cancelDeadlineText(deadline, now: now)) } icon: { ClimesaIcon(.clock, size: 16) }
                    .font(Typo.small).foregroundStyle(Theme.muted)
            case .tooLate, .blocked:
                // S0: the shared gate's reason (too late, or the server's own reason) instead of a silent gap.
                if let reason = option.gate.blockedReason { BlockedReasonLine(text: reason) }
            case .hidden:
                EmptyView()
            }
            // CITA-02: el estado de una solicitud de cambio de horario (pendiente, rechazada) sí importa al paciente.
            if let text = AppointmentRules.rescheduleText(appointment, now: now) {
                Text(verbatim: text).font(Typo.small).foregroundStyle(appointment.reschedule?.state == .rechazada ? Theme.warning : Theme.muted)
            }
        }
        .padding(.bottom, Spacing.s)
    }
}

private struct CancelAppointmentSheet: View {
    let appointment: Appointment
    let submission: Submission
    let flow: PatientCancelFlow
    let reload: () async -> Void
    @EnvironmentObject private var account: AccountModel
    @Environment(\.dismiss) private var dismiss
    /// D-8: one tap on a reason; only «Otro» asks for a few words.
    @State private var chip: String?
    @State private var other = ""

    private var reason: String? { PatientCancelReasons.reason(chip: chip, otherText: other) }

    var body: some View {
        NavigationStack {
            ScreenFrame(title: "appointments.cancel.title", onClose: { dismiss() }) {
                SectionCard {
                    ListRow(title: ClimesaDates.short(appointment.start), subtitle: appointment.doctorName)
                }
                SectionTitle("appointments.cancel.reason")
                VStack(spacing: Spacing.s) {
                    ForEach(PatientCancelReasons.chips, id: \.self) { option in
                        Button { chip = option } label: {
                            HStack(spacing: Spacing.m) {
                                Image(systemName: chip == option ? "largecircle.fill.circle" : "circle").foregroundStyle(chip == option ? Theme.primary : Theme.muted).accessibilityHidden(true)
                                Text(verbatim: option).font(Typo.body).foregroundStyle(Theme.ink)
                                Spacer()
                            }
                            .padding(.horizontal, Spacing.m).frame(minHeight: 48)
                            .background(Theme.surface, in: RoundedRectangle(cornerRadius: Radius.control))
                            .overlay(RoundedRectangle(cornerRadius: Radius.control).stroke(chip == option ? Theme.primary : Theme.controlLine, lineWidth: 1))
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityAddTraits(chip == option ? AccessibilityTraits.isSelected : AccessibilityTraits())
                    }
                }
                if chip == PatientCancelReasons.other {
                    FormField(label: L.text("appointments.cancel.other"), text: $other, error: PatientCancelReasons.otherError(other) ?? submission.fieldErrors["reason"])
                }
                PatientSubmissionNotice(submission: submission)
                if submission.lastFailure?.code == "version_conflicto" { ConflictBanner { Task { await reload(); dismiss() } } }
                ClimesaButton(title: L.text("appointments.cancel.confirm"), kind: .destructive, loading: submission.busy) { Task { await send() } }
                    .disabled(reason == nil)
            }
        }
    }

    /// D-8: the quick reason goes with its `reasonCode`; `PatientCancelFlow` owns the keys and the fallback to the
    /// released body for an API before D-8. The sheet waits for the answer and stays open with the error.
    private func send() async {
        guard reason != nil else { return }
        let path = "/citas/\(appointment.id)/cancelar"
        let ok = await submission.perform(appointment.id, success: L.text("appointments.cancelled")) {
            try await flow.cancel(appointment.id, version: appointment.version, chip: chip, otherText: other) { body, key in
                _ = try await account.client().send("POST", path, body: body, key: key, as: AppointmentCommandResult.self)
            }
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
    @Environment(LiveViewModel.self) private var live
    @Environment(\.dismiss) private var dismiss
    @State private var availability = Loader<Availability>()
    @State private var submission = Submission()
    /// A4: the chosen day (`yyyy-MM-dd` in El Salvador), picked from a row of chips.
    @State private var day = ClimesaDates.localDay(Date())
    @State private var slot: Period?

    var body: some View {
        NavigationStack {
            ScreenFrame(title: "appointments.reschedule.title", onClose: { dismiss() }) {
                SectionCard { ListRow(title: ClimesaDates.short(appointment.start), subtitle: appointment.doctorName) }
                Text("appointments.reschedule.intro").font(Typo.small).foregroundStyle(Theme.muted)
                SectionTitle("appointments.date")
                // D126: the chosen day chip always comes fully into view, never half cut at the edge.
                ScrollViewReader { chips in
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: Spacing.s) {
                            ForEach(DayChipRules.days(from: Date()), id: \.self) { option in
                                Button { day = option } label: {
                                    Text(verbatim: DayChipRules.label(option, today: Date())).font(Typo.label)
                                        .padding(.horizontal, Spacing.m).frame(minHeight: 44)
                                        .background(day == option ? Theme.primary : Theme.surface, in: RoundedRectangle(cornerRadius: Radius.control))
                                        .overlay(RoundedRectangle(cornerRadius: Radius.control).stroke(day == option ? Theme.primary : Theme.controlLine, lineWidth: 1))
                                        .foregroundStyle(day == option ? Theme.onPrimary : Theme.ink)
                                        .contentShape(Rectangle())
                                }
                                .buttonStyle(.plain)
                                .id(option)
                                .accessibilityAddTraits(day == option ? AccessibilityTraits.isSelected : AccessibilityTraits())
                            }
                        }
                        .padding(.horizontal, 1)
                    }
                    .onChange(of: day) { _, picked in
                        withAnimation(.easeOut(duration: 0.2)) { chips.scrollTo(picked, anchor: .center) }
                    }
                }
                SectionTitle("appointments.slots")
                LoadState(loader: availability, retry: loadSlots) { value in
                    let free = AppointmentRules.freeSlots(value, excluding: appointment.start)
                    if free.isEmpty { EmptyStateView(title: L.text("appointments.slots.none")) }
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
            }
            // The free slots change with any booking or shift change, not only with the chosen day.
            .task(id: "\(day)|\(live.snapshot.version([.appointments, .shifts]))") {
                if let picked = slot, ClimesaDates.parse(picked.start).map(ClimesaDates.localDay) != day { slot = nil }
                await loadSlots()
                // A slot taken meanwhile is no longer offered, so it cannot stay selected.
                if let picked = slot, availability.error == nil, let value = availability.value,
                   !AppointmentRules.freeSlots(value, excluding: appointment.start).contains(picked) { slot = nil }
            }
        }
    }

    private func loadSlots() async {
        let path = "/citas/disponibilidad?doctorId=\(Query.encode(appointment.doctorId))&date=\(day)"
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

/// Solicitudes por motivo del paciente con su estado; "Retirar solicitud" solo si el servidor lo permite (`allowedActions`).
private struct MyCategoryRequests: View {
    let requests: [CategoryRequest]
    let submission: Submission
    let reload: () async -> Void
    @EnvironmentObject private var account: AccountModel
    @State private var withdrawing: CategoryRequest?

    @State private var resolvedOpen = false

    var body: some View {
        // The withdraw confirmation hangs from the title, which is always on screen with the list.
        SectionTitle("appointments.category.mine")
        .confirmationDialog(L.text("appointments.category.withdraw"), isPresented: Binding(get: { withdrawing != nil }, set: { if !$0 { withdrawing = nil } }), titleVisibility: .visible) {
            Button(L.text("appointments.category.withdraw"), role: .destructive) { if let item = withdrawing { Task { await withdraw(item) } } }
        } message: { Text("appointments.category.withdraw.message") }
        let split = CategoryRequestFold.split(requests)
        ForEach(split.pending) { item in requestCard(item) }
        if !split.resolved.isEmpty {
            Button { resolvedOpen.toggle() } label: {
                HStack(spacing: Spacing.space1) {
                    Text(verbatim: CategoryRequestFold.toggleTitle(split.resolved.count, expanded: resolvedOpen)).font(Typo.label)
                    Image(systemName: resolvedOpen ? "chevron.up" : "chevron.down").font(Typo.small).accessibilityHidden(true)
                }
                .foregroundStyle(Theme.primaryText).frame(minHeight: 44).contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            if resolvedOpen { ForEach(split.resolved) { item in requestCard(item) } }
        }
    }

    @ViewBuilder private func requestCard(_ item: CategoryRequest) -> some View {
            SectionCard {
                // D123: the state goes on its own line above, so the reasons and the note keep the full width.
                PatientTag(CategoryRequestRules.badgeValue(item.state), label: L.text(CategoryRequestRules.stateKey(item.state)))
                ListRow(title: item.categoryNames, subtitle: L.text(item.franja.titleKey), meta: item.note)
                if let appointment = item.appointment {
                    Text(verbatim: String(format: L.text("appointments.category.assigned"), appointment.doctorName, ClimesaDates.short(appointment.start)))
                        .font(Typo.small).foregroundStyle(Theme.primary)
                }
                if let reason = CategoryRequestFold.rejection(item.rejectionReason) { Text(verbatim: reason).font(Typo.small).foregroundStyle(Theme.muted) }
                if item.canWithdraw { CrudButton(kind: .deactivate, label: L.text("appointments.category.withdraw")) { withdrawing = item } }
            }
    }

    private func withdraw(_ item: CategoryRequest) async {
        let body = VersionBody(version: item.version)
        let ok = await submission.run("withdraw-\(item.id)", body: body, success: L.text("appointments.category.withdrawn")) { key in
            _ = try await account.client().send("POST", CategoryRequestRules.cancelPath(item.id), body: body, key: key, as: CategoryRequestCommandResult.self)
        }
        withdrawing = nil
        if ok { await reload() }
    }
}

/// A06 iOS: pedir cita por motivo (una a tres categorías con ícono y búsqueda), franja preferida y nota. El médico es
/// solo una opción secundaria; recepción asigna médico y hora.
private struct CategoryRequestSheet: View {
    let reload: () async -> Void
    /// Tells the list the request went through, before the sheet closes.
    let sent: () -> Void
    @EnvironmentObject private var account: AccountModel
    @Environment(\.dismiss) private var dismiss
    @State private var categories = Loader<[AppointmentCategory]>()
    @State private var catalog = Loader<AppointmentCatalogs>()
    @State private var submission = Submission()
    @State private var query = ""
    @State private var picked: [String] = []
    @State private var franja: RequestFranja = .cualquiera
    @State private var note = ""
    @State private var doctorOpen = false
    @State private var doctorQuery = ""
    @State private var doctor: AppointmentCatalogs.Doctor?
    /// R2: «Con turno (N)» is the default chip; «Todos (N)» shows the doctors without a shift today too.
    @State private var shiftFilter: DoctorShiftFilter = .conTurno
    /// D128: the server's request limit, read when the sheet opens; nil until it answers or from an older API.
    @State private var limit: CategoryRequestLimit?

    var body: some View {
        NavigationStack {
            ScreenFrame(title: "appointments.request.title", onClose: { dismiss() }) {
                if CategoryRequestRules.blocked(limit), let limit {
                    // D128 (S12): at the limit the server's reason shows first and nothing can be filled or sent.
                    PatientNotice(text: CategoryRequestRules.limitText(limit), failure: true)
                    ClimesaButton(title: CategoryRequestRules.backToAppointments, kind: .secondary) { dismiss() }
                } else {
                    form
                }
            }
            .task { await loadLimit() }
            .task { await loadCategories() }
            .task(id: doctorOpen) { if doctorOpen && catalog.value == nil { await loadCatalog() } }
        }
    }

    @ViewBuilder private var form: some View {
                Group {
                SectionTitle("appointments.category.reason")
                Text(verbatim: String(format: L.text("appointments.category.count"), picked.count)).font(Typo.caption).foregroundStyle(Theme.muted)
                searchField(L.text("appointments.category.search"), text: $query)
                LoadState(loader: categories, retry: loadCategories) { list in
                    let visible = CategoryRequestRules.filter(list, query: query, picked: picked)
                    if visible.isEmpty { EmptyStateView(title: L.text("appointments.category.none")) }
                    // Lote 5 S16: grouped by body area (Cuerpo, Interno y digestivo, Mente y emociones, Sentidos, General).
                    ForEach(CategoryGroups.sections(visible)) { section in
                        Text(verbatim: section.group.title).font(Typo.label).foregroundStyle(Theme.muted).padding(.top, Spacing.s)
                            .accessibilityAddTraits(.isHeader)
                        LazyVGrid(columns: [GridItem(.adaptive(minimum: 150), spacing: Spacing.s)], spacing: Spacing.s) {
                            ForEach(section.categories) { category in categoryButton(category) }
                        }
                    }
                }
                }
                SectionTitle("appointments.category.franja")
                ClimesaSegmented(title: L.text("appointments.category.franja"),
                                 options: RequestFranja.allCases.map { ClimesaSegmented<RequestFranja>.Option($0, L.text($0.titleKey)) },
                                 selection: $franja)
                PatientTextArea(label: L.text("appointments.category.note"), text: $note, lines: 2...4,
                                error: note.count > CategoryRequestRules.noteMax ? L.text("appointments.category.note.long") : submission.fieldErrors["note"])
                doctorSection
                PatientSubmissionNotice(submission: submission)
                ClimesaButton(title: L.text("appointments.category.submit"), loading: submission.busy) { Task { await send() } }
                    .disabled(!CategoryRequestRules.canSend(picked: picked, note: note))
    }

    /// D128: asks the server whether a new request would be accepted; a failure (older API) leaves the form open as before.
    private func loadLimit() async {
        guard let api = try? account.client() else { return }
        limit = try? await api.get(CategoryRequestRules.limitPath, as: CategoryRequestLimit.self)
    }

    private func categoryButton(_ category: AppointmentCategory) -> some View {
        let selected = picked.contains(category.code)
        let full = !selected && picked.count >= CategoryRequestRules.maxCategories
        return Button { picked = CategoryRequestRules.toggle(picked, category.code) } label: {
            HStack(spacing: Spacing.s) {
                ClimesaIcon(selected ? .check : CategoryRequestRules.icon(category.icon), size: 20).frame(width: 22)
                Text(verbatim: category.name).font(Typo.label).multilineTextAlignment(.leading)
                Spacer(minLength: 0)
            }
            .padding(.horizontal, Spacing.m).frame(maxWidth: .infinity, minHeight: Spacing.control)
            .background(selected ? Theme.primary : Theme.surface, in: RoundedRectangle(cornerRadius: Radius.control))
            .overlay(RoundedRectangle(cornerRadius: Radius.control).stroke(selected ? Theme.primary : Theme.controlLine, lineWidth: 1))
            .foregroundStyle(selected ? Theme.onPrimary : Theme.ink)
        }
        .disabled(full).opacity(full ? 0.5 : 1)
        .accessibilityLabel(Text(verbatim: "\(category.name): \(category.description)"))
        .accessibilityAddTraits(selected ? .isSelected : [])
    }

    @ViewBuilder private var doctorSection: some View {
        if let doctor {
            SectionCard {
                ListRow(title: doctor.fullName, subtitle: doctor.specialty ?? L.text("appointments.category.general"), meta: nil) {
                    Button(L.text("appointments.category.doctor.remove")) { self.doctor = nil }.font(Typo.label)
                }
            }
        } else if !doctorOpen {
            Button(L.text("appointments.category.doctor")) { doctorOpen = true }.font(Typo.label).foregroundStyle(Theme.primary)
        } else {
            searchField(L.text("appointments.category.doctor.search"), text: $doctorQuery)
            let all = catalog.value?.doctors ?? []
            // R1-R3: doctors with a shift today first, each with its tag; the chips wear the badge they filter.
            if !all.isEmpty {
                let shown = DoctorShiftRules.effective(shiftFilter, all)
                FlowLayout(spacing: Spacing.s) {
                    ForEach(DoctorShiftFilter.allCases, id: \.self) { option in
                        StatusFilterChip(label: option.label, count: option == .conTurno ? DoctorShiftRules.withShift(all) : all.filter(\.active).count,
                                         status: option.statusValue, selected: shown == option) { shiftFilter = option }
                    }
                }
            }
            let found = Array(DoctorShiftRules.visible(all, filter: shiftFilter, query: doctorQuery).prefix(12))
            if let message = catalog.error {
                PartError(message: message, retry: loadCatalog)
            } else if catalog.value != nil, found.isEmpty {
                Text("appointments.category.doctor.none").font(Typo.small).foregroundStyle(Theme.muted)
            }
            ForEach(found) { d in
                Button { doctor = d; doctorQuery = "" } label: {
                    ListRow(title: d.fullName, subtitle: d.specialty ?? L.text("appointments.category.general"), meta: nil) {
                        let tag = DoctorShiftRules.tag(d)
                        StatusBadge(tag.value, label: tag.label)
                    }
                }.buttonStyle(.plain)
            }
        }
    }

    private func searchField(_ label: String, text: Binding<String>) -> some View {
        HStack(spacing: Spacing.s) {
            ClimesaIcon(.search, size: 18).foregroundStyle(Theme.muted)
            TextField(label, text: text).font(Typo.body).foregroundStyle(Theme.ink).textInputAutocapitalization(.never).autocorrectionDisabled()
        }
        .padding(.horizontal, Spacing.m).frame(minHeight: Spacing.control)
        .background(Theme.surface, in: RoundedRectangle(cornerRadius: Radius.control))
        .overlay(RoundedRectangle(cornerRadius: Radius.control).stroke(Theme.controlLine, lineWidth: 1))
    }

    /// Reception may assign any of the next 7 days, so the catalog is asked for each of them and merged: a doctor is
    /// «Con turno» when any day has a shift (Android parity). A day that fails is skipped; all failing is an error.
    private func loadCatalog() async {
        await catalog.load {
            let api = try account.client()
            var lists: [[AppointmentCatalogs.Doctor]] = []
            var failure: Error?
            for offset in 0..<RequestDoctorRules.days {
                let day = ClimesaDates.localDay(Date().addingTimeInterval(Double(offset) * 86_400))
                do { lists.append(try await api.get("/citas/catalogos?date=\(day)", as: AppointmentCatalogs.self).doctors) }
                catch { failure = failure ?? error }
            }
            if lists.isEmpty, let failure { throw failure }
            return AppointmentCatalogs(doctors: RequestDoctorRules.week(lists))
        }
    }

    private func loadCategories() async { await categories.load { try await account.client().get(CategoryRequestRules.categoriesPath, as: [AppointmentCategory].self) } }

    private func send() async {
        let body = CategoryRequestRules.body(picked: picked, franja: franja, note: note, preferredDoctorId: doctor?.id)
        let ok = await submission.run(body: body, success: L.text("appointments.category.sent")) { key in
            _ = try await account.client().send("POST", CategoryRequestRules.path, body: body, key: key, as: CategoryRequestCommandResult.self)
        }
        if ok { sent(); await reload(); dismiss() }
    }
}

/// I07 · Mis exámenes: estado siempre; valores solo después de la revisión médica.
struct PatientExamsView: View {
    let profile: AccessProfile
    @EnvironmentObject private var account: AccountModel
    @Environment(LiveViewModel.self) private var live
    /// S13: the read and the «seen» mark live in the view model.
    @State private var model = PatientExamsViewModel()
    private var loader: Loader<[LabOrder]> { model.loader }
    @State private var filter: LabFilter = .all
    @State private var showPast = false

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.space4) {
            if profile.patientId == nil {
                EmptyStateView(title: L.text("home.unlinked.title"), message: L.text("exams.unlinked"))
            } else {
                LoadState(loader: loader, retry: load) { orders in
                    // Each chip wears the badge of the stage it filters (pending waits, in process, done).
                    FlowLayout(spacing: Spacing.s) {
                        ForEach(LabFilter.allCases, id: \.self) { option in
                            StatusFilterChip(label: L.text(option.titleKey), count: option == .all ? nil : option.count(in: orders),
                                             status: option.statusValue, selected: filter == option) { filter = option }
                        }
                    }
                    .accessibilityElement(children: .contain)
                    .accessibilityLabel(Text("exams.filter"))
                    let shown = filter.apply(orders)
                    if shown.isEmpty { EmptyStateView(title: L.text(orders.isEmpty ? "exams.none" : "exams.filter.none")) }
                    // Closed results beyond the newest few fold under «Ver N más».
                    let folded = PatientLabRules.fold(shown)
                    if !shown.isEmpty {
                        ListCard(items: showPast ? shown : folded.shown) { order in
                            NavigationLink {
                                ScreenFrame(title: "exams.detail") { LabOrderDetail(order: order, showValues: PatientLabRules.showsValues(order)) }
                            } label: {
                                LabOrderRow(order: order, status: PatientLabRules.statusText(order), critical: false, showPatient: false)
                            }.buttonStyle(.plain)
                        }
                        if !folded.folded.isEmpty {
                            ClimesaButton(title: showPast ? L.text("exams.less") : String(format: L.text("exams.more"), folded.folded.count), kind: .secondary) { showPast.toggle() }
                        }
                    }
                }
            }
        }
        .task(id: live.snapshot.version(.laboratory)) { if profile.patientId != nil { await load() } }
    }

    private func load() async {
        model.client = { [account] in try account.client() }
        // G6: the results on screen are seen, so «Resultados nuevos» on Inicio goes back to 0 (stored on the device, G-7).
        await model.load(user: profile.id)
    }
}

struct LabOrderRow: View {
    let order: LabOrder
    let status: String
    let critical: Bool
    /// The patient's own list does not repeat their name on every row.
    var showPatient = true
    /// Lote 5 S13: «2 fuera de rango · 1 crítico» for the doctor's list; nil hides it.
    var summary: String? = nil
    /// A row inside a `ListCard`, not a card of its own (I-9).
    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.s) {
            ListRow(title: order.items.map(\.name).joined(separator: ", "), subtitle: showPatient ? order.patientName : nil,
                    meta: ClimesaDates.short(order.completedAt ?? order.createdAt)) {
                ClimesaIcon(.chevron, size: 16).foregroundStyle(Theme.muted).accessibilityHidden(true)
            }
            HStack(spacing: Spacing.s) {
                PatientTag(PatientLabRules.badgeValue(order), label: status)
                // Priority uses the priority badge (amber), not a queue state family.
                if order.priority == .urgente { PriorityBadge(order.priority.rawValue) }
                if critical { PatientTag("critico_alto", label: L.text("results.critical")) }
            }
            if let summary {
                Text(verbatim: summary).font(Typo.small).foregroundStyle(critical ? Theme.danger : Theme.warning)
            }
        }
        .padding(.bottom, Spacing.s)
        .contentShape(Rectangle())
    }
}

/// Detalle de una orden: cada examen con su valor y su marca (los rangos los decide el laboratorio).
struct LabOrderDetail: View {
    let order: LabOrder
    let showValues: Bool
    /// Solo el personal ve la observación del laboratorio (nota para el médico); el paciente nunca.
    var staffView = false
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if staffView {
                PatientTag(PatientLabRules.badgeValue(order), label: PatientLabRules.awaitsReview(order) ? L.text("results.awaitingReview") : order.state.label)
            } else {
                // Same wording as the list: a completed order not yet reviewed stays "En revisión médica".
                PatientTag(PatientLabRules.badgeValue(order), label: PatientLabRules.statusText(order))
            }
            // Solo el paciente ve este aviso (sin valores): el médico ve los valores y su propia etiqueta.
            // S10: orden externa. El paciente ve dónde hacerse el examen y las instrucciones tal como se escribieron.
            if order.external {
                SectionCard(title: String(format: L.text("exams.external.place"), order.externalPlace ?? L.text("exams.external.noPlace"))) {
                    if let note = LabExternalRules.patientNote(order), !showValues { Text(verbatim: note).font(Typo.label).foregroundStyle(Theme.ink) }
                    if let instructions = order.externalInstructions { Text(verbatim: instructions).font(Typo.body).foregroundStyle(Theme.ink) }
                }
            }
            if !showValues && PatientLabRules.awaitsReview(order) && LabExternalRules.patientNote(order) == nil { PatientNotice(text: L.text(ReviewRules.isAmendedPendingReview(order) ? "exams.amended" : "exams.waiting_review")) }
            if order.state == .cancelado, let reason = order.cancellationReason {
                Text(verbatim: String(format: L.text("exams.cancelReason"), reason)).font(Typo.small).foregroundStyle(Theme.muted)
            }
            // R7 C1: the doctor's note for the patient arrives only with the released results.
            if !staffView, showValues, let note = order.patientNote, !note.isEmpty { PatientNotice(text: String(format: L.text("exams.doctorNote"), note)) }
            ForEach(order.items) { item in
                if staffView && showValues {
                    // Lote 5 S13: each component with its value, unit, range and a coloured flag, so the review is not monotonous.
                    StaffLabResultCard(item: item)
                } else {
                SectionCard(title: staffView ? "\(item.name) (\(item.code))" : item.name) {
                    if showValues {
                        HStack {
                            Text(verbatim: PatientLabRules.valueText(item.result, unit: item.unit)).font(Typo.heading).foregroundStyle(Theme.ink)
                            Spacer()
                            if let mark = item.result?.mark { PatientTag(mark.rawValue, label: mark.label) }
                        }
                        // C-3: the doctor reviews against the range valid for this patient (the API never sends it to the patient).
                        if staffView, let range = PatientLabRules.rangeText(item.referenceRange) {
                            Text(verbatim: String(format: L.text("results.range"), range)).font(Typo.small).foregroundStyle(Theme.muted)
                        }
                        // D1: once released, the patient sees the range (without critical limits) and whether the value fell outside.
                        if !staffView, let range = PatientLabRules.patientRangeText(item.referenceRange) {
                            HStack(spacing: 8) {
                                Text(verbatim: String(format: L.text("results.range"), range)).font(Typo.small).foregroundStyle(Theme.muted)
                                if PatientLabRules.outOfRange(item.result?.mark), let mark = item.result?.mark { PatientTag(mark.rawValue, label: L.text("exams.outOfRange")) }
                            }
                        }
                        if let observation = LabFollowUpRules.labNote(item.result, staffView: staffView) {
                            Text(verbatim: String(format: L.text(item.result?.relevant == true ? "exams.observation.relevant" : "exams.observation"), observation))
                                .font(Typo.small).foregroundStyle(item.result?.relevant == true ? Theme.ink : Theme.muted)
                        }
                    }
                }
                }
            }
        }
    }
}

/// Lote 5 S13 · one result component for the doctor: name and code, the value large with its unit, the reference range
/// and the flag (En rango, Alto, Bajo, Crítico) on its colour; a critical value gets a red edge on the whole card.
struct StaffLabResultCard: View {
    let item: LabOrderItem

    var body: some View {
        let flag = LabResultView.flag(item)
        VStack(alignment: .leading, spacing: Spacing.s) {
            HStack(alignment: .firstTextBaseline, spacing: Spacing.s) {
                Text(verbatim: item.name).font(Typo.subheading).foregroundStyle(Theme.ink).fixedSize(horizontal: false, vertical: true)
                Text(verbatim: item.code).font(Typo.caption).foregroundStyle(Theme.muted)
                Spacer(minLength: Spacing.s)
                LabFlagBadge(flag: flag)
            }
            HStack(alignment: .firstTextBaseline, spacing: Spacing.xs) {
                Text(verbatim: LabResultCopy.value(item)).font(Typo.heading).foregroundStyle(flag.critical ? Theme.danger : Theme.ink)
                    .fixedSize(horizontal: false, vertical: true)
                if item.result?.value != nil, let unit = item.unit, !unit.isEmpty { Text(verbatim: unit).font(Typo.label).foregroundStyle(Theme.muted) }
            }
            if let range = PatientLabRules.rangeText(item.referenceRange) {
                Text(verbatim: String(format: L.text("results.range"), range)).font(Typo.small).foregroundStyle(Theme.muted)
            }
            if let observation = LabFollowUpRules.labNote(item.result, staffView: true) {
                Text(verbatim: String(format: L.text(item.result?.relevant == true ? "exams.observation.relevant" : "exams.observation"), observation))
                    .font(Typo.small).foregroundStyle(item.result?.relevant == true ? Theme.ink : Theme.muted).fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(Spacing.l)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(flag.critical ? Theme.dangerSoft : Theme.surface, in: RoundedRectangle(cornerRadius: Radius.card))
        .overlay(RoundedRectangle(cornerRadius: Radius.card).stroke(flag.critical ? Theme.danger : (flag.outOfRange ? Theme.warning : Theme.line), lineWidth: flag.outOfRange ? 2 : 1))
        .accessibilityElement(children: .combine)
    }
}

/// The value shown for a result: the number without its unit, the written result, or «Pendiente».
enum LabResultCopy {
    static func value(_ item: LabOrderItem) -> String {
        guard let result = item.result else { return LabFlag.pending.label }
        if result.value != nil { return PatientLabRules.valueText(result, unit: nil) }
        return result.text ?? "—"
    }
}

/// Más (paciente): secciones según permisos del catálogo.
struct MoreView: View {
    let profile: AccessProfile
    let role: String
    @Environment(NoticeInboxModel.self) private var notices
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            ForEach(AppSection.visible(for: role, profile: profile), id: \.self) { section in
                NavigationLink { PatientSectionView(section: section, profile: profile) } label: {
                    SectionCard {
                        HStack(spacing: Spacing.m) {
                            SectionIcon(icon: section.icon, symbol: section.symbol).foregroundStyle(Theme.primaryText).frame(width: 28).accessibilityHidden(true)
                            Text(LocalizedStringKey(section.titleKey)).font(Typo.subheading).foregroundStyle(Theme.ink)
                            Spacer()
                            // D1: the unread count (`noLeidos`) on the Avisos entry.
                            if section == .avisos, let unread = NoticeRules.badge(notices.inbox, hiding: notices.hidden) { UnreadBadge(count: unread) }
                            ClimesaIcon(.chevron, size: 16).foregroundStyle(Theme.muted).accessibilityHidden(true)
                        }
                    }
                }.buttonStyle(.plain)
            }
        }
    }
}

/// Unread count on an entry: a filled capsule with the number, read aloud as "3 avisos sin leer".
private struct UnreadBadge: View {
    let count: Int
    var body: some View {
        Text(verbatim: count > 99 ? "99+" : "\(count)")
            .font(Typo.tag).monospacedDigit()
            .foregroundStyle(Theme.onPrimary)
            .padding(.horizontal, 8).frame(minWidth: 24, minHeight: 24)
            .background(Theme.primary, in: Capsule())
            .accessibilityLabel(Text(verbatim: NoticeRules.badgeLabel(count)))
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
                else { EmptyStateView(title: L.text("home.unlinked.title"), message: L.text("exams.unlinked")) }
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
            case .avisos: NoticesView()
            }
        }
    }
}

/// I03 · Vincular expediente (U12). Linking is automatic by verified email (`GET /me/vinculacion`): the linked state, a
/// request to confirm the email first, or «Pide en Recepción que anoten este correo: {email}». There is no form: the
/// account joins its record on its next session or when Recepción saves that email on the record. A failed read is shown
/// with «Reintentar». It rereads on `vinculacion.*` (tiempo real); a refreshed profile with a record shows it linked.
struct LinkRecordView: View {
    @EnvironmentObject private var account: AccountModel
    @Environment(LiveViewModel.self) private var live
    @State private var loader = Loader<MyLink>()

    private var profileLinked: Bool { account.profile?.patientId != nil }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            if profileLinked {
                content(.linked)
            } else {
                LoadState(loader: loader, retry: load) { link in
                    content(LinkStatusRules.screen(link, profileLinked: false))
                }
            }
        }
        .task(id: live.snapshot.version(.link)) { if !profileLinked { await load() } }
    }

    @ViewBuilder private func content(_ screen: LinkStatusRules.Screen) -> some View {
        switch screen {
        case .linked:
            PatientNotice(text: L.text("link.approved"))
        case let .emailNotVerified(email):
            // Confirm the email first: only a confirmed email joins the account with the record.
            PatientNotice(text: LinkStatusRules.confirmEmailText, failure: true)
            receptionCard(email)
        case let .askReception(email):
            receptionCard(email)
        }
    }

    /// «Pide en Recepción que anoten este correo: {email}», with what happens next.
    private func receptionCard(_ email: String?) -> some View {
        SectionCard(eyebrow: L.text("link.status")) {
            Text(verbatim: LinkStatusRules.receptionText(email)).font(Typo.body).foregroundStyle(Theme.ink)
            EmptyNote("link.reception.body")
        }
    }

    private func load() async {
        await loader.load { try await account.client().get("/me/vinculacion", as: MyLink.self) }
        guard let link = loader.value else { return }
        // Linked on the server before the profile knows it: refresh the profile so the tabs follow.
        if LinkStatusRules.screen(link, profileLinked: false) == .linked { await account.refreshProfile() }
    }
}

/// I08 (paciente) e I22 (médico) · Historial: consultas, diagnósticos, recetas, resultados y hospitalizaciones.
/// Sin relación de atención, la API responde 403 y se muestra su mensaje.
struct ClinicalHistoryView: View {
    let patientId: String
    /// Quién mira: el paciente su propio historial o el médico el de un paciente (solo el tratante lo ve).
    var viewerIsPatient = true
    /// D4: «Registrar resultado externo» for the doctor; offered in the patient card only once the history was read.
    var recordExternal: (() -> Void)? = nil
    @EnvironmentObject private var account: AccountModel
    @Environment(LiveViewModel.self) private var live
    @State private var loader = Loader<ClinicalHistory>()

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            if let denied = RecordAccess.deniedMessage(for: loader.failure, viewerIsPatient: viewerIsPatient) {
                InfoStateView(message: denied, title: L.text("history.forbidden.title"))
            } else {
                LoadState(loader: loader, retry: load) { history in
                    // S4: the history's `allowedActions` decide when present; otherwise the permission, as before.
                    let offer = !viewerIsPatient && ExternalRecordRules.canOffer(account.profile, history: history)
                    HistoryContent(history: history, viewerIsPatient: viewerIsPatient, recordExternal: offer ? recordExternal : nil)
                }
            }
        }
        .task(id: live.snapshot.version([.consultations, .laboratory, .admissions, .patient])) { await load() }
    }

    private func load() async {
        await loader.load { try await account.client().get("/pacientes/\(patientId)/historial", as: ClinicalHistory.self) }
    }
}

private struct HistoryContent: View {
    let history: ClinicalHistory
    /// The API never returns the patient's own admissions here: «Hospitalizaciones» is only for the doctor (Android parity).
    var viewerIsPatient = true
    var recordExternal: (() -> Void)? = nil
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionCard {
                ListRow(title: history.patient.fullName ?? history.patient.record, meta: history.patient.record) {
                    PatientTag(history.access.rawValue, label: history.access.label)
                }
                if let recordExternal {
                    CrudButton(kind: .create, label: L.text("record.external.open"), action: recordExternal)
                }
            }
            SectionTitle("history.consultations")
            if history.consultations.isEmpty { EmptyStateView(title: L.text("history.none")) }
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
                        // Lote 5 S16: the row says when the consultation left a prescription, opened in its detail.
                        if !consultation.prescriptions.isEmpty {
                            Label { Text(verbatim: HistoryCopy.prescriptionLine(consultation.prescriptions.reduce(0) { $0 + $1.items.count })) } icon: { ClimesaIcon(.clipboard, size: 14) }
                                .font(Typo.small).foregroundStyle(Theme.primaryText)
                        }
                    }
                }.buttonStyle(.plain)
            }
            SectionTitle("history.laboratory")
            if history.laboratory.isEmpty { EmptyStateView(title: L.text("history.none")) }
            // Lote 5 S15: one row per order (exams, date, how many fell out of range); its detail says why it was ordered.
            ForEach(ClinicalRecordLab.rows(history)) { row in
                if let order = history.laboratory.first(where: { $0.id == row.orderId }) {
                    NavigationLink {
                        ScreenFrame(title: "history.lab.detail") { RecordLabDetail(order: order, history: history, viewerIsPatient: viewerIsPatient) }
                    } label: {
                        SectionCard {
                            ListRow(title: row.exams, subtitle: ClinicalRecordLab.summary(row), meta: ClimesaDates.display(row.orderedAt, .date)) {
                                HStack(spacing: Spacing.s) {
                                    PatientTag(order.state.rawValue, label: order.state.label)
                                    ClimesaIcon(.chevron, size: 16).foregroundStyle(Theme.muted).accessibilityHidden(true)
                                }
                            }
                        }
                    }.buttonStyle(.plain)
                }
            }
            if !viewerIsPatient && !history.admissions.isEmpty {
                SectionTitle("history.admissions")
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
}

/// Copy of the record list that depends on a count.
enum HistoryCopy {
    static func prescriptionLine(_ medicines: Int) -> String {
        medicines == 1 ? "Con receta · 1 medicamento" : "Con receta · \(medicines) medicamentos"
    }
}

/// Lote 5 S15 · one order of the record: «Por qué se pidió» (consultation, doctor, reason, diagnoses), then its results.
private struct RecordLabDetail: View {
    let order: ClinicalHistory.LabOrder
    let history: ClinicalHistory
    var viewerIsPatient = true

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionCard(title: L.text("history.lab.why")) {
                if let origin = LabOriginRules.of(history, consultationId: order.consultationId) {
                    ListRow(title: String(format: L.text("history.lab.origin"), ClimesaDates.display(origin.date, .date)),
                            subtitle: origin.doctor ?? L.text("history.doctor.unknown"))
                    if let reason = origin.reason {
                        Text(verbatim: reason).font(Typo.body).foregroundStyle(Theme.ink).fixedSize(horizontal: false, vertical: true)
                    }
                    ForEach(origin.diagnoses, id: \.self) { diagnosis in
                        Text(verbatim: diagnosis).font(Typo.small).foregroundStyle(Theme.muted).fixedSize(horizontal: false, vertical: true)
                    }
                } else {
                    Text("history.lab.noOrigin").font(Typo.small).foregroundStyle(Theme.muted).fixedSize(horizontal: false, vertical: true)
                }
            }
            SectionCard {
                ListRow(title: L.text("history.lab.ordered"), meta: ClimesaDates.display(order.createdAt, .date)) {
                    PatientTag(order.state.rawValue, label: order.state.label)
                }
                if let row = ClinicalRecordLab.rows(history).first(where: { $0.orderId == order.id }) {
                    Text(verbatim: ClinicalRecordLab.summary(row)).font(Typo.label).foregroundStyle(Theme.warning)
                }
            }
            SectionCard(title: L.text("history.laboratory")) {
                ForEach(order.items) { item in
                    HStack {
                        Text(verbatim: item.name).font(Typo.small).foregroundStyle(Theme.ink).fixedSize(horizontal: false, vertical: true)
                        Spacer()
                        if let result = item.result {
                            Text(verbatim: PatientLabRules.valueText(LabItemResult(value: result.value, text: result.text, mark: result.mark), unit: item.unit)).font(Typo.mono).foregroundStyle(Theme.ink)
                            if let mark = result.mark { PatientTag(mark.rawValue, label: mark.label) }
                        }
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
                        if diagnosis.principal { StatusBadge("principal", label: L.text("consultation.principal")) }
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
        SectionCard { Text(label).font(Typo.eyebrow).foregroundStyle(Theme.primaryText).textCase(.uppercase).tracking(Typo.eyebrowTracking); Text(verbatim: text).font(Typo.body).foregroundStyle(Theme.ink) }
    }
}

/// I09 · Pedir ambulancia: aviso del 911, ubicación, motivo y teléfono. Queda "por confirmar" (la central llama).
/// MA-AMB-05: el estado sale de `GET /ambulancia/solicitudes/mias` (sobrevive a cerrar la app) y se vuelve a pedir con cada
/// evento de ambulancia del canal propio; "Cancelar solicitud" solo aparece cuando la API la permite.
struct AmbulanceRequestView: View {
    @EnvironmentObject private var account: AccountModel
    @Environment(LiveViewModel.self) private var live
    /// S13: the form, the own requests, the prefill and the writes live in the view model; the view draws them.
    @State private var model = AmbulanceRequestViewModel()
    private var loader: Loader<[OwnAmbulanceRequest]> { model.loader }
    private var submission: Submission { model.submission }
    private var errors: [String: String] { model.errors }
    private var prefillNotice: String? { model.prefillNotice }

    /// The view model, bound to the session's client before each call.
    private var vm: AmbulanceRequestViewModel {
        model.client = { [account] in try account.client() }
        return model
    }

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
                if let active = AmbulanceRules.active(requests) { activeCard(active) } else {
                    // How the last request ended (discarded and why, cancelled, finished) sits above the new-request form.
                    if let last = AmbulanceRules.latestResolved(requests) { activeCard(last) }
                    // S6: without a linked record the API refuses the request, so the form is replaced by what to do.
                    if let reason = AmbulanceRules.requestGate(account.profile).blockedReason {
                        SectionCard { BlockedReasonLine(text: reason) }
                    } else {
                        form
                    }
                }
            }
        }
        .task(id: live.snapshot.version(.ambulance)) { await load() }
        .task { await prefill() }
        .sheet(item: $model.cancelling) { request in cancelSheet(request) }
    }

    private func activeCard(_ request: OwnAmbulanceRequest) -> some View {
        let tag = AmbulanceRules.tagValue(request)
        return SectionCard(eyebrow: L.text(request.isActive ? "ambulance.status" : "ambulance.last")) {
            PatientTag(tag.value, label: tag.label)
            Text(verbatim: AmbulanceRules.progress(request)).font(Typo.body).foregroundStyle(Theme.ink)
            Text(verbatim: request.address).font(Typo.small).foregroundStyle(Theme.muted)
            if request.state == .descartada, let why = request.discardReason, !why.isEmpty {
                Text(verbatim: "\(L.text("ambulance.discardReason")): \(why)").font(Typo.small).foregroundStyle(Theme.ink)
            }
            if let service = request.service {
                ForEach(["salida", "en_escena", "trasladando", "en_hospital"], id: \.self) { type in
                    let done = service.milestones.first { $0.type == type }
                    HStack {
                        Text(verbatim: AmbulanceRules.milestoneLabel(type)).font(Typo.small).foregroundStyle(done == nil ? Theme.muted : Theme.ink)
                        Spacer()
                        Text(verbatim: done.map { ClimesaDates.display($0.occurredAt, .time) } ?? "—").font(Typo.time).foregroundStyle(Theme.muted)
                    }
                }
            }
            Text(verbatim: request.notice).font(Typo.small).foregroundStyle(Theme.muted)
            // The write's result belongs to the request being followed, not to how the last one ended.
            if request.isActive { PatientSubmissionNotice(submission: submission) }
            if request.canCancel {
                CrudButton(kind: .deactivate, label: L.text("ambulance.cancel"), loading: submission.busy) { model.askCancel(request) }
            }
        }
    }

    private func cancelSheet(_ request: OwnAmbulanceRequest) -> some View {
        NavigationStack {
            ScreenFrame(title: "ambulance.cancel", onClose: { model.cancelling = nil }) {
                Text("ambulance.cancel.detail").font(Typo.body).foregroundStyle(Theme.ink)
                PatientTextArea(label: L.text("ambulance.cancel.reason"), text: $model.cancelReason, lines: 2...4, error: nil)
                // A refused cancel says why here, where the patient is looking, not behind the sheet.
                PatientSubmissionNotice(submission: submission)
                ClimesaButton(title: L.text("ambulance.cancel"), kind: .destructive, loading: submission.busy) { Task { await cancel(request) } }
            }
        }
    }

    private var form: some View {
        VStack(alignment: .leading, spacing: 16) {
                SectionCard {
                    if let prefillNotice { Text(LocalizedStringKey(prefillNotice)).font(Typo.small).foregroundStyle(Theme.muted).fixedSize(horizontal: false, vertical: true) }
                    PatientTextArea(label: L.text("ambulance.address"), text: $model.address, lines: 1...3, error: errors["address"] ?? submission.fieldErrors["address"])
                    FormField(label: L.text("ambulance.municipality"), text: $model.municipality)
                    PatientTextArea(label: L.text("ambulance.reason"), text: $model.reason, lines: 2...5, error: errors["reason"] ?? submission.fieldErrors["reason"])
                    FormField(label: L.text("ambulance.phone"), text: $model.phone, error: errors["contactPhone"] ?? submission.fieldErrors["contactPhone"])
                        .keyboardType(.phonePad).textContentType(.telephoneNumber)
                }
                PatientSubmissionNotice(submission: submission)
                ClimesaButton(title: L.text("ambulance.submit"), loading: submission.busy) { Task { await send() } }
        }
    }

    private func load() async { await vm.load() }

    /// Prefill from "Mis datos" only for a linked patient who may read it (best effort, once per screen).
    private func prefill() async {
        let allowed = account.profile.map { $0.patientId != nil && $0.hasPermission(AppSection.misDatos.requiredPermission ?? "") } ?? false
        await vm.prefill(allowed: allowed)
    }

    private func cancel(_ request: OwnAmbulanceRequest) async {
        await vm.cancel(request, success: L.text("ambulance.cancel.done"))
    }

    private func send() async { await vm.send() }
}

/// I11 · Quién vio mi expediente: fecha, rol y motivo de cada acceso.
struct MyAccessView: View {
    @EnvironmentObject private var account: AccountModel
    @Environment(LiveViewModel.self) private var live
    @State private var loader = Loader<[MyAccess]>()
    @State private var olderOpen = false

    var body: some View {
        LoadState(loader: loader, retry: load) { rows in
            if rows.isEmpty { EmptyStateView(title: L.text("accesses.none")) }
            // Grouped by day ("Hoy · mié 18 nov"); the last week stays open, older days fold under one line.
            let now = Date()
            let days = AccessLogRules.byDay(rows, now: now)
            let older = days.filter(\.older)
            ForEach(days.filter { !$0.older }, id: \.day) { day in accessDay(day, now: now) }
            if !older.isEmpty {
                SectionCard {
                    DisclosureGroup(isExpanded: $olderOpen) {
                        ForEach(older, id: \.day) { day in accessDay(day, now: now) }
                    } label: {
                        Text(verbatim: AccessLogRules.olderTitle(older.reduce(0) { $0 + $1.rows.count })).font(Typo.label).foregroundStyle(Theme.ink).frame(minHeight: 44)
                    }
                    .tint(Theme.primaryText)
                }
            }
        }
        // No event announces a new access: read on entering and again after a reconnection.
        .task(id: live.snapshot.resyncVersion) { await load() }
    }

    @ViewBuilder private func accessDay(_ day: AccessLogRules.Day, now: Date) -> some View {
        // D130: a burst of the same access is one row; who and what in plain words; an urgent access is marked.
        let groups = AccessLogRules.collapse(day.rows)
        ListCard(title: ClimesaDates.shortDay(day.day, now: now), items: Array(groups.enumerated()).map { AccessItem(index: $0.offset, group: $0.element) }) { item in
            let row = item.group.row
            ListRow(title: AccessLogRules.who(row, roleLabel: RoleNames.label(row.role)),
                    subtitle: [AccessLogRules.detail(row), AccessLogRules.burstText(item.group.count)].compactMap { $0 }.joined(separator: " · "),
                    meta: accessTime(item.group)) {
                if row.isUrgent { PatientTag("critico_alto", label: AccessLogRules.urgentLabel) }
            }
        }
    }

    /// One time, or «HH:mm a HH:mm» when the row stands for a burst.
    private func accessTime(_ group: AccessLogRules.Group) -> String {
        let last = ClimesaDates.display(group.latest, .time)
        guard group.count > 1 else { return last }
        let first = ClimesaDates.display(group.earliest, .time)
        return first == last ? last : "\(first) a \(last)"
    }

    private func load() async { await loader.load { try await account.client().get("/me/accesos", as: [MyAccess].self) } }
}

/// One row (one access or one burst, D130) of a day of «Quién vio mi expediente» (rows have no id of their own).
private struct AccessItem: Identifiable {
    let index: Int
    let group: AccessLogRules.Group
    var id: Int { index }
}
