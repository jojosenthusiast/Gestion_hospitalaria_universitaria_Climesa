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
        SectionCard(title: ClimesaDates.display(day.entries.first?.start, .date)) {
            ForEach(Array(day.entries.enumerated()), id: \.element.id) { index, entry in
                if index > 0 { Divider().overlay(Theme.line) }
                row(entry)
            }
        }
    }

    @ViewBuilder private func row(_ entry: AgendaEntry) -> some View {
        let content = ListRow(title: entry.patientName ?? L.text("day.patient.unknown"), subtitle: entry.reason, meta: ClimesaDates.display(entry.start, .time)) {
            if let state = entry.consultationState { MedicoTag(state.rawValue, label: state.label) }
            else { MedicoTag(entry.appointmentState.rawValue, label: entry.appointmentState.label) }
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
            ClinicalHistoryView(patientId: patientId, viewerIsPatient: false)
        }
    }
}

/// Habitación del paciente si está hospitalizado a cargo de este médico (`/admisiones` ya filtra por relación de atención).
private struct DoctorPatientRoom: View {
    let patientId: String
    @EnvironmentObject private var account: AccountModel
    @Environment(LiveViewModel.self) private var live
    @State private var room: Admission?

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.s) {
            if let room {
                RoomCard(admission: room)
                Text("room.treating_only").font(Typo.caption).foregroundStyle(Theme.muted)
            }
        }
        .task(id: live.snapshot.version(.admissions)) {
            guard account.can("admision.ver") else { room = nil; return }
            let admissions = try? await account.client().get("/admisiones", as: [Admission].self)
            room = admissions.flatMap { RoomRules.current($0, patientId: patientId) }
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
    }

    @ViewBuilder private func statusSection(_ value: AmbulanceStatus) -> some View {
        SectionCard(eyebrow: L.text("ambulance.unit")) {
            ListRow(title: value.unit.plate, subtitle: value.unit.stateReason, meta: value.unit.stateSince.map { String(format: L.text("ambulance.since"), ClimesaDates.display($0)) }) {
                StatusTag(value.unit.state)
            }
            if let crew = AmbulanceLogRules.crewNotice(value) {
                Text(verbatim: crew).font(Typo.small).foregroundStyle(Theme.ink)
            }
            if let block = value.dispatchBlock {
                MedicoAlert(text: block.message)
                Text(verbatim: AmbulanceLogRules.blockAdvice(block, canPlanShifts: account.can("turnos.planificar"))).font(Typo.small).foregroundStyle(Theme.ink)
            }
        }
        if let service = value.activeService {
            SectionCard(eyebrow: L.text("ambulance.active")) {
                ListRow(title: "\(service.origin) → \(service.destination)", meta: String(format: L.text("arrival.dispatched"), ClimesaDates.display(service.dispatchedAt, .time))) {
                    MedicoTag(service.priority.rawValue, label: service.priority.label)
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
                ClimesaButton(title: L.text("ambulance.log.clear"), kind: .secondary) { query = AmbulanceLogQuery(); Task { await loadLog() } }
            }
        }
        LoadState(loader: log, retry: loadLog) { entries in
            if entries.isEmpty { EmptyStateView(title: L.text("ambulance.log.none"), symbol: "list.bullet.rectangle") }
            ForEach(entries) { entry in logRow(entry) }
        }
    }

    @ViewBuilder private var filterPanel: some View {
        VStack(alignment: .leading, spacing: Spacing.m) {
            Picker("ambulance.log.priority", selection: $query.priority) {
                Text("ambulance.log.any").tag(AmbulancePriority?.none)
                ForEach([AmbulancePriority.roja, .naranja, .amarilla, .verde], id: \.self) { Text(verbatim: $0.label).tag(Optional($0)) }
            }.pickerStyle(.menu)
            Picker("ambulance.log.state", selection: $query.finalState) {
                Text("ambulance.log.any").tag(AmbulanceFinalState?.none)
                ForEach(AmbulanceFinalState.allCases, id: \.self) { Text(verbatim: $0.label).tag(Optional($0)) }
            }.pickerStyle(.menu)
            Toggle("ambulance.log.from", isOn: dayToggle(\.from)).tint(Theme.primary)
            if query.from != nil { DatePicker("ambulance.log.from", selection: dayBinding(\.from), displayedComponents: .date).labelsHidden() }
            Toggle("ambulance.log.to", isOn: dayToggle(\.to)).tint(Theme.primary)
            if query.to != nil { DatePicker("ambulance.log.to", selection: dayBinding(\.to), displayedComponents: .date).labelsHidden() }
            FieldError(text: query.rangeError)
            ClimesaButton(title: L.text("ambulance.log.apply"), loading: log.loading) { Task { await loadLog() } }.disabled(query.rangeError != nil)
        }
    }

    @ViewBuilder private func logRow(_ entry: AmbulanceLogEntry) -> some View {
        SectionCard {
            ListRow(title: "\(entry.origin) → \(entry.destination)", subtitle: [AmbulanceLogRules.typeLabel(entry.type), entry.municipality].compactMap { $0 }.joined(separator: " · "),
                    meta: ClimesaDates.display(entry.dispatchedAt)) {
                MedicoTag(entry.priority.rawValue, label: entry.priority.label)
            }
            HStack(spacing: Spacing.s) {
                Text(verbatim: AmbulanceLogRules.finalStateLabel(entry.finalState)).font(Typo.label).foregroundStyle(Theme.ink)
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
        Binding(get: { query[keyPath: keyPath].flatMap { ClimesaDates.parse($0 + "T12:00:00Z") } ?? Date() },
                set: { query[keyPath: keyPath] = ClimesaDates.localDay($0) })
    }

    private func loadStatus() async { await status.load { try await account.client().get("/ambulancia", as: AmbulanceStatus.self) } }

    private func loadLog() async {
        guard query.rangeError == nil else { return }
        let path = query.path
        await log.load { try await account.client().get(path, as: [AmbulanceLogEntry].self) }
    }
}
