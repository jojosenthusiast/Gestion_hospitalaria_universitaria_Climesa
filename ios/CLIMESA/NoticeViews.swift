import SwiftUI
import Observation

// Fase 2, S11 · Avisos en su propia área (espejo de web/src/features/avisos). La bandeja sale de
// `GET /me/avisos/bandeja`; «Enterado» y «Recordarme en N h» son `POST /me/avisos/{id}/enterado|posponer`.
// El inicio solo muestra los avisos `destacado` (críticos dirigidos al rol o al área, sin «Enterado» ni posponer).

/// Bandeja de avisos de la cuenta. Cada lectura nueva cancela la anterior y una respuesta vieja nunca pisa a una nueva.
@MainActor @Observable
final class NoticeInboxModel {
    enum Verb: String { case enterado, posponer }

    private(set) var inbox: NoticeInbox?
    private(set) var loading = false
    private(set) var error: String?
    /// Avisos atendidos aquí que la siguiente lectura todavía no refleja; se vacía al llegar esa lectura.
    private(set) var hidden: Set<String> = []
    /// One flag spans the whole action (write, then reread), so a double tap cannot submit twice.
    private(set) var busy = false
    /// Notice whose last action failed; its message shows only under that notice, never under another one.
    private(set) var failedNotice: String?
    let submission = Submission()
    private var current: Task<Void, Never>?
    private var generation = 0

    nonisolated init() {}

    func load(_ makeClient: () throws -> APIClient) async {
        current?.cancel()
        generation += 1
        let mine = generation
        let api: APIClient
        do { api = try makeClient() } catch { self.error = error.userMessage; return }
        loading = true
        let task = Task { [weak self] in
            let result: Result<NoticeInbox, Error>
            do { result = .success(try await api.get("/me/avisos/bandeja", as: NoticeInbox.self)) } catch { result = .failure(error) }
            guard let self, mine == self.generation else { return }
            self.loading = false
            switch result {
            case let .success(value):
                self.inbox = value; self.error = nil; self.hidden = []
            case let .failure(failure):
                if !(failure is CancellationError) { self.error = failure.userMessage }
            }
        }
        current = task
        await withTaskCancellationHandler { await task.value } onCancel: { task.cancel() }
    }

    /// «Enterado» o «Recordarme»: la escritura con su `Idempotency-Key` (una intención por aviso y acción) y después
    /// una sola lectura de la bandeja. Un rechazo se explica en español y la lista se vuelve a leer igual.
    func send(_ verb: Verb, _ notice: InboxNotice, success: String? = nil, _ makeClient: () throws -> APIClient) async {
        guard !busy else { return }
        busy = true
        failedNotice = notice.id
        defer { busy = false }
        let api: APIClient
        do { api = try makeClient() } catch { submission.error = error.userMessage; return }
        let body = EmptyBody()
        let path = "/me/avisos/\(notice.id)/\(verb.rawValue)"
        let ok = await submission.run("\(notice.id)-\(verb.rawValue)", body: body, success: success) { key in
            _ = try await api.send("POST", path, body: body, key: key, as: NoticeAck.self)
        }
        if ok { hidden.insert(notice.id); failedNotice = nil } else if let failure = submission.lastFailure { submission.error = NoticeRules.actionMessage(failure) }
        await load(makeClient)
    }

    func clearMessages() { submission.error = nil; submission.notice = nil; failedNotice = nil }
}

extension View {
    /// Lee la bandeja al entrar y con cada evento `aviso.*` (tiempo real), y una sola vez más en su `proximoCambio`
    /// (vence o empieza un aviso, o vuelve un recordatorio). Sin sondeo: salir de la pantalla cancela la espera.
    @MainActor func loadsNoticeInbox(_ model: NoticeInboxModel, account: AccountModel, live: LiveViewModel) -> some View {
        self
            .task(id: live.snapshot.version(.notices)) { await model.load { try account.client() } }
            .task(id: model.inbox?.nextChange) {
                await reloadAt(delay: model.inbox?.refreshDelay(now: Date())) { await model.load { try account.client() } }
            }
    }
}

// MARK: - Inicio

/// S11 · Aviso crítico persistente en el inicio. Se queda hasta «Enterado»; «Recordarme en N h» lo aparta y vuelve
/// solo cuando la API lo anuncia en `proximoCambio`. El inicio lo muestra solo si hay algún aviso destacado.
struct CriticalNoticeBanner: View {
    let model: NoticeInboxModel
    @EnvironmentObject private var account: AccountModel

