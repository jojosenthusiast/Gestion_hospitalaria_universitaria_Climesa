import SwiftUI

// Pantallas del Médico de la ronda 3: agenda completa, expediente con habitación y ambulancia con bitácora filtrable.

/// Agenda de las citas de sus pacientes, por día: próximas primero y las anteriores en un bloque aparte.
struct DoctorAgendaView: View {
    let profile: AccessProfile
    @EnvironmentObject private var account: AccountModel
    @Environment(LiveViewModel.self) private var live
    @State private var loader = Loader<[AgendaEntry]>()
    @State private var showPast = false

    var body: some View {
        LoadState(loader: loader, retry: load) { entries in
            let upcoming = AgendaRules.upcoming(entries, now: Date())
            let past = AgendaRules.past(entries, now: Date())
            if upcoming.isEmpty { EmptyStateView(title: L.text("agenda.none"), symbol: "calendar") }
            ForEach(upcoming) { day in dayCard(day) }
            if !past.isEmpty {
                Toggle("agenda.past", isOn: $showPast).font(Typo.label).tint(Theme.primary)
                if showPast { ForEach(past) { day in dayCard(day) } }
            }
        }
        .task(id: live.snapshot.version([.appointments, .consultations])) { await load() }
    }

    @ViewBuilder private func dayCard(_ day: AgendaDay) -> some View {
        SectionCard(title: day.entries.first.map { ClimesaDates.shortDay($0.start) } ?? "—") {
            ForEach(Array(day.entries.enumerated()), id: \.element.id) { index, entry in
                if index > 0 { Divider().overlay(Theme.line) }
                row(entry)
            }
        }
    }

    @ViewBuilder private func row(_ entry: AgendaEntry) -> some View {
        let content = VStack(alignment: .leading, spacing: Spacing.s) {
            ListRow(title: entry.patientName ?? L.text("day.patient.unknown"), subtitle: entry.reason, meta: ClimesaDates.display(entry.start, .time)) {
                if let state = entry.consultationState { MedicoTag(state.rawValue, label: state.label) }
                else { MedicoTag(entry.appointmentState.rawValue, label: entry.appointmentState.label) }
            }
            CategoryMarks(categories: entry.categories)
        }
        if account.can("expediente.ver") {
            NavigationLink { PatientRecordScreen(patientId: entry.patientId) } label: { content }.buttonStyle(.plain)
        } else {
            content
        }
    }

    private func load() async { await loader.load { try await account.client().get("/consultas/agenda", as: [AgendaEntry].self) } }
}

/// Expediente de un paciente que ve el médico: habitación asignada y historial clínico.
/// Sin relación de atención la API responde 403 y la pantalla explica que solo ve el médico tratante.
struct PatientRecordScreen: View {
    let patientId: String

    var body: some View {
        ScreenFrame(title: "patients.record") {
            DoctorPatientRoom(patientId: patientId)
            DoctorPatientVitals(patientId: patientId)
            ClinicalHistoryView(patientId: patientId, viewerIsPatient: false)
        }
    }
}

/// Habitación del paciente si está hospitalizado a cargo de este médico (`/admisiones` ya filtra por relación de atención).
private struct DoctorPatientRoom: View {
    let patientId: String
    @EnvironmentObject private var account: AccountModel
    @Environment(LiveViewModel.self) private var live
    @State private var loader = Loader<[Admission]>()

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.s) {
            // CH-02: si la lectura falla se dice, en vez de parecer que el paciente no está hospitalizado.
            if let error = loader.error {
                SectionCard(title: L.text("room.eyebrow")) { PartError(message: error, retry: load) }
            } else if let room = loader.value.flatMap({ RoomRules.current($0, patientId: patientId) }) {
                RoomCard(admission: room)
                Text("room.treating_only").font(Typo.caption).foregroundStyle(Theme.muted)
            }
        }
        .task(id: live.snapshot.version(.admissions)) { await load() }
    }

    private func load() async {
        guard account.can("admision.ver") else { loader.clear(); return }
        await loader.load { try await account.client().get("/admisiones", as: [Admission].self) }
    }
}

