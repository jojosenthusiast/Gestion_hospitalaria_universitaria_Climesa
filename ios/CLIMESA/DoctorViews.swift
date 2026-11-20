import SwiftUI

// Pantallas del Médico (docs/arquitectura/datos/pantallas.csv, I20 y I22 a I25; I21 está en ConsultationView.swift).

/// Cada parte se pide por separado: la que falla muestra su error con «Reintentar» (CH-02), nunca un cero falso.
struct DoctorDay: Sendable {
    var agenda: Part<[AgendaEntry]>?
    /// Lote 5 S11: earlier days of the agenda, newest first, for «Historial de días anteriores».
    var pastDays: [AgendaDay] = []
    var tickets: Part<[QueueTicket]>?
    /// S9: who goes next in consulta general by the server rule (`GET /fila/siguiente`). B3: a failed read shows its
    /// error in place; `.loaded(nil)` is a doctor who only sees their own queue (403).
    var next: Part<QueueNextProposal?>?
    var pendingResults: Part<Int>?
    /// RN-25: órdenes con valor crítico que este médico puede revisar.
    var criticalResults = 0
    var hospitalized: Part<Int>?
    /// m-22: consultas propias abiertas de cualquier día.
    var unsigned: Part<[UnsignedConsultation]>?
    /// CITA-02: citas propias con una solicitud de reprogramación que el médico puede decidir.
    var reschedules: Part<[Appointment]>?
}