    var body: some View {
        let pending = NoticeRules.banner(model.inbox, hiding: model.hidden)
        if let notice = pending.first {
            let hours = NoticeRules.hoursText(model.inbox?.reminderHours ?? 4)
            HStack(alignment: .top, spacing: Spacing.m) {
                ClimesaIcon(.alert, size: 22)
                    .foregroundStyle(Theme.critical).accessibilityHidden(true)
                VStack(alignment: .leading, spacing: Spacing.m) {
                    HStack(spacing: Spacing.s) {
                        NoticeLevelBadge(level: .critico)
                        if pending.count > 1 {
                            Text(verbatim: String(format: L.text("notices.banner.more"), pending.count)).font(Typo.small).foregroundStyle(Theme.ink)
                        }
                    }
                    Text(verbatim: notice.title).font(Typo.heading).foregroundStyle(Theme.ink)
                        .fixedSize(horizontal: false, vertical: true).accessibilityAddTraits(.isHeader)
                    Text(verbatim: notice.body).font(Typo.body).foregroundStyle(Theme.ink).fixedSize(horizontal: false, vertical: true)
                    if model.failedNotice == notice.id, let error = model.submission.error { PatientNotice(text: error, failure: true) }
                    // Inside a home screen the screen keeps its own primary: «Enterado» is secondary.
                    ClimesaButton(title: L.text("notices.ack"), kind: .secondary, loading: model.busy) {
                        Task { await model.send(.enterado, notice) { try account.client() } }
                    }
                    if NoticeRules.canSnooze(notice) {
                        ClimesaButton(title: String(format: L.text("notices.snooze"), hours), kind: .secondary) {
                            Task { await model.send(.posponer, notice) { try account.client() } }
                        }
                        .disabled(model.busy)
                    }
                    NavigationLink {
                        ScreenFrame(title: "section.avisos") { NoticesView(initialFilter: .criticos) }
                    } label: {
                        HStack(spacing: Spacing.xs) {
                            Text("notices.banner.open").font(Typo.label)
                            ClimesaIcon(.chevron, size: 14).accessibilityHidden(true)
                        }
                        .foregroundStyle(Theme.primaryText)
                        .frame(minHeight: 44)
                    }
                }
            }
            .padding(Spacing.l)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Theme.criticalSoft, in: RoundedRectangle(cornerRadius: Radius.card))
            .overlay { CriticalBorder() }
            .accessibilityElement(children: .contain)
        }
    }
}

/// Borde doble del patrón «crítico» (02-sistema §3): se distingue sin color.
private struct CriticalBorder: View {
    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: Radius.card).strokeBorder(Theme.critical, lineWidth: 1.5)
            RoundedRectangle(cornerRadius: Radius.card - 3).strokeBorder(Theme.critical.opacity(0.6), lineWidth: 1).padding(3)
        }
        .accessibilityHidden(true)
    }
}

// MARK: - Avisos

/// Avisos (bandeja de pendientes, 02-sistema §5): filtros Todos / Sin leer / Críticos, lista y detalle con «Enterado».
struct NoticesView: View {
    @EnvironmentObject private var account: AccountModel
    @Environment(LiveViewModel.self) private var live
    /// D1: the session's inbox, shared with Inicio and the badge; opening Avisos reads it again.
    @Environment(NoticeInboxModel.self) private var model
    @State private var filter: NoticeFilter
    /// Expired notices stay folded under «Ver avisos vencidos (N)», like past appointments.
    @State private var showPast = false

