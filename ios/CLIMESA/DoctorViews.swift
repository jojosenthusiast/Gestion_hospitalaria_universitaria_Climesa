import SwiftUI

// Pantallas del Médico (docs/arquitectura/datos/pantallas.csv, I20 y I22 a I25; I21 está en ConsultationView.swift).

/// Cada parte se pide por separado: la que falla muestra su error con «Reintentar» (CH-02), nunca un cero falso.
struct DoctorDay: Sendable {
    var agenda: [AgendaEntry]?
    var tickets: Part<[QueueTicket]>?
    var pendingResults: Part<Int>?
    /// RN-25: órdenes con valor crítico que este médico puede revisar.
    var criticalResults = 0
    var hospitalized: Part<Int>?
    /// m-22: consultas propias abiertas de cualquier día.
    var unsigned: Part<[UnsignedConsultation]>?
    /// CITA-02: citas propias con una solicitud de reprogramación que el médico puede decidir.
    var reschedules: Part<[Appointment]>?
    /// MA-AVI-01: avisos públicos y los dirigidos a Medicina (`GET /me/avisos`), como en el inicio de Android.
    var notices: Part<[PublicNotices.Notice]>?
    /// La respuesta de `/me/avisos`, para volver a leer en su `proximoCambio`.
    var noticeFeed: PublicNotices?
}