/// I20 · Mi día: citas del día, números de la fila, resultados por revisar y hospitalizados.
struct DoctorDayView: View {
    let profile: AccessProfile
    let go: (AppTab) -> Void
    @EnvironmentObject private var account: AccountModel
    @Environment(LiveViewModel.self) private var live
    /// S11: only the highlighted critical notice shows here; every notice lives in Avisos (Más).
    /// D1: the session's inbox (RoleTabsView loads it), so the banner and Avisos agree.
    @Environment(NoticeInboxModel.self) private var notices
    @State private var loader = Loader<DoctorDay>()
    /// «Llamar siguiente» only; every called number has its own write state in `rows` (B3: no global spinner).
    @State private var calling = Submission()
    @State private var rows = SubmissionBook()
    @State private var deciding = Submission()
    /// B3: numbers called from this screen; each keeps its own «Deshacer» while still called (with `calledByMe`).
    @State private var calledHere: Set<String> = []
    /// D-3: "No se presentó" waits 8 s with «Deshacer», stored at the tap.
    @State private var absences = DeferredAbsences()
    @State private var rejecting: Appointment?
    /// Owner rule: pending lists show their two most urgent rows; the rest fold behind «Ver N pendientes más».
    @State private var unsignedOpen = false
    @State private var reschedulesOpen = false
    /// Lote 5 S11: «Mostrar N más de hoy» opens the rest of today's upcoming appointments.
    @State private var upcomingOpen = false

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.l) {
            // D68: the banner also stays to confirm «Enterado» or «Recordarme» where they were asked.
            if !NoticeRules.banner(notices.inbox, hiding: notices.hidden).isEmpty || notices.bannerDone != nil { CriticalNoticeBanner(model: notices) }
            LoadState(loader: loader, retry: load) { day in
                if day.criticalResults > 0 {
                    Button { go(.resultados) } label: {
                        MedicoAlert(text: String(format: L.text("results.critical.pending"), day.criticalResults))
                    }.buttonStyle(.plain)
                }
                // I-11: no tile grid repeating what each section already says.
                partErrors(day)
                // Lote 5 S11: Ahora, the queue, Próximas, Pendientes de firmar and Atendidas hoy, then the earlier days.
                // D76: a patient already called or in attention in this office shows once, in the queue card.
                let today = day.agenda?.value.map { DoctorDaySections.split(DoctorDaySections.withoutCalled($0, tickets: day.tickets?.value ?? []), now: Date()) }
                if let today, !today.now.isEmpty { agendaBlock(L.text("day.section.now"), today.now) }
                if let tickets = day.tickets?.value { queueSection(tickets, next: day.next) }
                if let today { upcomingSection(today.upcoming, nothingToday: today.now.isEmpty && today.done.isEmpty) }
                if let open = day.unsigned?.value, !open.isEmpty { unsignedSection(open) }
                if let pending = day.reschedules?.value, !pending.isEmpty { rescheduleSection(pending) }
                if let today, !today.done.isEmpty { agendaBlock(L.text("day.section.done"), today.done) }
                historyEntry(day.pastDays)
                moreSection(day)
            }
        }
        .task(id: live.snapshot.version([.appointments, .consultations, .queue, .laboratory, .admissions, .hospitalInfo])) {
            // Stored "No se presentó" left by a closed app or a lost signal goes first (in tap order), then the day.
            await absences.bind(user: profile.id, account: account) { await load() }
            await load()
        }
        .sheet(item: $rejecting) { item in RejectRescheduleSheet(appointment: item, submission: deciding) { await load() } }
    }

    @ViewBuilder private func unsignedSection(_ open: [UnsignedConsultation]) -> some View {
        // The oldest open consultation is the most urgent to sign.
        let ranked = open.sorted { (ClimesaDates.parse($0.startedAt) ?? .distantPast) < (ClimesaDates.parse($1.startedAt) ?? .distantPast) }
        ListCard(title: L.text("day.unsigned"), items: AttentionFold.shown(ranked, expanded: unsignedOpen)) { item in
            VStack(alignment: .leading, spacing: Spacing.s) {
                ListRow(title: item.patientName ?? L.text("day.patient.unknown"), subtitle: item.reason, meta: ClimesaDates.short(item.startedAt))
                // Lote 5 S2: resume is an edit of the open consultation; the record is a neutral view.
                ActionRow {
                    NavigationLink { ConsultationView(origin: .resume(item), profile: profile) } label: { CardActionLabel(title: L.text("day.unsigned.resume"), icon: .pencil) }
                        .buttonStyle(ClimesaButtonStyle(kind: ClimesaButtonKind(CardActionRole.edit)))
                    if account.can("expediente.ver") {
                        NavigationLink { PatientRecordScreen(patientId: item.patientId) } label: { CardActionLabel(title: L.text("day.record.view"), icon: .clipboard) }
                            .buttonStyle(ClimesaButtonStyle(kind: ClimesaButtonKind(CardActionRole.neutral)))
                    }
                }
            }
            .padding(.bottom, Spacing.s)
        }
        AttentionFoldToggle(count: ranked.count, expanded: $unsignedOpen)
    }

    @ViewBuilder private func rescheduleSection(_ pending: [Appointment]) -> some View {
        // The soonest appointment is the most urgent decision.
        let ranked = pending.sorted { (ClimesaDates.parse($0.start) ?? .distantPast) < (ClimesaDates.parse($1.start) ?? .distantPast) }
        SectionCard(title: L.text("day.reschedules")) {
            WriteNotice(submission: deciding, reload: load)
            ForEach(Array(AttentionFold.shown(ranked, expanded: reschedulesOpen).enumerated()), id: \.element.id) { index, item in
                if index > 0 { Divider().overlay(Theme.line) }
                ListRow(title: item.patientName ?? L.text("day.patient.unknown"), subtitle: ClimesaDates.short(item.start),
                        meta: item.reschedule.map { "→ \(ClimesaDates.short($0.start))" })
                // S13: a list of decisions has no primary of its own; "Llamar siguiente" / "Atender" is the day's primary.
                // I-15: the spinner shows only on the row being decided.
                // Lote 5 S2: accept is the main step of the request, reject is danger.
                ActionRow {
                    CardActionButton(title: L.text("day.reschedules.accept"), role: .primary, icon: .check, loading: deciding.busyId != nil && deciding.busyId == item.reschedule?.id) { Task { await accept(item) } }
                        .disabled(deciding.busy)
                    CardActionButton(title: L.text("day.reschedules.reject"), role: .danger, icon: .close) { rejecting = item }
                        .disabled(deciding.busy)
                }
            }
            AttentionFoldToggle(count: ranked.count, expanded: $reschedulesOpen)
        }
    }

    private func accept(_ item: Appointment) async {
        guard let request = item.reschedule else { return }
        let body = RescheduleDecisionBody(version: request.version)
        await deciding.run(request.id, body: body, success: L.text("day.reschedules.accepted")) { key in
            _ = try await account.client().send("POST", "/citas/reprogramaciones/\(request.id)/aceptar", body: body, key: key, as: AppointmentCommandResult.self)
        }
        await load()
    }

    /// Partes del día que no se pudieron leer, cada una con su título y «Reintentar».
    @ViewBuilder private func partErrors(_ day: DoctorDay) -> some View {
        let failed = [
            PartFailure(title: L.text("day.agenda"), message: day.agenda?.error),
            PartFailure(title: L.text("day.queue"), message: day.tickets?.error),
            PartFailure(title: L.text("day.results.title"), message: day.pendingResults?.error),
            PartFailure(title: L.text("ds.medico.stat.hospitalized"), message: day.hospitalized?.error)
        ].filter { $0.message != nil }
        ForEach(failed) { part in
            SectionCard(title: part.title) { PartError(message: part.message ?? "", retry: load) }
        }
    }

    @ViewBuilder private func queueSection(_ tickets: [QueueTicket], next: Part<QueueNextProposal?>?) -> some View {
        let waiting = tickets.filter { $0.service == .consultaGeneral && $0.state == .enEspera }.count
        // S13: one primary on the day: attend the number already called, otherwise call the next one.
        let primary = DoctorDayActionRules.primary(tickets: tickets, canAttend: account.can("consulta.iniciar"), canCallNext: account.can("fila.llamar"))
        let called = tickets.filter { $0.state == .llamado || $0.state == .enAtencion }.sorted { $0.number < $1.number }
        SectionCard(title: L.text("day.queue")) {
            Text(verbatim: String(format: L.text("day.queue.waiting"), waiting)).font(Typo.body).foregroundStyle(Theme.ink)
            // S9 / RN-FILA-SIGUIENTE: the server proposes who goes next and says why; "Llamar siguiente" calls that number.
            // B3: a failed read says so here with «Reintentar»; it never disappears in silence.
            if let message = next?.error {
                PartError(message: message, retry: load)
            } else if let proposal = next?.value ?? nil {
                nextCard(proposal)
            }
            if account.can("fila.llamar"), QueueRules.nextToCall(tickets) != nil {
                CardActionButton(title: L.text("day.queue.callNext"), role: primary == .callNext ? .primary : .edit, icon: .megaphone, loading: calling.busy) { Task { await callNext() } }
            }
            WriteNotice(submission: calling, reload: load)
            absenceNotices
            // I-9: called numbers are rows of this card, not one card each.
            ForEach(called) { ticket in
                Divider().overlay(Theme.line)
                calledRow(ticket, primary: primary)
            }
        }
    }

    /// D-3: what happened to a deferred "No se presentó": sent, dropped for good (said once), or kept for a retry.
    @ViewBuilder private var absenceNotices: some View {
        if let sent = absences.lastSent { PatientNotice(text: sent) }
        if let report = absences.report { PatientNotice(text: report, failure: true) }
        ForEach(absences.failed) { item in
            VStack(alignment: .leading, spacing: Spacing.s) {
                PatientNotice(text: String(format: L.text("day.queue.absent.failed"), item.label, item.error ?? ""), failure: true)
                HStack(spacing: Spacing.m) {
                    ClimesaButton(title: L.text("ds.retry"), kind: .secondary) { Task { await absences.retry() } }
                    ClimesaButton(title: L.text("day.queue.absent.discard"), kind: .secondary) { absences.discard(item.id) }
                }
            }
        }
    }

    @ViewBuilder private func calledRow(_ ticket: QueueTicket, primary: DoctorDayAction?) -> some View {
        let row = rows[ticket.id]
        VStack(alignment: .leading, spacing: Spacing.s) {
            HStack(spacing: Spacing.s) {
                AreaTag(QueueBoardRules.area(ticket))
                // The per-area number, large, as it is called out ("CON 7").
                Text(verbatim: "\(ticket.number)").font(Typo.number(22)).foregroundStyle(Theme.ink).accessibilityLabel(QueueBoardRules.code(ticket))
                Spacer()
                MedicoTag(ticket.state.rawValue, label: ticket.state.label)
            }
            Text(verbatim: ticket.patientName ?? ticket.service.label).font(Typo.subheading).foregroundStyle(Theme.ink)
            // Lote 5 S11: what the doctor needs before calling them in: age and sex, service and origin, the wait.
            if let who = QueueRowContext.demographics(age: ticket.patientAge, sex: ticket.patientSex) {
                Text(verbatim: who).font(Typo.small).foregroundStyle(Theme.ink)
            }
            Text(verbatim: QueueRowContext.line(ticket)).font(Typo.small).foregroundStyle(Theme.muted).fixedSize(horizontal: false, vertical: true)
            HStack(spacing: Spacing.s) {
                if QueueBoardRules.priority(ticket) != "rutina" { PriorityBadge(ticket.priority) }
                if let wait = QueueRowContext.wait(ticket, now: Date()) { Text(verbatim: wait).font(Typo.small).foregroundStyle(Theme.muted) }
            }
            if absences.isPending(ticket.id) {
                // D-3: nothing reached the server yet; «Deshacer» cancels it with no API call.
                HStack(spacing: Spacing.m) {
                    Text(verbatim: DoctorDayActionRules.absencePending(ticket)).font(Typo.body).foregroundStyle(Theme.ink).fixedSize(horizontal: false, vertical: true)
                    Spacer()
                    Button(L.text("queue.undo")) { absences.undo(ticket.id) }.font(Typo.label).frame(minHeight: 44)
                }
                .padding(Spacing.m).frame(maxWidth: .infinity, alignment: .leading)
                .background(Theme.soft, in: RoundedRectangle(cornerRadius: Radius.control))
                .accessibilityElement(children: .combine)
            } else {
                rowActions(ticket, row: row, primary: primary)
            }
            WriteNotice(submission: row, reload: load)
        }
        .padding(.vertical, Spacing.s)
    }

    /// FILA-01: volver a llamar o "No se presentó" solo cuando el servidor lo permite. I-12: an action the server blocks is
    /// hidden, its internal reason is not printed. B3 / I-15: the spinner and the lock are this number's only.
    @ViewBuilder private func rowActions(_ ticket: QueueTicket, row: Submission, primary: DoctorDayAction?) -> some View {
        let allowed = ticket.allowedActions ?? []
        let undoable = account.can("fila.llamar") && DoctorDayActionRules.canUndo(ticket, calledHere: calledHere)
        // Lote 5 S2: attend is the main step, call again and undo are edits, «No se presentó» is danger, the record is neutral.
        if DoctorDayActionRules.calledElsewhere(ticket) {
            // Another clinician called this number: it is theirs to attend (web `calledElsewhere`).
            Text("day.queue.calledElsewhere").font(Typo.small).foregroundStyle(Theme.muted)
        } else if account.can("consulta.iniciar") {
            // Un número con consulta propia ya iniciada se retoma; los demás se atienden.
            NavigationLink { ConsultationView(origin: .ticket(ticket), profile: profile) } label: {
                CardActionLabel(title: L.text(ticket.consultationId == nil ? "day.attend" : "day.resume"), icon: .steth)
            }
            .buttonStyle(ClimesaButtonStyle(kind: ClimesaButtonKind(primary == .attend(ticket.id) ? CardActionRole.primary : CardActionRole.edit)))
            .disabled(row.busy)
        }
        if allowed.contains(.llamar) || allowed.contains(.noSePresento) || undoable || (account.can("expediente.ver") && ticket.patientId != nil) {
            ActionRow {
                if undoable { CardActionButton(title: L.text("queue.undo"), role: .edit, loading: row.busy && row.busyId == "undo-\(ticket.id)") { Task { await undoCall(ticket) } }.disabled(row.busy) }
                if allowed.contains(.llamar) { CardActionButton(title: L.text("day.queue.callAgain"), role: .edit, icon: .megaphone, loading: row.busy && row.busyId == ticket.id) { Task { await call(ticket) } }.disabled(row.busy) }
                if let patientId = ticket.patientId, account.can("expediente.ver") {
                    NavigationLink { PatientRecordScreen(patientId: patientId) } label: { CardActionLabel(title: L.text("day.record.view"), icon: .clipboard) }
                        .buttonStyle(ClimesaButtonStyle(kind: ClimesaButtonKind(CardActionRole.neutral)))
                }
                if allowed.contains(.noSePresento) { CardActionButton(title: QueueAction.noSePresento.label, role: .danger) { Task { await absent(ticket) } }.disabled(row.busy) }
            }
        }
        cardMenu(ticket, row: row, undoable: undoable)
    }

    @ViewBuilder private func nextCard(_ next: QueueNextProposal) -> some View {
        VStack(alignment: .leading, spacing: Spacing.s) {
            Text("queue.next.title").font(Typo.label).foregroundStyle(Theme.muted)
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
            // I-31: the rule stays one tap away. B3: in the app's own words, never the server's raw `rule` text.
            DisclosureGroup {
                NextRuleList()
            } label: { Text("queue.next.why").font(Typo.small).foregroundStyle(Theme.primaryText).frame(minHeight: 44) }
        }
        .padding(Spacing.m)
        .frame(maxWidth: .infinity, alignment: .leading)
        .areaSurface(next.area)
    }

    /// Board moves without dragging: only the moves the server accepts now, plus the priority (S9).
    @ViewBuilder private func cardMenu(_ ticket: QueueTicket, row: Submission, undoable: Bool) -> some View {
        let moves = QueueBoardRules.destinations(ticket)
        let priorities = account.can("fila.gestionar") ? QueueBoardRules.priorityChoices(ticket) : []
        // «Deshacer» on the row already removes one call; the menu does not repeat it.
        let removeCall = !undoable && account.can("fila.llamar") && QueueBoardRules.canRemoveCall(ticket)
        if !moves.isEmpty || !priorities.isEmpty || removeCall {
            Menu {
                if removeCall {
                    Button(String(format: L.text("queue.removeCall"), ticket.calls)) { Task { await move(ticket, .quitarLlamado) } }
                }
                ForEach(moves, id: \.column) { item in
                    Button(String(format: L.text("queue.move.to"), item.column.label, item.move.label.lowercased())) { Task { await move(ticket, item.move) } }
                }
                ForEach(priorities, id: \.self) { value in
                    Button(String(format: L.text("queue.priority.to"), QueueBoardRules.priorityLabel(value))) { Task { await setPriority(ticket, value) } }
                }
            } label: { Text("queue.menu").frame(minHeight: 44).contentShape(Rectangle()) }
            .disabled(row.busy)
            .accessibilityLabel(String(format: L.text("queue.menu.for"), QueueBoardRules.code(ticket)))
        }
    }

    /// Lote 5 S11 · «Próximas»: the first three of today, then «Mostrar N más de hoy». An empty day says so in one line.
    @ViewBuilder private func upcomingSection(_ upcoming: [AgendaEntry], nothingToday: Bool) -> some View {
        if upcoming.isEmpty {
            // I-37: one line inside the section, not a large empty block.
            if nothingToday { SectionCard(title: L.text("day.section.upcoming")) { EmptyNote("day.agenda.none") } }
        } else {
            let shown = upcomingOpen ? upcoming : Array(upcoming.prefix(DoctorDaySections.upcomingVisible))
            SectionCard(title: L.text("day.section.upcoming")) {
                ForEach(Array(shown.enumerated()), id: \.element.id) { index, entry in
                    if index > 0 { Divider().overlay(Theme.line) }
                    agendaRow(entry)
                }
                if let label = DoctorDaySections.moreTodayLabel(upcoming.count, expanded: upcomingOpen) {
                    Button { upcomingOpen.toggle() } label: {
                        HStack(spacing: Spacing.space1) {
                            Text(verbatim: label).font(Typo.label)
                            Image(systemName: upcomingOpen ? "chevron.up" : "chevron.down").font(Typo.small).accessibilityHidden(true)
                        }
                        .foregroundStyle(Theme.primaryText).frame(minHeight: 44).contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    /// «Ahora» and «Atendidas hoy»: today's appointments of that section, one row each with its actions.
    @ViewBuilder private func agendaBlock(_ title: String, _ entries: [AgendaEntry]) -> some View {
        SectionCard(title: title) {
            ForEach(Array(entries.enumerated()), id: \.element.id) { index, entry in
                if index > 0 { Divider().overlay(Theme.line) }
                agendaRow(entry)
            }
        }
    }

    /// One appointment: time, patient, reason and categories, its state, then its actions on one line (Lote 5 S2).
    @ViewBuilder private func agendaRow(_ entry: AgendaEntry) -> some View {
        VStack(alignment: .leading, spacing: Spacing.s) {
            ListRow(title: entry.patientName ?? L.text("day.patient.unknown"), subtitle: entry.reason, meta: ClimesaDates.display(entry.start, .time)) {
                if let state = entry.consultationState { MedicoTag(state.rawValue, label: state.label) }
                else { MedicoTag(entry.appointmentState.rawValue, label: entry.appointmentState.label) }
            }
            CategoryMarks(categories: entry.categories)
            // MA-CIT-03: iniciar solo el día de la cita (lo decide el servidor con `allowedActions`). I-12: a blocked
            // start is hidden; its server reason is not body text.
            let canOpen = entry.consultationId != nil || (account.can("consulta.iniciar") && (entry.allowedActions?.contains(.iniciarConsulta) ?? (entry.appointmentState == .confirmada)))
            if canOpen || account.can("expediente.ver") {
                ActionRow {
                    if canOpen {
                        NavigationLink { ConsultationView(origin: .appointment(entry), profile: profile) } label: {
                            CardActionLabel(title: L.text(Self.consultationLinkKey(entry)), icon: entry.consultationState == .firmada ? .eye : .steth)
                        }
                        .buttonStyle(ClimesaButtonStyle(kind: ClimesaButtonKind(Self.consultationRole(entry))))
                    }
                    if account.can("expediente.ver") {
                        NavigationLink { PatientRecordScreen(patientId: entry.patientId) } label: { CardActionLabel(title: L.text("day.record.view"), icon: .clipboard) }
                            .buttonStyle(ClimesaButtonStyle(kind: ClimesaButtonKind(CardActionRole.neutral)))
                    }
                }
                .padding(.bottom, Spacing.s)
            }
        }
    }

    /// Start or resume is the main step; viewing a signed consultation is neutral.
    static func consultationRole(_ entry: AgendaEntry) -> CardActionRole {
        entry.consultationState == .firmada ? .neutral : .primary
    }

    /// Lote 5 S11 · «Historial de días anteriores»: one dated entry to the agenda's earlier days, instead of «Ver más».
    @ViewBuilder private func historyEntry(_ past: [AgendaDay]) -> some View {
        if let detail = DoctorDaySections.historyDetail(past), AppSection.visible(for: "MED", profile: profile).contains(.agenda) {
            SectionCard {
                NavigationLink { PatientSectionView(section: .agenda, profile: profile) } label: {
                    HStack(spacing: Spacing.m) {
                        ClimesaIcon(.calendar, size: 22).foregroundStyle(Theme.primaryText).accessibilityHidden(true)
                        ListRow(title: L.text("day.history.title"), subtitle: detail) {
                            ClimesaIcon(.chevron, size: 16).foregroundStyle(Theme.muted).accessibilityHidden(true)
                        }
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
    }

    /// Start, resume an open consultation, or view a signed one: the label says which.
    static func consultationLinkKey(_ entry: AgendaEntry) -> String {
        guard entry.consultationId != nil else { return "day.consultation.start" }
        return entry.consultationState == .abierta ? "day.resume" : "day.consultation.view"
    }

    @ViewBuilder private func moreSection(_ day: DoctorDay) -> some View {
        let sections = AppSection.visible(for: "MED", profile: profile).filter { [.agenda, .hospitalizados, .llegadaAmbulancia].contains($0) }
        let pendingResults = day.pendingResults?.value ?? 0
        if !sections.isEmpty || pendingResults > 0 {
            SectionCard(title: L.text("day.more")) {
                // The pending count lives here once, as a link to Resultados (I-11).
                if pendingResults > 0 {
                    Button { go(.resultados) } label: {
                        ListRow(title: L.text("day.results.title")) {
                            HStack(spacing: Spacing.s) {
                                Text(verbatim: "\(pendingResults)").font(Typo.label).monospacedDigit().foregroundStyle(Theme.ink)
                                ClimesaIcon(.chevron, size: 16).foregroundStyle(Theme.muted).accessibilityHidden(true)
                            }
                        }
                        .contentShape(Rectangle())
                    }.buttonStyle(.plain)
                    if !sections.isEmpty { Divider().overlay(Theme.line) }
                }
                ForEach(Array(sections.enumerated()), id: \.element) { index, section in
                    if index > 0 { Divider().overlay(Theme.line) }
                    NavigationLink { PatientSectionView(section: section, profile: profile) } label: {
                        HStack(spacing: Spacing.m) {
                            SectionIcon(icon: section.icon, symbol: section.symbol).foregroundStyle(Theme.primaryText).frame(width: 28).accessibilityHidden(true)
                            ListRow(title: L.text(section.titleKey)) {
                                HStack(spacing: Spacing.s) {
                                    if section == .hospitalizados, let count = day.hospitalized?.value { Text(verbatim: "\(count)").font(Typo.label).foregroundStyle(Theme.ink) }
                                    ClimesaIcon(.chevron, size: 16).foregroundStyle(Theme.muted).accessibilityHidden(true)
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
                var all: [AgendaEntry] = []
                day.agenda = try await Part<[AgendaEntry]>.load {
                    all = try await api.get("/consultas/agenda", as: [AgendaEntry].self)
                    return all.filter { ClimesaDates.parse($0.start).map(ClimesaDates.localDay) == today }.sorted { $0.start < $1.start }
                }
                day.pastDays = AgendaRules.past(all, now: Date())
            }
            if profile.hasPermission("consulta.iniciar") {
                day.unsigned = try await Part<[UnsignedConsultation]>.load { try await api.get("/consultas/sin-firmar", as: [UnsignedConsultation].self) }
            }
            if profile.hasPermission("citas.ver") {
                day.reschedules = try await Part<[Appointment]>.load {
                    try await api.get("/citas", as: [Appointment].self).filter { $0.allowedActions?.contains(.aceptarReprogramacion) ?? false }
                }
            }
            if profile.hasPermission("fila.ver") {
                day.tickets = try await Part<[QueueTicket]>.load { try await api.get("/fila", as: [QueueTicket].self) }
                // A doctor who only sees their own queue gets 403 and simply no proposal; any other failure is shown (B3).
                day.next = try await Part<QueueNextProposal?>.load {
                    do { return try await api.get("/fila/siguiente?service=consulta_general", as: QueueNextProposal.self) }
                    catch let failure as APIFailure where failure.isForbidden { return nil }
                }
            }
            if profile.hasPermission("resultados.ver") {
                let orders = try await Part<[LabOrder]>.load { try await api.get("/laboratorio/ordenes", as: [LabOrder].self) }
                switch orders {
                case let .loaded(list):
                    day.pendingResults = .loaded(ReviewRules.toReview(list))
                    day.criticalResults = ReviewRules.criticalToReview(list)
                case let .failed(message):
                    day.pendingResults = .failed(message)
                }
            }
            if profile.hasPermission("admision.ver") {
                day.hospitalized = try await Part<Int>.load {
                    let admissions = try await api.get("/admisiones", as: [Admission].self)
                    // D84: the same stays «Mis hospitalizados» lists (signed discharges still in the bed included).
                    return DischargeRules.listed(admissions).count
                }
            }
            return day
        }
        // A number that is no longer called has nothing to undo.
        if let tickets = loader.value?.tickets?.value {
            calledHere = calledHere.filter { id in tickets.contains { $0.id == id && $0.state == .llamado } }
        }
    }

    private func callNext() async {
        let body = QueueCallNextBody(service: QueueService.consultaGeneral.rawValue)
        var called: QueueCallNextResult?
        await calling.run("siguiente", body: body) { key in
            called = try await account.client().send("POST", "/fila/llamar-siguiente", body: body, key: key, as: QueueCallNextResult.self)
        }
        if let called {
            calling.notice = QueueBoardRules.moveDone("\(QueueBoardRules.area(of: .consultaGeneral)) \(called.number)", .llamar)
            calledHere.insert(called.id)
        }
        await load()
    }

    /// B3: each called number undoes its own call (`deshacer-llamado` at its current version); the others stay called.
    private func undoCall(_ ticket: QueueTicket) async {
        let body = VersionBody(version: ticket.version)
        let ok = await rows[ticket.id].run("undo-\(ticket.id)", body: body, success: DoctorDayActionRules.undoDone(ticket)) { key in
            _ = try await account.client().send("POST", "/fila/\(ticket.id)/deshacer-llamado", body: body, key: key, as: QueueTransitionResult.self)
        }
        if ok && ticket.calls <= 1 { calledHere.remove(ticket.id) }
        await load()
    }

    private func move(_ ticket: QueueTicket, _ move: QueueMove) async {
        // D-3: "No se presentó" from the menu also waits 8 s with «Deshacer».
        if move == .noSePresento { await absent(ticket); return }
        let body = VersionBody(version: ticket.version)
        let ok = await rows[ticket.id].run(ticket.id, body: body, success: QueueBoardRules.moveDone(QueueBoardRules.code(ticket), move)) { key in
            _ = try await account.client().send("POST", QueueBoardRules.path(ticket, move), body: body, key: key, as: QueueTransitionResult.self)
        }
        if ok && move == .llamar { calledHere.insert(ticket.id) }
        await load()
    }

    private func setPriority(_ ticket: QueueTicket, _ priority: String) async {
        let body = QueuePriorityBody(version: ticket.version, priority: priority)
        await rows[ticket.id].run(ticket.id, body: body, success: "\(QueueBoardRules.code(ticket)): \(QueueBoardRules.priorityLabel(priority))") { key in
            _ = try await account.client().send("POST", "/fila/\(ticket.id)/prioridad", body: body, key: key, as: QueueTransitionResult.self)
        }
        await load()
    }

    /// D-3: stored at the tap and sent after 8 s unless «Deshacer»; the row says so in place.
    private func absent(_ ticket: QueueTicket) async {
        rows[ticket.id].clearFailure()
        await absences.start(ticket)
    }

    private func call(_ ticket: QueueTicket) async {
        let body = VersionBody(version: ticket.version)
        let ok = await rows[ticket.id].run(ticket.id, body: body, success: QueueBoardRules.moveDone(QueueBoardRules.code(ticket), .llamar)) { key in
            _ = try await account.client().send("POST", "/fila/\(ticket.id)/llamar", body: body, key: key, as: QueueCallResult.self)
        }
        if ok { calledHere.insert(ticket.id) }
        await load()
    }
}

/// RN-FILA-SIGUIENTE, one numbered step per line, in the app's words.
struct NextRuleList: View {
    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.xs) {
            ForEach(NextRuleText.lines, id: \.self) { line in
                Text(verbatim: line).font(Typo.small).foregroundStyle(Theme.muted).fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// D-3 on Mi día: "No se presentó" waits 8 s with «Deshacer» before it is sent (no inverse endpoint, gap B-8). Each one
/// is stored per account at the tap (`DraftStore`), so a closed app or a lost signal never loses it; `DeferredQueue`
/// replays it exactly, drops a definitive 4xx with one notice, and rebases a `version_conflicto` once.
@MainActor @Observable
final class DeferredAbsences {
    static let storeKey = "fila-no-se-presento"

    private(set) var pending: [DeferredRequest] = []
    private(set) var failed: [DeferredRequest] = []
    /// "CON 7 marcado como no se presentó" once the server accepted it.
    private(set) var lastSent: String?
    /// A request dropped for good or expired, said once.
    private(set) var report: String?
    @ObservationIgnored private var queue: DeferredQueue?
    @ObservationIgnored private var user: String?

    nonisolated init() {}

    func isPending(_ ticketId: String) -> Bool { pending.contains { $0.subject == ticketId } }

    func bind(user: String, account: AccountModel, reload: @escaping @MainActor () async -> Void) async {
        guard self.user != user || queue == nil else { await queue?.resume(); return }
        self.user = user
        let store = DraftStore.shared, key = Self.storeKey
        let queue = DeferredQueue(
            stored: store.load([DeferredRequest].self, user: user, key: key) ?? [],
            save: { items in
                if items.isEmpty { store.clear(user: user, key: key) } else { _ = store.save(items, user: user, key: key) }
            },
            send: { item in try await account.client().sendRaw("POST", item.path, body: item.body, key: item.id) },
            rebase: { item in
                // 409: the number changed; read it again and send its current version under a new key, if it still applies.
                let tickets = try await account.client().get("/fila", as: [QueueTicket].self)
                let ticket = tickets.first { $0.id == item.subject }
                guard DoctorDayActionRules.absenceStillApplies(ticket), let ticket else { return nil }
                return try JSONBody.encode(VersionBody(version: ticket.version))
            })
        queue.onChange = { [weak self, weak queue] in
            guard let self, let queue else { return }
            self.pending = queue.pending
            self.failed = queue.failed
        }
        queue.onSent = { [weak self] item in
            self?.lastSent = QueueBoardRules.moveDone(item.label, .noSePresento)
            Task { await reload() }
        }
        queue.onReport = { [weak self] message in self?.report = message }
        self.queue = queue
        await queue.resume()
    }

    func start(_ ticket: QueueTicket) async {
        lastSent = nil; report = nil
        guard let queue, let body = try? JSONBody.encode(VersionBody(version: ticket.version)) else {
            report = "\(QueueBoardRules.code(ticket)): no se pudo guardar la acción. Vuelve a intentar."
            return
        }
        await queue.start(subject: ticket.id, label: QueueBoardRules.code(ticket), path: QueueBoardRules.path(ticket, .noSePresento), body: body)
    }

    func undo(_ ticketId: String) {
        if queue?.undo(ticketId) == true { lastSent = nil }
    }

    func retry() async {
        report = nil
        await queue?.resume()
    }

    func discard(_ id: String) { queue?.discard(id) }
}

/// Pestaña Pacientes: buscar y abrir el expediente (I22). I-27: busca mientras se escribe (con una pausa breve tras la
/// última tecla), sin botón ni frases de ayuda; la nota de privacidad va solo en el estado vacío.
struct DoctorPatientsView: View {
    @EnvironmentObject private var account: AccountModel
    @State private var query = ""
    @State private var loader = Loader<[PatientCandidate]>()

    private var trimmed: String { query.trimmingCharacters(in: .whitespacesAndNewlines) }

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.l) {
            FormField(label: L.text("patients.search"), text: $query)
                .textInputAutocapitalization(.words).autocorrectionDisabled().submitLabel(.search)
                .onSubmit { Task { await search() } }
            if trimmed.count == 1 { EmptyNote("patients.search.hint") }
            LoadState(loader: loader, retry: search) { rows in
                if rows.isEmpty {
                    EmptyStateView(title: L.text("patients.none"), message: L.text("patients.treating_only"))
                } else {
                    // S2: patients the doctor attends first; the rest show why they do not open, with no navigation.
                    ListCard(items: RecordAccess.ordered(rows)) { patient in
                        if let reason = RecordAccess.gate(patient).blockedReason {
                            VStack(alignment: .leading, spacing: Spacing.xs) {
                                ListRow(title: patient.fullName, meta: RecordAccess.rowMeta(patient)) {
                                    if !patient.active { StatusTag("inactivo", label: L.text("patients.inactive")) }
                                }
                                .opacity(0.6)
                                BlockedReasonLine(text: reason)
                            }
                            .accessibilityElement(children: .combine)
                        } else {
                            NavigationLink {
                                PatientRecordScreen(patientId: patient.id)
                            } label: {
                                ListRow(title: patient.fullName, meta: RecordAccess.rowMeta(patient)) {
                                    HStack(spacing: Spacing.s) {
                                        if !patient.active { StatusTag("inactivo", label: L.text("patients.inactive")) }
                                        ClimesaIcon(.chevron, size: 16).foregroundStyle(Theme.muted).accessibilityHidden(true)
                                    }
                                }
                                .contentShape(Rectangle())
                            }.buttonStyle(.plain)
                        }
                    }
                }
            }
        }
        // Debounce of the user's typing (not a refresh timer): the search runs 0.4 s after the last key.
        .task(id: trimmed) {
            guard trimmed.count >= 2 else { loader.clear(); return }
            try? await Task.sleep(nanoseconds: 400_000_000)
            if !Task.isCancelled { await search() }
        }
    }

    private func search() async {
        let text = trimmed
        guard text.count >= 2 else { loader.clear(); return }
        await loader.load { try await account.client().get("/pacientes?query=\(Query.encode(text))&limit=20", as: [PatientCandidate].self) }
    }
}

/// I23 · Resultados por revisar: críticos arriba en rojo; detalle con valores y marca; marcar revisado. Debajo, las
/// órdenes propias en curso que la API deja cancelar (MA-LAB-05).
struct ResultsReviewView: View {
    @EnvironmentObject private var account: AccountModel
    @Environment(LiveViewModel.self) private var live
    @State private var loader = Loader<[LabOrder]>()
    /// Nil before the first read or without `laboratorio.revisar`; a failed read shows its error, never an empty inbox.
    @State private var followUps: Part<[LabFollowUp]>?
    @State private var followUpSubmission = Submission()

    var body: some View {
        LoadState(loader: loader, retry: load) { orders in
            // S10: valores críticos y observaciones relevantes del laboratorio, hasta que el médico los marca revisados.
            if account.can("laboratorio.revisar") {
                if let message = followUps?.error {
                    SectionCard(title: L.text("results.followUp.title")) { PartError(message: message, retry: loadFollowUps) }
                } else if let items = followUps?.value {
                    LabFollowUpInbox(items: items, orders: orders, submission: followUpSubmission, review: review, reload: load)
                }
            }
            // I-32: critical results are tagged on their row (critical first); no extra banner repeating the count.
            // An order already in «Resultados por revisar» is not listed a second time below it.
            let inInbox = Set((followUps?.value ?? []).map(\.orderId))
            let pending = ReviewRules.pending(orders).filter { !inInbox.contains($0.id) }
            let inProgress = ReviewRules.cancellable(orders)
            if pending.isEmpty && inInbox.isEmpty { EmptyStateView(title: L.text("results.none")) }
            else if !pending.isEmpty {
                ListCard(items: pending) { order in
                    NavigationLink { ReviewDetailView(order: order, reload: load) } label: {
                        LabOrderRow(order: order, status: L.text(ReviewRules.rowStatusKey(order)), critical: ReviewRules.isCritical(order),
                                    summary: LabResultView.summary(order.items))
                    }.buttonStyle(.plain)
                }
            }
            if !inProgress.isEmpty {
                ListCard(title: L.text("results.inProgress"), items: inProgress) { order in
                    NavigationLink { ReviewDetailView(order: order, reload: load) } label: {
                        LabOrderRow(order: order, status: order.state.label, critical: false)
                    }.buttonStyle(.plain)
                }
            }
        }
        .task(id: live.snapshot.version(.laboratory)) { await load() }
    }

    private func load() async {
        await loader.load { try await account.client().get("/laboratorio/ordenes", as: [LabOrder].self) }
        await loadFollowUps()
    }

    private func loadFollowUps() async {
        guard account.can("laboratorio.revisar") else { return }
        do {
            let rows = try await account.client().get("/laboratorio/pendientes", as: [LabFollowUp].self)
            followUps = .loaded(LabFollowUpRules.sorted(rows))
        } catch is CancellationError {
        } catch {
            followUps = .failed(error.userMessage)
        }
    }

    private func review(_ item: LabFollowUp) async {
        let body = LabFollowUpRules.reviewBody(version: item.version)
        _ = await followUpSubmission.run(item.id, body: body, success: L.text("results.followUp.done")) { key in
            _ = try await account.client().send("POST", LabFollowUpRules.reviewPath(item.id), body: body, key: key, as: LabFollowUpState.self)
        }
        await loadFollowUps()
    }
}

/// S10 · «Resultados por revisar»: críticos primero (rojo solo para el valor crítico); cada uno se marca revisado.
private struct LabFollowUpInbox: View {
    let items: [LabFollowUp]
    /// The doctor's orders, so a row opens its order (C1: the values and «Revisar y liberar» are one tap away).
    let orders: [LabOrder]
    let submission: Submission
    let review: (LabFollowUp) async -> Void
    let reload: () async -> Void

    var body: some View {
        SectionCard(title: L.text("results.followUp.title")) {
            if items.isEmpty { Text("results.followUp.none").font(Typo.small).foregroundStyle(Theme.muted) }
            ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
                if index > 0 { Divider().overlay(Theme.line) }
                VStack(alignment: .leading, spacing: Spacing.s) {
                    // A relevant observation is not a process state: neutral tag; red only for the critical value.
                    // D69: the tag goes above the name, so the full name keeps the whole width and is never cut.
                    PatientTag(item.critical ? "critico_alto" : "observacion", label: L.text(item.critical ? "results.critical" : "results.followUp.observation"))
                    Text(verbatim: item.patientName ?? L.text("results.followUp.patient")).font(Typo.label).foregroundStyle(Theme.ink)
                        .fixedSize(horizontal: false, vertical: true)
                    if let record = item.patientRecord { Text(verbatim: String(format: L.text("results.followUp.record"), record)).font(Typo.small).foregroundStyle(Theme.muted) }
                    Text(verbatim: item.detail).font(Typo.small).foregroundStyle(Theme.ink)
                    if let order = orders.first(where: { $0.id == item.orderId }) {
                        NavigationLink { ReviewDetailView(order: order, reload: reload) } label: { CrudLabel(kind: .view, label: L.text("results.followUp.open")) }
                            .buttonStyle(ClimesaButtonStyle(kind: .view))
                    }
                    ClimesaButton(title: L.text("results.followUp.review"), kind: .secondary, loading: submission.busyId == item.id) { Task { await review(item) } }
                        .disabled(submission.busy)
                }
            }
            WriteNotice(submission: submission, reload: reload)
        }
    }
}

private struct ReviewDetailView: View {
    /// C2: the order is state, read again after «Enviar a externo» and on each live lab event, so the screen never acts
    /// on a stale version (a second send would hit `version_conflicto`).
    @State private var order: LabOrder
    let reload: () async -> Void
    @EnvironmentObject private var account: AccountModel
    @Environment(LiveViewModel.self) private var live
    @Environment(\.dismiss) private var dismiss
    @State private var submission = Submission()
    @State private var cancelSubmission = Submission()
    @State private var cancelling = false
    @State private var cancelled = false
    @State private var sendingExternal = false
    @State private var externalSubmission = Submission()
    /// The API accepted «Enviar a externo» from this screen: the action is gone even before the order is read again.
    @State private var sentExternal = false
    @State private var loadingExternal = false
    /// What the last external step did («La orden quedó como externa», «Resultado externo guardado»), kept on screen.
    @State private var externalNotice: String?
    /// A failed read of the order; the last copy stays visible with «Reintentar».
    @State private var refreshError: String?
    /// #12 / §4.7: releasing results to the patient is clinical and cannot be undone, so it asks first with a summary.
    @State private var confirmingRelease = false
    /// Set once the API accepted the release: the result stays on this screen instead of closing it in silence.
    @State private var released: String?
    /// Lote 5 S13: the consultation that ordered these exams, read from the patient's record (best effort).
    @State private var origin: LabOrigin?

    init(order: LabOrder, reload: @escaping () async -> Void) {
        _order = State(initialValue: order)
        self.reload = reload
    }

    var body: some View {
        ScreenFrame(title: "results.detail") {
            if let name = order.patientName { Text(verbatim: name).font(Typo.heading).foregroundStyle(Theme.ink) }
            if ReviewRules.isCritical(order) { MedicoAlert(text: L.text("results.critical.notice")) }
            if ReviewRules.isAmendedPendingReview(order) {
                Text("results.amended").font(Typo.label).foregroundStyle(Theme.warning)
            }
            if let refreshError { PartError(message: refreshError, retry: refreshOrder) }
            // Lote 5 S13: how many fell out of range, and the consultation and date that ordered them, before the values.
            if let summary = LabResultView.summary(order.items) {
                Label { Text(verbatim: summary) } icon: { ClimesaIcon(.alert, size: 16) }
                    .font(Typo.label).foregroundStyle(ReviewRules.isCritical(order) ? Theme.danger : Theme.warning)
            }
            if let origin {
                SectionCard(title: L.text("history.lab.why")) {
                    ListRow(title: String(format: L.text("history.lab.origin"), ClimesaDates.display(origin.date, .date)), subtitle: origin.doctor)
                    if let reason = origin.reason { Text(verbatim: reason).font(Typo.small).foregroundStyle(Theme.ink).fixedSize(horizontal: false, vertical: true) }
                    ForEach(origin.diagnoses, id: \.self) { Text(verbatim: $0).font(Typo.small).foregroundStyle(Theme.muted) }
                }
            } else {
                Text(verbatim: String(format: L.text("results.orderedAt"), ClimesaDates.display(order.createdAt, .date))).font(Typo.small).foregroundStyle(Theme.muted)
            }
            LabOrderDetail(order: order, showValues: true, staffView: true)
            // T07c: the external report's photo or PDF, opened through a 5-minute signed link (same rule as the web).
            if order.external && order.state == .completado { LabAttachmentsSection(order: order) }
            if let externalNotice { PatientNotice(text: externalNotice) }
            WriteNotice(submission: submission, reload: refresh)
            if let released {
                PatientNotice(text: released)
            } else {
                // Los botones salen de `allowedActions` de la API para este médico, nunca del rol ni del estado.
                if order.allows(.revisar) {
                    ClimesaButton(title: L.text("results.release"), loading: submission.busy) { submission.clearFailure(); confirmingRelease = true }
                }
                if LabExternalRules.canSend(order, sentHere: sentExternal) {
                    ClimesaButton(title: L.text("results.external.send"), kind: .secondary) { sendingExternal = true }
                }
                if LabExternalRules.canLoadResult(order) {
                    ClimesaButton(title: L.text("results.externalLoad.open"), kind: .secondary) { loadingExternal = true }
                }
                if order.allows(.cancelar) {
                    CrudButton(kind: .deactivate, label: L.text("results.cancel")) { cancelling = true }
                }
            }
            if account.can("expediente.ver") {
                NavigationLink {
                    PatientRecordScreen(patientId: order.patientId)
                } label: { CrudLabel(kind: .view, label: L.text("day.record")) }
                    .buttonStyle(ClimesaButtonStyle(kind: .view))
            }
        }
        .sheet(isPresented: $cancelling, onDismiss: { if cancelled { dismiss() } }) {
            CancelLabOrderSheet(order: order, submission: cancelSubmission, reload: reload) { cancelled = true }
        }
        .sheet(isPresented: $sendingExternal) {
            SendExternalSheet(order: order, submission: externalSubmission, reload: refresh) {
                sentExternal = true
                externalNotice = L.text("results.external.done")
            }
        }
        .sheet(isPresented: $loadingExternal) {
            ExternalResultSheet(order: order, reload: refresh) { message in externalNotice = message }
        }
        .sheet(isPresented: $confirmingRelease) {
            ReleaseResultsSheet(order: order, submission: submission) { followUp, note in await review(followUp: followUp, note: note) }
        }
        // A live lab event (another device, the lab) brings the current version of this order.
        .task(id: live.snapshot.version(.laboratory)) { await refreshOrder() }
        .task(id: order.id) { await loadOrigin() }
    }

    /// Reads the record only to name the consultation that ordered the exams; a failure just leaves the date.
    private func loadOrigin() async {
        guard let consultationId = order.consultationId, account.can("expediente.ver") else { return }
        if let history = try? await account.client().get("/pacientes/\(order.patientId)/historial", as: ClinicalHistory.self) {
            origin = LabOriginRules.of(history, consultationId: consultationId)
        }
    }

    /// The list behind and this order, after a write from this screen.
    private func refresh() async {
        await reload()
        await refreshOrder()
    }

    private func refreshOrder() async {
        do {
            order = try await account.client().get("/laboratorio/ordenes/\(order.id)", as: LabOrder.self)
            refreshError = nil
        } catch is CancellationError {
        } catch {
            refreshError = error.userMessage
        }
    }

    /// The body stays `{version}` unless the doctor turned the follow-up off or wrote a note; true when the API accepted it.
    private func review(followUp: Bool, note: String) async -> Bool {
        let body = ReleaseRules.body(version: order.version, followUp: followUp, note: note)
        var answer: LabReviewResult?
        let ok = await submission.run(order.id, body: body) { key in
            answer = try await account.client().send("POST", "/laboratorio/ordenes/\(order.id)/revisar", body: body, key: key, as: LabReviewResult.self)
        }
        if ok { released = ReleaseRules.done(order, result: answer) }
        await refresh()
        return ok
    }
}

/// C1 (#12, §4.7) · «Revisar y liberar» asks first: what the patient will see (critical values first), the follow-up
/// proposal to reception (on by default, D-4) and an optional note the patient reads with the results. Nothing is sent
/// until the doctor confirms; a refusal keeps the sheet open with its message.
private struct ReleaseResultsSheet: View {
    let order: LabOrder
    let submission: Submission
    let release: @MainActor (_ followUp: Bool, _ note: String) async -> Bool
    @Environment(\.dismiss) private var dismiss
    @State private var followUp = true
    @State private var note = ""
    /// D71: a critical result is released only after this explicit tick.
    @State private var criticalAcknowledged = false

    var body: some View {
        NavigationStack {
            ScreenFrame(title: "results.release.confirm", onClose: { dismiss() }) {
                if ReviewRules.isCritical(order) { MedicoAlert(text: L.text("results.critical.notice")) }
                Text(verbatim: ReleaseRules.summary(order)).font(Typo.body).foregroundStyle(Theme.ink).fixedSize(horizontal: false, vertical: true)
                if ReviewRules.isCritical(order) {
                    // D71: the critical values in red, then the tick the dialog asks for.
                    VStack(alignment: .leading, spacing: Spacing.xs) {
                        ForEach(ReleaseRules.criticalLines(order), id: \.self) { line in
                            Label { Text(verbatim: line).fixedSize(horizontal: false, vertical: true) } icon: { ClimesaIcon(.alert, size: 14) }
                                .font(Typo.label).foregroundStyle(Theme.danger)
                        }
                    }
                    SectionCard {
                        Toggle(isOn: $criticalAcknowledged) {
                            Text(verbatim: ReleaseRules.criticalAcknowledgement).font(Typo.label).foregroundStyle(Theme.ink)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        .tint(Theme.primary)
                        .frame(minHeight: Spacing.control)
                    }
                }
                SectionCard {
                    Toggle(isOn: $followUp) {
                        VStack(alignment: .leading, spacing: Spacing.xs) {
                            Text("results.release.followUp").font(Typo.label).foregroundStyle(Theme.ink)
                            Text("results.release.followUp.hint").font(Typo.small).foregroundStyle(Theme.muted).fixedSize(horizontal: false, vertical: true)
                        }
                    }
                    .tint(Theme.primary)
                    .frame(minHeight: Spacing.control)
                }
                VStack(alignment: .leading, spacing: Spacing.xs) {
                    MedicoTextArea(label: L.text("results.release.note"), text: $note, error: submission.fieldErrors["patientNote"], lines: 2...5)
                    CharacterCounter(count: note.trimmingCharacters(in: .whitespacesAndNewlines).count, range: 0...ReleaseRules.noteMaximum)
                }
                SubmissionNotice(submission: submission)
                // D71 / S12: a disabled release says why under the button.
                ClimesaButton(title: L.text("results.release"), loading: submission.busy,
                              blockedReason: ReleaseRules.canRelease(order, acknowledged: criticalAcknowledged) ? nil : ReleaseRules.criticalBlocked) {
                    Task { if await release(followUp, note) { dismiss() } }
                }
                .disabled(note.trimmingCharacters(in: .whitespacesAndNewlines).count > ReleaseRules.noteMaximum)
            }
        }
    }
}

/// S10 · La orden se hace en otro lugar: el paciente ve el lugar y las instrucciones en «Mis exámenes».
private struct SendExternalSheet: View {
    let order: LabOrder
    let submission: Submission
    let reload: () async -> Void
    /// Called once the API accepted the send, before the order is read again.
    let onSent: () -> Void
    @EnvironmentObject private var account: AccountModel
    @Environment(\.dismiss) private var dismiss
    @State private var place = ""
    @State private var instructions = LabExternalRules.instructionsTemplate
    @State private var problem: String?

    var body: some View {
        NavigationStack {
            ScreenFrame(title: "results.external.send", onClose: { dismiss() }) {
                MedicoTextArea(label: L.text("results.external.place"), text: $place, error: problem ?? submission.fieldErrors["place"], lines: 1...2)
                MedicoTextArea(label: L.text("results.external.instructions"), text: $instructions, error: submission.fieldErrors["instructions"], lines: 3...6)
                WriteNotice(submission: submission, reload: reload)
                ClimesaButton(title: L.text("results.external.confirm"), loading: submission.busy) { Task { await send() } }
            }
        }
    }

    private func send() async {
        problem = LabExternalRules.sendError(place: place, instructions: instructions)
        guard problem == nil else { return }
        let body = LabExternalRules.sendBody(version: order.version, place: place, instructions: instructions)
        let ok = await submission.run(order.id, body: body, success: L.text("results.external.done")) { key in
            _ = try await account.client().send("POST", LabExternalRules.sendPath(order.id), body: body, key: key, as: LabExternalSent.self)
        }
        if ok { onSent() }
        await reload()
        if ok { dismiss() }
    }
}

/// MA-LAB-05 · Cancelar una orden propia en curso con motivo (10 a 500 caracteres, igual que la web).
private struct CancelLabOrderSheet: View {
    let order: LabOrder
    let submission: Submission
    let reload: () async -> Void
    let onCancelled: () -> Void
    @EnvironmentObject private var account: AccountModel
    @Environment(\.dismiss) private var dismiss
    @State private var reason = ""
    @State private var reasonError: String?

    var body: some View {
        NavigationStack {
            ScreenFrame(title: "results.cancel.title", onClose: { dismiss() }) {
                SectionCard {
                    ListRow(title: order.items.map(\.name).joined(separator: ", "), subtitle: order.patientName) {
                        MedicoTag(order.state.rawValue, label: order.state.label)
                    }
                }
                VStack(alignment: .leading, spacing: Spacing.xs) {
                    MedicoTextArea(label: L.text("results.cancel.reason"), text: $reason, error: reasonError ?? submission.fieldErrors["reason"], lines: 3...6)
                    CharacterCounter(count: LabCancelRules.reasonCount(reason), range: LabCancelRules.reasonRange)
                }
                .onChange(of: reason) { _, value in
                    if reasonError != nil { reasonError = LabCancelRules.reasonError(value) }
                }
                WriteNotice(submission: submission, reload: reload)
                ClimesaButton(title: L.text("results.cancel"), kind: .destructive, loading: submission.busy) { Task { await send() } }
            }
        }
    }

    private func send() async {
        reasonError = LabCancelRules.reasonError(reason)
        guard reasonError == nil else { return }
        let body = LabCancelRules.body(version: order.version, reason: reason)
        let ok = await submission.run(order.id, body: body, success: L.text("results.cancel.done")) { key in
            _ = try await account.client().send("POST", LabCancelRules.path(order.id), body: body, key: key, as: LabOrderStateResult.self)
        }
        await reload()
        if ok { onCancelled(); dismiss() }
    }
}

/// I24 · Mis hospitalizados: paciente, cama y estado; firmar o revocar el alta. Cada botón sale de `allowedActions`
/// de la API (BL-03, MA-HOS-02); la solicitud de alta de Recepción y el alta firmada se muestran en la fila.
struct HospitalizedView: View {
    @EnvironmentObject private var account: AccountModel
    @Environment(LiveViewModel.self) private var live
    @State private var loader = Loader<[Admission]>()
    @State private var expanded = false

    var body: some View {
        LoadState(loader: loader, retry: load) { admissions in
            // Row 13: discharge requests first, then signed discharges; two shown, the rest folded.
            let listed = DischargeRules.ranked(admissions)
            if listed.isEmpty { EmptyStateView(title: L.text("hospitalized.none")) }
            ForEach(AttentionFold.shown(listed, expanded: expanded)) { admission in
                HospitalizedRow(admission: admission, actions: HospitalizedRowActions.of(admission), reload: load)
            }
            AttentionFoldToggle(count: listed.count, expanded: $expanded)
        }
        .task(id: live.snapshot.version(.admissions)) { await load() }
    }

    private func load() async { await loader.load { try await account.client().get("/admisiones", as: [Admission].self) } }
}

private struct HospitalizedRow: View {
    let admission: Admission
    let actions: HospitalizedRowActions
    let reload: () async -> Void

    var body: some View {
        SectionCard {
            ListRow(
                title: admission.patientName ?? L.text("day.patient.unknown"),
                subtitle: admission.bed.isEmpty ? L.text("hospitalized.noBed") : String(format: L.text("hospitalized.bed"), admission.bed),
                meta: admission.requestedCategory.label + (admission.isolation ? " · " + L.text("hospitalized.isolation") : "")
            ) { MedicoTag(admission.state.rawValue, label: admission.state.label) }
            if let name = admission.attendingDoctorName, !name.isEmpty {
                Text(verbatim: String(format: L.text("hospitalized.attending"), name)).font(Typo.small).foregroundStyle(Theme.muted)
            }
            if let hint = actions.requestHint {
                HStack(alignment: .top, spacing: Spacing.s) {
                    ClimesaIcon(.bell, size: 18).foregroundStyle(Theme.warning).accessibilityHidden(true)
                    Text(verbatim: hint).font(Typo.small).foregroundStyle(Theme.ink).fixedSize(horizontal: false, vertical: true)
                }
                .padding(Spacing.s).frame(maxWidth: .infinity, alignment: .leading)
                .background(Theme.warningSoft, in: RoundedRectangle(cornerRadius: Radius.control))
                .accessibilityElement(children: .combine)
            }
            if let discharge = actions.discharge { SignedDischarge(discharge: discharge) }
            if actions.sign {
                NavigationLink { DischargeView(admission: admission, reload: reload) } label: { Text("hospitalized.discharge") }
                    .buttonStyle(ClimesaButtonStyle(kind: .secondary))
            }
            // S13: revoking undoes a signed discharge, so it reads as destructive and asks for confirmation.
            if actions.revoke {
                NavigationLink { RevokeDischargeView(admission: admission, reload: reload) } label: { Text("hospitalized.revoke") }
                    .buttonStyle(ClimesaButtonStyle(kind: .destructive))
            }
        }
    }
}

/// Alta firmada vigente: tipo, quién y cuándo, y los pendientes con su responsable (RN-11).
private struct SignedDischarge: View {
    let discharge: Admission.Discharge

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.xs) {
            Text(verbatim: discharge.kind.map { String(format: L.text("hospitalized.discharge.signed"), $0.label) } ?? L.text("hospitalized.discharge.signedNoType"))
                .font(Typo.label).foregroundStyle(Theme.ink)
            Text(verbatim: String(format: L.text("hospitalized.discharge.signedBy"), discharge.signedByName ?? "—", ClimesaDates.short(discharge.signedAt)))
                .font(Typo.small).foregroundStyle(Theme.muted)
            if discharge.specialHandling {
                Text("hospitalized.discharge.specialHandling").font(Typo.small).foregroundStyle(Theme.ink).fixedSize(horizontal: false, vertical: true)
            }
            if let pending = discharge.pending, !pending.isEmpty {
                ForEach(Array(pending.enumerated()), id: \.offset) { _, item in
                    Text(verbatim: String(format: L.text("hospitalized.discharge.pendingItem"), item.description, item.responsible))
                        .font(Typo.small).foregroundStyle(Theme.ink).fixedSize(horizontal: false, vertical: true)
                }
            } else if discharge.pending == nil, discharge.pendingCount > 0 {
                Text(verbatim: String(format: L.text("hospitalized.discharge.pendingCount"), discharge.pendingCount))
                    .font(Typo.small).foregroundStyle(Theme.muted).fixedSize(horizontal: false, vertical: true)
            } else {
                Text("hospitalized.discharge.noPending").font(Typo.small).foregroundStyle(Theme.muted)
            }
        }
        .accessibilityElement(children: .combine)
    }
}

private struct PendingLine: Identifiable {
    let id = UUID()
    var description = ""
    var responsible = ""
}

/// D89 · «Quién responde»: the usual teams in a menu, and «Otro» opens a text field for a name or team not listed.
private struct ResponsibleField: View {
    @Binding var responsible: String
    @State private var other = false
    private let options = DischargeRules.pendingResponsibles

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.s) {
            Text(verbatim: L.text("discharge.pending.responsible")).font(Typo.label).foregroundStyle(Theme.ink)
            Menu {
                ForEach(options, id: \.self) { option in
                    Button(option) { other = false; responsible = option }
                }
                Button(DischargeRules.otherResponsible) {
                    other = true
                    if options.contains(responsible) { responsible = "" }
                }
            } label: {
                HStack(spacing: Spacing.s) {
                    Text(verbatim: shown).font(Typo.body).foregroundStyle(responsible.isEmpty && !other ? Theme.muted : Theme.ink)
                    Spacer(minLength: Spacing.s)
                    Image(systemName: "chevron.up.chevron.down").font(Typo.small).foregroundStyle(Theme.muted).accessibilityHidden(true)
                }
                .padding(.horizontal, Spacing.m).frame(maxWidth: .infinity, minHeight: Spacing.control)
                .background(Theme.surface, in: RoundedRectangle(cornerRadius: Radius.control))
                .overlay(RoundedRectangle(cornerRadius: Radius.control).stroke(Theme.controlLine, lineWidth: 1))
                .contentShape(Rectangle())
            }
            if other { FormField(label: DischargeRules.otherResponsibleField, text: $responsible) }
        }
        .onAppear { other = !responsible.isEmpty && !options.contains(responsible) }
    }

    private var shown: String {
        if other { return DischargeRules.otherResponsible }
        return responsible.isEmpty ? DischargeRules.pickResponsible : responsible
    }
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
    @State private var confirming = false
    /// G3: the signature stays visible where it was made ("Alta firmada · Recepción registrará la salida").
    @State private var signed = false

    var body: some View {
        ScreenFrame(title: "hospitalized.discharge") {
            Text(verbatim: admission.patientName ?? L.text("day.patient.unknown")).font(Typo.heading).foregroundStyle(Theme.ink)
            if signed {
                PatientNotice(text: DischargeConfirmRules.signedNotice)
                ClimesaButton(title: L.text("discharge.done.back"), kind: .secondary) { dismiss() }
            } else {
                form
            }
        }
    }

    @ViewBuilder private var form: some View {
            SectionCard {
                VStack(alignment: .leading, spacing: Spacing.s) {
                    Text("discharge.type").font(Typo.label).foregroundStyle(Theme.ink)
                    Picker("discharge.type", selection: $type) {
                        ForEach(DischargeType.allCases, id: \.self) { Text(verbatim: $0.label).tag($0) }
                    }.pickerStyle(.menu).tint(Theme.primary)
                    FieldError(text: submission.fieldErrors["type"])
                }
                VStack(alignment: .leading, spacing: Spacing.xs) {
                    // D88: the length rule shows under the field while typing, never only after the tap.
                    MedicoTextArea(label: L.text("discharge.summary"), text: $summary,
                                   error: DischargeRules.summaryError(summary) ?? errors["summary"] ?? submission.fieldErrors["summary"])
                    CharacterCounter(count: summary.trimmingCharacters(in: .whitespacesAndNewlines).count, range: 10...2000)
                }
                if type == .voluntaria {
                    Toggle("discharge.consent", isOn: $consent).font(Typo.body).tint(Theme.primary)
                    FieldError(text: errors["voluntaryConsent"] ?? submission.fieldErrors["voluntaryConsent"])
                }
            }
            SectionCard(title: L.text("discharge.pending")) {
                // I-38: each pending item removes with a 44 pt icon; adding is a text button, not two full-width buttons per item.
                ForEach($pending) { $line in
                    if line.id != pending.first?.id { Divider().overlay(Theme.line) }
                    HStack(alignment: .top, spacing: Spacing.s) {
                        VStack(alignment: .leading, spacing: Spacing.m) {
                            FormField(label: L.text("discharge.pending.description"), text: $line.description)
                            // D89: a choice of the usual teams, with «Otro» for anyone not listed.
                            ResponsibleField(responsible: $line.responsible)
                            FieldError(text: DischargeRules.pendingLineError(description: line.description, responsible: line.responsible))
                        }
                        Button {
                            let id = line.id
                            pending.removeAll { $0.id == id }
                        } label: {
                            ClimesaIcon(.close, size: 22).frame(width: 44, height: 44).contentShape(Rectangle())
                        }
                        .foregroundStyle(Theme.muted)
                        .accessibilityLabel(Text("discharge.pending.remove"))
                    }
                }
                FieldError(text: errors["pending"] ?? submission.fieldErrors["pending"])
                Button { pending.append(PendingLine()) } label: {
                    Label { Text("discharge.pending.add") } icon: { ClimesaIcon(.plus, size: 18) }
                        .font(Typo.label).frame(minHeight: 44).contentShape(Rectangle())
                }
                .foregroundStyle(Theme.primaryText)
            }
            WriteNotice(submission: submission, reload: reload)
            ClimesaButton(title: L.text("discharge.sign"), loading: submission.busy) {
                // Check the form first, so the confirmation only appears when the signature can go through.
                errors = DischargeRules.errors(type: type, summary: summary, voluntaryConsent: consent, pending: lines)
                if errors.isEmpty { confirming = true }
            }
            .confirmationDialog(L.text("discharge.sign.confirm"), isPresented: $confirming, titleVisibility: .visible) {
                // D87: the signature cannot be undone by this screen, so it reads apart from «Cancelar».
                Button(L.text("discharge.sign"), role: .destructive) { Task { await sign() } }
            } message: {
                // §4.7: who, what type, the pending items and the summary, before the signature.
                Text(verbatim: DischargeConfirmRules.signRecap(patient: admission.patientName, type: type, pendingCount: lines.count, summary: summary))
            }
    }

    private var lines: [DischargePendingBody] {
        pending.map { DischargePendingBody(description: $0.description.trimmingCharacters(in: .whitespaces), responsible: $0.responsible.trimmingCharacters(in: .whitespaces)) }
    }

    private func sign() async {
        let lines = self.lines
        errors = DischargeRules.errors(type: type, summary: summary, voluntaryConsent: consent, pending: lines)
        guard errors.isEmpty else { return }
        let text = summary.trimmingCharacters(in: .whitespacesAndNewlines)
        let body = DischargeBody(type: type, version: admission.version, summary: text.isEmpty ? nil : text, voluntaryConsent: type == .voluntaria ? consent : nil, pending: lines)
        let ok = await submission.run(admission.id, body: body) { key in
            _ = try await account.client().send("POST", "/admisiones/\(admission.id)/alta", body: body, key: key, as: AdmissionCommandResult.self)
        }
        if ok { signed = true }
        await reload()
    }
}

/// MA-HOS-02 · Revocar un alta firmada mientras no haya salida: vuelve a hospitalizado, con motivo (10 a 500).
private struct RevokeDischargeView: View {
    let admission: Admission
    let reload: () async -> Void
    @EnvironmentObject private var account: AccountModel
    @Environment(\.dismiss) private var dismiss
    @State private var submission = Submission()
    @State private var reason = ""
    @State private var reasonError: String?
    @State private var confirming = false

    var body: some View {
        ScreenFrame(title: "hospitalized.revoke") {
            Text(verbatim: admission.patientName ?? L.text("day.patient.unknown")).font(Typo.heading).foregroundStyle(Theme.ink)
            if let discharge = admission.discharge { SectionCard { SignedDischarge(discharge: discharge) } }
            SectionCard {
                Text("revoke.intro").font(Typo.small).foregroundStyle(Theme.muted)
                VStack(alignment: .leading, spacing: Spacing.xs) {
                    MedicoTextArea(label: L.text("revoke.reason"), text: $reason, error: reasonError ?? submission.fieldErrors["reason"], lines: 3...6)
                    CharacterCounter(count: DischargeRevocationRules.reasonCount(reason), range: DischargeRevocationRules.reasonRange)
                }
                .onChange(of: reason) { _, value in
                    if reasonError != nil { reasonError = DischargeRevocationRules.reasonError(value) }
                }
            }
            WriteNotice(submission: submission, reload: reload)
            ClimesaButton(title: L.text("hospitalized.revoke"), kind: .destructive, loading: submission.busy) {
                reasonError = DischargeRevocationRules.reasonError(reason)
                if reasonError == nil { confirming = true }
            }
            .confirmationDialog(L.text("revoke.confirm"), isPresented: $confirming, titleVisibility: .visible) {
                Button(L.text("hospitalized.revoke"), role: .destructive) { Task { await revoke() } }
            } message: {
                Text(verbatim: DischargeConfirmRules.revokeSummary)
            }
        }
    }

    private func revoke() async {
        reasonError = DischargeRevocationRules.reasonError(reason)
        guard reasonError == nil else { return }
        let body = DischargeRevocationBody(version: admission.version, reason: reason)
        let ok = await submission.run(admission.id, body: body) { key in
            _ = try await account.client().send("POST", "/admisiones/\(admission.id)/revocar-alta", body: body, key: key, as: AdmissionCommandResult.self)
        }
        await reload()
        if ok { dismiss() }
    }
}

struct AmbulanceArrival: Sendable {
    var status: AmbulanceStatus
    var prehospital: PrehospitalView?
    var services: [ArrivalService.Candidate] = []
}

/// I25 · Llegada de ambulancia: prioridad, hora estimada, motivo y signos del reporte prehospital.
/// MA-AMB-04: "Marcar recibido" solo aparece cuando la API lo ofrece (`allowedActions`), después de la llegada al hospital.
struct AmbulanceArrivalView: View {
    @EnvironmentObject private var account: AccountModel
    @Environment(LiveViewModel.self) private var live
    @State private var loader = Loader<AmbulanceArrival>()
    @State private var submission = Submission()
    @State private var chosen: String?
    /// §4.7: receiving the patient is recorded with the doctor's name and time, so it asks first.
    @State private var confirmingReceive = false

    var body: some View {
        LoadState(loader: loader, retry: load) { arrival in
            // MA-AMB-04: un servicio que llegó sin entrega sigue en la lista aunque la unidad salga a otro.
            if arrival.services.count > 1 {
                SectionCard(title: L.text("arrival.pending")) {
                    ForEach(arrival.services) { candidate in
                        Button {
                            chosen = candidate.serviceId
                            Task { await load() }
                        } label: {
                            ListRow(title: String(format: L.text(candidate.arrived ? "arrival.pending.arrived" : "arrival.pending.onTheWay"), ClimesaDates.display(candidate.dispatchedAt, .time))) {
                                if candidate.serviceId == arrival.prehospital?.serviceId { ClimesaIcon(.check, size: 18).foregroundStyle(Theme.ink) }
                            }
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            if let service = arrival.status.activeService {
                SectionCard {
                    ListRow(
                        title: arrival.status.unit.plate,
                        subtitle: "\(service.origin) → \(service.destination)",
                        meta: String(format: L.text("arrival.dispatched"), ClimesaDates.display(service.dispatchedAt, .time))
                    ) { MedicoTag(service.priority.rawValue, label: service.priority.label) }
                }
            }
            if let view = arrival.prehospital {
                handover(view)
                if !view.clinical { Text("arrival.noClinical").font(Typo.small).foregroundStyle(Theme.muted) }
                if view.reports.isEmpty { Text("arrival.noReport").font(Typo.small).foregroundStyle(Theme.muted) }
                ForEach(view.reports) { report in PrehospitalReportCard(report: report) }
            } else if arrival.status.activeService != nil {
                Text("arrival.noReport").font(Typo.small).foregroundStyle(Theme.muted)
            } else {
                EmptyStateView(title: L.text("arrival.none"))
            }
        }
        .task(id: live.snapshot.version(.ambulance)) { await load() }
    }

    @ViewBuilder private func handover(_ view: PrehospitalView) -> some View {
        SectionCard(title: L.text("arrival.handover")) {
            if let done = view.handover {
                MedicoTag("atendido", label: L.text("arrival.received"))
                Text(verbatim: String(format: L.text("arrival.receivedBy"), done.receivedByName ?? L.text("arrival.clinicalStaff"), ClimesaDates.display(done.receivedAt, .time)))
                    .font(Typo.body).foregroundStyle(Theme.ink)
                // A54: after the handover comes the admission, which Recepción records with origin «Ambulancia».
                Text("arrival.nextAdmission").font(Typo.small).foregroundStyle(Theme.muted)
            } else if view.canReceive {
                ClimesaButton(title: L.text("arrival.receive"), loading: submission.busy) { submission.clearFailure(); confirmingReceive = true }
                    .confirmationDialog(L.text("arrival.receive.confirm"), isPresented: $confirmingReceive, titleVisibility: .visible) {
                        Button(L.text("arrival.receive")) { Task { await receive(view) } }
                    } message: {
                        Text("arrival.receive.confirm.message")
                    }
            } else {
                Text(verbatim: L.text(view.arrived == true ? "arrival.receive.otherRole" : "arrival.receive.wait")).font(Typo.small).foregroundStyle(Theme.muted)
            }
            // Outside the branches: a refusal stays visible even when the reload changes what this card offers.
            SubmissionNotice(submission: submission)
        }
    }

    private func receive(_ view: PrehospitalView) async {
        guard !submission.busy else { return }
        let body = EmptyBody()
        _ = await submission.run(view.serviceId, body: body, success: L.text("arrival.receive.done")) { key in
            _ = try await account.client().send("POST", "/ambulancia/servicios/\(view.serviceId)/recepcion", body: body, key: key, as: HandoverResult.self)
        }
        await load()
    }

    private func load() async {
        await loader.load {
            let api = try account.client()
            let status = try await api.get("/ambulancia", as: AmbulanceStatus.self)
            // MA-AMB-04: la API lista qué recibir (también después de que la tripulación finalizó, mientras falte la entrega, 24 h).
            let pending = try await api.get("/ambulancia/llegada", as: ArrivalService.self)
            var arrival = AmbulanceArrival(status: status, prehospital: nil, services: pending.services)
            if let serviceId = pending.pick(chosen) {
                arrival.prehospital = try await api.get("/ambulancia/servicios/\(serviceId)/prehospital", as: PrehospitalView.self)
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
                Text(verbatim: ClimesaDates.display(report.capturedAt, .time)).font(Typo.time).foregroundStyle(Theme.muted)
            }
            if let eta = report.estimatedArrival { Text(verbatim: String(format: L.text("arrival.eta"), ClimesaDates.display(eta, .time))).font(Typo.heading).foregroundStyle(Theme.ink) }
            if let reason = report.reason { Text(verbatim: reason).font(Typo.body).foregroundStyle(Theme.ink) }
            if let signs = report.vitalSigns, !signs.isEmpty {
                // I-21: Spanish names and units, never the raw API key.
                ForEach(VitalSignLabels.ordered(Array(signs.keys)), id: \.self) { key in
                    HStack {
                        Text(verbatim: VitalSignLabels.label(key)).font(Typo.small).foregroundStyle(Theme.muted)
                        Spacer()
                        Text(verbatim: VitalSignLabels.value(key, signs[key]?.text ?? "")).font(Typo.body).monospacedDigit().foregroundStyle(Theme.ink)
                    }
                    .accessibilityElement(children: .combine)
                }
            }
        }
    }
}

/// CITA-02: el médico rechaza el cambio de horario pedido por el paciente, con motivo (10 a 500 caracteres).
private struct RejectRescheduleSheet: View {
    let appointment: Appointment
    let submission: Submission
    let reload: () async -> Void
    @EnvironmentObject private var account: AccountModel
    @Environment(\.dismiss) private var dismiss
    @State private var reason = ""

    private var trimmed: String { reason.trimmingCharacters(in: .whitespacesAndNewlines) }

    var body: some View {
        NavigationStack {
            ScreenFrame(title: "day.reschedules.reject.title", onClose: { dismiss() }) {
                SectionCard {
                    ListRow(title: appointment.patientName ?? L.text("day.patient.unknown"), subtitle: ClimesaDates.short(appointment.start),
                            meta: appointment.reschedule.map { "→ \(ClimesaDates.short($0.start))" })
                }
                MedicoTextArea(label: L.text("day.reschedules.reject.reason"), text: $reason, error: submission.fieldErrors["reason"], lines: 3...6)
                CharacterCounter(count: trimmed.count, range: 10...500)
                WriteNotice(submission: submission, reload: reload)
                ClimesaButton(title: L.text("day.reschedules.reject"), kind: .destructive, loading: submission.busy) { Task { await send() } }
                    .disabled(!(10...500).contains(trimmed.count))
            }
        }
    }

    private func send() async {
        guard let request = appointment.reschedule else { return }
        let body = RescheduleDecisionBody(version: request.version, rejectionReason: trimmed)
        let ok = await submission.run(request.id, body: body, success: L.text("day.reschedules.rejected")) { key in
            _ = try await account.client().send("POST", "/citas/reprogramaciones/\(request.id)/rechazar", body: body, key: key, as: AppointmentCommandResult.self)
        }
        await reload()
        if ok { dismiss() }
    }
}