    init(initialFilter: NoticeFilter = .todos) { _filter = State(initialValue: initialFilter) }

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.l) {
            // Each chip wears the tag it filters: «Sin leer» the waiting stripes, «Críticos» the double red border.
            FlowLayout(spacing: Spacing.s) {
                ForEach(NoticeFilter.allCases, id: \.self) { option in
                    StatusFilterChip(label: option.label, count: model.inbox.flatMap { NoticeRules.count($0, option) },
                                     status: option.statusValue, selected: filter == option) { filter = option }
                }
            }
            .accessibilityElement(children: .contain)
            .accessibilityLabel(Text("notices.filter"))
            if let inbox = model.inbox {
                if let error = model.error { PartError(message: error, retry: reload) }
                list(inbox)
            } else if let error = model.error {
                ErrorStateView(message: error) { Task { await reload() } }
            } else {
                Skeleton()
            }
        }
        // RoleTabsView already follows live events for the shared inbox. A second loader here would cancel that fetch and,
        // on leaving Avisos, could leave the badge stale; so opening Avisos only reads it once, in a task not tied to the view.
        .onAppear { Task { await reload() } }
    }

    private func reload() async { await model.load { try account.client() } }

    @ViewBuilder private func list(_ inbox: NoticeInbox) -> some View {
        let items = NoticeRules.filter(inbox.notices, by: filter)
        if inbox.notices.isEmpty {
            EmptyStateView(title: L.text("notices.empty.title"), message: L.text("notices.empty.body"))
        } else if items.isEmpty {
            EmptyStateView(title: L.text(filter == .criticos ? "notices.empty.critical" : "notices.empty.read"), message: L.text("notices.empty.filter"))
        } else {
            let timeline = NoticeRules.timeline(items)
            if !timeline.current.isEmpty {
                SectionCard(title: L.text("notices.group.current")) { rows(timeline.current) }
            } else if !timeline.upcoming.isEmpty || timeline.pastCount > 0 {
                SectionCard(title: L.text("notices.group.current")) { EmptyNote("notices.group.current.none") }
            }
            ForEach(timeline.upcoming) { day in
                SectionCard(title: String(format: L.text("notices.group.scheduled"), ClimesaDates.shortDay(day.day))) { rows(day.notices) }
            }
            if timeline.pastCount > 0 {
                SectionCard {
                    DisclosureGroup(isExpanded: $showPast) {
                        ForEach(timeline.past) { day in
                            Text(verbatim: ClimesaDates.shortDay(day.day)).font(Typo.eyebrow).foregroundStyle(Theme.muted)
                                .textCase(.uppercase).padding(.top, Spacing.s).accessibilityAddTraits(.isHeader)
                            rows(day.notices)
                        }
                    } label: {
                        Text(verbatim: NoticeRules.pastTitle(timeline.pastCount)).font(Typo.label).foregroundStyle(Theme.ink).frame(minHeight: 44)
                    }
                    .tint(Theme.primaryText)
                }
            }
        }
    }

    @ViewBuilder private func rows(_ notices: [InboxNotice]) -> some View {
        ForEach(Array(notices.enumerated()), id: \.element.id) { index, notice in
            if index > 0 { Divider().overlay(Theme.line) }
            NavigationLink { NoticeDetailView(snapshot: notice, model: model) } label: { NoticeRow(notice: notice) }
                .buttonStyle(.plain)
        }
    }
}

/// Fila de la bandeja: nivel (Informativo / Importante / Crítico) y su estado con la familia común — «Sin leer» en
/// espera, «Enterado» terminado, «Programado» en espera, «Vencido» cerrado —, título y fechas cortas sin año.
private struct NoticeRow: View {
    let notice: InboxNotice

    var body: some View {
        let unread = notice.state == .vigente && notice.acknowledgedAt == nil
        let tag = NoticeRules.tag(notice)
        HStack(alignment: .center, spacing: Spacing.m) {
            VStack(alignment: .leading, spacing: Spacing.s) {
                FlowLayout(spacing: Spacing.s) {
                    NoticeLevelBadge(level: notice.level)
                    StatusBadge(tag.value, label: tag.label)
                }
                Text(verbatim: notice.title).font(unread ? Typo.subheading : Typo.body)
                    .foregroundStyle(notice.state == .vencido ? Theme.muted : Theme.ink).fixedSize(horizontal: false, vertical: true)
                let meta = NoticeRules.whenText(notice)
                if !meta.isEmpty { Text(verbatim: meta).font(Typo.small).foregroundStyle(Theme.muted) }
            }
            Spacer(minLength: Spacing.s)
            ClimesaIcon(.chevron, size: 14).foregroundStyle(Theme.muted).accessibilityHidden(true)
        }
        .padding(.vertical, Spacing.m)
        .frame(minHeight: Spacing.control)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }
}

/// Detalle de un aviso: la tarjeta, sus fechas y la acción principal «Enterado» mientras falte.
struct NoticeDetailView: View {
    let snapshot: InboxNotice
    let model: NoticeInboxModel
    @EnvironmentObject private var account: AccountModel