/// Row 4: últimos signos vitales del paciente, solo lectura (`GET /pacientes/{id}/signos`, permiso `signos.registrar`).
/// Sin relación de atención la API responde 403: la tarjeta no se muestra y el expediente ya explica por qué.
private struct DoctorPatientVitals: View {
    let patientId: String
    @EnvironmentObject private var account: AccountModel
    @Environment(LiveViewModel.self) private var live
    @State private var loader = Loader<PatientVitalsHistory?>()

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.s) {
            if let error = loader.error {
                SectionCard(title: L.text("consultation.vitals")) { PartError(message: error, retry: load) }
            } else if let history = loader.value ?? nil {
                let items = PatientVitalsRules.latest(history.items)
                SectionCard(title: L.text("consultation.vitals")) {
                    if items.isEmpty { Text("consultation.vitals.none").font(Typo.small).foregroundStyle(Theme.muted) }
                    ForEach(Array(items.enumerated()), id: \.element.id) { index, sign in
                        if index > 0 { Divider().overlay(Theme.line) }
                        ListRow(title: ConsultationView.vitalsText(sign), meta: ClimesaDates.short(sign.takenAt))
                    }
                }
            }
        }
        .task(id: live.snapshot.version([.consultations, .admissions])) { await load() }
    }

    private func load() async {
        guard account.can("signos.registrar") else { loader.clear(); return }
        await loader.load {
            do { return try await account.client().get("/pacientes/\(patientId)/signos", as: PatientVitalsHistory.self) }
            catch let failure as APIFailure where failure.isForbidden { return nil }
        }
    }
}