/// I20 · Mi día: citas del día, números de la fila, resultados por revisar y hospitalizados.
struct DoctorDayView: View {
    let profile: AccessProfile
    let go: (AppTab) -> Void
    @EnvironmentObject private var account: AccountModel
    @Environment(LiveViewModel.self) private var live
    @State private var loader = Loader<DoctorDay>()
    @State private var calling = Submission()
    @State private var deciding = Submission()
    @State private var rejecting: Appointment?

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.l) {
            LoadState(loader: loader, retry: load) { day in
                if day.criticalResults > 0 {
                    Button { go(.resultados) } label: {
                        MedicoAlert(text: String(format: L.text("results.critical.pending"), day.criticalResults))
                    }.buttonStyle(.plain)
                }
                summary(day)
                partErrors(day)
                if let notices = day.notices?.value, !notices.isEmpty {
                    SectionTitle("home.notices")
                    ForEach(notices) { notice in NoticeCard(notice: notice) }
                }
                if let open = day.unsigned?.value, !open.isEmpty { unsignedSection(open) }
                if let pending = day.reschedules?.value, !pending.isEmpty { rescheduleSection(pending) }
                if let tickets = day.tickets?.value { queueSection(tickets) }
                if let agenda = day.agenda { agendaSection(agenda) }
                moreSection(day)
            }
        }
        .task(id: live.snapshot.version([.appointments, .consultations, .queue, .laboratory, .admissions, .hospitalInfo])) { await load() }
        .task(id: loader.value?.noticeFeed?.nextChange) { await reloadAtNextChange(loader.value?.noticeFeed, reload: load) }
        .sheet(item: $rejecting) { item in RejectRescheduleSheet(appointment: item, submission: deciding) { await load() } }
    }

    @ViewBuilder private func unsignedSection(_ open: [UnsignedConsultation]) -> some View {
        SectionCard(title: L.text("day.unsigned")) {
            ForEach(open) { item in
                ListRow(title: item.patientName ?? L.text("day.patient.unknown"), subtitle: item.reason, meta: ClimesaDates.display(item.startedAt))
                NavigationLink { ConsultationView(origin: .resume(item), profile: profile) } label: { Text("day.unsigned.resume") }
                    .buttonStyle(ClimesaButtonStyle(kind: .secondary))
            }
        }
    }

    @ViewBuilder private func rescheduleSection(_ pending: [Appointment]) -> some View {
        SectionCard(title: L.text("day.reschedules")) {
            WriteNotice(submission: deciding, reload: load)
            ForEach(pending) { item in
                ListRow(title: item.patientName ?? L.text("day.patient.unknown"), subtitle: ClimesaDates.display(item.start),
                        meta: item.reschedule.map { "→ \(ClimesaDates.display($0.start))" })
                HStack(spacing: Spacing.m) {
                    ClimesaButton(title: L.text("day.reschedules.accept"), loading: deciding.busy) { Task { await accept(item) } }
                    ClimesaButton(title: L.text("day.reschedules.reject"), kind: .secondary) { rejecting = item }
                }
            }
        }
    }

    private func accept(_ item: Appointment) async {
        guard let request = item.reschedule else { return }
        let body = RescheduleDecisionBody(version: request.version)
        await deciding.run(request.id, body: body, success: L.text("day.reschedules.accept")) { key in
            _ = try await account.client().send("POST", "/citas/reprogramaciones/\(request.id)/aceptar", body: body, key: key, as: AppointmentCommandResult.self)
        }
        await load()
    }

    @ViewBuilder private func summary(_ day: DoctorDay) -> some View {
        LazyVGrid(columns: [GridItem(.flexible(), spacing: Spacing.m), GridItem(.flexible(), spacing: Spacing.m)], spacing: Spacing.m) {
            if let pending = day.pendingResults?.value {
                Button { go(.resultados) } label: { StatTile(value: "\(pending)", label: L.text("day.results")) }.buttonStyle(.plain)
            }
            if let agenda = day.agenda { StatTile(value: "\(agenda.count)", label: L.text("day.appointments")) }
            if let tickets = day.tickets?.value {
                StatTile(value: "\(tickets.filter { $0.service == .consultaGeneral && $0.state == .enEspera }.count)", label: L.text("ds.medico.stat.waiting"))
            }
            if let count = day.hospitalized?.value { StatTile(value: "\(count)", label: L.text("ds.medico.stat.hospitalized")) }
        }
    }

    /// Partes del día que no se pudieron leer, cada una con su título y «Reintentar».
    @ViewBuilder private func partErrors(_ day: DoctorDay) -> some View {
        let failed = [
            PartFailure(title: L.text("day.queue"), message: day.tickets?.error),
            PartFailure(title: L.text("day.results.title"), message: day.pendingResults?.error),
            PartFailure(title: L.text("ds.medico.stat.hospitalized"), message: day.hospitalized?.error),
            PartFailure(title: L.text("home.notices"), message: day.notices?.error)
        ].filter { $0.message != nil }
        ForEach(failed) { part in
            SectionCard(title: part.title) { PartError(message: part.message ?? "", retry: load) }
        }
    }

    @ViewBuilder private func queueSection(_ tickets: [QueueTicket]) -> some View {
        let waiting = tickets.filter { $0.service == .consultaGeneral && $0.state == .enEspera }.count
        SectionCard(title: L.text("day.queue")) {
            Text(verbatim: String(format: L.text("day.queue.waiting"), waiting)).font(Typo.body).foregroundStyle(Theme.ink)
            // FILA-02: el servidor elige el siguiente número en espera del servicio.
            if account.can("fila.llamar"), QueueRules.nextToCall(tickets) != nil {
                ClimesaButton(title: L.text("day.queue.callNext"), loading: calling.busy) { Task { await callNext() } }
            }
            WriteNotice(submission: calling, reload: load)
        }
        let called = tickets.filter { $0.state == .llamado || $0.state == .enAtencion }.sorted { $0.number < $1.number }
        ForEach(called) { ticket in
            SectionCard {
                ListRow(title: ticket.patientName ?? ticket.service.label, subtitle: String(format: L.text("consultation.ticket"), ticket.number)) {
                    MedicoTag(ticket.state.rawValue, label: ticket.state.label)
                }
                // FILA-01: volver a llamar o "No se presentó" solo cuando el servidor lo permite; si no, su motivo.
                let allowed = ticket.allowedActions ?? []
                if allowed.contains(.llamar) || allowed.contains(.noSePresento) {
                    HStack(spacing: Spacing.m) {
                        if allowed.contains(.llamar) { ClimesaButton(title: L.text("day.queue.callAgain"), kind: .secondary, loading: calling.busy) { Task { await call(ticket) } } }
                        if allowed.contains(.noSePresento) { ClimesaButton(title: QueueAction.noSePresento.label, kind: .secondary, loading: calling.busy) { Task { await absent(ticket) } } }
                    }
                }
                ForEach(ticket.blockedActions ?? [], id: \.action) { item in
                    Text(verbatim: "\(item.action.label): \(item.reason)").font(Typo.small).foregroundStyle(Theme.muted)
                }
                if account.can("consulta.iniciar") {
                    // Un número con consulta propia ya iniciada se retoma; los demás se atienden.
                    NavigationLink { ConsultationView(origin: .ticket(ticket), profile: profile) } label: { Text(LocalizedStringKey(ticket.consultationId == nil ? "day.attend" : "day.resume")) }
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
                    // MA-CIT-03: iniciar solo el día de la cita (lo decide el servidor con `allowedActions`).
                    if entry.consultationId != nil || (account.can("consulta.iniciar") && (entry.allowedActions?.contains(.iniciarConsulta) ?? (entry.appointmentState == .confirmada))) {
                        NavigationLink { ConsultationView(origin: .appointment(entry), profile: profile) } label: { Text("day.consultation") }
                            .buttonStyle(ClimesaButtonStyle())
                    } else if let reason = entry.blockedActions?.first(where: { $0.action == .iniciarConsulta })?.reason {
                        Text(verbatim: reason).font(Typo.small).foregroundStyle(Theme.muted)
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
                                    if section == .hospitalizados, let count = day.hospitalized?.value { Text(verbatim: "\(count)").font(Typo.label).foregroundStyle(Theme.ink) }
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
            if profile.hasPermission("consulta.iniciar") {
                day.unsigned = try await Part<[UnsignedConsultation]>.load { try await api.get("/consultas/sin-firmar", as: [UnsignedConsultation].self) }
            }
            if profile.hasPermission("citas.ver") {
                day.reschedules = try await Part<[Appointment]>.load {
                    try await api.get("/citas", as: [Appointment].self).filter { $0.allowedActions?.contains(.aceptarReprogramacion) ?? false }
                }
            }
            if profile.hasPermission("fila.ver") { day.tickets = try await Part<[QueueTicket]>.load { try await api.get("/fila", as: [QueueTicket].self) } }
            if profile.hasPermission("resultados.ver") {
                let orders = try await Part<[LabOrder]>.load { try await api.get("/laboratorio/ordenes", as: [LabOrder].self) }
                switch orders {
                case let .loaded(rows):
                    day.pendingResults = .loaded(ReviewRules.pending(rows).count)
                    day.criticalResults = ReviewRules.criticalToReview(rows)
                case let .failed(message):
                    day.pendingResults = .failed(message)
                }
            }
            if profile.hasPermission("admision.ver") {
                day.hospitalized = try await Part<Int>.load {
                    let admissions = try await api.get("/admisiones", as: [Admission].self)
                    return DischargeRules.current(admissions).count
                }
            }
            let feed = try await Part<PublicNotices>.load { try await api.get("/me/avisos", as: PublicNotices.self) }
            day.noticeFeed = feed.value
            day.notices = feed.value.map { .loaded($0.byPriority) } ?? .failed(feed.error ?? "")
            return day
        }
    }

    private func callNext() async {
        let body = QueueCallNextBody(service: QueueService.consultaGeneral.rawValue)
        var called: QueueCallNextResult?
        await calling.run("siguiente", body: body) { key in
            called = try await account.client().send("POST", "/fila/llamar-siguiente", body: body, key: key, as: QueueCallNextResult.self)
        }
        if let called { calling.notice = String(format: L.text("day.queue.called"), called.number) }
        await load()
    }

    private func absent(_ ticket: QueueTicket) async {
        let body = VersionBody(version: ticket.version)
        await calling.run(ticket.id, body: body, success: QueueState.noSePresento.label) { key in
            _ = try await account.client().send("POST", "/fila/\(ticket.id)/no-se-presento", body: body, key: key, as: QueueTransitionResult.self)
        }
        await load()
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

/// I23 · Resultados por revisar: críticos arriba en rojo; detalle con valores y marca; marcar revisado. Debajo, las
/// órdenes propias en curso que la API deja cancelar (MA-LAB-05).
struct ResultsReviewView: View {
    @EnvironmentObject private var account: AccountModel
    @Environment(LiveViewModel.self) private var live
    @State private var loader = Loader<[LabOrder]>()

    var body: some View {
        LoadState(loader: loader, retry: load) { orders in
            let pending = ReviewRules.pending(orders)
            let critical = ReviewRules.criticalToReview(orders)
            let inProgress = ReviewRules.cancellable(orders)
            if critical > 0 { MedicoAlert(text: String(format: L.text("results.critical.pending"), critical)) }
            if pending.isEmpty { EmptyStateView(title: L.text("results.none"), symbol: "checkmark.circle") }
            ForEach(pending) { order in
                NavigationLink { ReviewDetailView(order: order, reload: load) } label: {
                    LabOrderRow(order: order, status: L.text(ReviewRules.isAmendedPendingReview(order) ? "results.amended" : "results.toReview"),
                                critical: ReviewRules.isCritical(order))
                }.buttonStyle(.plain)
            }
            if !inProgress.isEmpty {
                Text("results.inProgress").font(Typo.subheading).foregroundStyle(Theme.ink).padding(.top, Spacing.m)
                ForEach(inProgress) { order in
                    NavigationLink { ReviewDetailView(order: order, reload: load) } label: {
                        LabOrderRow(order: order, status: order.state.label, critical: false)
                    }.buttonStyle(.plain)
                }
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
    @State private var cancelSubmission = Submission()
    @State private var cancelling = false
    @State private var cancelled = false

    var body: some View {
        ScreenFrame(title: "results.detail") {
            if let name = order.patientName { Text(verbatim: name).font(Typo.heading).foregroundStyle(Theme.ink) }
            if ReviewRules.isCritical(order) { MedicoAlert(text: L.text("results.critical.notice")) }
            if ReviewRules.isAmendedPendingReview(order) {
                Text("results.amended").font(Typo.label).foregroundStyle(Theme.warning)
            }
            LabOrderDetail(order: order, showValues: true)
            WriteNotice(submission: submission, reload: reload)
            // Los botones salen de `allowedActions` de la API para este médico, nunca del rol ni del estado.
            if order.allows(.revisar) {
                ClimesaButton(title: L.text("results.markReviewed"), loading: submission.busy) { Task { await review() } }
            }
            if order.allows(.cancelar) {
                ClimesaButton(title: L.text("results.cancel"), kind: .secondary) { cancelling = true }
            }
            if account.can("expediente.ver") {
                NavigationLink {
                    PatientRecordScreen(patientId: order.patientId)
                } label: { Text("day.record") }
                    .buttonStyle(ClimesaButtonStyle(kind: .secondary))
            }
        }
        .sheet(isPresented: $cancelling, onDismiss: { if cancelled { dismiss() } }) {
            CancelLabOrderSheet(order: order, submission: cancelSubmission, reload: reload) { cancelled = true }
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
            ScreenFrame(title: "results.cancel.title") {
                SectionCard {
                    ListRow(title: order.items.map(\.name).joined(separator: ", "), subtitle: order.patientName, meta: order.state.label)
                }
                Text("results.cancel.intro").font(Typo.small).foregroundStyle(Theme.muted)
                VStack(alignment: .leading, spacing: Spacing.xs) {
                    MedicoTextArea(label: L.text("results.cancel.reason"), text: $reason, error: reasonError ?? submission.fieldErrors["reason"], lines: 3...6)
                    CharacterCounter(count: LabCancelRules.reasonCount(reason), range: LabCancelRules.reasonRange)
                }
                .onChange(of: reason) { _, value in
                    if reasonError != nil { reasonError = LabCancelRules.reasonError(value) }
                }
                WriteNotice(submission: submission, reload: reload)
                ClimesaButton(title: L.text("results.cancel"), kind: .destructive, loading: submission.busy) { Task { await send() } }
                ClimesaButton(title: L.text("common.close"), kind: .secondary) { dismiss() }
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

    var body: some View {
        LoadState(loader: loader, retry: load) { admissions in
            let listed = DischargeRules.listed(admissions)
            if listed.isEmpty { EmptyStateView(title: L.text("hospitalized.none"), symbol: "bed.double") }
            ForEach(listed) { admission in
                HospitalizedRow(admission: admission, actions: HospitalizedRowActions.of(admission), reload: load)
            }
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
                    Image(systemName: "bell.badge").foregroundStyle(Theme.warning).accessibilityHidden(true)
                    Text(verbatim: hint).font(Typo.small).foregroundStyle(Theme.ink).fixedSize(horizontal: false, vertical: true)
                }
                .padding(Spacing.s).frame(maxWidth: .infinity, alignment: .leading)
                .background(Theme.warningSoft, in: RoundedRectangle(cornerRadius: 8))
                .accessibilityElement(children: .combine)
            }
            if let discharge = actions.discharge { SignedDischarge(discharge: discharge) }
            if actions.sign {
                NavigationLink { DischargeView(admission: admission, reload: reload) } label: { Text("hospitalized.discharge") }
                    .buttonStyle(ClimesaButtonStyle(kind: .secondary))
            }
            if actions.revoke {
                NavigationLink { RevokeDischargeView(admission: admission, reload: reload) } label: { Text("hospitalized.revoke") }
                    .buttonStyle(ClimesaButtonStyle(kind: .secondary))
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
            Text(verbatim: String(format: L.text("hospitalized.discharge.signedBy"), discharge.signedByName ?? "—", ClimesaDates.display(discharge.signedAt)))
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
                    }.pickerStyle(.menu).tint(Theme.primary)
                    FieldError(text: submission.fieldErrors["type"])
                }
                VStack(alignment: .leading, spacing: Spacing.xs) {
                    MedicoTextArea(label: L.text("discharge.summary"), text: $summary, error: errors["summary"] ?? submission.fieldErrors["summary"])
                    CharacterCounter(count: summary.trimmingCharacters(in: .whitespacesAndNewlines).count, range: 10...2000)
                }
                if type == .voluntaria {
                    Toggle("discharge.consent", isOn: $consent).font(Typo.body).tint(Theme.primary)
                    FieldError(text: errors["voluntaryConsent"] ?? submission.fieldErrors["voluntaryConsent"])
                }
            }
            SectionCard(title: L.text("discharge.pending")) {
                ForEach($pending) { $line in
                    FormField(label: L.text("discharge.pending.description"), text: $line.description)
                    FormField(label: L.text("discharge.pending.responsible"), text: $line.responsible)
                    ClimesaButton(title: L.text("discharge.pending.remove"), kind: .secondary) {
                        pending.removeAll { $0.id == line.id }
                    }
                }
                FieldError(text: errors["pending"] ?? submission.fieldErrors["pending"])
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

/// MA-HOS-02 · Revocar un alta firmada mientras no haya salida: vuelve a hospitalizado, con motivo (10 a 500).
private struct RevokeDischargeView: View {
    let admission: Admission
    let reload: () async -> Void
    @EnvironmentObject private var account: AccountModel
    @Environment(\.dismiss) private var dismiss
    @State private var submission = Submission()
    @State private var reason = ""
    @State private var reasonError: String?

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
            ClimesaButton(title: L.text("hospitalized.revoke"), loading: submission.busy) { Task { await revoke() } }
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
                                if candidate.serviceId == arrival.prehospital?.serviceId { Image(systemName: "checkmark").foregroundStyle(Theme.ink) }
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
                EmptyStateView(title: L.text("arrival.none"), symbol: "cross.case")
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
            } else if view.canReceive {
                SubmissionNotice(submission: submission)
                ClimesaButton(title: L.text("arrival.receive"), loading: submission.busy) { Task { await receive(view) } }
            } else {
                Text(verbatim: L.text(view.arrived == true ? "arrival.receive.otherRole" : "arrival.receive.wait")).font(Typo.small).foregroundStyle(Theme.muted)
            }
        }
    }

    private func receive(_ view: PrehospitalView) async {
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
            ScreenFrame(title: "day.reschedules.reject.title") {
                SectionCard {
                    ListRow(title: appointment.patientName ?? L.text("day.patient.unknown"), subtitle: ClimesaDates.display(appointment.start),
                            meta: appointment.reschedule.map { "→ \(ClimesaDates.display($0.start))" })
                }
                TextField(L.text("day.reschedules.reject.reason"), text: $reason, axis: .vertical).lineLimit(3...6).textFieldStyle(.roundedBorder)
                CharacterCounter(count: trimmed.count, range: 10...500)
                WriteNotice(submission: submission, reload: reload)
                ClimesaButton(title: L.text("day.reschedules.reject"), kind: .destructive, loading: submission.busy) { Task { await send() } }
                    .disabled(!(10...500).contains(trimmed.count))
                ClimesaButton(title: L.text("common.close"), kind: .secondary) { dismiss() }
            }
        }
    }

    private func send() async {
        guard let request = appointment.reschedule else { return }
        let body = RescheduleDecisionBody(version: request.version, rejectionReason: trimmed)
        let ok = await submission.run(request.id, body: body, success: L.text("day.reschedules.reject")) { key in
            _ = try await account.client().send("POST", "/citas/reprogramaciones/\(request.id)/rechazar", body: body, key: key, as: AppointmentCommandResult.self)
        }
        await reload()
        if ok { dismiss() }
    }
}