    var body: some View {
        // Shows the latest copy after an action rereads the inbox; the snapshot stays if the notice left the list.
        let notice = model.inbox?.notices.first(where: { $0.id == snapshot.id }) ?? snapshot
        let hours = NoticeRules.hoursText(model.inbox?.reminderHours ?? 4)
        ScreenFrame(title: "notices.detail") {
            InboxNoticeCard(notice: notice)
            SectionCard {
                HStack { Spacer(); StatusBadge(NoticeRules.tag(notice).value, label: NoticeRules.tag(notice).label) }
                Divider().overlay(Theme.line)
                MetaLine(label: L.text(notice.state == .programado ? "notices.starts" : "notices.published"),
                         value: (notice.state == .programado ? notice.from : notice.publishedAt).map { ClimesaDates.short($0) })
                Divider().overlay(Theme.line)
                MetaLine(label: L.text("notices.until"), value: notice.until.map { ClimesaDates.short($0) })
                if let remind = notice.remindAt, NoticeRules.canAcknowledge(notice) {
                    Divider().overlay(Theme.line)
                    MetaLine(label: L.text("notices.remind"), value: ClimesaDates.short(remind))
                }
            }
            if model.failedNotice == notice.id, let error = model.submission.error { PatientNotice(text: error, failure: true) }
            if let done = model.submission.notice { PatientNotice(text: done) }
            if let acknowledged = notice.acknowledgedAt {
                Label {
                    Text(verbatim: "\(L.text("notices.read")) · \(ClimesaDates.short(acknowledged))").font(Typo.small)
                } icon: {
                    ClimesaIcon(.mail, size: 18).accessibilityHidden(true)
                }
                .foregroundStyle(Theme.muted)
            } else if NoticeRules.canAcknowledge(notice) {
                ClimesaButton(title: L.text("notices.ack"), loading: model.busy) {
                    Task { await model.send(.enterado, notice) { try account.client() } }
                }
                if NoticeRules.canSnooze(notice) {
                    ClimesaButton(title: String(format: L.text("notices.snooze"), hours), kind: .secondary) {
                        Task { await model.send(.posponer, notice, success: String(format: L.text("notices.snooze.done"), hours)) { try account.client() } }
                    }
                    .disabled(model.busy)
                }
            }
        }
        .onAppear { model.clearMessages() }
    }
}

private struct MetaLine: View {
    let label: String
    let value: String?
    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(verbatim: label).font(Typo.small).foregroundStyle(Theme.muted)
            Spacer(minLength: Spacing.m)
            Text(verbatim: value ?? "—").font(Typo.body).foregroundStyle(Theme.ink).multilineTextAlignment(.trailing)
        }
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Piezas

/// Nivel de un aviso con ícono + etiqueta (S7): el color acompaña, nunca va solo; el rojo es solo de «Crítico».
struct NoticeLevelBadge: View {
    let level: NoticeLevel

    var body: some View {
        let colors = Theme.colors(for: level.priority)
        let critical = level == .critico
        let shape = RoundedRectangle(cornerRadius: Radius.chip)
        HStack(spacing: 6) {
            ClimesaIcon(level.icon, size: 14).accessibilityHidden(true)
            Text(verbatim: level.label).lineLimit(1)
        }
        .font(Typo.tag)
        .foregroundStyle(critical ? Theme.onStatus : colors.strong)
        .padding(.horizontal, 8).padding(.vertical, 3)
        .background(colors.soft, in: shape)
        .overlay(shape.strokeBorder(colors.strong, lineWidth: 1))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(verbatim: "Nivel \(level.label)"))
    }
}

/// Tarjeta de un aviso de la bandeja (`NoticeCard` de la web): tono por nivel, título, texto, para quién y hasta cuándo.
struct InboxNoticeCard: View {
    let notice: InboxNotice

    var body: some View {
        let tone: (strong: Color, soft: Color) = {
            switch notice.level {
            case .critico: return (Theme.critical, Theme.criticalSoft)
            case .importante: return (Theme.priorityUrgente, Theme.priorityUrgenteSoft)
            case .informativo: return (Theme.primaryText, Theme.surface)
            }
        }()
        HStack(alignment: .top, spacing: Spacing.m) {
            ClimesaIcon(notice.level == .informativo ? notice.level.icon : .alert, size: 20)
                .foregroundStyle(tone.strong).accessibilityHidden(true)
            VStack(alignment: .leading, spacing: Spacing.s) {
                NoticeLevelBadge(level: notice.level)
                Text(verbatim: notice.title).font(Typo.heading).foregroundStyle(Theme.ink)
                    .fixedSize(horizontal: false, vertical: true).accessibilityAddTraits(.isHeader)
                Text(verbatim: notice.body).font(Typo.body).foregroundStyle(Theme.ink).fixedSize(horizontal: false, vertical: true)
                Text(verbatim: String(format: L.text("notices.for"), NoticeRules.audience(notice))).font(Typo.small).foregroundStyle(Theme.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(Spacing.l)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(tone.soft, in: RoundedRectangle(cornerRadius: Radius.card))
        .overlay(RoundedRectangle(cornerRadius: Radius.card).stroke(notice.level == .informativo ? Theme.line : tone.strong, lineWidth: 1))
        .accessibilityElement(children: .combine)
    }
}