/// Estado de la ambulancia (unidad, motivo de bloqueo, servicio activo) y, con permiso, la bitácora con filtros.
struct AmbulanceOverviewView: View {
    @EnvironmentObject private var account: AccountModel
    @Environment(LiveViewModel.self) private var live
    @State private var status = Loader<AmbulanceStatus>()
    @State private var log = Loader<[AmbulanceLogEntry]>()
    @State private var query = AmbulanceLogQuery()
    @State private var filtersOpen = false
    /// Past days of the log stay folded until opened.
    @State private var pastOpen = false
    /// Filters of the last request, so a filter change reloads once and the first appearance does not load twice.
    @State private var filtersApplied: String?

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.l) {
            LoadState(loader: status, retry: loadStatus) { value in statusSection(value) }
            if account.can("ambulancia.ver_bitacora") {
                logSection
            } else {
                PatientNotice(text: L.text("ambulance.log.restricted"))
            }
        }
        .task(id: live.snapshot.version(.ambulance)) {
            await loadStatus()
            if account.can("ambulancia.ver_bitacora") { await loadLog() }
        }
        // S13: priority, state and dates apply as soon as they change; there is no separate «Aplicar» step.
        .task(id: query.autoApplyKey) {
            guard filtersApplied != nil, filtersApplied != query.autoApplyKey, account.can("ambulancia.ver_bitacora") else { return }
            await loadLog()
        }
    }

    @ViewBuilder private func statusSection(_ value: AmbulanceStatus) -> some View {
        SectionCard(eyebrow: L.text("ambulance.unit")) {
            ListRow(title: value.unit.plate, subtitle: value.unit.stateReason, meta: value.unit.stateSince.map { String(format: L.text("ambulance.since"), ClimesaDates.short($0)) }) {
                StatusTag(value.unit.state)
            }
            if let crew = AmbulanceLogRules.crewNotice(value) {
                Text(verbatim: crew).font(Typo.small).foregroundStyle(Theme.ink)
            }
            if let block = value.dispatchBlock {
                // A dispatch block is a warning, not a critical value: warning tone, red stays for critical.
                HStack(alignment: .top, spacing: Spacing.s) {
                    Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(Theme.warning).accessibilityHidden(true)
                    Text(verbatim: block.message).font(Typo.small).foregroundStyle(Theme.ink).fixedSize(horizontal: false, vertical: true)
                }
                Text(verbatim: AmbulanceLogRules.blockAdvice(block, canPlanShifts: account.can("turnos.planificar"))).font(Typo.small).foregroundStyle(Theme.ink)
            }
        }
        if let service = value.activeService {
            SectionCard(eyebrow: L.text("ambulance.active")) {
                ListRow(title: "\(service.origin) → \(service.destination)", meta: String(format: L.text("arrival.dispatched"), ClimesaDates.display(service.dispatchedAt, .time))) {
                    MedicoTag(service.priority.rawValue, label: service.priority.label)
                }
                if AmbulanceLogRules.isUnclosed(dispatchedAt: service.dispatchedAt) { PriorityBadge(.urgente, label: L.text("ambulance.unclosed")) }
                if let milestones = service.milestones {
                    ForEach(["salida", "en_escena", "trasladando", "en_hospital", "finalizado"], id: \.self) { type in
                        let done = milestones.first { $0.type == type }
                        HStack {
                            Text(verbatim: AmbulanceRules.milestoneLabel(type)).font(Typo.small).foregroundStyle(done == nil ? Theme.muted : Theme.ink)
                            Spacer()
                            Text(verbatim: done.map { ClimesaDates.display($0.occurredAt, .time) } ?? "—").font(Typo.mono).foregroundStyle(Theme.muted)
                        }
                    }
                }
            }
        } else {
            EmptyStateView(title: L.text("arrival.none"), symbol: "cross.case")
        }
    }

    @ViewBuilder private var logSection: some View {
        SectionTitle("ambulance.log")
        SectionCard {
            FormField(label: L.text("ambulance.log.search"), text: $query.text, hint: L.text("ambulance.log.search.hint"))
                .textInputAutocapitalization(.never).autocorrectionDisabled().submitLabel(.search)
                .onSubmit { Task { await loadLog() } }
            Button { filtersOpen.toggle() } label: {
                HStack {
                    Image(systemName: "line.3.horizontal.decrease.circle").accessibilityHidden(true)
                    Text(verbatim: query.activeCount == 0 ? L.text("ambulance.log.filters") : String(format: L.text("ambulance.log.filters.active"), query.activeCount)).font(Typo.label)
                    Spacer()
                    Image(systemName: filtersOpen ? "chevron.up" : "chevron.down").accessibilityHidden(true)
                }.foregroundStyle(Theme.primaryText).frame(minHeight: Spacing.control)
            }
            if filtersOpen { filterPanel }
            if query.activeCount > 0 {
                ClimesaButton(title: L.text("ambulance.log.clear"), kind: .secondary) {
                    // Only the text was active: no filter key changes, so reload here.
                    let textOnly = query.autoApplyKey == AmbulanceLogQuery().autoApplyKey
                    query = AmbulanceLogQuery()
                    if textOnly { Task { await loadLog() } }
                }
            }
        }
        LoadState(loader: log, retry: loadLog) { entries in
            if entries.isEmpty { EmptyStateView(title: L.text("ambulance.log.none"), symbol: "list.bullet.rectangle") }
            // Day-grouped: today open, the past days folded (open by themselves when nothing happened today).
            let days = AmbulanceLogRules.days(entries)
            if let today = days.today { dayGroup(ClimesaDates.localDay(Date()), today) }
            if !days.past.isEmpty {
                DisclosureGroup(isExpanded: Binding(get: { pastOpen || days.today == nil }, set: { pastOpen = $0 })) {
                    ForEach(days.past) { group in dayGroup(group.day, group.entries) }
                } label: {
                    Text(verbatim: String(format: L.text("ambulance.log.pastDays"), days.past.reduce(0) { $0 + $1.entries.count })).font(Typo.label).foregroundStyle(Theme.muted)
                }
            }
        }
    }

    @ViewBuilder private var filterPanel: some View {
        VStack(alignment: .leading, spacing: Spacing.m) {
            // Each priority filters with the triage colour its rows wear.
            Text("ambulance.log.priority").font(Typo.label).foregroundStyle(Theme.ink)
            FlowLayout(spacing: Spacing.s) {
                StatusFilterChip(label: L.text("ambulance.log.any"), selected: query.priority == nil) { query.priority = nil }
                ForEach([AmbulancePriority.roja, .naranja, .amarilla, .verde], id: \.self) { priority in
                    StatusFilterChip(label: priority.label, priority: AmbulanceLogRules.priorityLevel(priority), selected: query.priority == priority) { query.priority = priority }
                }
            }
            // Each final state filters with the badge its rows wear.
            Text("ambulance.log.state").font(Typo.label).foregroundStyle(Theme.ink)
            FlowLayout(spacing: Spacing.s) {
                StatusFilterChip(label: L.text("ambulance.log.any"), selected: query.finalState == nil) { query.finalState = nil }
                ForEach(AmbulanceFinalState.allCases, id: \.self) { state in
                    StatusFilterChip(label: state.label, status: state.statusValue, selected: query.finalState == state) { query.finalState = state }
                }
            }
            Toggle("ambulance.log.from", isOn: dayToggle(\.from)).tint(Theme.primary)
            if query.from != nil { DatePicker("ambulance.log.from", selection: dayBinding(\.from), displayedComponents: .date).labelsHidden()
                .environment(\.timeZone, ClimesaDates.zone).environment(\.calendar, ClimesaDates.calendar) }
            Toggle("ambulance.log.to", isOn: dayToggle(\.to)).tint(Theme.primary)
            if query.to != nil { DatePicker("ambulance.log.to", selection: dayBinding(\.to), displayedComponents: .date).labelsHidden()
                .environment(\.timeZone, ClimesaDates.zone).environment(\.calendar, ClimesaDates.calendar) }
            FieldError(text: query.rangeError)
        }
    }

    @ViewBuilder private func dayGroup(_ day: String, _ entries: [AmbulanceLogEntry]) -> some View {
        Text(verbatim: ClimesaDates.shortDay(day)).font(Typo.label).foregroundStyle(Theme.ink).padding(.top, Spacing.s)
            .accessibilityAddTraits(.isHeader)
        ForEach(entries) { entry in logRow(entry) }
    }

    @ViewBuilder private func logRow(_ entry: AmbulanceLogEntry) -> some View {
        SectionCard {
            ListRow(title: "\(entry.origin) → \(entry.destination)", subtitle: [AmbulanceLogRules.typeLabel(entry.type), entry.municipality].compactMap { $0 }.joined(separator: " · "),
                    meta: ClimesaDates.short(entry.dispatchedAt)) {
                MedicoTag(entry.priority.rawValue, label: entry.priority.label)
            }
            HStack(spacing: Spacing.s) {
                let tag = AmbulanceLogRules.finalTag(entry)
                MedicoTag(tag.value, label: tag.label)
                if let response = AmbulanceLogRules.responseText(entry.responseMinutes) { Text(verbatim: response).font(Typo.small).foregroundStyle(Theme.muted) }
            }
            if !entry.crew.isEmpty {
                Text(verbatim: entry.crew.map(\.name).joined(separator: ", ")).font(Typo.small).foregroundStyle(Theme.muted)
            }
        }
    }

    private func dayToggle(_ keyPath: WritableKeyPath<AmbulanceLogQuery, String?>) -> Binding<Bool> {
        Binding(get: { query[keyPath: keyPath] != nil },
                set: { query[keyPath: keyPath] = $0 ? ClimesaDates.localDay(Date()) : nil })
    }

    private func dayBinding(_ keyPath: WritableKeyPath<AmbulanceLogQuery, String?>) -> Binding<Date> {
        Binding(get: { ClimesaDates.pickerDate(day: query[keyPath: keyPath]) ?? Date() },
                set: { query[keyPath: keyPath] = ClimesaDates.localDay($0) })
    }

    private func loadStatus() async { await status.load { try await account.client().get("/ambulancia", as: AmbulanceStatus.self) } }

    private func loadLog() async {
        guard query.rangeError == nil else { return }
        filtersApplied = query.autoApplyKey
        let path = query.path
        await log.load { try await account.client().get(path, as: [AmbulanceLogEntry].self) }
    }
}
